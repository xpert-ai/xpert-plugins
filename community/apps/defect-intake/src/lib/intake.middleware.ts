import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy, type AgentMiddleware, type IAgentMiddlewareContext, type IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { feature, icon, middlewareName } from './constants'
import { IntakeError } from '../shared/contracts'
import { IntakeService } from './intake.service'
import { AnalysisService } from './analysis/analysis.service'
import { analysisConfigSchema } from './analysis/config'

export const intakeToolNames = ['defect_intake_list_records', 'defect_intake_get_record', 'defect_intake_analyze_record'] as const
@Injectable()
@AgentMiddlewareStrategy(middlewareName)
export class IntakeMiddleware implements IAgentMiddlewareStrategy<z.infer<typeof analysisConfigSchema>> {
  constructor(private readonly service: IntakeService, private readonly analysis: AnalysisService) {}
  meta: TAgentMiddlewareMeta = {
    name: middlewareName, label: { en_US: 'Smart Ticket Completion', zh_Hans: '智能工单补全' },
    description: { en_US: 'Read owned feedback and prepare evidence-linked suggestions; humans confirm reports.', zh_Hans: '读取本人反馈，生成有来源的建议稿和追问；报告由用户确认。' },
    icon: { type: 'svg', value: icon }, features: [feature],
    configSchema: { type: 'object', properties: {
      model: { type: 'object', title: { en_US: 'Analysis model', zh_Hans: '分析模型' }, 'x-ui': { component: 'ai-model-select', span: 2, inputs: { modelType: 'llm', hiddenLabel: true } } }
    }, required: [] }
  }
  getToolNames() { return intakeToolNames }
  createMiddleware(options: z.infer<typeof analysisConfigSchema>, context: IAgentMiddlewareContext): AgentMiddleware {
    analysisConfigSchema.parse(options)
    const scope = { tenantId: context.tenantId, organizationId: context.organizationId || '', userId: context.userId }
    const wrap = async (run: () => Promise<object>) => {
      try { return JSON.stringify({ success: true, ...await run() }) }
      catch (error) { return JSON.stringify({ success: false, code: error instanceof IntakeError ? error.code : 'operation_unavailable' }) }
    }
    const list = tool(input => wrap(async () => {
      const data = await this.service.list(scope, { search: input.search, page: input.page })
      return { items: data.items, total: data.total, ...data.meta }
    }), { name: intakeToolNames[0], description: 'List the current user’s saved defect feedback, with paginated IDs, title and preview. Never search another user’s data.', schema: z.object({ search: z.string().max(200).optional(), page: z.number().int().min(1).max(10000).optional() }).strict(), metadata: { toolName: { en_US: 'Find feedback records', zh_Hans: '查找反馈记录' } } })
    const get = tool(input => wrap(async () => {
      await this.analysis.reconcile(scope, input.recordId)
      return { record: await this.service.get(scope, input.recordId) }
    }), { name: intakeToolNames[1], description: 'Read one owned feedback record, current report, analysis state, sources and clarifications. Report unknown facts honestly.', schema: z.object({ recordId: z.string().uuid() }).strict(), metadata: { toolName: { en_US: 'Read defect report', zh_Hans: '读取缺陷报告' } } })
    const analyze = tool(input => wrap(async () => {
      if (!context.xpertId || !context.workspaceId) throw new IntakeError('scope_required')
      const record = await this.service.get(scope, input.recordId)
      await this.analysis.start(scope, record.id, { assistantId: context.xpertId, workspaceId: context.workspaceId }, { revision: record.revision, requestId: randomUUID() })
      const current = await this.service.get(scope, record.id)
      return { recordId: current.id, revision: current.revision, analysis: current.analysis, saved: true }
    }), { name: intakeToolNames[2], description: 'Start or retry a background AI analysis of one saved record at the current revision. This prepares suggestions and up to three clarifications; it never confirms a report. A queued or running receipt is not completion. The user can watch results in the Workbench.', schema: z.object({ recordId: z.string().uuid() }).strict(), metadata: { toolName: { en_US: 'Analyze feedback', zh_Hans: '整理反馈并提出追问' } } })
    return { name: middlewareName, tools: [list, get, analyze] }
  }
}

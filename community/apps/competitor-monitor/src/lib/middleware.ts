// AI 接口层：定义严格参数与工具边界，模型提供判断，服务端掌握事实和持久化。
import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy, RequestContext, type AgentMiddleware, type IAgentMiddlewareContext, type IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { FEATURE, MIDDLEWARE } from './constants.js'
import { MonitorService, type Scope } from './service.js'

const getChangesSchema = z.object({
  roundId: z.string().min(1).max(160).describe('Round id returned by the Workbench collection action.'),
  page: z.number().int().min(1).max(100000).default(1),
  limit: z.number().int().min(1).max(50).default(50)
}).strict()
const confirmChangeSchema = z.object({
  changeId: z.string().min(1).max(500).describe('Existing deterministic change id returned by monitor_get_round_changes.'),
  severity: z.enum(['low', 'medium', 'high']).describe('Semantic urgency assessment. The evidence and values remain server-owned.')
}).strict()
const adviceSchema = z.object({
  operationId: z.string().uuid().describe('Stable UUID for this advice operation. Reuse the same UUID when retrying the same operation.'),
  changeId: z.string().min(1).max(500).describe('Existing change id returned by monitor_get_round_changes.'),
  category: z.enum(['title_optimization', 'promotion_adjustment', 'creative_request']),
  content: z.string().trim().min(1).max(1000),
  reason: z.string().trim().min(1).max(1000)
}).strict()
const issueSchema = z.object({
  roundId: z.string().min(1).max(160),
  reason: z.string().trim().min(1).max(1000),
  missingFields: z.array(z.string().trim().min(1).max(100)).max(20).default([])
}).strict()

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE)
export class CompetitorMonitorMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE, label: { en_US: 'Competitor Monitor', zh_Hans: '竞品监控' },
    description: { en_US: 'Read deterministic changes and persist reviewable advice.', zh_Hans: '读取确定性变化并保存可审核运营建议。' },
    icon: { type: 'font', value: 'ri-radar-line' }, features: [FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
  constructor(private readonly service: MonitorService) {}

  // 绑定当前运行上下文；工具参数只包含业务输入，不能自行扩大数据范围。
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    const scope: Scope = { tenantId: context.tenantId,
      organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId }
    return { name: MIDDLEWARE,
      // 模型失败仅记录最新用户请求明确指定的轮次，避免误改历史轮次。
      wrapModelCall: async (request, handler) => {
        try { return await handler(request) }
        catch (error) {
          // Bind only the explicit round in the latest human request, never an older turn.
          const human = [...request.messages].reverse().find(message => message._getType() === 'human')
          const match = typeof human?.content === 'string'
            ? /^请分析采集轮次 ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})。/i.exec(human.content)
            : null
          if (match) {
            try {
              await this.service.reportAnalysisIssue(scope, {
                roundId: match[1], reason: '模型调用未完成，请重新分析此轮次。', missingFields: []
              })
            } catch { /* Preserve the original model error; scope/state validation may reject recording. */ }
          }
          throw error
        }
      }, tools: [
      tool((input) => this.stringify(this.service.finishAnalysis(scope, input.roundId)), {
        name: 'monitor_finish_analysis',
        description: 'Finish analysis after every change has persisted advice. Clears a previous analysis failure only when server validation succeeds. Never use after reporting missing evidence.',
        schema: z.object({ roundId: z.string().uuid() }).strict(), verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Finish analysis', zh_Hans: '完成轮次分析' } }
      }),
      tool((input) => this.stringify(this.service.getRoundChanges(scope, input)), {
        name: 'monitor_get_round_changes',
        description: 'Read bounded, server-owned deterministic changes for one collection round. Always call this before confirming changes or creating advice. Never invent or rewrite beforeValue, afterValue, or evidence.',
        schema: getChangesSchema, verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Read round changes', zh_Hans: '读取轮次变化' } }
      }),
      tool((input) => this.stringify(this.service.confirmChange(scope, input)), {
        name: 'monitor_record_change',
        description: 'Confirm the semantic severity of one existing change returned by monitor_get_round_changes. This never creates a diff and cannot overwrite server-owned values or evidence.',
        schema: confirmChangeSchema, verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Confirm competitor change', zh_Hans: '确认竞品变化' } }
      }),
      tool((input) => this.stringify(this.service.createAdvice(scope, input)), {
        name: 'monitor_create_advice',
        description: 'After monitor_get_round_changes, create one executable, human-reviewable advice for an existing change whose adviceStatus is missing. Existing pending, approved, or rejected advice is never reset.',
        schema: adviceSchema, verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Create operations advice', zh_Hans: '生成运营建议' } }
      }),
      tool((input) => this.stringify(this.service.reportAnalysisIssue(scope, input)), {
        name: 'monitor_report_analysis_issue',
        description: 'Report missing or unusable evidence. Use this instead of inventing facts or advice.',
        schema: issueSchema, verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Report analysis issue', zh_Hans: '报告分析问题' } }
      })
    ] }
  }
  private async stringify(value: Promise<object>) { return JSON.stringify(await value) }
}

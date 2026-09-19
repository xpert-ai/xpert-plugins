import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy, RequestContext, type AgentMiddleware, type IAgentMiddlewareContext, type IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { RFID_FEATURE, RFID_ICON, RFID_MIDDLEWARE_NAME } from './rfid-constants.js'
import { analysisIdSchema, analysisAttemptSchema, saveInterpretationSchema, type AnalysisAttempt, type ExperimentScope } from './experiment-contracts.js'
import { RfidExperimentInsightService } from './rfid-experiment-insight.service.js'

@Injectable()
@AgentMiddlewareStrategy(RFID_MIDDLEWARE_NAME)
export class RfidExperimentInsightMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: RFID_MIDDLEWARE_NAME,
    label: { en_US: 'RFID Experiment Insight', zh_Hans: '无线感知实验智能分析助手' },
    icon: { type: 'svg', value: RFID_ICON },
    description: { en_US: 'Analyze uploaded experiment results using deterministic statistics and a configured model.', zh_Hans: '基于已上传的实验结果进行确定性统计和真实模型解释。' },
    features: [RFID_FEATURE], configSchema: { type: 'object', properties: {} }
  }
  constructor(private readonly service: RfidExperimentInsightService) {}
  getToolNames() { return ['analyze_experiment', 'save_analysis', 'get_analysis'] as const }
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    const scope: ExperimentScope = {
      tenantId: context.tenantId, userId: context.userId,
      organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
      workspaceId: context.workspaceId ?? null, projectId: context.projectId ?? null
    }
    const active = new Map<string, AnalysisAttempt>()
    return { name: RFID_MIDDLEWARE_NAME,
      wrapModelCall: async (request, handler) => {
        try { return await handler(request) }
        catch (error) {
          await Promise.all([...active.values()].map((attempt) => this.service.reportFailure(scope, attempt, 'model')))
          active.clear()
          throw error
        }
      },
      afterAgent: async () => {
        await Promise.all([...active.values()].map((attempt) => this.service.reportFailure(scope, attempt, 'incomplete')))
        active.clear()
      },
      tools: [
      tool(async (attempt) => {
        const result = await this.service.analyzeExperiment(scope, attempt)
        active.set(attempt.attemptId, attempt)
        return JSON.stringify(result)
      }, {
        name: 'analyze_experiment', description: 'Read deterministic statistics for the active analysisId and attemptId supplied by Workbench. Interpret these statistics using the Assistant model, then call save_analysis. Never invent ids or recalculate statistics.', schema: analysisAttemptSchema
      }),
      tool(async ({ aiSummary, ...attempt }) => {
        const result = await this.service.saveInterpretation(scope, attempt, aiSummary)
        active.delete(attempt.attemptId)
        return JSON.stringify(result)
      }, {
        name: 'save_analysis', description: 'Persist the Assistant interpretation in four required sections for user review. This does not confirm the result; only the user can confirm in Workbench.', schema: saveInterpretationSchema
      }),
      tool(async ({ analysisId }) => JSON.stringify((await this.service.getWorkbenchData(scope, analysisId)).item), {
        name: 'get_analysis', description: 'Read a saved experiment analysis by its explicit id, including statistics, AI interpretation and confirmation state.', schema: analysisIdSchema
      })
    ] }
  }
}

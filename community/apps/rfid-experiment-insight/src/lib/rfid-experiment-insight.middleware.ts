import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { STATE_VARIABLE_HUMAN, type TXpertChatRequestHuman, type TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy, RequestContext, WorkspaceFilesRuntimeCapability, type AgentMiddleware, type IAgentMiddlewareContext, type IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
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
  getToolNames() { return ['create_analysis', 'analyze_experiment', 'save_analysis', 'get_analysis'] as const }
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    const scope: ExperimentScope = {
      tenantId: context.tenantId, userId: context.userId,
      organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
      workspaceId: context.workspaceId ?? null, projectId: context.projectId ?? null
    }
    const active = new Map<string, AnalysisAttempt>()
    let attachments: TXpertChatRequestHuman['files']
    let creation: Promise<unknown> | undefined
    return { name: RFID_MIDDLEWARE_NAME,
      wrapModelCall: async (request, handler) => {
        const human = (request.state as Record<string, unknown> | undefined)?.[STATE_VARIABLE_HUMAN] as TXpertChatRequestHuman | undefined
        attachments = human?.files
        const instruction = 'RFID Public Chat supports uploaded CSV files: when Workbench ids are absent, call create_analysis with no arguments to create/start the attached experiment. Use only its returned analysisId and attemptId for analyze_experiment then save_analysis. Never ask the user for ids. If already COMPLETED, use the saved result. Do not calculate statistics yourself. After save_analysis succeeds, call no more tools: answer with the four saved sections and stop. If a tool reports an inactive or stale attempt, do not call create_analysis, get_analysis, or save_analysis again in this run; report that the attempt failed and stop.'
        try { return await handler({ ...request, systemMessage: new SystemMessage([
          ...(request.systemMessage ? [request.systemMessage.text] : []), instruction
        ].join('\n\n')) }) }
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
      tool(async () => {
        creation ??= (async () => {
          if (attachments?.length !== 1) throw new Error('Attach exactly one RFID CSV file to this message.')
          const file = attachments[0]
          if (!('fileAssetId' in file)) throw new Error('The upload must finish before analysis.')
          const fileAssetId = z.string().uuid().parse(file.fileAssetId)
          const files = context.runtime.capabilities?.require(WorkspaceFilesRuntimeCapability)
          if (!files) throw new Error('The host does not provide authorized attachment reading.')
          const uploaded = await files.readRuntimeBuffer(fileAssetId)
          if (!uploaded.buffer.length || uploaded.buffer.length > 1024 * 1024) throw new Error('Upload a nonempty CSV file of at most 1 MiB.')
          const fileName = uploaded.name
          const item = await this.service.importCsv(scope, { requestId: fileAssetId, name: fileName,
            fileName, csv: new TextDecoder('utf-8', { fatal: true }).decode(uploaded.buffer) })
          const current = (await this.service.getWorkbenchData(scope, item.id)).item!
          if (current.status === 'COMPLETED') return current
          const prepared = await this.service.prepareAnalysis(scope, item.id)
          active.set(prepared.attemptId, prepared)
          return { analysisId: prepared.analysisId, attemptId: prepared.attemptId }
        })()
        try { return JSON.stringify(await creation) }
        catch (error) { creation = undefined; throw error }
      }, { name: 'create_analysis', description: 'Create/start the single CSV attached to this chat request. Returns real analysisId and attemptId for analyze_experiment and save_analysis. Takes no ids or paths. Reuses the uploaded analysis on retry.', schema: z.object({}).strict() }),
      tool(async (attempt) => {
        const result = await this.service.analyzeExperiment(scope, attempt)
        active.set(attempt.attemptId, attempt)
        return JSON.stringify(result)
      }, {
        name: 'analyze_experiment', description: 'Read deterministic statistics for the active analysisId and attemptId supplied by Workbench or create_analysis. Interpret these statistics using the Assistant model, then call save_analysis. Never invent ids or recalculate statistics.', schema: analysisAttemptSchema
      }),
      tool(async ({ aiSummary, ...attempt }) => {
        const result = await this.service.saveInterpretation(scope, attempt, aiSummary)
        active.delete(attempt.attemptId)
        return JSON.stringify({ ...result, terminal: true, nextAction: 'respond_with_saved_four_sections_and_stop' })
      }, {
        name: 'save_analysis', description: 'Persist the Assistant interpretation in four required sections for user review. On success, stop calling tools and answer with those four sections. This does not confirm the result; only the user can confirm in Workbench.', schema: saveInterpretationSchema
      }),
      tool(async ({ analysisId }) => JSON.stringify((await this.service.getWorkbenchData(scope, analysisId)).item), {
        name: 'get_analysis', description: 'Read a saved experiment analysis by its explicit id, including statistics, AI interpretation and confirmation state.', schema: analysisIdSchema
      })
    ] }
  }
}

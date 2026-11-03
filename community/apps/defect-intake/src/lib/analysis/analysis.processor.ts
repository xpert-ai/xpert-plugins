import { Injectable } from '@nestjs/common'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { PluginJobProcessor, type ManagedQueueJob, type ManagedQueueJobContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { packageMeta } from '../constants'
import type { AnalysisFailure } from '../../shared/analysis'
import { AnalysisService, analysisJob, analysisQueue } from './analysis.service'
import { analysisConfigSchema } from './config'
import { ANALYSIS_PROMPT, InvalidAnalysisOutput, validateAnalysisOutput } from './domain'

export const queuePayloadSchema = z.object({ attemptId: z.string().uuid() }).strict()
export type QueuePayload = z.infer<typeof queuePayloadSchema>
class ModelTimeout extends Error {}

@Injectable()
@PluginJobProcessor({ pluginName: packageMeta.name, queueName: analysisQueue, jobName: analysisJob, concurrency: 2 })
export class AnalysisProcessor {
  constructor(private readonly service: AnalysisService) {}
  async handle(job: ManagedQueueJob<QueuePayload>, context: ManagedQueueJobContext) {
    const { attemptId } = queuePayloadSchema.parse(job.data)
    if (!context.tenantId || !context.organizationId || !context.userId || context.scopeKey !== 'system:global') return
    const scope = { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }
    const attempt = await this.service.claim(scope, attemptId)
    if (!attempt) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let authorizationResolved = false
    try {
      const work = async () => {
        const resolved = await this.service.resolveRuntime(scope, attempt)
        authorizationResolved = true
        const config = analysisConfigSchema.parse(resolved.options)
        const configured = config.model || await resolved.context.runtime.getDefaultChatModel?.()
        if (!configured?.model || !configured.copilotId) throw new Error('model_unavailable')
        const client = await resolved.context.runtime.createModelClient<BaseChatModel>({ copilotId: configured.copilotId, model: configured.model, modelType: AiModelTypeEnum.LLM, options: { temperature: 0.2, maxRetries: 0, max_tokens: 2500 } }, { abortController: controller })
        const response = await client.invoke([['system', ANALYSIS_PROMPT], ['human', JSON.stringify(attempt.input)]], { signal: controller.signal })
        const text = typeof response.content === 'string' ? response.content : response.content.flatMap(part => part.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('')
        if (text.length > 64000) throw new InvalidAnalysisOutput()
        const normalized = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1')
        let value: unknown
        try { value = JSON.parse(normalized) } catch { throw new InvalidAnalysisOutput() }
        return validateAnalysisOutput(value, attempt.input, attempt.id, attempt.sourceRevision)
      }
      const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ModelTimeout()) }, Math.max(1, Math.min(90000, attempt.deadlineAt.getTime() - Date.now()))) })
      const result = await Promise.race([work(), timeout])
      await this.service.finish(scope, attempt.id, result, null)
    } catch (error) {
      const code: AnalysisFailure = error instanceof ModelTimeout ? 'model_timeout' : error instanceof InvalidAnalysisOutput ? 'invalid_output' : !authorizationResolved ? 'access_denied' : 'model_unavailable'
      // Transport bodies may contain secrets; only stable codes are persisted and displayed.
      await this.service.finish(scope, attempt.id, null, code)
    } finally { if (timer) clearTimeout(timer); controller.abort() }
  }
}

import { Inject, Injectable } from '@nestjs/common'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import {
  PluginJobProcessor,
  WorkspaceFilesRuntimeCapability,
  XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
  processAsyncAIGCManagedJob,
  type AgentMiddlewareRuntimeServiceApi,
  type AsyncAIGCModelClient,
  type ManagedQueueJob,
  type ManagedQueueJobContext,
  type ManagedQueueJobProcessor
} from '@xpert-ai/plugin-sdk'
import { GeminiVeoClient, validateVeoOperationName } from './client.js'
import { VEO_PLUGIN_NAME, VEO_VIDEO_JOB, VEO_VIDEO_QUEUE } from './constants.js'
import { veoResult } from './tools.js'
import {
  VeoModelProvider,
  type VeoGenerationRequest,
  type VeoOperation,
  type VeoVideoJobPayload
} from './types.js'
import { uploadGeneratedVideo } from './workspace-upload.js'

@Injectable()
@PluginJobProcessor({
  pluginName: VEO_PLUGIN_NAME,
  queueName: VEO_VIDEO_QUEUE,
  jobName: VEO_VIDEO_JOB,
  concurrency: 4
})
export class VeoVideoJobProcessor implements ManagedQueueJobProcessor<VeoVideoJobPayload> {
  constructor(
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
    private readonly runtimeService: AgentMiddlewareRuntimeServiceApi
  ) {}

  async handle(job: ManagedQueueJob<VeoVideoJobPayload>, context: ManagedQueueJobContext) {
    const runtime = this.runtimeService.createScopedApi({
      ...job.data.runtimeScope,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId
    })
    if (!runtime.getModelProvider) throw new Error('Google Veo model provider runtime is unavailable')
    const provider = await runtime.getModelProvider(VeoModelProvider)
    if (!provider.copilotId) throw new Error('Google Veo model provider is not configured')
    const client = await runtime.createModelClient<AsyncAIGCModelClient<VeoGenerationRequest, VeoOperation>>(
      { copilotId: provider.copilotId, model: job.data.model, modelType: AiModelTypeEnum.VIDEO },
      { purpose: 'invoke' }
    )
    const workspaceFiles = runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!workspaceFiles) throw new Error('Xpert workspace file runtime is unavailable')
    const downloadClient = new GeminiVeoClient({
      gemini_api_key: requireAuthorizationCredential(provider.authorization, 'ApiKey')
    })

    await processAsyncAIGCManagedJob(job, {
      client,
      provider,
      finalize: async (operation) => {
        const providerTaskId = operation.name
          ? validateVeoOperationName(operation.name)
          : job.data.providerRequestId || job.data.requestId
        const videoUri = readGeneratedVideoUri(operation)
        if (!videoUri) throw new Error(readFilteredOutputMessage(operation))
        const downloaded = await downloadClient.downloadVideo(videoUri)
        const file = await uploadGeneratedVideo({
          workspaceFiles,
          workspaceScope: toWorkspaceScope(job.data),
          buffer: downloaded.buffer,
          fileName: `${safeTaskFileStem(providerTaskId)}.mp4`,
          mimeType: downloaded.mimeType.startsWith('video/') ? downloaded.mimeType : 'video/mp4',
          taskId: providerTaskId
        })
        return veoResult(`Veo generation ${providerTaskId} completed.`, [file], {
          task_id: job.id,
          provider_request_id: providerTaskId,
          request_id: job.data.requestId,
          status: 'succeeded'
        })
      },
      failureMessage: (operation) => normalizeOperationError(operation)
    })
  }
}

function toWorkspaceScope(payload: VeoVideoJobPayload) {
  const scope = payload.runtimeScope
  if (scope.projectId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'projects' as const,
      scopeId: scope.projectId,
      projectId: scope.projectId
    }
  }
  return scope.xpertId
    ? {
        tenantId: scope.tenantId,
        userId: scope.userId,
        catalog: 'xperts' as const,
        scopeId: scope.xpertId,
        xpertId: scope.xpertId,
        isolateByUser: false
      }
    : undefined
}

function requireAuthorizationCredential(value: string, scheme: 'Bearer' | 'ApiKey') {
  const match = new RegExp(`^${scheme}\\s+(.+)$`, 'i').exec(value.trim())
  if (!match?.[1]) throw new Error(`Google Veo model provider authorization must use ${scheme}`)
  return match[1]
}

function readGeneratedVideoUri(operation: VeoOperation) {
  const uri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
  return typeof uri === 'string' && uri.trim() ? uri.trim() : undefined
}

function readFilteredOutputMessage(operation: VeoOperation) {
  const count = operation.response?.generateVideoResponse?.raiMediaFilteredCount ?? 0
  return count > 0
    ? 'The provider safety filters did not return a video.'
    : 'The completed provider operation did not contain a generated video.'
}

function normalizeOperationError(operation: VeoOperation) {
  const error = operation.error
  if (!error) return 'The Veo generation operation failed.'
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message.replace(/https?:\/\/\S+/gi, '[redacted-url]').replace(/[\r\n]+/g, ' ').slice(0, 500)
  }
  return typeof error.status === 'string' && error.status.trim()
    ? error.status.trim()
    : error.code !== undefined
      ? String(error.code)
      : 'The Veo generation operation failed.'
}

function safeTaskFileStem(taskId: string) {
  const lastSegment = taskId.split('/').filter(Boolean).pop() || 'veo-video'
  return lastSegment.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180)
}

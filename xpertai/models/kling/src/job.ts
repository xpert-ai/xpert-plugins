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
import { KlingClient } from './client.js'
import { KLING_PLUGIN_NAME, KLING_VIDEO_JOB, KLING_VIDEO_QUEUE } from './constants.js'
import { klingTaskResult } from './tools.js'
import {
  KlingModelProvider,
  type KlingProviderTask,
  type KlingVideoGenerationRequest,
  type KlingVideoJobPayload
} from './types.js'
import { uploadGeneratedVideo } from './workspace-upload.js'

@Injectable()
@PluginJobProcessor({
  pluginName: KLING_PLUGIN_NAME,
  queueName: KLING_VIDEO_QUEUE,
  jobName: KLING_VIDEO_JOB,
  concurrency: 4
})
export class KlingVideoJobProcessor implements ManagedQueueJobProcessor<KlingVideoJobPayload> {
  constructor(
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
    private readonly runtimeService: AgentMiddlewareRuntimeServiceApi
  ) {}

  async handle(job: ManagedQueueJob<KlingVideoJobPayload>, context: ManagedQueueJobContext) {
    const runtime = this.runtimeService.createScopedApi({
      ...job.data.runtimeScope,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId
    })
    if (!runtime.getModelProvider) throw new Error('Kling model provider runtime is unavailable')
    const provider = await runtime.getModelProvider(KlingModelProvider)
    if (!provider.copilotId) throw new Error('Kling model provider is not configured')
    const client = await runtime.createModelClient<AsyncAIGCModelClient<KlingVideoGenerationRequest, KlingProviderTask>>(
      { copilotId: provider.copilotId, model: job.data.model, modelType: AiModelTypeEnum.VIDEO },
      { purpose: 'invoke' }
    )
    const workspaceFiles = runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!workspaceFiles) throw new Error('Xpert workspace file runtime is unavailable')
    const downloadClient = new KlingClient({
      api_key: requireAuthorizationCredential(provider.authorization, 'Bearer'),
      api_endpoint_host: provider.baseURL
    })

    await processAsyncAIGCManagedJob(job, {
      client,
      provider,
      finalize: async (task) => {
        const output = task.outputs[0]
        if (!output) throw new Error('Kling task succeeded without an MP4 result')
        const downloaded = await downloadClient.downloadBuffer(output.url)
        const file = await uploadGeneratedVideo(
          {
            workspaceFiles,
            workspaceScope: toWorkspaceScope(job.data)
          },
          task.id,
          downloaded.buffer,
          downloaded.mimeType
        )
        return klingTaskResult(task, [file])
      },
      failureMessage: (task) => task.error || `Kling video generation task ${task.id} failed`
    })
  }
}

function toWorkspaceScope(payload: KlingVideoJobPayload) {
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
  if (!match?.[1]) throw new Error(`Kling model provider authorization must use ${scheme}`)
  return match[1]
}

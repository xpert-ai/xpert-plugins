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
import { Siliconflow } from '../types.js'
import { SiliconflowVideoClient } from './client.js'
import { SILICONFLOW_PLUGIN_NAME, SILICONFLOW_VIDEO_JOB, SILICONFLOW_VIDEO_QUEUE } from './constants.js'
import { siliconflowVideoResult } from './tools.js'
import {
  SiliconflowVideo,
  type SiliconflowArtifactFile,
  type SiliconflowVideoGenerationPayload,
  type SiliconflowVideoJobPayload,
  type SiliconflowVideoTask,
  type WorkspaceFilesApi
} from './types.js'
import { extensionFromMimeType, uploadGeneratedAsset } from './workspace-upload.js'

const VIDEO_FOLDER = 'files/siliconflow/videos'

@Injectable()
@PluginJobProcessor({
  pluginName: SILICONFLOW_PLUGIN_NAME,
  queueName: SILICONFLOW_VIDEO_QUEUE,
  jobName: SILICONFLOW_VIDEO_JOB,
  concurrency: 4
})
export class SiliconflowVideoJobProcessor implements ManagedQueueJobProcessor<SiliconflowVideoJobPayload> {
  constructor(
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
    private readonly runtimeService: AgentMiddlewareRuntimeServiceApi
  ) {}

  async handle(job: ManagedQueueJob<SiliconflowVideoJobPayload>, context: ManagedQueueJobContext) {
    const runtime = this.runtimeService.createScopedApi({
      ...job.data.runtimeScope,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId
    })
    if (!runtime.getModelProvider) throw new Error('SiliconFlow model provider runtime is unavailable')
    const provider = await runtime.getModelProvider(Siliconflow)
    if (!provider.copilotId) throw new Error('SiliconFlow model provider is not configured')
    const client = await runtime.createModelClient<
      AsyncAIGCModelClient<SiliconflowVideoGenerationPayload, SiliconflowVideoTask>
    >(
      { copilotId: provider.copilotId, model: job.data.model, modelType: AiModelTypeEnum.VIDEO },
      { purpose: 'invoke' }
    )
    const workspaceFiles = runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!workspaceFiles) throw new Error('Xpert workspace file runtime is unavailable')
    const downloadClient = new SiliconflowVideoClient({
      api_key: requireAuthorizationCredential(provider.authorization, 'Bearer'),
      endpoint_url: provider.baseURL
    })

    await processAsyncAIGCManagedJob(job, {
      client,
      provider,
      finalize: async (task) => finalizeTask(task, job.data.providerRequestId, downloadClient, workspaceFiles, job.data),
      failureMessage: (task) =>
        `SiliconFlow video generation task ${task.requestId || job.data.providerRequestId || job.id} failed${
          task.reason ? `: ${task.reason}` : ''
        }`
    })
  }
}

async function finalizeTask(
  task: SiliconflowVideoTask,
  providerRequestId: string | undefined,
  client: SiliconflowVideoClient,
  workspaceFiles: WorkspaceFilesApi,
  payload: SiliconflowVideoJobPayload
) {
  const taskId = task.requestId || providerRequestId || payload.requestId
  if (!task.results.videos.length) throw new Error(`SiliconFlow video task ${taskId} succeeded without a video result`)
  const files: SiliconflowArtifactFile[] = []
  for (const [index, item] of task.results.videos.entries()) {
    if (!item.url) throw new Error(`SiliconFlow video result ${index + 1} is missing its URL`)
    const video = await client.downloadBuffer(item.url)
    const mimeType = video.mimeType?.startsWith('video/') ? video.mimeType : 'video/mp4'
    const suffix = task.results.videos.length > 1 ? `-${index + 1}` : ''
    const fileName = `${sanitizeFileStem(taskId)}${suffix}.${extensionFromMimeType(mimeType)}`
    files.push(
      await uploadGeneratedAsset({
        workspaceFiles,
        workspaceScope: toWorkspaceScope(payload),
        buffer: video.buffer,
        mimeType,
        folder: VIDEO_FOLDER,
        fileName,
        metadata: { source: 'siliconflow_video_generation', taskId, resultIndex: index, seed: task.results.seed }
      })
    )
  }
  return siliconflowVideoResult(`Video task ${taskId} status: Succeed.`, files, {
    task_id: taskId,
    request_id: payload.requestId,
    status: 'Succeed',
    provider_video_urls: task.results.videos.flatMap((item) => (item.url ? [item.url] : [])),
    seed: task.results.seed,
    inference_seconds: task.results.inference
  })
}

function toWorkspaceScope(payload: SiliconflowVideoJobPayload) {
  const scope = payload.runtimeScope
  if (scope.projectId) {
    return { tenantId: scope.tenantId, userId: scope.userId, catalog: 'projects' as const, scopeId: scope.projectId, projectId: scope.projectId }
  }
  return scope.xpertId
    ? { tenantId: scope.tenantId, userId: scope.userId, catalog: 'xperts' as const, scopeId: scope.xpertId, xpertId: scope.xpertId, isolateByUser: false }
    : undefined
}

function requireAuthorizationCredential(value: string, scheme: 'Bearer' | 'ApiKey') {
  const match = new RegExp(`^${scheme}\\s+(.+)$`, 'i').exec(value.trim())
  if (!match?.[1]) throw new Error(`SiliconFlow model provider authorization must use ${scheme}`)
  return match[1]
}

function sanitizeFileStem(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '')
  return sanitized.slice(0, 160) || 'siliconflow-video'
}

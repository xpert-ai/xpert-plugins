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
import { Volcengine } from '../types.js'
import { SeedreamArkClient } from './client.js'
import { VOLCENGINE_PLUGIN_NAME, VOLCENGINE_VIDEO_JOB, VOLCENGINE_VIDEO_QUEUE } from './constants.js'
import { seedreamResult } from './tools.js'
import type { SeedanceVideoJobPayload, SeedanceVideoTask, WorkspaceFilesApi } from './types.js'
import { uploadGeneratedAsset } from './workspace-upload.js'

const VIDEO_FOLDER = 'files/seedream-aigc/videos'

@Injectable()
@PluginJobProcessor({
  pluginName: VOLCENGINE_PLUGIN_NAME,
  queueName: VOLCENGINE_VIDEO_QUEUE,
  jobName: VOLCENGINE_VIDEO_JOB,
  concurrency: 4
})
export class SeedanceVideoJobProcessor implements ManagedQueueJobProcessor<SeedanceVideoJobPayload> {
  constructor(
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
    private readonly runtimeService: AgentMiddlewareRuntimeServiceApi
  ) {}

  async handle(job: ManagedQueueJob<SeedanceVideoJobPayload>, context: ManagedQueueJobContext) {
    const runtime = this.runtimeService.createScopedApi({
      ...job.data.runtimeScope,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId
    })
    if (!runtime.getModelProvider) throw new Error('Volcengine model provider runtime is unavailable')
    const provider = await runtime.getModelProvider(Volcengine)
    if (!provider.copilotId) throw new Error('Volcengine model provider is not configured')
    const client = await runtime.createModelClient<AsyncAIGCModelClient<Record<string, unknown>, SeedanceVideoTask>>(
      { copilotId: provider.copilotId, model: job.data.model, modelType: AiModelTypeEnum.VIDEO },
      { purpose: 'invoke' }
    )
    const workspaceFiles = runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!workspaceFiles) throw new Error('Xpert workspace file runtime is unavailable')
    const downloadClient = new SeedreamArkClient({
      ark_api_key: requireAuthorizationCredential(provider.authorization, 'Bearer'),
      api_endpoint_host: provider.baseURL
    })

    await processAsyncAIGCManagedJob(job, {
      client,
      provider,
      finalize: async (task) => finalizeTask(task, job.data.providerRequestId, downloadClient, workspaceFiles, job.data),
      failureMessage: (task) => formatTaskError(task, job.data.providerRequestId || job.id)
    })
  }
}

async function finalizeTask(
  task: SeedanceVideoTask,
  providerRequestId: string | undefined,
  client: SeedreamArkClient,
  workspaceFiles: WorkspaceFilesApi,
  payload: SeedanceVideoJobPayload
) {
  const taskId = task.id || providerRequestId || payload.requestId
  const videoUrl = task.content?.video_url
  if (!videoUrl) throw new Error(`Seedance video task ${taskId} succeeded without a video URL`)
  const { buffer, mimeType } = await client.downloadBuffer(videoUrl)
  const resolvedMimeType = mimeType || 'video/mp4'
  const file = await uploadGeneratedAsset({
    workspaceFiles,
    workspaceScope: toWorkspaceScope(payload),
    buffer,
    mimeType: resolvedMimeType,
    folder: VIDEO_FOLDER,
    fileName: `${sanitizeFileStem(taskId)}.mp4`,
    metadata: { source: 'ark_video_generation', taskId, arkUrl: videoUrl }
  })
  return seedreamResult(`Video task ${taskId} status: ${task.status || 'succeeded'}.`, [file], {
    task_id: payload.requestId,
    provider_request_id: taskId,
    request_id: payload.requestId,
    status: task.status,
    video_url: videoUrl,
    last_frame_url: task.content?.last_frame_url,
    model: task.model || payload.model,
    usage: task.usage
  })
}

function toWorkspaceScope(payload: SeedanceVideoJobPayload) {
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
  if (!match?.[1]) throw new Error(`Volcengine model provider authorization must use ${scheme}`)
  return match[1]
}

function sanitizeFileStem(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '')
  return sanitized.slice(0, 160) || 'seedance-video'
}

function formatTaskError(task: SeedanceVideoTask, fallbackId?: string) {
  const id = task.id || fallbackId || 'unknown'
  if (typeof task.error === 'string' && task.error.trim()) {
    return `Seedance video generation task ${id} failed: ${task.error.trim()}`
  }
  if (task.error && typeof task.error === 'object' && !Array.isArray(task.error) && 'message' in task.error) {
    const message = task.error.message
    if (typeof message === 'string' && message.trim()) {
      return `Seedance video generation task ${id} failed: ${message.trim()}`
    }
  }
  return `Seedance video generation task ${id} failed`
}

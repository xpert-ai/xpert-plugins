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
import { ZhipuAIModelProvider } from '../types.js'
import { ZhipuCogVideoClient } from './client.js'
import { ZHIPUAI_PLUGIN_NAME, ZHIPUAI_VIDEO_JOB, ZHIPUAI_VIDEO_QUEUE } from './constants.js'
import { zhipuCogVideoResult } from './tools.js'
import type {
  WorkspaceFilesApi,
  ZhipuArtifactFile,
  ZhipuVideoGenerationPayload,
  ZhipuVideoJobPayload,
  ZhipuVideoTask
} from './types.js'
import { extensionFromMimeType, uploadGeneratedAsset } from './workspace-upload.js'

const VIDEO_FOLDER = 'files/zhipuai/cogvideo/videos'
const COVER_FOLDER = 'files/zhipuai/cogvideo/covers'
const MAX_COVER_BYTES = 20 * 1024 * 1024

@Injectable()
@PluginJobProcessor({
  pluginName: ZHIPUAI_PLUGIN_NAME,
  queueName: ZHIPUAI_VIDEO_QUEUE,
  jobName: ZHIPUAI_VIDEO_JOB,
  concurrency: 4
})
export class ZhipuVideoJobProcessor implements ManagedQueueJobProcessor<ZhipuVideoJobPayload> {
  constructor(
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
    private readonly runtimeService: AgentMiddlewareRuntimeServiceApi
  ) {}

  async handle(job: ManagedQueueJob<ZhipuVideoJobPayload>, context: ManagedQueueJobContext) {
    const runtime = this.runtimeService.createScopedApi({
      ...job.data.runtimeScope,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId
    })
    if (!runtime.getModelProvider) throw new Error('ZhipuAI model provider runtime is unavailable')
    const provider = await runtime.getModelProvider(ZhipuAIModelProvider)
    if (!provider.copilotId) throw new Error('ZhipuAI model provider is not configured')
    const client = await runtime.createModelClient<AsyncAIGCModelClient<ZhipuVideoGenerationPayload, ZhipuVideoTask>>(
      { copilotId: provider.copilotId, model: job.data.model, modelType: AiModelTypeEnum.VIDEO },
      { purpose: 'invoke' }
    )
    const workspaceFiles = runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!workspaceFiles) throw new Error('Xpert workspace file runtime is unavailable')
    const downloadClient = new ZhipuCogVideoClient({
      api_key: requireAuthorizationCredential(provider.authorization, 'Bearer'),
      endpoint_url: provider.baseURL
    })

    await processAsyncAIGCManagedJob(job, {
      client,
      provider,
      finalize: async (task) =>
        finalizeTask(task, job.data.providerRequestId, downloadClient, workspaceFiles, job.data),
      failureMessage: (task) =>
        `ZhipuAI video generation task ${task.id || job.data.providerRequestId || job.id} failed${formatTaskError(
          task.error
        )}`
    })
  }
}

async function finalizeTask(
  task: ZhipuVideoTask,
  providerRequestId: string | undefined,
  client: ZhipuCogVideoClient,
  workspaceFiles: WorkspaceFilesApi,
  payload: ZhipuVideoJobPayload
) {
  const taskId = task.id || providerRequestId || payload.requestId
  if (!task.video_result.length) throw new Error(`ZhipuAI video task ${taskId} succeeded without a video result`)
  const files = await downloadTaskFiles(task, taskId, client, workspaceFiles, payload)
  return zhipuCogVideoResult(`Video task ${taskId} status: SUCCESS.`, files, {
    task_id: taskId,
    request_id: payload.requestId,
    status: 'SUCCESS',
    model: task.model || payload.model,
    provider_video_urls: task.video_result.flatMap((item) => (item.url ? [item.url] : [])),
    cover_image_urls: task.video_result.flatMap((item) => (item.cover_image_url ? [item.cover_image_url] : []))
  })
}

async function downloadTaskFiles(
  task: ZhipuVideoTask,
  taskId: string,
  client: ZhipuCogVideoClient,
  workspaceFiles: WorkspaceFilesApi,
  payload: ZhipuVideoJobPayload
) {
  const files: ZhipuArtifactFile[] = []
  const safeTaskId = sanitizeFileStem(taskId)

  for (const [index, item] of task.video_result.entries()) {
    if (!item.url) throw new Error(`ZhipuAI video result ${index + 1} is missing its URL`)
    const video = await client.downloadBuffer(item.url)
    const videoMimeType = video.mimeType || 'video/mp4'
    if (!videoMimeType.startsWith('video/')) {
      throw new Error(`ZhipuAI video result ${index + 1} returned an invalid MIME type`)
    }
    const suffix = task.video_result.length > 1 ? `-${index + 1}` : ''
    const videoFileName = `${safeTaskId}${suffix}.${extensionFromMimeType(videoMimeType)}`
    files.push(
      await uploadGeneratedAsset({
        workspaceFiles,
        workspaceScope: toWorkspaceScope(payload),
        buffer: video.buffer,
        mimeType: videoMimeType,
        folder: VIDEO_FOLDER,
        fileName: videoFileName,
        metadata: { source: 'zhipu_cogvideo_generation', taskId, model: task.model, resultIndex: index }
      })
    )

    if (item.cover_image_url) {
      const cover = await client.downloadBuffer(item.cover_image_url)
      const coverMimeType = cover.mimeType || 'image/jpeg'
      if (!coverMimeType.startsWith('image/')) {
        throw new Error(`ZhipuAI cover image ${index + 1} returned an invalid MIME type`)
      }
      if (cover.buffer.length > MAX_COVER_BYTES) {
        throw new Error(`ZhipuAI cover image ${index + 1} exceeds the 20MB limit`)
      }
      const coverFileName = `${safeTaskId}${suffix}-cover.${extensionFromMimeType(coverMimeType)}`
      files.push(
        await uploadGeneratedAsset({
          workspaceFiles,
          workspaceScope: toWorkspaceScope(payload),
          buffer: cover.buffer,
          mimeType: coverMimeType,
          folder: COVER_FOLDER,
          fileName: coverFileName,
          metadata: { source: 'zhipu_cogvideo_cover', taskId, model: task.model, resultIndex: index }
        })
      )
    }
  }
  return files
}

function toWorkspaceScope(payload: ZhipuVideoJobPayload) {
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
  if (!match?.[1]) throw new Error(`ZhipuAI model provider authorization must use ${scheme}`)
  return match[1]
}

function sanitizeFileStem(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '')
  return sanitized.slice(0, 160) || 'zhipu-video'
}

function formatTaskError(value: unknown) {
  if (typeof value === 'string' && value.trim()) return `: ${value.trim()}`
  if (value && typeof value === 'object' && !Array.isArray(value) && 'message' in value) {
    const message = value.message
    if (typeof message === 'string' && message.trim()) return `: ${message.trim()}`
  }
  return ''
}

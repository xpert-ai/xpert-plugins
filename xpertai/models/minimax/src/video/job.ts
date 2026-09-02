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
import { MiniMax } from '../types.js'
import { MiniMaxVideoClient } from './client.js'
import { MINIMAX_PLUGIN_NAME, MINIMAX_VIDEO_JOB, MINIMAX_VIDEO_QUEUE } from './constants.js'
import { miniMaxVideoResult } from './tools.js'
import type { MiniMaxVideoGenerationPayload, MiniMaxVideoJobPayload, MiniMaxVideoTask } from './types.js'
import { uploadMiniMaxVideo } from './workspace-upload.js'

@Injectable()
@PluginJobProcessor({
  pluginName: MINIMAX_PLUGIN_NAME,
  queueName: MINIMAX_VIDEO_QUEUE,
  jobName: MINIMAX_VIDEO_JOB,
  concurrency: 4
})
export class MiniMaxVideoJobProcessor implements ManagedQueueJobProcessor<MiniMaxVideoJobPayload> {
  constructor(
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
    private readonly runtimeService: AgentMiddlewareRuntimeServiceApi
  ) {}

  async handle(job: ManagedQueueJob<MiniMaxVideoJobPayload>, context: ManagedQueueJobContext) {
    const runtime = this.runtimeService.createScopedApi({
      ...job.data.runtimeScope,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId
    })
    if (!runtime.getModelProvider) throw new Error('MiniMax model provider runtime is unavailable')
    const provider = await runtime.getModelProvider(MiniMax)
    if (!provider.copilotId) throw new Error('MiniMax model provider is not configured')
    const client = await runtime.createModelClient<
      AsyncAIGCModelClient<MiniMaxVideoGenerationPayload, MiniMaxVideoTask>
    >(
      { copilotId: provider.copilotId, model: job.data.model, modelType: AiModelTypeEnum.VIDEO },
      { purpose: 'invoke' }
    )
    const workspaceFiles = runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!workspaceFiles) throw new Error('Xpert workspace file runtime is unavailable')
    const downloadClient = new MiniMaxVideoClient({
      api_key: requireBearer(provider.authorization),
      group_id: '',
      base_url: provider.baseURL
    })

    await processAsyncAIGCManagedJob(job, {
      client,
      provider,
      finalize: async (task) => {
        const url = task.content?.url
        if (!url) throw new Error(`MiniMax video task ${task.id} succeeded without a video URL`)
        const downloaded = await downloadClient.downloadBuffer(url)
        const file = await uploadMiniMaxVideo({
          workspaceFiles,
          workspaceScope: toWorkspaceScope(job.data),
          buffer: downloaded.buffer,
          mimeType: downloaded.mimeType.startsWith('video/') ? downloaded.mimeType : 'video/mp4',
          fileName: `${safeFileStem(task.id)}.mp4`,
          taskId: task.id
        })
        return miniMaxVideoResult(`MiniMax video task ${task.id} completed.`, [file], {
          task_id: job.id,
          provider_request_id: task.id,
          request_id: job.data.requestId,
          status: task.status,
          resolution: task.resolution,
          duration: task.duration
        })
      },
      failureMessage: (task) => task.error?.message || `MiniMax video task ${task.id} failed`
    })
  }
}

function toWorkspaceScope(payload: MiniMaxVideoJobPayload) {
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

function requireBearer(value: string) {
  const match = /^Bearer\s+(.+)$/iu.exec(value.trim())
  if (!match?.[1]) throw new Error('MiniMax model provider authorization must use Bearer')
  return match[1]
}

function safeFileStem(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 180) || 'minimax-h3-video'
}

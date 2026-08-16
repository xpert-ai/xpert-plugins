import { ZhipuAIDefaultBaseUrl } from '../types.js'
import type {
  AgentMiddlewareRuntimeScope,
  AsyncAIGCManagedJobPayload,
  ManagedQueueService,
  WorkspaceFile as PlatformWorkspaceFile,
  WorkspaceFileCatalog as PlatformWorkspaceFileCatalog,
  WorkspaceFileScope,
  WorkspaceMediaFilesApi,
  WorkspaceRuntimeFileDescriptor,
  WorkspaceUploadBufferInput as PlatformWorkspaceUploadBufferInput
} from '@xpert-ai/plugin-sdk'

export const ZhipuCogVideo = 'zhipu_cogvideo'
export const ZhipuCogVideoDefaultBaseUrl = ZhipuAIDefaultBaseUrl

export type ZhipuCogVideoCredentials = {
  api_key?: string
  endpoint_url?: string
}

export type WorkspaceFileCatalog = PlatformWorkspaceFileCatalog
export type ZhipuWorkspaceScope = WorkspaceFileScope
export type WorkspaceUploadBufferInput = PlatformWorkspaceUploadBufferInput
export type WorkspaceFile = PlatformWorkspaceFile
export type WorkspaceFilesApi = WorkspaceMediaFilesApi<WorkspaceFileScope & WorkspaceRuntimeFileDescriptor>

export type ZhipuVideoTaskStatus = 'PROCESSING' | 'SUCCESS' | 'FAIL' | string

export type ZhipuVideoResult = {
  url?: string
  cover_image_url?: string
}

export type ZhipuVideoTask = {
  id?: string
  model?: string
  video_result: ZhipuVideoResult[]
  task_status?: ZhipuVideoTaskStatus
  request_id?: string
  error?: unknown
}

export type ZhipuVideoGenerationPayload = {
  model: string
  prompt?: string
  image_url?: string
  quality?: 'quality' | 'speed'
  with_audio?: boolean
  size?: string
  duration?: number
  fps?: number
  request_id?: string
  user_id?: string
}

export type ZhipuArtifactFile = {
  fileName: string
  filePath: string
  workspacePath: string
  fileUrl?: string
  url?: string
  mimeType: string
  size?: number
  catalog?: WorkspaceFileCatalog
  scopeId?: string
  extension: string
  provider: typeof ZhipuCogVideo
}

export type ZhipuCogVideoArtifact = {
  files: ZhipuArtifactFile[]
  data?: Record<string, unknown>
}

export type ZhipuCogVideoToolResult = [string, ZhipuCogVideoArtifact]

export type ZhipuCogVideoToolDependencies = {
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: ZhipuWorkspaceScope
  managedQueue?: ManagedQueueService
  pluginScopeKey?: string
  runtimeScope?: AgentMiddlewareRuntimeScope
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}

export type ZhipuVideoJobPayload = AsyncAIGCManagedJobPayload<
  ZhipuVideoGenerationPayload,
  ZhipuCogVideoToolResult
> & {
  runtimeScope: AgentMiddlewareRuntimeScope
}

export { ZhipuAIDefaultBaseUrl }

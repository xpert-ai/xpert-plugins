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

export const SiliconflowVideo = 'siliconflow_video'
export const SiliconflowVideoDefaultBaseUrl = 'https://api.siliconflow.cn/v1'

export const SiliconflowVideoTextModel = 'Wan-AI/Wan2.2-T2V-A14B'
export const SiliconflowVideoImageModel = 'Wan-AI/Wan2.2-I2V-A14B'

export const SiliconflowVideoModels = [SiliconflowVideoTextModel, SiliconflowVideoImageModel] as const
export const SiliconflowVideoSizes = ['1280x720', '720x1280', '960x960'] as const

export type SiliconflowVideoModel = (typeof SiliconflowVideoModels)[number]
export type SiliconflowVideoSize = (typeof SiliconflowVideoSizes)[number]

export type SiliconflowVideoCredentials = {
  api_key?: string
  endpoint_url?: string
}

export type WorkspaceFileCatalog = PlatformWorkspaceFileCatalog
export type SiliconflowWorkspaceScope = WorkspaceFileScope
export type WorkspaceUploadBufferInput = PlatformWorkspaceUploadBufferInput
export type WorkspaceFile = PlatformWorkspaceFile
export type WorkspaceFilesApi = WorkspaceMediaFilesApi<WorkspaceFileScope & WorkspaceRuntimeFileDescriptor>

export type SiliconflowVideoGenerationPayload = {
  model: SiliconflowVideoModel
  prompt: string
  negative_prompt?: string
  image_size?: SiliconflowVideoSize
  image?: string
  seed?: number
}

export type SiliconflowVideoStatus = 'Succeed' | 'InQueue' | 'InProgress' | 'Failed' | string

export type SiliconflowVideoResult = {
  url?: string
}

export type SiliconflowVideoTask = {
  requestId?: string
  status?: SiliconflowVideoStatus
  reason?: string
  results: {
    videos: SiliconflowVideoResult[]
    seed?: number
    inference?: number
  }
}

export type SiliconflowArtifactFile = {
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
  provider: typeof SiliconflowVideo
}

export type SiliconflowVideoArtifact = {
  files: SiliconflowArtifactFile[]
  data?: Record<string, unknown>
}

export type SiliconflowVideoToolResult = [string, SiliconflowVideoArtifact]

export type SiliconflowVideoToolDependencies = {
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: SiliconflowWorkspaceScope
  managedQueue?: ManagedQueueService
  pluginScopeKey?: string
  runtimeScope?: AgentMiddlewareRuntimeScope
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}

export type SiliconflowVideoJobPayload = AsyncAIGCManagedJobPayload<
  SiliconflowVideoGenerationPayload,
  SiliconflowVideoToolResult
> & {
  runtimeScope: AgentMiddlewareRuntimeScope
}

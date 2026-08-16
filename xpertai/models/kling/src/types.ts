import type {
  AgentMiddlewareRuntimeScope,
  AsyncAIGCManagedJobPayload,
  ManagedQueueService,
  WorkspaceFile as PlatformWorkspaceFile,
  WorkspaceFileCatalog as PlatformWorkspaceFileCatalog,
  WorkspaceFileScope,
  WorkspaceMediaFilesApi,
  WorkspaceUploadBufferInput as PlatformWorkspaceUploadBufferInput
} from '@xpert-ai/plugin-sdk'

export const KlingVideo = 'kling_video'
export const KlingModelProvider = 'kling'
export const KlingDefaultBaseUrl = 'https://api-singapore.klingai.com'

export type KlingCredentials = {
  api_key?: string
  api_endpoint_host?: string
}

export type WorkspaceFileCatalog = PlatformWorkspaceFileCatalog
export type WorkspaceUploadBufferInput = PlatformWorkspaceUploadBufferInput
export type WorkspaceFile = PlatformWorkspaceFile
export type WorkspaceFilesApi = WorkspaceMediaFilesApi
export type KlingWorkspaceScope = WorkspaceFileScope

export type KlingToolDependencies = {
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: KlingWorkspaceScope
  managedQueue?: ManagedQueueService
  pluginScopeKey?: string
  runtimeScope?: AgentMiddlewareRuntimeScope
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}

export type KlingVideoGenerationRequest = {
  path: string
  payload: Record<string, unknown>
}

export type KlingArtifactFile = {
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
  provider: typeof KlingVideo
}

export type KlingToolArtifact = {
  files: KlingArtifactFile[]
  data?: Record<string, unknown>
}

export type KlingToolResult = [string, KlingToolArtifact]

export type KlingVideoJobPayload = AsyncAIGCManagedJobPayload<KlingVideoGenerationRequest, KlingToolResult> & {
  runtimeScope: AgentMiddlewareRuntimeScope
}

export type KlingProviderTaskStatus = 'submitted' | 'processing' | 'succeeded' | 'failed'

export type KlingProviderTask = {
  id: string
  status: KlingProviderTaskStatus
  model?: string
  createdAt?: number
  updatedAt?: number
  error?: string
  outputs: Array<{
    type: 'video'
    id?: string
    url: string
    duration?: number
  }>
}

import type {
  AgentMiddlewareModelProviderConnection,
  AgentMiddlewareRuntimeScope,
  AIGCModelClient,
  AsyncAIGCManagedJobPayload,
  ManagedQueueService,
  WorkspaceFile as PlatformWorkspaceFile,
  WorkspaceFileCatalog as PlatformWorkspaceFileCatalog,
  WorkspaceFileScope,
  WorkspaceMediaFilesApi,
  WorkspaceUploadBufferInput as PlatformWorkspaceUploadBufferInput
} from '@xpert-ai/plugin-sdk'

export const SeedreamAigc = 'seedream_aigc'
export const SeedreamAigcDefaultBaseUrl = 'https://ark.cn-beijing.volces.com/api/v3'

export type SeedreamAigcCredentials = {
  ark_api_key?: string
  api_endpoint_host?: string
}

export type WorkspaceFileCatalog = PlatformWorkspaceFileCatalog
export type WorkspaceUploadBufferInput = PlatformWorkspaceUploadBufferInput
export type WorkspaceFile = PlatformWorkspaceFile
export type WorkspaceFilesApi = WorkspaceMediaFilesApi
export type SeedreamWorkspaceScope = WorkspaceFileScope

export type SeedreamImageResponse = {
  id?: unknown
  request_id?: unknown
  usage?: unknown
  data?: unknown
}

export type SeedreamToolDependencies = {
  credentials: SeedreamAigcCredentials
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: SeedreamWorkspaceScope
  managedQueue?: ManagedQueueService
  pluginScopeKey?: string
  runtimeScope?: AgentMiddlewareRuntimeScope
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
  createImageModelClient?: (
    model: string
  ) => Promise<AIGCModelClient<Record<string, unknown>, SeedreamImageResponse>>
  modelProvider?: AgentMiddlewareModelProviderConnection
}

export type SeedanceVideoUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export type SeedanceVideoTask = {
  id?: string
  status?: string
  model?: string
  content?: {
    video_url?: string
    last_frame_url?: string
  }
  error?: unknown
  usage?: SeedanceVideoUsage
}

export type SeedreamArtifactFile = {
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
  provider: typeof SeedreamAigc
}

export type SeedreamToolArtifact = {
  files: SeedreamArtifactFile[]
  data?: Record<string, unknown>
}

export type SeedreamToolResult = [string, SeedreamToolArtifact]

export type SeedanceVideoJobPayload = AsyncAIGCManagedJobPayload<Record<string, unknown>, SeedreamToolResult> & {
  runtimeScope: AgentMiddlewareRuntimeScope
}

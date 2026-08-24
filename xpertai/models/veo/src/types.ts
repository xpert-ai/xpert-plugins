import type {
  AgentMiddlewareRuntimeScope,
  AsyncAIGCManagedJobPayload,
  ManagedQueueService,
  WorkspaceFile as PlatformWorkspaceFile,
  WorkspaceFileCatalog as PlatformWorkspaceFileCatalog,
  WorkspaceFileLocator,
  WorkspaceFileScope,
  WorkspaceMediaFilesApi,
  WorkspaceUploadBufferInput as PlatformWorkspaceUploadBufferInput
} from '@xpert-ai/plugin-sdk'

export const VeoToolsetName = 'veo_video_generation'
export const VeoModelProvider = 'veo'
export const VeoApiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta'

export const VeoModels = ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview'] as const

export type VeoModel = (typeof VeoModels)[number]

export const VeoSvgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#fff"/><path d="M9 12h9l6 14 6-14h9L27.6 37h-7.2L9 12Z" fill="#4285F4"/><path d="m18 12 6 14 3.6-8L25 12h-7Z" fill="#34A853"/><path d="m30 12-2.4 6L30 23.3 39 12h-9Z" fill="#EA4335"/><path d="m24 26-3.6 8L24 37l3.6-3L24 26Z" fill="#FBBC04"/></svg>`

export type VeoCredentials = {
  gemini_api_key?: string
}

export type WorkspaceFileCatalog = PlatformWorkspaceFileCatalog
export type WorkspaceUploadBufferInput = PlatformWorkspaceUploadBufferInput
export type WorkspaceFile = PlatformWorkspaceFile
export type WorkspaceRuntimeLocator = WorkspaceFileLocator
export type WorkspaceFilesApi = WorkspaceMediaFilesApi
export type VeoWorkspaceScope = WorkspaceFileScope

export type VeoToolDependencies = {
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: VeoWorkspaceScope
  managedQueue?: ManagedQueueService
  pluginScopeKey?: string
  runtimeScope?: AgentMiddlewareRuntimeScope
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}

export type VeoGenerationRequest = {
  model: VeoModel
  payload: Record<string, unknown>
}

export type VeoInlineImage = {
  inlineData: {
    mimeType: string
    data: string
  }
}

export type VeoOperationError = {
  code?: string | number
  message?: string
  status?: string
}

export type VeoOperation = {
  name?: string
  done?: boolean
  error?: VeoOperationError
  metadata?: Record<string, unknown>
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: {
          uri?: string
          mimeType?: string
        }
      }>
      raiMediaFilteredCount?: number
      raiMediaFilteredReasons?: string[]
    }
  }
}

export type VeoArtifactFile = {
  fileName: string
  filePath: string
  workspacePath: string
  fileUrl?: string
  url?: string
  mimeType: string
  size?: number
  catalog?: WorkspaceFileCatalog
  scopeId?: string
  extension: 'mp4'
  provider: typeof VeoToolsetName
}

export type VeoToolArtifact = {
  files: VeoArtifactFile[]
  data?: Record<string, unknown>
}

export type VeoToolResult = [string, VeoToolArtifact]

export type VeoVideoJobPayload = AsyncAIGCManagedJobPayload<VeoGenerationRequest, VeoToolResult> & {
  runtimeScope: AgentMiddlewareRuntimeScope
}

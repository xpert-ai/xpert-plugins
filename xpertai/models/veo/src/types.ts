export const VeoToolsetName = 'veo_video_generation'
export const VeoWorkspaceCapability = 'platform.workspace.files'
export const VeoApiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta'

export const VeoModels = [
  'veo-3.1-generate-preview',
  'veo-3.1-fast-generate-preview'
] as const

export type VeoModel = (typeof VeoModels)[number]

export const VeoSvgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#fff"/><path d="M9 12h9l6 14 6-14h9L27.6 37h-7.2L9 12Z" fill="#4285F4"/><path d="m18 12 6 14 3.6-8L25 12h-7Z" fill="#34A853"/><path d="m30 12-2.4 6L30 23.3 39 12h-9Z" fill="#EA4335"/><path d="m24 26-3.6 8L24 37l3.6-3L24 26Z" fill="#FBBC04"/></svg>`

export type VeoCredentials = {
  gemini_api_key?: string
}

export type WorkspaceFileCatalog =
  | 'projects'
  | 'users'
  | 'knowledges'
  | 'skills'
  | 'xperts'

export type WorkspaceUploadBufferInput = {
  tenantId?: string | null
  userId?: string | null
  catalog?: WorkspaceFileCatalog | null
  scopeId?: string | null
  projectId?: string | null
  xpertId?: string | null
  isolateByUser?: boolean | null
  buffer: Buffer
  originalName: string
  mimeType?: string | null
  size?: number | null
  folder?: string | null
  fileName?: string | null
  metadata?: Record<string, unknown>
}

export type WorkspaceFile = {
  name: string
  filePath: string
  workspacePath: string
  fileUrl?: string
  url?: string
  mimeType?: string
  size?: number
  catalog: WorkspaceFileCatalog
  scopeId?: string
  metadata?: Record<string, unknown>
}

export type WorkspaceRuntimeLocator =
  | string
  | ({
      source?: string
      path?: string | null
      filePath?: string | null
      workspacePath?: string | null
      mimeType?: string | null
      mimetype?: string | null
      name?: string | null
      originalName?: string | null
    } & Record<string, unknown>)

export type WorkspaceFilesApi = {
  uploadBuffer(input: WorkspaceUploadBufferInput): Promise<WorkspaceFile>
  readBuffer(
    input: { filePath: string } & Record<string, unknown>
  ): Promise<WorkspaceFile & { buffer: Buffer }>
  readRuntimeBuffer?(
    input: WorkspaceRuntimeLocator
  ): Promise<WorkspaceFile & { buffer: Buffer }>
  deleteFile(input: { filePath: string } & Record<string, unknown>): Promise<void>
}

export type RuntimeCapabilityRegistryLike = {
  get<T>(key: string): T | undefined
}

export type VeoWorkspaceScope = Omit<
  WorkspaceUploadBufferInput,
  'buffer' | 'originalName'
>

export type VeoToolDependencies = {
  credentials: VeoCredentials
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: VeoWorkspaceScope
  fetch?: typeof fetch
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

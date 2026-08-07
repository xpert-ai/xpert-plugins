export const KlingVideo = 'kling_video'
export const KlingWorkspaceCapability = 'platform.workspace.files'
export const KlingDefaultBaseUrl = 'https://api-singapore.klingai.com'

export type KlingCredentials = {
  api_key?: string
  api_endpoint_host?: string
}

export type WorkspaceFileCatalog = 'projects' | 'users' | 'knowledges' | 'skills' | 'xperts'

export type WorkspaceUploadBufferInput = {
  tenantId?: string | null
  userId?: string | null
  catalog?: WorkspaceFileCatalog | null
  scopeId?: string | null
  projectId?: string | null
  knowledgeId?: string | null
  rootId?: string | null
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

export type WorkspaceFilesApi = {
  uploadBuffer(input: WorkspaceUploadBufferInput): Promise<WorkspaceFile>
  readBuffer(input: { filePath: string } & Record<string, unknown>): Promise<WorkspaceFile & { buffer: Buffer }>
  readRuntimeBuffer?(
    input:
      | string
      | ({
          path?: string | null
          filePath?: string | null
          workspacePath?: string | null
          mimeType?: string | null
          mimetype?: string | null
          name?: string | null
          originalName?: string | null
        } & Record<string, unknown>)
  ): Promise<WorkspaceFile & { buffer: Buffer }>
  deleteFile(input: { filePath: string } & Record<string, unknown>): Promise<void>
}

export type RuntimeCapabilityRegistryLike = {
  get<T>(key: string): T | undefined
  require?<T>(key: string): T
}

export type KlingWorkspaceScope = Omit<WorkspaceUploadBufferInput, 'buffer' | 'originalName'> & {
  catalog?: WorkspaceFileCatalog | null
}

export type KlingToolDependencies = {
  credentials: KlingCredentials
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: KlingWorkspaceScope
  fetch?: typeof fetch
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

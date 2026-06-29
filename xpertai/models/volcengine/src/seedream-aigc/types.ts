export const SeedreamAigc = 'seedream_aigc'
export const SeedreamAigcWorkspaceCapability = 'platform.workspace.files'
export const SeedreamAigcDefaultBaseUrl = 'https://ark.cn-beijing.volces.com/api/v3'

export type SeedreamAigcCredentials = {
  ark_api_key?: string
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
  deleteFile(input: { filePath: string } & Record<string, unknown>): Promise<void>
}

export type RuntimeCapabilityRegistryLike = {
  get<T>(key: string): T | undefined
  require?<T>(key: string): T
}

export type SeedreamWorkspaceScope = Omit<WorkspaceUploadBufferInput, 'buffer' | 'originalName'> & {
  catalog?: WorkspaceFileCatalog | null
}

export type SeedreamToolDependencies = {
  credentials: SeedreamAigcCredentials
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: SeedreamWorkspaceScope
  fetch?: typeof fetch
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

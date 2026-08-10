export const SiliconflowVideo = 'siliconflow_video'
export const SiliconflowVideoWorkspaceCapability = 'platform.workspace.files'
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

export type WorkspaceFileCatalog = 'projects' | 'users' | 'knowledges' | 'skills' | 'xperts'

export type SiliconflowWorkspaceScope = {
  tenantId?: string
  userId?: string
  catalog?: WorkspaceFileCatalog
  scopeId?: string
  projectId?: string
  xpertId?: string
  isolateByUser?: boolean
}

export type WorkspaceUploadBufferInput = SiliconflowWorkspaceScope & {
  buffer: Buffer
  originalName: string
  mimeType?: string
  size?: number
  folder?: string
  fileName?: string
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
  readBuffer(input: SiliconflowWorkspaceScope & { filePath: string }): Promise<WorkspaceFile & { buffer: Buffer }>
  readRuntimeBuffer?: (
    input: SiliconflowWorkspaceScope & {
      path?: string
      filePath?: string
      workspacePath?: string
      mimeType?: string
      mimetype?: string
      name?: string
      originalName?: string
    }
  ) => Promise<WorkspaceFile & { buffer: Buffer }>
}

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
  credentials: SiliconflowVideoCredentials
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: SiliconflowWorkspaceScope
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}

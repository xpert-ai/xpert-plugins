import { ZhipuAIDefaultBaseUrl } from '../types.js'

export const ZhipuCogVideo = 'zhipu_cogvideo'
export const ZhipuCogVideoWorkspaceCapability = 'platform.workspace.files'
export const ZhipuCogVideoDefaultBaseUrl = ZhipuAIDefaultBaseUrl

export type ZhipuCogVideoCredentials = {
  api_key?: string
  endpoint_url?: string
}

export type WorkspaceFileCatalog = 'projects' | 'users' | 'knowledges' | 'skills' | 'xperts'

export type ZhipuWorkspaceScope = {
  tenantId?: string
  userId?: string
  catalog?: WorkspaceFileCatalog
  scopeId?: string
  projectId?: string
  xpertId?: string
  isolateByUser?: boolean
}

export type WorkspaceUploadBufferInput = ZhipuWorkspaceScope & {
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
  readBuffer(input: ZhipuWorkspaceScope & { filePath: string }): Promise<WorkspaceFile & { buffer: Buffer }>
  readRuntimeBuffer?: (
    input: ZhipuWorkspaceScope & {
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
  credentials: ZhipuCogVideoCredentials
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: ZhipuWorkspaceScope
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}

export { ZhipuAIDefaultBaseUrl }

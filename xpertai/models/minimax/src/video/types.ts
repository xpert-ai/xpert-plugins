import type {
  AgentMiddlewareRuntimeScope,
  AsyncAIGCManagedJobPayload,
  ManagedQueueService,
  WorkspaceFile,
  WorkspaceFileCatalog,
  WorkspaceFileScope,
  WorkspaceMediaFilesApi
} from '@xpert-ai/plugin-sdk'

export const MiniMaxVideo = 'minimax_video'
export const MiniMaxH3 = 'MiniMax-H3'
export const MiniMaxH3Max = 'MiniMax-H3-Max'
export const MiniMaxVideoModels = [MiniMaxH3, MiniMaxH3Max] as const
export const MiniMaxVideoResolutions = ['480P', '768P', '2K'] as const
export const MiniMaxVideoRatios = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const

export type MiniMaxVideoModel = (typeof MiniMaxVideoModels)[number]
export type MiniMaxVideoResolution = (typeof MiniMaxVideoResolutions)[number]
export type MiniMaxVideoRatio = (typeof MiniMaxVideoRatios)[number]

export type MiniMaxVideoContentItem =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string }; role: 'first_frame' | 'last_frame' }

export type MiniMaxVideoGenerationPayload = {
  model: MiniMaxVideoModel
  content: MiniMaxVideoContentItem[]
  resolution: MiniMaxVideoResolution
  duration: number
  ratio: MiniMaxVideoRatio
  aigc_watermark?: boolean
}

export type MiniMaxVideoUsage = {
  total_seconds?: number
  input_seconds?: number
  output_seconds?: number
  input_image_count?: number
}

export type MiniMaxVideoTask = {
  id: string
  model?: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  content?: { url?: string }
  resolution?: string
  duration?: number
  ratio?: string
  usage?: MiniMaxVideoUsage
  error?: { code?: string; message?: string }
}

export type MiniMaxArtifactFile = {
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
  provider: typeof MiniMaxVideo
}

export type MiniMaxVideoToolResult = [
  string,
  { files: MiniMaxArtifactFile[]; data?: Record<string, unknown> }
]

export type MiniMaxWorkspaceFilesApi = WorkspaceMediaFilesApi
export type MiniMaxWorkspaceScope = WorkspaceFileScope
export type MiniMaxWorkspaceFile = WorkspaceFile

export type MiniMaxVideoToolDependencies = {
  workspaceFiles: MiniMaxWorkspaceFilesApi
  workspaceScope?: MiniMaxWorkspaceScope
  managedQueue?: ManagedQueueService
  pluginScopeKey?: string
  runtimeScope?: AgentMiddlewareRuntimeScope
  sleep?: (milliseconds: number) => Promise<void>
}

export type MiniMaxVideoJobPayload = AsyncAIGCManagedJobPayload<
  MiniMaxVideoGenerationPayload,
  MiniMaxVideoToolResult
> & { runtimeScope: AgentMiddlewareRuntimeScope }

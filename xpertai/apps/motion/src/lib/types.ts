export type MotionProjectStatus = 'draft' | 'reviewed' | 'archived' | 'failed'
export type MotionSurface = 'web' | 'video'
export type MotionVersionSource = 'agent_web' | 'agent_video' | 'workbench' | 'import' | 'restore'
export type MotionExportKind = 'html' | 'css' | 'react' | 'lottie' | 'json' | 'mp4' | 'gif'
export type MotionActorType = 'agent' | 'user' | 'system'
export type MotionWorkspaceCatalog = 'xperts' | 'projects'
export type MotionActionType =
  | 'project_created'
  | 'web_artifact_saved'
  | 'video_composition_saved'
  | 'media_uploaded'
  | 'version_finalized'
  | 'version_restored'
  | 'project_status_updated'
  | 'project_archived'
  | 'project_deleted'
  | 'style_saved'
  | 'style_deleted'
  | 'artifact_exported'
  | 'failure_reported'

export const MOTION_WORKSPACE_FILES_RUNTIME_CAPABILITY = 'platform.workspace.files'

export type MotionJsonPrimitive = string | number | boolean | null
export type MotionJsonValue = MotionJsonPrimitive | MotionJsonObject | MotionJsonArray
export interface MotionJsonObject {
  [key: string]: MotionJsonValue | undefined
}
export type MotionJsonArray = MotionJsonValue[]

export interface MotionScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface MotionWorkspaceFileScope {
  tenantId?: string | null
  userId?: string | null
  catalog: MotionWorkspaceCatalog
  scopeId: string
  xpertId?: string | null
  projectId?: string | null
  isolateByUser?: boolean | null
}

export interface MotionWorkspaceFileRecord {
  name?: string
  filePath: string
  workspacePath?: string
  fileUrl?: string
  url?: string
  mimeType?: string
  size?: number
  catalog?: MotionWorkspaceCatalog
  scopeId?: string
}

export interface MotionWorkspaceFileBuffer extends MotionWorkspaceFileRecord {
  buffer: Buffer
}

export interface MotionWorkspaceFilesApi {
  uploadBuffer(input: MotionWorkspaceFileScope & {
    buffer: Buffer
    originalName: string
    mimeType?: string | null
    size?: number | null
    folder?: string | null
    fileName?: string | null
    metadata?: MotionJsonObject
  }): Promise<MotionWorkspaceFileRecord>

  readBuffer(input: MotionWorkspaceFileScope & {
    filePath: string
  }): Promise<MotionWorkspaceFileBuffer>

  deleteFile(input: MotionWorkspaceFileScope & {
    filePath: string
  }): Promise<void>
}

export interface MotionRecipeSummary extends MotionJsonObject {
  id: string
  name: string
  category?: string
  cat?: string
  surfaces?: string[]
  canvas?: string[]
  target?: string[]
  runtime?: string[]
  export?: string[]
  tags?: string[]
  desc?: string
  description?: string
  status?: string
  preview?: string | null
}

export interface MotionRecipeDetail {
  summary: MotionRecipeSummary
  manifestText?: string
  skillText?: string
  implementationFiles: string[]
}

export interface MotionVideoTrackPoint extends MotionJsonObject {
  t?: number
  v?: number
  ease?: string
}

export type MotionVideoTrackMap = Partial<Record<'opacity' | 'x' | 'y' | 'scale' | 'rotate' | 'blur' | 'offset', MotionVideoTrackPoint[]>>

export interface MotionVideoPath extends MotionJsonObject {
  kind?: 'raw' | 'line' | 'smooth' | 'circle' | 'ellipse' | 'rect' | string
  points?: Array<{ x: number; y: number }>
}

export interface MotionSearchRecipesInput {
  query?: string
  category?: string
  surface?: MotionSurface | string
  target?: string
  runtime?: string
  exportKind?: string
  status?: string
  page?: number
  pageSize?: number
}

export interface MotionVideoLayer extends MotionJsonObject {
  id?: string
  type?: 'text' | 'rect' | 'ellipse' | 'image' | 'video'
  start?: number
  end?: number
  x?: number
  y?: number
  w?: number
  h?: number
  text?: string
  src?: string
  filePath?: string
  fileUrl?: string
  opacity?: number
  scale?: number
  rotate?: number
  color?: string
  bg?: string
  fill?: string
  radius?: number
  size?: number
  weight?: number
  align?: 'left' | 'center' | 'right' | 'start' | 'end'
  font?: string
  kinetic?: MotionJsonObject
  path?: MotionVideoPath
  z?: number
  loop?: boolean
  tracks?: MotionVideoTrackMap
}

export interface MotionVideoScene extends MotionJsonObject {
  id?: string
  name?: string
  duration?: number
  transition?: 'cut' | 'dissolve' | 'push' | 'fade' | string
  bg?: string
  background?: MotionJsonObject
  layers?: MotionVideoLayer[]
}

export interface MotionVideoComposition extends MotionJsonObject {
  w?: number
  h?: number
  fps?: number
  bg?: string
  duration?: number
  layers?: MotionVideoLayer[]
  scenes?: MotionVideoScene[]
  shared?: MotionVideoLayer[]
  reference?: MotionJsonObject
}

export interface CreateMotionProjectInput {
  title: string
  brief?: string | null
  surface: MotionSurface
  designSystemId?: string | null
  motionProfile?: string | null
  selectedRecipeIds?: string[] | null
  html?: string | null
  videoComposition?: MotionVideoComposition | null
  changeSummary?: string | null
}

export interface SearchMotionProjectsInput {
  status?: MotionProjectStatus
  surface?: MotionSurface
  search?: string
  page?: number
  pageSize?: number
}

export interface GetMotionProjectInput {
  projectId: string
  versionLimit?: number
  includeLogs?: boolean
  logLimit?: number
}

export interface SaveMotionWebArtifactInput {
  projectId: string
  html: string
  selectedRecipeIds?: string[] | null
  componentSelection?: MotionJsonObject | null
  changeSummary?: string | null
}

export interface SaveMotionVideoCompositionInput {
  projectId: string
  composition: MotionVideoComposition
  selectedRecipeIds?: string[] | null
  layerSelection?: MotionJsonObject | null
  changeSummary?: string | null
}

export interface FinalizeMotionVersionInput {
  projectId: string
  sourceType?: MotionVersionSource
  changeSummary?: string | null
}

export interface ExportMotionArtifactInput {
  projectId: string
  kind: MotionExportKind
  versionId?: string | null
  fileName?: string | null
  content?: string | null
  mimeType?: string | null
  changeSummary?: string | null
}

export interface SaveMotionStyleInput {
  projectId?: string | null
  name: string
  surface?: MotionSurface | null
  style: MotionJsonObject
  description?: string | null
}

export interface UpdateMotionProjectStatusInput {
  projectId: string
  status: MotionProjectStatus
  reason?: string | null
}

export interface ReportMotionFailureInput {
  projectId?: string | null
  versionId?: string | null
  operation: string
  errorMessage: string
  recoverable?: boolean | null
  evidence?: MotionJsonValue
}

export interface SaveMotionMediaFileInput {
  projectId: string
  buffer: Buffer
  originalName: string
  mimeType?: string | null
  size?: number | null
  purpose?: 'layer' | 'background' | 'reference' | 'export' | string | null
}

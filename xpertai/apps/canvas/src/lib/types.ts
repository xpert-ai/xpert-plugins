export type CanvasDocumentStatus = 'draft' | 'reviewed' | 'archived'
export type CanvasDocumentKind = 'canvas' | 'whiteboard' | 'moodboard' | 'wireframe' | 'annotation' | 'image-board' | 'other'
export type CanvasVersionSource = 'agent_snapshot' | 'agent_patch' | 'agent_image' | 'workbench' | 'import' | 'restore'
export type CanvasActorType = 'agent' | 'user' | 'system'
export type CanvasWorkspaceCatalog = 'xperts' | 'projects'
export type CanvasActionType =
  | 'document_created'
  | 'snapshot_saved'
  | 'records_patched'
  | 'image_inserted'
  | 'status_updated'
  | 'version_restored'
  | 'document_archived'
  | 'failure_reported'

export const CANVAS_WORKSPACE_FILES_RUNTIME_CAPABILITY = 'platform.workspace.files'

export type CanvasJsonPrimitive = string | number | boolean | null
export type CanvasJsonValue = CanvasJsonPrimitive | CanvasJsonObject | CanvasJsonArray
export interface CanvasJsonObject {
  [key: string]: CanvasJsonValue | undefined
}
export type CanvasJsonArray = CanvasJsonValue[]

export interface CanvasRecord extends CanvasJsonObject {
  id: string
  typeName?: string
  type?: string
  parentId?: string
  index?: string
  x?: number
  y?: number
  rotation?: number
  props?: CanvasJsonObject
  meta?: CanvasJsonObject
}

export interface CanvasSnapshotData extends CanvasJsonObject {
  schema: CanvasJsonValue
  store: Record<string, CanvasRecord>
}

export interface CanvasScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface CanvasWorkspaceFileScope {
  tenantId?: string | null
  userId?: string | null
  catalog: CanvasWorkspaceCatalog
  scopeId: string
  xpertId?: string | null
  projectId?: string | null
  isolateByUser?: boolean | null
}

export interface CanvasWorkspaceFileRecord {
  name?: string
  filePath: string
  workspacePath?: string
  fileUrl?: string
  url?: string
  mimeType?: string
  size?: number
  catalog?: CanvasWorkspaceCatalog
  scopeId?: string
}

export interface CanvasWorkspaceFilesApi {
  uploadBuffer(input: CanvasWorkspaceFileScope & {
    buffer: Buffer
    originalName: string
    mimeType?: string | null
    size?: number | null
    folder?: string | null
    fileName?: string | null
    metadata?: CanvasJsonObject
  }): Promise<CanvasWorkspaceFileRecord>

  deleteFile(input: CanvasWorkspaceFileScope & {
    filePath: string
  }): Promise<void>
}

export interface CanvasSnapshotImageInput {
  dataUrl?: string | null
  base64?: string | null
  mimeType?: string | null
  fileName?: string | null
  width?: number | null
  height?: number | null
  pageId?: string | null
  camera?: CanvasJsonValue
  capturedAt?: string | null
}

export interface CanvasSnapshotInput {
  snapshot?: CanvasSnapshotData | null
  viewState?: CanvasJsonObject | null
  selectionSummary?: CanvasJsonObject | null
  snapshotImage?: CanvasSnapshotImageInput | null
}

export interface CreateCanvasDocumentInput extends CanvasSnapshotInput {
  title: string
  description?: string
  kind?: CanvasDocumentKind
  tags?: string[]
  source?: string
  changeSummary?: string
}

export interface SaveCanvasSnapshotInput extends CanvasSnapshotInput {
  documentId: string
  sourceType?: CanvasVersionSource
  changeSummary?: string
}

export interface AutosaveCanvasSnapshotInput extends CanvasSnapshotInput {
  documentId: string
  snapshot: CanvasSnapshotData
  snapshotImage: CanvasSnapshotImageInput
  changeSummary?: string | null
}

export interface PatchCanvasRecordsInput {
  documentId: string
  putRecords?: CanvasRecord[]
  removeRecordIds?: string[]
  viewStatePatch?: CanvasJsonObject
  selectionSummary?: CanvasJsonObject | null
  changeSummary?: string
}

export interface InsertCanvasImageInput {
  documentId?: string
  title?: string
  description?: string
  kind?: CanvasDocumentKind
  dataUrl?: string
  base64?: string
  mimeType?: string
  fileName?: string
  width?: number
  height?: number
  displayWidth?: number
  displayHeight?: number
  pageId?: string
  anchorShapeId?: string
  placement?: 'right' | 'left' | 'below' | 'center'
  margin?: number
  matchAnchor?: boolean
  altText?: string
  shapeMeta?: CanvasJsonObject
  assetMeta?: CanvasJsonObject
  changeSummary?: string
}

export interface SearchCanvasDocumentsInput {
  status?: CanvasDocumentStatus
  kind?: CanvasDocumentKind
  search?: string
  page?: number
  pageSize?: number
}

export interface GetCanvasDocumentInput {
  documentId: string
  versionId?: string
  versionNumber?: number
  includeSnapshot?: boolean
  versionLimit?: number
  includeLogs?: boolean
  logLimit?: number
}

export interface GetCanvasRecordInput {
  documentId: string
  recordId: string
  versionId?: string
  versionNumber?: number
}

export interface UpdateCanvasDocumentStatusInput {
  documentId: string
  status: CanvasDocumentStatus
  reason?: string
}

export interface ReportCanvasFailureInput {
  documentId?: string
  versionId?: string
  operation: string
  errorMessage: string
  recoverable?: boolean
  evidence?: CanvasJsonValue
}

export interface PrepareCanvasAssistantPromptInput {
  documentId: string
  instruction?: string | null
  includeSceneSummary?: boolean | null
}

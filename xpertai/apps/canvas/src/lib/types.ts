export type CanvasDocumentStatus = 'draft' | 'reviewed' | 'archived'
export type CanvasDocumentKind = 'canvas' | 'whiteboard' | 'moodboard' | 'wireframe' | 'annotation' | 'image-board' | 'other'
export type CanvasVersionSource = 'agent_snapshot' | 'agent_patch' | 'agent_image' | 'workbench' | 'import' | 'restore'
export type CanvasActorType = 'agent' | 'user' | 'system'
export type CanvasWorkspaceCatalog = 'xperts' | 'projects'
export type CanvasActionType =
  | 'document_created'
  | 'snapshot_saved'
  | 'snapshot_imported'
  | 'records_patched'
  | 'image_inserted'
  | 'status_updated'
  | 'version_restored'
  | 'version_deleted'
  | 'artifact_published'
  | 'artifact_share_revoked'
  | 'artifact_share_failed'
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
  assistantDisplayName?: string | null
}

export interface CanvasAwarenessV1 {
  protocolVersion: 1
  pageId?: string | null
  pointer?: { x: number; y: number; visible: boolean } | null
  selectedRecordIds?: string[] | null
  focusedRecordId?: string | null
  viewport?: { zoom: number; width: number; height: number } | null
  mode?: string | null
  status?: 'thinking' | 'editing' | 'done' | 'failed' | null
  toolName?: string | null
  operationLabel?: string | null
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

export interface CanvasWorkspaceFileBuffer extends CanvasWorkspaceFileRecord {
  buffer: Buffer
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

  readBuffer(input: CanvasWorkspaceFileScope & {
    filePath: string
  }): Promise<CanvasWorkspaceFileBuffer>

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
  snapshotImage: CanvasSnapshotImageInput
  baseRevision?: number | null
  baseSnapshotChecksum?: string | null
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

export interface CanvasRecordFieldPatch {
  name?: string
  parentId?: string
  index?: string
  x?: number
  y?: number
  rotation?: number
  opacity?: number
  isLocked?: boolean
  fromId?: string
  toId?: string
  props?: CanvasJsonObject
  meta?: CanvasJsonObject
  unsetProps?: string[]
  unsetMeta?: string[]
}

export interface UpdateCanvasRecordInput {
  id: string
  expectedChecksum: string
  patch: CanvasRecordFieldPatch
}

export interface RemoveCanvasRecordInput {
  id: string
  expectedChecksum: string
}

export type CanvasAgentShapeColor =
  | 'black'
  | 'grey'
  | 'light-violet'
  | 'violet'
  | 'blue'
  | 'light-blue'
  | 'yellow'
  | 'orange'
  | 'green'
  | 'light-green'
  | 'light-red'
  | 'red'
  | 'white'
export type CanvasAgentShapeSize = 's' | 'm' | 'l' | 'xl'
export type CanvasAgentShapeFont = 'draw' | 'sans' | 'serif' | 'mono'
export type CanvasAgentShapeAlign = 'start' | 'middle' | 'end'
export type CanvasAgentShapeDash = 'draw' | 'solid' | 'dashed' | 'dotted' | 'none'
export type CanvasAgentShapeFill = 'none' | 'semi' | 'solid' | 'pattern' | 'fill' | 'lined-fill'
export type CanvasAgentGeoShape =
  | 'cloud'
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'rhombus'
  | 'rhombus-2'
  | 'oval'
  | 'trapezoid'
  | 'arrow-right'
  | 'arrow-left'
  | 'arrow-up'
  | 'arrow-down'
  | 'x-box'
  | 'check-box'
  | 'heart'
export type CanvasAgentArrowhead = 'arrow' | 'triangle' | 'square' | 'dot' | 'pipe' | 'diamond' | 'inverted' | 'bar' | 'none'

export interface CanvasAgentShapePlacement {
  id?: string
  parentId?: string
  x: number
  y: number
  rotation?: number
  opacity?: number
  isLocked?: boolean
}

export interface CreateCanvasTextShapeInput extends CanvasAgentShapePlacement {
  type: 'text'
  text: string
  width?: number
  color?: CanvasAgentShapeColor
  size?: CanvasAgentShapeSize
  font?: CanvasAgentShapeFont
  textAlign?: CanvasAgentShapeAlign
  autoSize?: boolean
}

export interface CreateCanvasGeoShapeInput extends CanvasAgentShapePlacement {
  type: 'geo'
  geo?: CanvasAgentGeoShape
  width?: number
  height?: number
  text?: string
  color?: CanvasAgentShapeColor
  labelColor?: CanvasAgentShapeColor
  fill?: CanvasAgentShapeFill
  dash?: CanvasAgentShapeDash
  size?: CanvasAgentShapeSize
  font?: CanvasAgentShapeFont
  align?: CanvasAgentShapeAlign
  verticalAlign?: CanvasAgentShapeAlign
}

export interface CreateCanvasNoteShapeInput extends CanvasAgentShapePlacement {
  type: 'note'
  text: string
  color?: CanvasAgentShapeColor
  labelColor?: CanvasAgentShapeColor
  size?: CanvasAgentShapeSize
  font?: CanvasAgentShapeFont
  align?: CanvasAgentShapeAlign
  verticalAlign?: CanvasAgentShapeAlign
}

export interface CreateCanvasFrameShapeInput extends CanvasAgentShapePlacement {
  type: 'frame'
  name?: string
  width?: number
  height?: number
  color?: CanvasAgentShapeColor
}

export interface CanvasAgentPoint {
  x: number
  y: number
}

export interface CreateCanvasArrowShapeInput {
  id?: string
  parentId?: string
  type: 'arrow'
  start: CanvasAgentPoint
  end: CanvasAgentPoint
  rotation?: number
  opacity?: number
  isLocked?: boolean
  text?: string
  color?: CanvasAgentShapeColor
  labelColor?: CanvasAgentShapeColor
  fill?: CanvasAgentShapeFill
  dash?: CanvasAgentShapeDash
  size?: CanvasAgentShapeSize
  font?: CanvasAgentShapeFont
  bend?: number
  arrowheadStart?: CanvasAgentArrowhead
  arrowheadEnd?: CanvasAgentArrowhead
}

export type CreateCanvasAgentShapeInput =
  | CreateCanvasTextShapeInput
  | CreateCanvasGeoShapeInput
  | CreateCanvasNoteShapeInput
  | CreateCanvasFrameShapeInput
  | CreateCanvasArrowShapeInput

/** Model-visible bounded mutation. Workbench record deltas continue to use PatchCanvasRecordsInput. */
export interface ApplyCanvasRecordBatchInput {
  documentId: string
  operationId: string
  batchId: string
  stageIndex: number
  stageLabel: string
  isFinalStage: boolean
  baseRevision: number
  createShapes?: CreateCanvasAgentShapeInput[]
  updateRecords?: UpdateCanvasRecordInput[]
  removeRecords?: RemoveCanvasRecordInput[]
  changeSummary: string
}

export interface GetCanvasDocumentSummaryInput {
  documentId: string
  expectedRevision?: number
}

export type CanvasPersistentRecordType = 'document' | 'page' | 'shape' | 'asset' | 'binding'

export interface ListCanvasRecordsInput {
  documentId: string
  expectedRevision: number
  cursor?: string
  limit?: number
  typeNames?: CanvasPersistentRecordType[]
  shapeTypes?: string[]
  pageId?: string
  parentId?: string
  query?: string
}

export interface InsertCanvasImageInput {
  documentId?: string
  dataUrl?: string
  base64?: string
  workspaceFilePath?: string
  mimeType?: string
  target?: CanvasImageInsertionTargetInput
  changeSummary?: string
}

export interface CanvasImageInsertionTargetInput {
  documentId?: string
  pageId?: string
  shapeId?: string
  width?: number
  height?: number
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

export interface GetCanvasRecordForAgentInput {
  documentId: string
  recordId: string
  expectedRevision: number
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

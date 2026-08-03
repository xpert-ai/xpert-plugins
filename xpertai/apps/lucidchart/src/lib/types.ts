export type LucidchartDocumentStatus = 'draft' | 'reviewed' | 'archived'
export type LucidchartDocumentKind =
  | 'diagram'
  | 'flowchart'
  | 'architecture'
  | 'process'
  | 'wireframe'
  | 'orgchart'
  | 'network'
  | 'other'
export type LucidchartProduct = 'lucidchart' | 'lucidspark'
export type LucidchartVersionSource =
  | 'agent_standard_import'
  | 'agent_patch'
  | 'agent_mermaid'
  | 'workbench'
  | 'workbench_mermaid'
  | 'import'
  | 'external_lucid'
  | 'restore'
export type LucidchartActorType = 'agent' | 'user' | 'system'
export type LucidchartActionType =
  | 'document_created'
  | 'version_saved'
  | 'standard_import_stage_applied'
  | 'standard_import_finalized'
  | 'standard_import_patched'
  | 'mermaid_draft_saved'
  | 'external_document_registered'
  | 'status_updated'
  | 'version_restored'
  | 'document_archived'
  | 'metadata_updated'
  | 'failure_reported'
  | 'artifact_published'
  | 'artifact_share_revoked'

export interface LucidchartScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface LucidchartDocumentContentInput {
  standardImport?: Record<string, unknown> | null
  mermaidSource?: string | null
  lucidDocumentId?: string | null
  lucidDocumentUrl?: string | null
  embedUrl?: string | null
  embedId?: string | null
  previewUrl?: string | null
  product?: LucidchartProduct
  importFileName?: string | null
}

export interface CreateLucidchartDocumentInput extends LucidchartDocumentContentInput {
  title: string
  description?: string
  kind?: LucidchartDocumentKind
  tags?: string[]
  source?: string
  changeSummary?: string
}

export interface SaveLucidchartStandardImportVersionInput extends LucidchartDocumentContentInput {
  documentId: string
  sourceType?: LucidchartVersionSource
  changeSummary?: string
}

export type LucidchartAgentShapeType =
  | 'rectangle'
  | 'text'
  | 'stickyNote'
  | 'decision'
  | 'database'
  | 'data'
  | 'document'
  | 'process'
  | 'terminator'
  | 'note'

export type LucidchartStrokeStyle = 'solid' | 'dashed' | 'dotted'
export type LucidchartLineType = 'straight' | 'elbow' | 'curved'
export type LucidchartEndpointStyle = 'none' | 'arrow' | 'openArrow' | 'hollowArrow'

export interface LucidchartAgentShapeInput {
  id: string
  type: LucidchartAgentShapeType
  x: number
  y: number
  width: number
  height: number
  text?: string
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  strokeStyle?: LucidchartStrokeStyle
  textColor?: string
  rounding?: number
  rotation?: number
  opacity?: number
  zIndex?: number
}

export interface LucidchartAgentLineInput {
  id: string
  fromShapeId: string
  toShapeId: string
  lineType?: LucidchartLineType
  startStyle?: LucidchartEndpointStyle
  endStyle?: LucidchartEndpointStyle
  label?: string
  strokeColor?: string
  strokeWidth?: number
  strokeStyle?: LucidchartStrokeStyle
  zIndex?: number
}

export interface LucidchartAgentPageSettingsInput {
  fillColor?: string
  infiniteCanvas?: boolean
  width?: number
  height?: number
}

export interface ApplyLucidchartDiagramStageInput {
  documentId: string
  expectedRevision: number
  pageId: string
  pageTitle?: string
  pageSettings?: LucidchartAgentPageSettingsInput
  shapes?: LucidchartAgentShapeInput[]
  lines?: LucidchartAgentLineInput[]
  removeShapeIds?: string[]
  removeLineIds?: string[]
  stageName: string
}

export interface FinalizeLucidchartDiagramInput {
  documentId: string
  expectedRevision: number
  changeSummary?: string
}

export interface GetLucidchartDiagramPageInput {
  documentId: string
  pageId: string
  offset?: number
  limit?: number
}

export interface PatchLucidchartStandardImportInput extends LucidchartDocumentContentInput {
  documentId: string
  standardImportPatch?: Record<string, unknown> | null
  merge?: boolean
  changeSummary?: string
}

export interface SaveLucidchartMermaidDraftInput {
  documentId?: string
  title?: string
  description?: string
  kind?: LucidchartDocumentKind
  mermaidSource: string
  changeSummary?: string
}

export interface RegisterLucidchartExternalDocumentInput {
  documentId?: string
  title?: string
  description?: string
  kind?: LucidchartDocumentKind
  lucidDocumentId?: string
  lucidDocumentUrl?: string
  embedUrl?: string
  embedId?: string
  previewUrl?: string
  product?: LucidchartProduct
  changeSummary?: string
}

export interface SearchLucidchartDocumentsInput {
  status?: LucidchartDocumentStatus
  kind?: LucidchartDocumentKind
  search?: string
  page?: number
  pageSize?: number
}

export interface UpdateLucidchartDocumentStatusInput {
  documentId: string
  status: LucidchartDocumentStatus
  reason?: string
}

export interface UpdateLucidchartDocumentMetadataInput {
  documentId: string
  title: string
  description?: string
  kind?: LucidchartDocumentKind
  changeSummary?: string
}

export interface ReportLucidchartFailureInput {
  documentId?: string
  versionId?: string
  operation: string
  errorMessage: string
  recoverable?: boolean
  evidence?: unknown
}

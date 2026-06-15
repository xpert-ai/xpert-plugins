export type ExcalidrawDrawingStatus = 'draft' | 'reviewed' | 'archived'
export type ExcalidrawDrawingKind = 'diagram' | 'whiteboard' | 'flowchart' | 'architecture' | 'wireframe' | 'other'
export type ExcalidrawVersionSource =
  | 'agent_json'
  | 'agent_patch'
  | 'agent_mermaid'
  | 'workbench'
  | 'workbench_mermaid'
  | 'import'
  | 'restore'
export type ExcalidrawActorType = 'agent' | 'user' | 'system'
export type ExcalidrawActionType =
  | 'drawing_created'
  | 'version_saved'
  | 'scene_patched'
  | 'mermaid_draft_saved'
  | 'status_updated'
  | 'version_restored'
  | 'drawing_archived'
  | 'failure_reported'

export interface ExcalidrawScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface ExcalidrawSceneInput {
  elements?: unknown[]
  appState?: Record<string, unknown> | null
  files?: Record<string, unknown> | null
  mermaidSource?: string | null
}

export interface CreateExcalidrawDrawingInput extends ExcalidrawSceneInput {
  title: string
  description?: string
  kind?: ExcalidrawDrawingKind
  tags?: string[]
  source?: string
  changeSummary?: string
}

export interface SaveExcalidrawSceneVersionInput extends ExcalidrawSceneInput {
  drawingId: string
  sourceType?: ExcalidrawVersionSource
  changeSummary?: string
}

export interface PatchExcalidrawSceneInput {
  drawingId: string
  addElements?: unknown[]
  updateElements?: Array<Record<string, unknown> & { id: string }>
  deleteElementIds?: string[]
  appStatePatch?: Record<string, unknown>
  files?: Record<string, unknown> | null
  mermaidSource?: string | null
  changeSummary?: string
}

export interface SaveExcalidrawMermaidDraftInput {
  drawingId?: string
  title?: string
  description?: string
  kind?: ExcalidrawDrawingKind
  mermaidSource: string
  changeSummary?: string
}

export interface SearchExcalidrawDrawingsInput {
  status?: ExcalidrawDrawingStatus
  kind?: ExcalidrawDrawingKind
  search?: string
  page?: number
  pageSize?: number
}

export interface UpdateExcalidrawDrawingStatusInput {
  drawingId: string
  status: ExcalidrawDrawingStatus
  reason?: string
}

export interface ReportExcalidrawFailureInput {
  drawingId?: string
  versionId?: string
  operation: string
  errorMessage: string
  recoverable?: boolean
  evidence?: unknown
}

export type DrawioDrawingStatus = 'draft' | 'reviewed' | 'archived'
export type DrawioDrawingKind = 'diagram' | 'flowchart' | 'architecture' | 'network' | 'wireframe' | 'sequence' | 'other'
export type DrawioVersionSource =
  | 'agent_xml'
  | 'agent_patch'
  | 'agent_mermaid'
  | 'workbench'
  | 'workbench_mermaid'
  | 'import'
  | 'restore'
export type DrawioActorType = 'agent' | 'user' | 'system'
export type DrawioActionType =
  | 'drawing_created'
  | 'version_saved'
  | 'scene_patched'
  | 'mermaid_draft_saved'
  | 'status_updated'
  | 'version_restored'
  | 'drawing_archived'
  | 'failure_reported'

export interface DrawioScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface DrawioSceneInput {
  xml?: string | null
  mermaidSource?: string | null
  previewSvg?: string | null
  previewPng?: string | null
  descriptor?: Record<string, unknown> | null
}

export interface CreateDrawioDrawingInput extends DrawioSceneInput {
  title: string
  description?: string
  kind?: DrawioDrawingKind
  tags?: string[]
  source?: string
  changeSummary?: string
}

export interface SaveDrawioSceneVersionInput extends DrawioSceneInput {
  drawingId: string
  sourceType?: DrawioVersionSource
  changeSummary?: string
}

export interface PatchDrawioSceneInput extends DrawioSceneInput {
  drawingId: string
  changeSummary?: string
}

export interface SaveDrawioMermaidDraftInput {
  drawingId?: string
  title?: string
  description?: string
  kind?: DrawioDrawingKind
  mermaidSource: string
  changeSummary?: string
}

export interface SearchDrawioDrawingsInput {
  status?: DrawioDrawingStatus
  kind?: DrawioDrawingKind
  search?: string
  page?: number
  pageSize?: number
}

export interface UpdateDrawioDrawingStatusInput {
  drawingId: string
  status: DrawioDrawingStatus
  reason?: string
}

export interface ReportDrawioFailureInput {
  drawingId?: string
  versionId?: string
  operation: string
  errorMessage: string
  recoverable?: boolean
  evidence?: unknown
}

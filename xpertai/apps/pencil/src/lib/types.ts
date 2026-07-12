import type { WorkspaceFile, WorkspaceFileLocator, WorkspaceFilesApi, WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'

export type PencilDocumentStatus = 'draft' | 'reviewed' | 'archived'
export type PencilDocumentKind = 'design' | 'figma-import' | 'wireframe' | 'prototype' | 'component-library' | 'illustration' | 'other'
export type PencilVersionSource = 'agent_snapshot' | 'agent_tool' | 'workbench' | 'import' | 'restore' | 'sample'
export type PencilActorType = 'agent' | 'user' | 'system'
export type PencilWorkspaceCatalog = 'xperts' | 'projects'
export type PencilExportFormat = 'fig' | 'png' | 'jpg' | 'webp' | 'svg' | 'pdf' | 'jsx'
export type PencilImportFormat = 'fig' | 'pen'
export type PencilRenderDraftStatus = 'active' | 'validating' | 'committed' | 'expired'
export type PencilActionType =
  | 'document_created'
  | 'document_renamed'
  | 'sample_document_created'
  | 'working_copy_saved'
  | 'version_saved'
  | 'file_imported'
  | 'file_exported'
  | 'status_updated'
  | 'version_restored'
  | 'version_deleted'
  | 'core_tool_executed'
  | 'render_draft_created'
  | 'render_draft_patched'
  | 'render_draft_committed'
  | 'failure_reported'

export type PencilJsonPrimitive = string | number | boolean | null
export type PencilJsonValue = PencilJsonPrimitive | PencilJsonObject | PencilJsonArray
export interface PencilJsonObject {
  [key: string]: PencilJsonValue | undefined
}
export type PencilJsonArray = PencilJsonValue[]

/**
 * Canonical JSON-safe representation of a Pencil scene graph.
 * Maps are stored as entry arrays and binary fields are encoded as base64 so the
 * same payload can cross database, Agent tool, and iframe boundaries losslessly.
 */
export interface PencilGraphSnapshot extends PencilJsonObject {
  formatVersion: 'pencil.scene-graph.v1'
  pencilVersion: string
  rootId: string
  nodes: Array<[string, PencilJsonObject]>
  images: Array<[string, string]>
  variables: Array<[string, PencilJsonObject]>
  variableCollections: Array<[string, PencilJsonObject]>
  activeMode: Array<[string, string]>
  instanceIndex: Array<[string, string[]]>
  figKiwiVersion?: number | null
  figSchemaDeflatedBase64?: string | null
  documentColorSpace?: string
}

/**
 * Request-derived ownership scope applied to every plugin-owned read and write.
 * Callers must never accept these values from Agent tool input.
 */
export interface PencilScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  /** Current Xpert owner used to isolate Pencil documents and versions. */
  xpertId?: string | null
  /** Persisted compatibility name for xpertId on existing Pencil entities. */
  assistantId?: string | null
  assistantDisplayName?: string | null
  agentKey?: string | null
  conversationId?: string | null
}

export interface PencilWorkspaceFileScope {
  tenantId?: string | null
  userId?: string | null
  catalog: PencilWorkspaceCatalog
  scopeId: string
  xpertId?: string | null
  projectId?: string | null
  isolateByUser?: boolean | null
}

export interface PencilSnapshotInput {
  graphSnapshot?: PencilGraphSnapshot | null
  viewState?: PencilJsonObject | null
  selectionSummary?: PencilJsonObject | null
}

export interface CreatePencilDocumentInput extends PencilSnapshotInput {
  title: string
  description?: string | null
  kind?: PencilDocumentKind
  tags?: string[]
  source?: string | null
  sourceFormat?: string | null
  changeSummary?: string | null
}

export interface CreatePencilSampleDocumentInput {
  title?: string | null
  description?: string | null
  tags?: string[]
  changeSummary?: string | null
}

export interface RenamePencilDocumentInput {
  documentId: string
  title: string
}

export interface SearchPencilDocumentsInput {
  status?: PencilDocumentStatus
  kind?: PencilDocumentKind
  search?: string
  page?: number
  pageSize?: number
}

export interface GetPencilDocumentInput {
  documentId: string
  versionId?: string
  versionNumber?: number
  includeSnapshot?: boolean
  includeLogs?: boolean
  versionLimit?: number
  logLimit?: number
}

export interface GetPencilNodeInput {
  documentId: string
  nodeId: string
  versionId?: string
  versionNumber?: number
}

export interface SavePencilWorkingCopyInput extends PencilSnapshotInput {
  documentId: string
  graphSnapshot: PencilGraphSnapshot
  /** Monotonic optimistic-lock token returned by the previous read or save. */
  baseRevision?: number | null
  /** Checksum fallback for clients that do not yet retain the numeric revision. */
  baseGraphChecksum?: string | null
  changeSummary?: string | null
}

export interface SavePencilVersionInput extends PencilSnapshotInput {
  documentId: string
  graphSnapshot?: PencilGraphSnapshot | null
  sourceType?: PencilVersionSource
  changeSummary?: string | null
}

export interface ImportPencilBufferInput {
  title?: string | null
  description?: string | null
  kind?: PencilDocumentKind
  tags?: string[]
  fileName?: string | null
  mimeType?: string | null
  buffer: Buffer
  source?: string | null
}

export interface ImportPencilRuntimeFileInput {
  title?: string | null
  description?: string | null
  kind?: PencilDocumentKind
  tags?: string[]
  file: WorkspaceFileLocator
  source?: string | null
}

export interface ExportPencilFileInput {
  documentId: string
  format: PencilExportFormat
  target?: PencilExportTargetInput
  fileName?: string | null
  scale?: number | null
  quality?: number | null
  colorSpace?: string | null
  writeToWorkspace?: boolean | null
}

export type PencilExportTargetInput =
  | {
      scope?: 'document'
    }
  | {
      scope: 'page'
      pageId: string
    }
  | {
      scope: 'selection'
      nodeIds: string[]
    }
  | {
      scope: 'node'
      nodeId: string
    }

export interface UpdatePencilDocumentStatusInput {
  documentId: string
  status: PencilDocumentStatus
  reason?: string | null
}

export interface ReportPencilFailureInput {
  documentId?: string | null
  versionId?: string | null
  operation: string
  errorMessage: string
  recoverable?: boolean | null
  evidence?: PencilJsonValue
}

export interface ExecutePencilCoreToolInput {
  documentId: string
  toolName: string
  args: Record<string, unknown>
  changeSummary?: string | null
}

/** Compact parser evidence returned to the Agent without echoing the complete JSX source. */
export interface PencilRenderDiagnostic extends PencilJsonObject {
  code: 'JSX_PARSE_ERROR' | 'JSX_RENDER_ERROR'
  message: string
  line?: number
  column?: number
  snippet?: string
  sourceLength: number
}

/** Single resumable render repair owned by a document and excluded from normal document queries. */
export interface PencilPendingRenderDraft extends PencilJsonObject {
  id: string
  revision: number
  status: PencilRenderDraftStatus
  sourceJsx: string
  normalizedJsx: string
  renderArgs: PencilJsonObject
  diagnostic?: PencilRenderDiagnostic | null
  changeSummary?: string | null
  sourceChecksum: string
  expiresAt: string
}

export interface PencilRenderDraftEdit {
  /** Exact source fragment expected once in the current draft revision. */
  oldText: string
  /** Replacement text; an empty string deletes the matched fragment. */
  newText: string
}

export interface PatchPencilRenderDraftInput {
  documentId: string
  draftId: string
  expectedRevision: number
  edits: PencilRenderDraftEdit[]
  changeSummary?: string | null
}

/**
 * Portable export metadata returned to Agents and the Workbench.
 * Large binary content is represented by a workspace reference whenever a
 * WorkspaceFiles runtime is available.
 */
export interface PencilPortableExport {
  format: PencilExportFormat
  mimeType: string
  extension: string
  encoding?: string
  size: number
  sha256: string
  file?: WorkspaceFile & {
    reference: WorkspacePortableFileReference
  }
  path?: string
  workspacePath?: string
  fileRef?: WorkspacePortableFileReference
  inline?: string
}

export type PencilWorkspaceFilesApi = WorkspaceFilesApi

import type { DOCX_EDITOR_TOOL_NAMES } from './constants.js'

export type DocxEditorDocumentStatus = 'draft' | 'active' | 'archived'
export type DocxEditorVersionSource = 'upload' | 'workbench' | 'agent' | 'restore'
export type DocxEditorOperationStatus = 'queued' | 'applied' | 'failed'
export type DocxEditorOperationSource = 'agent' | 'workbench' | 'system'
export type DocxEditorToolName = (typeof DOCX_EDITOR_TOOL_NAMES)[number]

export interface DocxEditorScope {
  tenantId?: string | null
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface CreateDocxDocumentInput {
  title: string
  description?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface SaveDocxVersionInput {
  documentId: string
  docxBase64: string
  title?: string | null
  description?: string | null
  fileName?: string | null
  mimeType?: string | null
  size?: number | null
  fileAssetId?: string | null
  fileId?: string | null
  storageFileId?: string | null
  source?: DocxEditorVersionSource
  changeSummary?: string | null
  operationId?: string | null
}

export interface UploadDocxInput extends Omit<SaveDocxVersionInput, 'documentId'> {
  documentId?: string | null
}

export interface SyncDocxSnapshotInput {
  documentId: string
  versionId?: string | null
  contentText?: string | null
  paragraphCount?: number | null
  totalPages?: number | null
  currentPage?: number | null
  selection?: unknown
  comments?: unknown
  changes?: unknown
  pages?: unknown
}

export interface CompleteDocxOperationInput {
  operationId: string
  status: DocxEditorOperationStatus
  result?: unknown
  errorMessage?: string | null
}

export interface RestoreDocxVersionInput {
  documentId: string
  versionId: string
  changeSummary?: string | null
}

export interface PrepareDocxAssistantPromptInput {
  documentId: string
  instruction?: string | null
}

export interface RunDocxAgentToolInput {
  documentId: string
  toolName: DocxEditorToolName
  input?: Record<string, unknown>
  author?: string | null
}

export interface DocxWorkbenchQuery {
  documentId?: string | null
  search?: string | null
  page?: number
  pageSize?: number
}

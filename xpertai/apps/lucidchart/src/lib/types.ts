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
  | 'standard_import_patched'
  | 'mermaid_draft_saved'
  | 'external_document_registered'
  | 'status_updated'
  | 'version_restored'
  | 'document_archived'
  | 'metadata_updated'
  | 'failure_reported'

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

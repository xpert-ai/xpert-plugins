import type {
  OFFICE_EDITOR_DOCUMENT_TYPES,
  OFFICE_EDITOR_IMPORT_FORMATS,
  OFFICE_EDITOR_OPERATION_TYPES,
  OFFICE_EDITOR_TOOL_NAMES
} from './constants.js'

export type OfficeDocumentType = (typeof OFFICE_EDITOR_DOCUMENT_TYPES)[number]
export type OfficeDocumentStatus = 'draft' | 'active' | 'archived'
export type OfficeSnapshotSource = 'system' | 'workbench' | 'agent' | 'collaboration' | 'restore' | 'import'
export type OfficeOperationType = (typeof OFFICE_EDITOR_OPERATION_TYPES)[number]
export type OfficeAuditOperationType = OfficeOperationType | 'import_document' | 'excel_automation' | 'excel_restore' | 'review_note' | 'failure_report'
export type OfficeOperationStatus = 'queued' | 'processing' | 'applied' | 'failed' | 'conflict'
export type OfficeOperationSource = 'agent' | 'workbench' | 'system'
export type OfficeToolName = (typeof OFFICE_EDITOR_TOOL_NAMES)[number]
export type OfficeImportFormat = (typeof OFFICE_EDITOR_IMPORT_FORMATS)[number]
export type OfficeFileVersionSource = 'import' | 'agent' | 'workbench' | 'restore'
export type OfficeWorkspaceCatalog = 'xperts' | 'projects'

export interface OfficeScope {
  tenantId?: string | null
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface OfficeWorkbenchQuery {
  documentId?: string | null
  documentType?: OfficeDocumentType | null
  search?: string | null
  page?: number
  pageSize?: number
}

export interface CreateOfficeDocumentInput {
  documentType: OfficeDocumentType
  title: string
  description?: string | null
  initialSnapshot?: unknown
  initialSnapshotText?: string | null
  source?: OfficeSnapshotSource
  changeSummary?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface ImportOfficeDocumentInput {
  importFormat: OfficeImportFormat
  documentType: OfficeDocumentType
  title?: string | null
  description?: string | null
  fileName: string
  mimeType?: string | null
  size?: number | null
  fileBase64: string
  assistantId?: string | null
  conversationId?: string | null
}

export interface OfficeWorkspaceFileScope {
  tenantId?: string | null
  userId?: string | null
  catalog: OfficeWorkspaceCatalog
  scopeId: string
  xpertId?: string | null
  projectId?: string | null
  isolateByUser?: boolean | null
}

export interface OfficeWorkspaceFileRecord {
  name?: string
  filePath: string
  workspacePath?: string
  fileUrl?: string
  url?: string
  mimeType?: string
  size?: number
  catalog?: OfficeWorkspaceCatalog
  scopeId?: string
}

export interface OfficeWorkspaceFileBuffer extends OfficeWorkspaceFileRecord {
  buffer: Buffer
}

export interface OfficeWorkspaceFilesApi {
  uploadBuffer(input: OfficeWorkspaceFileScope & {
    buffer: Buffer
    originalName: string
    mimeType?: string | null
    size?: number | null
    folder?: string | null
    fileName?: string | null
    metadata?: Record<string, unknown>
  }): Promise<OfficeWorkspaceFileRecord>

  readBuffer(input: OfficeWorkspaceFileScope & {
    filePath: string
  }): Promise<OfficeWorkspaceFileBuffer>

  deleteFile(input: OfficeWorkspaceFileScope & {
    filePath: string
  }): Promise<void>
}

export interface OfficeImportConversionResult {
  documentType: OfficeDocumentType
  importFormat: OfficeImportFormat
  snapshot: unknown
  snapshotText: string
  warnings: string[]
  fidelity: 'best_effort'
}

export interface SaveOfficeSnapshotInput {
  documentId: string
  snapshot: unknown
  snapshotText?: string | null
  source?: OfficeSnapshotSource
  yjsStateBase64?: string | null
  yjsStateVectorBase64?: string | null
  changeSummary?: string | null
  operationId?: string | null
}

export interface SyncOfficeYjsStateInput {
  documentId: string
  updateBase64?: string | null
  fullStateBase64?: string | null
  stateVectorBase64?: string | null
  snapshot?: unknown
  snapshotText?: string | null
  origin?: string | null
  clientId?: string | null
}

export interface QueueOfficeOperationInput {
  documentId: string
  operationType: OfficeOperationType
  input: OfficeOperationInput
  reviewNote?: string | null
  confidence?: number | null
  source?: OfficeOperationSource
}

export interface AddOfficeReviewNoteInput {
  documentId: string
  note: string
  target?: unknown
  confidence?: number | null
}

export interface CompleteOfficeOperationInput {
  operationId: string
  status: OfficeOperationStatus
  result?: unknown
  errorMessage?: string | null
}

export interface PrepareOfficeAssistantPromptInput {
  documentId: string
  instruction?: string | null
}

export interface ReportOfficeFailureInput {
  documentId?: string | null
  documentType?: OfficeDocumentType | null
  title?: string | null
  reason: string
  recoverable?: boolean | null
}

export interface ReadExcelWorkbookInput {
  documentId: string
  sheetName?: string | null
  range?: string | null
}

export interface EditExcelWorkbookInput {
  documentId: string
  expectedVersionNumber?: number | null
  operations: ExcelAutomationOperation[]
  changeSummary?: string | null
  idempotencyKey?: string | null
}

export interface RestoreExcelVersionInput {
  documentId: string
  versionId: string
  expectedVersionNumber?: number | null
  changeSummary?: string | null
}

export type ExcelAutomationOperation =
  | {
      type: 'set_range_values'
      sheetName: string
      range: string
      values: OfficeCellValue[][]
    }
  | {
      type: 'set_range_formulas'
      sheetName: string
      range: string
      formulas: Array<Array<string | null>>
    }
  | {
      type: 'clear_range'
      sheetName: string
      range: string
    }
  | {
      type: 'create_sheet'
      sheetName: string
    }
  | {
      type: 'rename_sheet'
      sheetName: string
      newSheetName: string
    }
  | {
      type: 'delete_sheet'
      sheetName: string
    }

export type OfficeOperationInput =
  | {
      operationType: 'sheet_set_range_values'
      sheetName?: string
      range: string
      values: OfficeCellValue[][]
    }
  | {
      operationType: 'doc_append_text'
      text: string
    }
  | {
      operationType: 'doc_replace_text'
      search: string
      replaceWith: string
      matchCase?: boolean
    }
  | {
      operationType: 'slide_create_outline'
      slides: Array<{
        title: string
        bullets?: string[]
        speakerNotes?: string
      }>
    }
  | {
      operationType: 'slide_update_text'
      slideId?: string
      slideIndex?: number
      targetText: string
      replaceWith: string
    }

export type OfficeCellValue = string | number | boolean | null

export interface OfficeCollabSession {
  sessionId: string
  documentId: string
  scope: OfficeScope
  userId?: string | null
  expiresAt: number
}

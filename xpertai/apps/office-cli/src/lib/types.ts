import type {
  OFFICE_CLI_DOCUMENT_FORMATS,
  OFFICE_CLI_GUIDANCE_SKILLS,
  OFFICE_CLI_READ_COMMANDS,
  OFFICE_CLI_TOOL_NAMES,
  OFFICE_CLI_WRITE_COMMANDS
} from './constants.js'
import type {
  WorkspaceFile,
  WorkspaceFilesApi,
  WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'

export type OfficeCliDocumentFormat = (typeof OFFICE_CLI_DOCUMENT_FORMATS)[number]
export type OfficeCliGuidanceSkill = (typeof OFFICE_CLI_GUIDANCE_SKILLS)[number]
export type OfficeCliReadCommand = (typeof OFFICE_CLI_READ_COMMANDS)[number]
export type OfficeCliWriteCommand = (typeof OFFICE_CLI_WRITE_COMMANDS)[number]
export type OfficeCliCommand = OfficeCliReadCommand | OfficeCliWriteCommand
export type OfficeCliToolName = (typeof OFFICE_CLI_TOOL_NAMES)[number]
export type OfficeCliDocumentStatus = 'draft' | 'active' | 'archived'
export type OfficeCliVersionSource = 'create' | 'import' | 'agent' | 'workbench' | 'restore'
export type OfficeCliWorkspaceCatalog = 'xperts' | 'user-xperts' | 'projects'

export interface OfficeCliScope {
  tenantId?: string | null
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
  workspaceFiles?: OfficeCliWorkspaceFileScope | null
  /** Scoped capability captured from middleware.runtime for this invocation. */
  runtimeWorkspaceFiles?: OfficeCliWorkspaceFilesApi
}

export interface OfficeCliWorkbenchQuery {
  documentId?: string | null
  search?: string | null
  page?: number
  pageSize?: number
}

export interface CreateOfficeCliDocumentInput {
  format: OfficeCliDocumentFormat
  title: string
  description?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface ImportOfficeCliDocumentInput {
  title?: string | null
  description?: string | null
  fileName: string
  mimeType?: string | null
  size?: number | null
  buffer: Buffer
  assistantId?: string | null
  conversationId?: string | null
}

export interface ExecuteOfficeCliCommandInput {
  documentId: string
  command: OfficeCliCommand
  args?: string[]
  stdin?: string | null
  expectedVersionNumber?: number | null
  changeSummary?: string | null
  source?: Extract<OfficeCliVersionSource, 'agent' | 'workbench'>
  dangerousConfirmed?: boolean
}

export interface RestoreOfficeCliVersionInput {
  documentId: string
  versionId: string
  expectedVersionNumber?: number | null
  changeSummary?: string | null
}

export interface ApplyOfficeCliWordDesignInput {
  documentId: string
  expectedVersionNumber: number
  includeTableOfContents?: boolean
  bodyFont?: string | null
  eastAsiaFont?: string | null
  accentColor?: string | null
  changeSummary?: string | null
}

export interface OfficeCliWorkspaceFileScope {
  tenantId?: string | null
  userId?: string | null
  catalog: OfficeCliWorkspaceCatalog
  scopeId: string
  xpertId?: string | null
  projectId?: string | null
  isolateByUser?: boolean | null
}

export type OfficeCliWorkspaceFileRecord = WorkspaceFile
export type OfficeCliPortableFileReference = WorkspacePortableFileReference

export interface OfficeCliWorkspaceFileBuffer extends OfficeCliWorkspaceFileRecord {
  buffer: Buffer
}

export type OfficeCliWorkspaceFilesApi = WorkspaceFilesApi

export interface OfficeCliExecutionResult {
  command: string
  args: string[]
  exitCode: number
  stdout: string
  stderr: string
  json?: unknown
  durationMs: number
}

export interface OfficeCliDocumentExecutionResult extends OfficeCliExecutionResult {
  fileBuffer: Buffer
}

export interface OfficeCliPreview {
  html?: string
  error?: string
  generatedAt?: string
}

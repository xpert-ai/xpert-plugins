export const DOCX_ASSISTANT_CONTEXT_KEY = 'docxEditor'

export type DocxAssistantContextDetail = {
  item?: Record<string, any>
  currentVersion?: Record<string, any> | null
  snapshot?: Record<string, any> | null
}

export type BuildDocxAssistantContextPayloadInput = {
  documentId?: string | null
  detail?: DocxAssistantContextDetail | null
  dirty?: boolean
  mode?: string | null
  selectionContext?: Record<string, any> | null
}

export type DocxAssistantContextPayload = {
  key: typeof DOCX_ASSISTANT_CONTEXT_KEY
  env: Record<string, string>
  context: {
    currentDocument: Record<string, unknown>
  }
}

export type DocxAssistantContextClearPayload = {
  key: typeof DOCX_ASSISTANT_CONTEXT_KEY
  clear: true
}

export function buildDocxAssistantContextPayload(
  input: BuildDocxAssistantContextPayloadInput
): DocxAssistantContextPayload | null {
  const documentId = stringValue(input.documentId)
  const item = input.detail?.item
  if (!documentId || !item) {
    return null
  }

  const currentVersion = input.detail?.currentVersion
  const mode = stringValue(input.mode) ?? 'editing'
  const workspaceFilePath = stringValue(currentVersion?.workspaceFilePath) || stringValue(item.workspaceFilePath)
  const versionId = stringValue(currentVersion?.id) || stringValue(item.currentVersionId)
  const selectionContext = input.selectionContext ?? null
  const selection = summarizeSelection(selectionContext?.selection ?? input.detail?.snapshot?.selection)
  const env: Record<string, string> = {
    docxEditorDocumentId: documentId,
    docxEditorMode: mode
  }
  if (versionId) {
    env.docxEditorVersionId = versionId
  }
  if (workspaceFilePath) {
    env.docxEditorWorkspaceFilePath = workspaceFilePath
  }

  return {
    key: DOCX_ASSISTANT_CONTEXT_KEY,
    env,
    context: {
      currentDocument: {
        documentId,
        title: stringValue(item.title) || stringValue(item.fileName) || documentId,
        fileName: stringValue(item.fileName),
        currentVersionId: versionId,
        currentVersionNumber: numberValue(currentVersion?.versionNumber) ?? numberValue(item.currentVersionNumber),
        workspaceFilePath,
        workspaceCatalog: stringValue(currentVersion?.workspaceCatalog) || stringValue(item.workspaceCatalog),
        workspaceScopeId: stringValue(currentVersion?.workspaceScopeId) || stringValue(item.workspaceScopeId),
        dirty: input.dirty === true,
        mode,
        selection,
        currentPage: numberValue(selectionContext?.currentPage),
        totalPages: numberValue(selectionContext?.totalPages)
      }
    }
  }
}

export function buildClearDocxAssistantContextPayload(): DocxAssistantContextClearPayload {
  return {
    key: DOCX_ASSISTANT_CONTEXT_KEY,
    clear: true
  }
}

export function summarizeSelection(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  return {
    paraId: stringValue(value.paraId),
    selectedText: truncateText(stringValue(value.selectedText), 800),
    paragraphText: truncateText(stringValue(value.paragraphText), 1200),
    before: truncateText(stringValue(value.before), 240),
    after: truncateText(stringValue(value.after), 240)
  }
}

export function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function truncateText(value: string | undefined, maxLength: number) {
  if (!value) {
    return undefined
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

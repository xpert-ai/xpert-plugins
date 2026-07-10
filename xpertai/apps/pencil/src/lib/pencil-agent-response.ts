import type { PencilJsonValue } from './types.js'

type AgentToolResultValue = PencilJsonValue | object | null | undefined
type AgentResultValue = AgentToolResultValue | Date | AgentResultValue[]
type AgentResultObject = {
  [key: string]: AgentResultValue
}

/** Removes undefined and empty collection noise before serializing a tool result for the model. */
export function stringifyAgentToolResult(value: AgentToolResultValue) {
  return JSON.stringify(pruneEmpty(value), null, 2)
}

/** Keeps mutation responses compact while preserving ids required by Workbench host events. */
export function summarizeDocumentMutationResult(result: object, message: string) {
  const resultObject = asObject(result) ?? {}
  const resultDocument = asObject(resultObject.document) ?? {}
  const document = asObject(resultDocument.item) ?? (Object.keys(resultDocument).length ? resultDocument : null) ?? asObject(resultObject.item)
  const version = asObject(resultObject.version) || asObject(resultDocument.currentVersion)
  const workingCopy = asObject(resultObject.workingCopy) || asObject(resultDocument.workingCopy)
  return {
    success: typeof resultObject.success === 'boolean' ? resultObject.success : true,
    message: typeof resultObject.message === 'string' ? resultObject.message : message,
    documentId: document?.id,
    currentVersionId: document?.currentVersionId ?? version?.id,
    currentVersionNumber: document?.currentVersionNumber ?? version?.versionNumber,
    workingCopyRevision: document?.workingCopyRevision ?? workingCopy?.workingCopyRevision,
    graphChecksum: document?.graphChecksum ?? workingCopy?.graphChecksum,
    snapshotSummary: resultObject.snapshotSummary ?? resultDocument.snapshotSummary ?? workingCopy?.snapshotSummary,
    export: summarizeExportResult(asObject(resultObject.export)),
    restoredVersionId: asObject(resultObject.restoredVersion)?.id
  }
}

export function summarizeGetDocumentResult(result: object, includeSnapshot?: boolean) {
  const resultObject = asObject(result) ?? {}
  const item = asObject(resultObject.item)
  const currentVersion = asObject(resultObject.currentVersion)
  const requestedVersion = asObject(resultObject.requestedVersion)
  return {
    documentId: item?.id,
    title: item?.title,
    kind: item?.kind,
    status: item?.status,
    currentVersionId: item?.currentVersionId ?? currentVersion?.id,
    currentVersionNumber: item?.currentVersionNumber ?? currentVersion?.versionNumber,
    requestedVersionId: requestedVersion?.id,
    graphSource: resultObject.graphSource,
    workingCopy: summarizeWorkingCopy(asObject(resultObject.workingCopy)),
    snapshotSummary: resultObject.snapshotSummary,
    versions: summarizeVersionList(resultObject.versions),
    logs: summarizeLogList(resultObject.logs),
    graphSnapshot: includeSnapshot ? resultObject.graphSnapshot : undefined,
    graph: includeSnapshot ? resultObject.graph : undefined
  }
}

export function summarizeGetNodeResult(result: object) {
  const resultObject = asObject(result) ?? {}
  const document = asObject(resultObject.document)
  const version = asObject(resultObject.version)
  return {
    documentId: document?.id,
    versionId: version?.id,
    versionNumber: version?.versionNumber,
    graphSource: resultObject.graphSource,
    node: resultObject.node
  }
}

export function summarizeSearchResult(result: object) {
  const resultObject = asObject(result) ?? {}
  const items = Array.isArray(resultObject.items) ? resultObject.items.map(asObject).filter((item): item is AgentResultObject => Boolean(item)) : []
  return {
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      status: item.status,
      sourceFormat: item.sourceFormat,
      currentVersionId: item.currentVersionId,
      currentVersionNumber: item.currentVersionNumber,
      graphChecksum: item.graphChecksum,
      updatedAt: item.updatedAt
    })),
    total: typeof resultObject.total === 'number' ? resultObject.total : 0,
    page: typeof resultObject.page === 'number' ? resultObject.page : 1,
    pageSize: typeof resultObject.pageSize === 'number' ? resultObject.pageSize : 20,
    search: typeof resultObject.search === 'string' ? resultObject.search : ''
  }
}

export function summarizeFailureResult(result: object) {
  const resultObject = asObject(result) ?? {}
  return {
    success: Boolean(resultObject.success),
    message: typeof resultObject.message === 'string' ? resultObject.message : 'Pencil failure was recorded.'
  }
}

export function summarizeCoreToolResult(result: object) {
  const resultObject = asObject(result) ?? {}
  const coreResult = asObject(resultObject.result)
  return {
    success: typeof resultObject.success === 'boolean' ? resultObject.success : true,
    message: resultObject.message,
    recoverable: resultObject.recoverable,
    toolName: resultObject.toolName,
    documentId: resultObject.documentId,
    pageId: resultObject.toolName === 'create_page' ? coreResult?.id : undefined,
    mutates: resultObject.mutates,
    workingCopyRevision: resultObject.workingCopyRevision,
    graphChecksum: resultObject.graphChecksum,
    snapshotSummary: resultObject.snapshotSummary,
    renderDraftId: resultObject.renderDraftId,
    renderDraftRevision: resultObject.renderDraftRevision,
    renderDraftStatus: resultObject.renderDraftStatus,
    renderDraftExpiresAt: resultObject.renderDraftExpiresAt,
    diagnostic: resultObject.diagnostic,
    result: resultObject.result
  }
}

function summarizeWorkingCopy(value: AgentResultObject | null) {
  if (!value) {
    return undefined
  }
  return {
    workingUpdatedAt: value.workingUpdatedAt,
    workingBaseVersionId: value.workingBaseVersionId,
    workingCopyRevision: value.workingCopyRevision,
    graphChecksum: value.graphChecksum,
    snapshotSummary: value.snapshotSummary
  }
}

function summarizeVersionList(value: AgentResultValue | undefined) {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.map(asObject).filter((item): item is AgentResultObject => Boolean(item)).map((item) => ({
    id: item.id,
    versionNumber: item.versionNumber,
    sourceType: item.sourceType,
    changeSummary: item.changeSummary,
    createdAt: item.createdAt,
    snapshotSummary: item.snapshotSummary
  }))
}

function summarizeLogList(value: AgentResultValue | undefined) {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.map(asObject).filter((item): item is AgentResultObject => Boolean(item)).map((item) => ({
    action: item.action,
    message: item.message,
    errorMessage: item.errorMessage,
    createdAt: item.createdAt
  }))
}

function summarizeExportResult(value: AgentResultObject | null) {
  if (!value) {
    return undefined
  }
  return {
    format: value.format,
    mimeType: value.mimeType,
    size: value.size,
    sha256: value.sha256,
    path: value.path,
    workspacePath: value.workspacePath,
    fileRef: value.fileRef
  }
}

function pruneEmpty(value: AgentToolResultValue): AgentToolResultValue {
  if (Array.isArray(value)) {
    return value.map((item) => pruneEmpty(item)).filter((item) => item !== undefined) as AgentResultValue[]
  }
  if (!value || typeof value !== 'object' || value instanceof Date) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, pruneEmpty(item as AgentToolResultValue)] as const)
      .filter(([, item]) => item !== undefined)
      .filter(([, item]) => !Array.isArray(item) || item.length > 0)
  )
}

function asObject(value: AgentToolResultValue): AgentResultObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AgentResultObject) : null
}

import type { CanvasJsonValue } from './types.js'

type AgentToolResultValue = CanvasJsonValue | object | null | undefined
type AgentResultValue = AgentToolResultValue | Date | AgentResultValue[]
type AgentResultObject = {
  [key: string]: AgentResultValue
}

export function stringifyAgentToolResult(value: AgentToolResultValue) {
  return JSON.stringify(value, null, 2)
}

export function summarizeDocumentMutationResult(result: object, message: string) {
  const resultObject = asObject(result) ?? {}
  const resultDocument = asObject(resultObject.document) ?? {}
  const document = asObject(resultDocument.item) ?? (Object.keys(resultDocument).length ? resultDocument : null) ?? asObject(resultObject.item)
  const version = asObject(resultObject.version) || asObject(resultDocument.currentVersion)
  return {
    success: typeof resultObject.success === 'boolean' ? resultObject.success : true,
    message: typeof resultObject.message === 'string' ? resultObject.message : message,
    documentId: document?.id,
    title: document?.title,
    status: document?.status,
    currentVersionId: document?.currentVersionId ?? version?.id,
    currentVersionNumber: document?.currentVersionNumber ?? version?.versionNumber,
    sceneSource: resultDocument.sceneSource,
    snapshotImagePath: resultDocument.snapshotImagePath ?? document?.snapshotImagePath ?? version?.snapshotImagePath,
    snapshotImageUpdatedAt: resultDocument.snapshotImageUpdatedAt,
    snapshotSummary: resultDocument.snapshotSummary ?? version?.snapshotSummary,
    next: 'Open the Canvas Workbench to review, edit, annotate, or export the canvas.'
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
      currentVersionId: item.currentVersionId,
      currentVersionNumber: item.currentVersionNumber,
      snapshotImagePath: item.snapshotImagePath,
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
    message: typeof resultObject.message === 'string' ? resultObject.message : 'Canvas failure was recorded.'
  }
}

function asObject(value: AgentToolResultValue): AgentResultObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AgentResultObject) : null
}

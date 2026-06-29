import type { CanvasJsonValue } from './types.js'

type AgentToolResultValue = CanvasJsonValue | object | null | undefined
type AgentResultValue = AgentToolResultValue | Date | AgentResultValue[]
type AgentResultObject = {
  [key: string]: AgentResultValue
}

export function stringifyAgentToolResult(value: AgentToolResultValue) {
  return JSON.stringify(pruneEmpty(value), null, 2)
}

export function summarizeDocumentMutationResult(result: object, message: string) {
  const resultObject = asObject(result) ?? {}
  const resultDocument = asObject(resultObject.document) ?? {}
  const document = asObject(resultDocument.item) ?? (Object.keys(resultDocument).length ? resultDocument : null) ?? asObject(resultObject.item)
  const version = asObject(resultObject.version) || asObject(resultDocument.currentVersion)
  const insertion = asObject(resultObject.insertion)
  const autosave = asObject(resultObject.autosave)
  return {
    success: typeof resultObject.success === 'boolean' ? resultObject.success : true,
    message: typeof resultObject.message === 'string' ? resultObject.message : message,
    documentId: document?.id,
    currentVersionId: document?.currentVersionId ?? version?.id,
    currentVersionNumber: document?.currentVersionNumber ?? version?.versionNumber,
    sceneSource: autosave ? 'autosave' : resultDocument.sceneSource,
    snapshotImagePath: resultDocument.snapshotImagePath ?? document?.snapshotImagePath ?? version?.snapshotImagePath ?? autosave?.snapshotImagePath,
    snapshotImageUpdatedAt: resultDocument.snapshotImageUpdatedAt ?? autosave?.autosaveUpdatedAt,
    insertion: insertion
      ? {
          shapeId: insertion.shapeId,
          assetId: insertion.assetId,
          pageId: insertion.pageId,
          anchorShapeId: insertion.anchorShapeId,
          replacedShapeIds: insertion.replacedShapeIds
        }
      : undefined
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
    sceneSource: resultObject.sceneSource,
    snapshotImagePath: resultObject.snapshotImagePath ?? item?.snapshotImagePath,
    snapshotImageUpdatedAt: resultObject.snapshotImageUpdatedAt,
    snapshotSummary: resultObject.snapshotSummary,
    workingCopy: summarizeWorkingCopy(asObject(resultObject.workingCopy)),
    versions: summarizeVersionList(resultObject.versions),
    logs: summarizeLogList(resultObject.logs),
    scene: includeSnapshot ? resultObject.scene : undefined
  }
}

export function summarizeGetRecordResult(result: object) {
  const resultObject = asObject(result) ?? {}
  const document = asObject(resultObject.document)
  const version = asObject(resultObject.version)
  return {
    documentId: document?.id,
    versionId: version?.id,
    versionNumber: version?.versionNumber,
    sceneSource: resultObject.sceneSource,
    record: resultObject.record
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

function summarizeWorkingCopy(value: AgentResultObject | null) {
  if (!value) {
    return undefined
  }
  return {
    autosaveUpdatedAt: value.autosaveUpdatedAt,
    autosaveBaseVersionId: value.autosaveBaseVersionId,
    snapshotImagePath: value.snapshotImagePath,
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
    snapshotImagePath: item.snapshotImagePath,
    createdAt: item.createdAt
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

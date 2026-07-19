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
    workingCopyRevision: document?.workingCopyRevision ?? autosave?.workingCopyRevision ?? resultObject.workingCopyRevision,
    sceneSource: autosave ? 'autosave' : resultDocument.sceneSource,
    hasSnapshotImage: Boolean(resultDocument.snapshotImagePath ?? document?.snapshotImagePath ?? version?.snapshotImagePath ?? autosave?.snapshotImagePath),
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

export function summarizeRecordBatchResult(result: object) {
  const value = asObject(result) ?? {}
  const counts = asObject(value.counts)
  return {
    success: Boolean(value.success),
    duplicate: Boolean(value.duplicate),
    documentId: value.documentId,
    operationId: value.operationId,
    batchId: value.batchId,
    stageIndex: value.stageIndex,
    stageLabel: value.stageLabel,
    isFinalStage: value.isFinalStage,
    baseRevision: value.baseRevision,
    revisionBefore: value.revisionBefore,
    workingCopyRevision: value.workingCopyRevision,
    createdRecordIds: value.createdRecordIds,
    updatedRecordIds: value.updatedRecordIds,
    removedRecordIds: value.removedRecordIds,
    cascadedRecordIds: value.cascadedRecordIds,
    counts: counts
      ? {
          created: counts.created,
          updated: counts.updated,
          removed: counts.removed,
          cascaded: counts.cascaded
        }
      : undefined,
    nextAction: value.nextAction
  }
}

export function summarizeDocumentSummaryResult(result: object) {
  const value = asObject(result) ?? {}
  return {
    documentId: value.documentId,
    title: value.title,
    description: value.description,
    kind: value.kind,
    status: value.status,
    tags: value.tags,
    currentVersionId: value.currentVersionId,
    currentVersionNumber: value.currentVersionNumber,
    workingCopyRevision: value.workingCopyRevision,
    snapshotChecksum: value.snapshotChecksum,
    snapshotSummary: value.snapshotSummary,
    hasSnapshotImage: value.hasSnapshotImage,
    snapshotImageUpdatedAt: value.snapshotImageUpdatedAt,
    updatedAt: value.updatedAt,
    availableReads: value.availableReads,
    nextAction: value.nextAction
  }
}

export function summarizeRecordListResult(result: object) {
  const value = asObject(result) ?? {}
  return {
    documentId: value.documentId,
    workingCopyRevision: value.workingCopyRevision,
    items: value.items,
    total: value.total,
    limit: value.limit,
    hasMore: value.hasMore,
    nextCursor: value.nextCursor,
    availableReads: value.availableReads
  }
}

export function summarizeGetRecordResult(result: object) {
  const resultObject = asObject(result) ?? {}
  const document = asObject(resultObject.document)
  const version = asObject(resultObject.version)
  return {
    documentId: resultObject.documentId ?? document?.id,
    versionId: version?.id,
    versionNumber: version?.versionNumber,
    workingCopyRevision: resultObject.workingCopyRevision,
    sceneSource: resultObject.sceneSource,
    record: resultObject.record,
    nextAction: resultObject.nextAction
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
      hasSnapshotImage: Boolean(item.snapshotImagePath),
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

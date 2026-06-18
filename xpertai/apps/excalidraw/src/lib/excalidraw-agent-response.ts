import type { GetExcalidrawDrawingInput, GetExcalidrawSceneItemInput } from './types.js'

const DEFAULT_VERSION_LIMIT = 3
const MAX_VERSION_LIMIT = 20
const DEFAULT_LOG_LIMIT = 5
const MAX_LOG_LIMIT = 20
const DEFAULT_ELEMENT_LIMIT = 50
const MAX_ELEMENT_LIMIT = 200
const TEXT_PREVIEW_LIMIT = 240
const ELEMENT_TEXT_PREVIEW_LIMIT = 120
const MERMAID_PREVIEW_LIMIT = 300

export function stringifyAgentToolResult(value: unknown) {
  return JSON.stringify(pruneUndefined(value))
}

export function summarizeDrawingMutationResult(result: Record<string, any>, fallbackMessage: string) {
  const drawingPayload = result.drawing ?? result
  const currentVersion = drawingPayload.currentVersion ?? result.version ?? null
  const drawing = summarizeDrawingItem(drawingPayload.item ?? result.item)
  const summarizedCurrentVersion = summarizeVersion(currentVersion)
  const summarizedVersion = result.version ? summarizeVersion(result.version) : undefined
  const drawingId =
    readString(result.drawingId) ??
    drawing?.id ??
    readString(currentVersion?.drawingId) ??
    readString(result.version?.drawingId)
  const versionId = readString(result.versionId) ?? summarizedVersion?.id ?? summarizedCurrentVersion?.id
  const versionNumber =
    readFiniteNumber(result.versionNumber) ?? summarizedVersion?.versionNumber ?? summarizedCurrentVersion?.versionNumber
  return pruneUndefined({
    success: result.success ?? true,
    message: result.message ?? fallbackMessage,
    drawingId,
    versionId,
    versionNumber,
    drawing,
    currentVersion: summarizedCurrentVersion,
    version: summarizedVersion,
    summary: drawingPayload.summary,
    patch: result.patch
  })
}

export function summarizeSearchResult(result: Record<string, any>) {
  return pruneUndefined({
    items: Array.isArray(result.items) ? result.items.map((item) => summarizeDrawingItem(item)) : [],
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    search: result.search
  })
}

export function summarizeStatusResult(result: Record<string, any>) {
  const item = summarizeDrawingItem(result.item)
  return pruneUndefined({
    success: result.success ?? true,
    message: result.message,
    drawingId: item?.id,
    item
  })
}

export function summarizeFailureResult(result: Record<string, any>) {
  const log = summarizeLog(result.log)
  return pruneUndefined({
    success: result.success ?? true,
    message: result.message,
    drawingId: log?.drawingId,
    versionId: log?.versionId,
    log
  })
}

export function buildAgentDrawingResponse(
  payload: Record<string, any>,
  input: GetExcalidrawDrawingInput,
  sceneVersion: Record<string, any> | null
) {
  const versions = Array.isArray(payload.versions) ? payload.versions : []
  const logs = Array.isArray(payload.logs) ? payload.logs : []
  const versionLimit = boundedInt(input.versionLimit, DEFAULT_VERSION_LIMIT, 1, MAX_VERSION_LIMIT)
  const logLimit = boundedInt(input.logLimit, DEFAULT_LOG_LIMIT, 1, MAX_LOG_LIMIT)
  const scenePayload = input.includeScene && sceneVersion ? buildScenePayload(sceneVersion, input) : undefined

  return pruneUndefined({
    item: summarizeDrawingItem(payload.item),
    currentVersion: summarizeVersion(payload.currentVersion),
    requestedVersion: input.versionId || input.versionNumber !== undefined ? summarizeVersion(sceneVersion) : undefined,
    versions: versions.slice(0, versionLimit).map((version) => summarizeVersion(version)),
    versionsReturned: Math.min(versions.length, versionLimit),
    totalVersions: versions.length,
    logs: input.includeLogs ? logs.slice(0, logLimit).map((log) => summarizeLog(log)) : undefined,
    logsReturned: input.includeLogs ? Math.min(logs.length, logLimit) : undefined,
    totalLogs: input.includeLogs ? logs.length : undefined,
    summary: payload.summary,
    scene: scenePayload,
    nextActions: input.includeScene
      ? scenePayload?.nextActions
      : 'Use version id or versionNumber from currentVersion/versions. Call excalidraw_get_drawing with includeScene=true for paged element refs; call excalidraw_get_scene_item for a full element, appState, file, or Mermaid source.'
  })
}

export function buildAgentSceneItemResponse(
  version: Record<string, any>,
  input: GetExcalidrawSceneItemInput
) {
  const elements = Array.isArray(version.elements) ? version.elements : []
  const files = isPlainObject(version.files) ? version.files : {}
  const versionRef = summarizeVersion(version)

  if (input.itemType === 'element') {
    const element = elements.find((candidate) => readString(candidate?.id) === input.elementId)
    return pruneUndefined({
      itemType: input.itemType,
      drawingId: version.drawingId ?? input.drawingId,
      version: versionRef,
      elementId: input.elementId,
      element
    })
  }

  if (input.itemType === 'file') {
    const fileId = input.fileId
    return pruneUndefined({
      itemType: input.itemType,
      drawingId: version.drawingId ?? input.drawingId,
      version: versionRef,
      fileId,
      file: fileId ? files[fileId] : undefined
    })
  }

  if (input.itemType === 'appState') {
    return pruneUndefined({
      itemType: input.itemType,
      drawingId: version.drawingId ?? input.drawingId,
      version: versionRef,
      appState: isPlainObject(version.appState) ? version.appState : {}
    })
  }

  return pruneUndefined({
    itemType: input.itemType,
    drawingId: version.drawingId ?? input.drawingId,
    version: versionRef,
    mermaidSource: typeof version.mermaidSource === 'string' ? version.mermaidSource : null
  })
}

export function summarizeDrawingItem(item: Record<string, any> | null | undefined) {
  if (!item) {
    return undefined
  }
  return pruneUndefined({
    id: item.id,
    title: item.title,
    description: previewText(item.description),
    kind: item.kind,
    status: item.status,
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 20) : undefined,
    source: item.source,
    currentVersionId: item.currentVersionId,
    currentVersionNumber: item.currentVersionNumber,
    createdAt: formatDateValue(item.createdAt),
    updatedAt: formatDateValue(item.updatedAt),
    lastEditedAt: formatDateValue(item.lastEditedAt)
  })
}

export function summarizeVersion(version: Record<string, any> | null | undefined) {
  if (!version) {
    return undefined
  }
  const elements = Array.isArray(version.elements) ? version.elements : []
  const files = isPlainObject(version.files) ? version.files : {}
  const mermaidSource = typeof version.mermaidSource === 'string' ? version.mermaidSource : ''
  return pruneUndefined({
    id: version.id,
    versionNumber: version.versionNumber,
    sourceType: version.sourceType,
    changeSummary: previewText(version.changeSummary),
    elementCount: elements.length,
    fileCount: Object.keys(files).length,
    hasMermaidSource: Boolean(mermaidSource)
  })
}

export function summarizeLog(log: Record<string, any> | null | undefined) {
  if (!log) {
    return undefined
  }
  return pruneUndefined({
    id: log.id,
    drawingId: log.drawingId,
    versionId: log.versionId,
    action: log.action,
    actorType: log.actorType,
    message: previewText(log.message),
    errorMessage: previewText(log.errorMessage),
    snapshotKeys: isPlainObject(log.snapshot) ? Object.keys(log.snapshot).slice(0, 20) : undefined,
    createdAt: formatDateValue(log.createdAt)
  })
}

function buildScenePayload(version: Record<string, any>, input: GetExcalidrawDrawingInput) {
  const elements = Array.isArray(version.elements) ? version.elements : []
  const offset = boundedInt(input.elementOffset, 0, 0, elements.length)
  const limit = boundedInt(input.elementLimit, DEFAULT_ELEMENT_LIMIT, 1, MAX_ELEMENT_LIMIT)
  const returnedElements = elements.slice(offset, offset + limit)
  const files = isPlainObject(version.files) ? version.files : {}
  const appState = isPlainObject(version.appState) ? version.appState : {}
  const mermaidSource = typeof version.mermaidSource === 'string' ? version.mermaidSource : ''
  return pruneUndefined({
    version: summarizeVersion(version),
    elementOffset: offset,
    elementLimit: limit,
    returnedElementCount: returnedElements.length,
    totalElementCount: elements.length,
    hasMoreElements: offset + returnedElements.length < elements.length,
    elementFields: ['id', 'type', 'isDeleted', 'x', 'y', 'width', 'height', 'textPreview', 'fileId', 'containerId', 'frameId', 'groupIds'],
    elements: returnedElements.map((element) => summarizeElementRef(element)),
    appState: summarizeAppState(appState),
    files: Object.entries(files).map(([fileId, file]) => summarizeFileRef(fileId, file)),
    mermaidSource: mermaidSource
      ? {
          length: mermaidSource.length,
          preview: mermaidSource.length > MERMAID_PREVIEW_LIMIT ? `${mermaidSource.slice(0, MERMAID_PREVIEW_LIMIT)}...` : mermaidSource
        }
      : undefined,
    nextActions: 'Use excalidraw_get_scene_item with itemType=element and elementId for full element JSON; itemType=appState for full appState; itemType=file and fileId for file payload; itemType=mermaidSource for full Mermaid source.'
  })
}

function summarizeElementRef(element: unknown) {
  if (!isPlainObject(element)) {
    return undefined
  }
  const type = readString(element.type)
  return pruneUndefined({
    id: readString(element.id),
    type,
    isDeleted: element.isDeleted === true ? true : undefined,
    x: readFiniteDecimal(element.x),
    y: readFiniteDecimal(element.y),
    width: readFiniteDecimal(element.width),
    height: readFiniteDecimal(element.height),
    textPreview: type === 'text' ? previewText(element.text, ELEMENT_TEXT_PREVIEW_LIMIT) : undefined,
    fileId: type === 'image' ? readString(element.fileId) : undefined,
    containerId: readString(element.containerId),
    frameId: readString(element.frameId),
    groupIds: Array.isArray(element.groupIds) && element.groupIds.length
      ? element.groupIds.filter((value) => typeof value === 'string').slice(0, 5)
      : undefined,
    pointsCount: Array.isArray(element.points) ? element.points.length : undefined,
    boundElementIds: Array.isArray(element.boundElements)
      ? element.boundElements
        .map((boundElement) => isPlainObject(boundElement) ? readString(boundElement.id) : undefined)
        .filter(Boolean)
        .slice(0, 10)
      : undefined
  })
}

function summarizeAppState(appState: Record<string, unknown>) {
  return pruneUndefined({
    keys: Object.keys(appState).slice(0, 30),
    theme: readString(appState.theme),
    viewBackgroundColor: readString(appState.viewBackgroundColor),
    gridSize: readFiniteNumber(appState.gridSize)
  })
}

function summarizeFileRef(fileId: string, file: unknown) {
  const fileObject = isPlainObject(file) ? file : {}
  const dataURL = typeof fileObject.dataURL === 'string' ? fileObject.dataURL : ''
  return pruneUndefined({
    id: fileId,
    mimeType: readString(fileObject.mimeType),
    created: fileObject.created,
    dataURLLength: dataURL ? dataURL.length : undefined
  })
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
  return Math.max(min, Math.min(max, numeric))
}

function previewText(value: unknown, limit = TEXT_PREVIEW_LIMIT) {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed
}

function formatDateValue(value: unknown) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
  }
  return undefined
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined
}

function readFiniteDecimal(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => pruneUndefined(item)) as T
  }
  if (!isPlainObject(value)) {
    return value
  }
  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, entryValue]) => {
    if (entryValue !== undefined) {
      acc[key] = pruneUndefined(entryValue)
    }
    return acc
  }, {}) as T
}

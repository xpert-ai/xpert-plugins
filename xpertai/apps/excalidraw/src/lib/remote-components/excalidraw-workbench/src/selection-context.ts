import {
  ASSISTANT_CONTEXT_SET_COMMAND,
  EXCALIDRAW_PLUGIN_NAME
} from '../../../constants.js'

const EXCALIDRAW_CONTEXT_KEY = 'excalidraw'
const EXCALIDRAW_SELECTION_CONTEXT_TYPE = 'excalidraw.selection.v1'

type SelectionContextInput = {
  drawing: Record<string, unknown> | null | undefined
  version: Record<string, unknown> | null | undefined
  selectedElementIds: string[]
  elements: unknown[]
  isDirty?: boolean
  capturedAt?: string
}

export function getSelectedElementIds(appState: Record<string, unknown>, fallback: string[] = []) {
  const selected = appState.selectedElementIds
  if (Array.isArray(selected)) {
    return uniqueStrings(selected)
  }
  if (selected instanceof Map) {
    return uniqueStrings(
      Array.from(selected.entries())
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key)
    )
  }
  if (isObject(selected)) {
    return uniqueStrings(
      Object.entries(selected)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key)
    )
  }
  return uniqueStrings(fallback)
}

export function createExcalidrawSelectionContextCommand(input: SelectionContextInput) {
  const drawingId = readString(input.drawing?.id)
  if (!drawingId) {
    return createExcalidrawSelectionClearCommand()
  }

  const selectedElements = buildSelectedElementRefs(input.elements, input.selectedElementIds)
  const resolvedSelectedElementIds = selectedElements.map((element) => readString(element.id)).filter((id): id is string => Boolean(id))
  if (resolvedSelectedElementIds.length === 0) {
    return createExcalidrawSelectionClearCommand()
  }

  const title = readString(input.drawing?.title)
  const versionId = readString(input.version?.id)
  const versionNumber = readFiniteNumber(input.version?.versionNumber)
  const capturedAt = input.capturedAt || new Date().toISOString()
  const isDirty = input.isDirty === true
  const selection = {
    type: EXCALIDRAW_SELECTION_CONTEXT_TYPE,
    selectedElementIds: resolvedSelectedElementIds,
    selectedElementCount: resolvedSelectedElementIds.length,
    elements: selectedElements,
    bounds: calculateSelectionBounds(selectedElements),
    capturedAt
  }
  const currentDrawing = pruneUndefined({
    drawingId,
    title,
    currentVersionId: versionId,
    currentVersionNumber: versionNumber,
    isDirty,
    source: EXCALIDRAW_PLUGIN_NAME,
    selection
  })
  const excalidrawContext = {
    currentDrawing
  }

  return {
    commandKey: ASSISTANT_CONTEXT_SET_COMMAND,
    payload: {
      key: EXCALIDRAW_CONTEXT_KEY,
      env: pruneUndefined({
        excalidrawDrawingId: drawingId,
        excalidrawVersionId: versionId,
        excalidrawVersionNumber: versionNumber === undefined ? undefined : String(versionNumber),
        excalidrawSelectedElementIdsJson: JSON.stringify(resolvedSelectedElementIds),
        excalidrawSelectionJson: JSON.stringify(selection),
        excalidrawContextJson: JSON.stringify(excalidrawContext),
        excalidrawSceneDirty: String(isDirty)
      }),
      context: {
        currentDrawing
      }
    }
  }
}

export function createExcalidrawSelectionClearCommand() {
  return {
    commandKey: ASSISTANT_CONTEXT_SET_COMMAND,
    payload: {
      key: EXCALIDRAW_CONTEXT_KEY,
      clear: true
    }
  }
}

export function createExcalidrawSelectionContextSignature(input: SelectionContextInput) {
  const command = createExcalidrawSelectionContextCommand({
    ...input,
    capturedAt: 'signature'
  })
  return JSON.stringify(command.payload)
}

function buildSelectedElementRefs(elements: unknown[], selectedElementIds: string[]) {
  const selectedIdSet = new Set(selectedElementIds)
  const refs: Array<Record<string, unknown>> = []
  for (const element of elements) {
    if (!isObject(element) || element.isDeleted === true) {
      continue
    }
    const id = readString(element.id)
    if (!id || !selectedIdSet.has(id)) {
      continue
    }
    refs.push(pruneUndefined({
      id,
      type: readString(element.type),
      x: readFiniteNumber(element.x),
      y: readFiniteNumber(element.y),
      width: readFiniteNumber(element.width),
      height: readFiniteNumber(element.height),
      textPreview: previewText(readString(element.text) ?? readString(element.originalText)),
      groupIds: readStringArray(element.groupIds),
      containerId: readString(element.containerId),
      boundElementIds: readBoundElementIds(element.boundElements)
    }))
  }
  return refs.sort((left, right) => selectedElementIds.indexOf(readString(left.id) ?? '') - selectedElementIds.indexOf(readString(right.id) ?? ''))
}

function calculateSelectionBounds(elements: Array<Record<string, unknown>>) {
  const boxes = elements.map((element) => {
    const x = readFiniteNumber(element.x) ?? 0
    const y = readFiniteNumber(element.y) ?? 0
    const width = readFiniteNumber(element.width) ?? 0
    const height = readFiniteNumber(element.height) ?? 0
    return {
      x,
      y,
      maxX: x + width,
      maxY: y + height
    }
  })
  const minX = Math.min(...boxes.map((box) => box.x))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxX = Math.max(...boxes.map((box) => box.maxX))
  const maxY = Math.max(...boxes.map((box) => box.maxY))
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())))
}

function readBoundElementIds(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }
  const ids = value
    .map((item) => isObject(item) ? readString(item.id) : undefined)
    .filter((item): item is string => Boolean(item))
  return ids.length ? ids : undefined
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }
  const values = value.map((item) => readString(item)).filter((item): item is string => Boolean(item))
  return values.length ? values : undefined
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function previewText(value: string | undefined, limit = 180) {
  if (!value) {
    return undefined
  }
  return value.length > limit ? `${value.slice(0, limit)}...` : value
}

function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => pruneUndefined(item)) as T
  }
  if (!isObject(value)) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .map(([key, field]) => [key, pruneUndefined(field)])
  ) as T
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

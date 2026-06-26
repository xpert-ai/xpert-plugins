import type { Editor } from 'tldraw'

export type CanvasStoreEvent = Parameters<Parameters<Editor['store']['listen']>[0]>[0]
export type CanvasStoreChanges = CanvasStoreEvent['changes']
type CanvasStoreRecord = CanvasStoreChanges['added'][keyof CanvasStoreChanges['added']]

export type CanvasSnapshotImagePayload = {
  dataUrl: string
  mimeType: 'image/png'
  fileName: 'current.png'
  width?: number | null
  height?: number | null
  pageId?: string | null
  camera?: ReturnType<Editor['getCamera']> | null
  capturedAt: string
}

type CanvasCamera = {
  x: number
  y: number
  z: number
}

type SerializablePrimitive = string | number | boolean | null
type SerializableValue = SerializablePrimitive | SerializableObject | SerializableValue[]
interface SerializableObject {
  [key: string]: SerializableValue | undefined
}

type StableStringifyValue = SerializableValue | object | undefined

type BufferConstructorLike = {
  from(input: ArrayBuffer): {
    toString(encoding: 'base64'): string
  }
}

type GlobalWithBuffer = typeof globalThis & {
  Buffer?: BufferConstructorLike
}

export function createAutosaveSignature(input: {
  documentId?: string | null
  snapshot?: StableStringifyValue
  viewState?: StableStringifyValue
  selectionSummary?: StableStringifyValue
}) {
  return stableStringify({
    documentId: input.documentId ?? '',
    snapshot: input.snapshot ?? null,
    viewState: input.viewState ?? null,
    selectionSummary: input.selectionSummary ?? null
  })
}

export async function captureViewportSnapshotImage(editor: Editor): Promise<CanvasSnapshotImagePayload> {
  if (!editor || typeof editor.toImage !== 'function') {
    throw new Error('The Canvas editor cannot export a viewport image in this environment.')
  }
  const shapeIds = Array.from(safeCall(() => editor.getCurrentPageShapeIds()) ?? [])
  const bounds = safeCall(() => editor.getViewportPageBounds()) ?? null
  const pageId = safeCall(() => editor.getCurrentPageId()) ?? null
  const camera = safeCall(() => editor.getCamera()) ?? null

  if (editor.fonts && typeof editor.fonts.loadRequiredFontsForCurrentPage === 'function') {
    await editor.fonts.loadRequiredFontsForCurrentPage(editor.options?.maxFontsToLoadBeforeRender)
  }

  const imageResult = await editor.toImage(shapeIds, {
    bounds: bounds ?? undefined,
    scale: 1,
    background: true,
    format: 'png'
  })
  const blob = imageResult.blob
  if (!blob || typeof blob.arrayBuffer !== 'function') {
    throw new Error('The Canvas editor did not return a PNG blob.')
  }

  return {
    dataUrl: await blobToDataUrl(blob),
    mimeType: 'image/png',
    fileName: 'current.png',
    width: numberValue(bounds?.w ?? bounds?.width),
    height: numberValue(bounds?.h ?? bounds?.height),
    pageId,
    camera,
    capturedAt: new Date().toISOString()
  }
}

export function buildCanvasViewState(editor: Editor) {
  return {
    version: 1,
    currentPageId: safeCall(() => editor.getCurrentPageId()) ?? null,
    camera: safeCall(() => editor.getCamera()) ?? { x: 0, y: 0, z: 1 }
  }
}

export function applyCanvasViewState(editor: Editor, viewState: SerializableObject | object | null | undefined) {
  if (!editor || !isObject(viewState)) {
    return false
  }

  let applied = false
  const pageId = typeof viewState.currentPageId === 'string' ? viewState.currentPageId : null
  if (pageId) {
    const pageArg = pageId as Parameters<Editor['getPage']>[0]
    const pageExists = safeCall(() => editor.getPage(pageArg))
    if (pageExists) {
      applied = safeCall(() => editor.setCurrentPage(pageArg)) !== null || applied
    }
  }

  const camera = normalizeCamera(viewState.camera)
  if (camera) {
    applied = safeCall(() => editor.setCamera(camera)) !== null || applied
  }

  return applied
}

export function hasPersistentCanvasViewStateChange(changes: CanvasStoreChanges) {
  return (
    Object.values(changes.added).some(isCameraRecord) ||
    Object.values(changes.removed).some(isCameraRecord) ||
    Object.values(changes.updated).some(([from, to]) => {
      if (isCameraRecord(from) || isCameraRecord(to)) {
        return true
      }
      if (isInstanceRecord(from) || isInstanceRecord(to)) {
        return getCurrentPageId(from) !== getCurrentPageId(to)
      }
      return false
    })
  )
}

async function blobToDataUrl(blob: Blob) {
  if (typeof FileReader !== 'undefined') {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read Canvas snapshot image.'))
      reader.readAsDataURL(blob)
    })
  }

  const arrayBuffer = await blob.arrayBuffer()
  const nodeBuffer = (globalThis as GlobalWithBuffer).Buffer
  const base64 =
    nodeBuffer && typeof nodeBuffer.from === 'function'
      ? nodeBuffer.from(arrayBuffer).toString('base64')
      : bytesToBase64(new Uint8Array(arrayBuffer))
  return `data:${blob.type || 'image/png'};base64,${base64}`
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
  }
  return btoa(binary)
}

function stableStringify(value: StableStringifyValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${(value as StableStringifyValue[]).map((item) => stableStringify(item)).join(',')}]`
  }
  const object = value as Record<string, StableStringifyValue>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`
}

function safeCall<T>(fn: () => T): T | null {
  try {
    return fn()
  } catch {
    return null
  }
}

function numberValue(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

function normalizeCamera(value: SerializableValue | undefined): CanvasCamera | null {
  if (!isObject(value)) {
    return null
  }
  const x = numericValue(value.x)
  const y = numericValue(value.y)
  const z = numericValue(value.z)
  if (x === null || y === null || z === null || z <= 0) {
    return null
  }
  return { x, y, z }
}

function numericValue(value: SerializableValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isObject(value: SerializableValue | object | null | undefined): value is SerializableObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isCameraRecord(value: CanvasStoreRecord) {
  return value.typeName === 'camera' || value.id.startsWith('camera:')
}

function isInstanceRecord(value: CanvasStoreRecord) {
  return value.typeName === 'instance' || value.id === 'instance:instance'
}

function getCurrentPageId(value: CanvasStoreRecord) {
  return 'currentPageId' in value && typeof value.currentPageId === 'string' ? value.currentPageId : null
}

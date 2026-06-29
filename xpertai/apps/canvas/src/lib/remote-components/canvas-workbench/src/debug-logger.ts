export type CanvasDebugPrimitive = string | number | boolean | null
export type CanvasDebugValue = CanvasDebugPrimitive | CanvasDebugObject | CanvasDebugValue[] | ArrayBuffer | Blob | File | Date | undefined

export interface CanvasDebugObject {
  [key: string]: CanvasDebugValue
}

export type CanvasDebugPayload = CanvasDebugObject | null | undefined

type ConsoleMethod = (message?: string, data?: CanvasDebugValue) => void
type DebugScope = {
  localStorage?: Storage
  sessionStorage?: Storage
  location?: {
    search?: string
  }
  parent?: DebugScope | null
  top?: DebugScope | null
  __XPERT_DEBUG_CANVAS_WORKBENCH__?: boolean | string
}

const SECRET_KEY_PATTERN = /(token|secret|password|credential|authorization|api[-_]?key|tenantId|organizationId)/i
const DATA_PAYLOAD_KEY_PATTERN = /(dataUrl|base64|buffer|fileBuffer|rawPayload|snapshotImage)/i
const MAX_STRING_LENGTH = 300
const MAX_ARRAY_ITEMS = 20
const MAX_OBJECT_KEYS = 40

let hostDebugEnabled = false

export function createCanvasDebugLogger(namespace: string) {
  return {
    debug(event: string, data?: CanvasDebugPayload) {
      if (isCanvasDebugEnabled(namespace)) {
        writeConsole(console.debug, namespace, event, data)
      }
    },
    info(event: string, data?: CanvasDebugPayload) {
      if (isCanvasDebugEnabled(namespace)) {
        writeConsole(console.info, namespace, event, data)
      }
    },
    warn(event: string, data?: CanvasDebugPayload) {
      writeConsole(console.warn, namespace, event, data)
    },
    error(event: string, data?: CanvasDebugPayload) {
      writeConsole(console.error, namespace, event, data)
    }
  }
}

export const canvasWorkbenchDebug = createCanvasDebugLogger('canvas-workbench')

export function redactDebugData(data: CanvasDebugPayload): CanvasDebugValue {
  return redactDebugValue(data, '', new Set<object>())
}

export function isCanvasDebugEnabled(namespace: string) {
  if (readStorageFlag(namespace, '0')) {
    return false
  }
  return readWindowFlag(namespace) || readStorageFlag(namespace, '1') || readQueryFlag(namespace) || hostDebugEnabled
}

export function setCanvasDebugHostConfig(config: CanvasDebugValue, namespace = 'canvas-workbench') {
  hostDebugEnabled = isHostDebugConfigEnabled(config, namespace)
}

function writeConsole(method: ConsoleMethod, namespace: string, event: string, data?: CanvasDebugPayload) {
  const message = `[${namespace}] ${event}`
  if (data === undefined) {
    method(message)
    return
  }
  method(message, redactDebugData(data))
}

function readQueryFlag(namespace: string) {
  for (const target of getDebugWindows()) {
    try {
      const search = target.location?.search || ''
      if (new URLSearchParams(search).get('xpertDebug') === namespace) {
        return true
      }
    } catch {
      // Ignore cross-origin or sandboxed access errors.
    }
  }
  return false
}

function readWindowFlag(namespace: string) {
  const globalFlagName = getGlobalFlagName(namespace)
  for (const target of getDebugWindows()) {
    try {
      const value = target[globalFlagName]
      if (value === true || value === '1' || value === namespace) {
        return true
      }
    } catch {
      // Ignore cross-origin or sandboxed access errors.
    }
  }
  return false
}

function readStorageFlag(namespace: string, expectedValue: string) {
  const key = `xpert.debug.${namespace}`
  for (const target of getDebugWindows()) {
    try {
      if (target.localStorage?.getItem(key) === expectedValue || target.sessionStorage?.getItem(key) === expectedValue) {
        return true
      }
    } catch {
      // Ignore cross-origin or sandboxed access errors.
    }
  }
  return false
}

function getGlobalFlagName(namespace: string): keyof DebugScope {
  if (namespace === 'canvas-workbench') {
    return '__XPERT_DEBUG_CANVAS_WORKBENCH__'
  }
  return '__XPERT_DEBUG_CANVAS_WORKBENCH__'
}

function getDebugWindows(): DebugScope[] {
  const currentWindow = globalThis
  const windows: DebugScope[] = []
  addDebugWindow(windows, currentWindow)
  try {
    addDebugWindow(windows, currentWindow.parent)
  } catch {
    // Ignore cross-origin or sandboxed access errors.
  }
  try {
    addDebugWindow(windows, currentWindow.top)
  } catch {
    // Ignore cross-origin or sandboxed access errors.
  }
  return windows
}

function addDebugWindow(windows: DebugScope[], value: DebugScope | null | undefined) {
  if (!value || windows.includes(value)) {
    return
  }
  windows.push(value)
}

function isHostDebugConfigEnabled(config: CanvasDebugValue, namespace: string) {
  const directFlag = readDebugFlag(config, namespace)
  if (directFlag !== null) {
    return directFlag
  }

  if (!isDebugObject(config)) {
    return false
  }

  const enabledFlag = readDebugFlag(config.enabled ?? config.debug, namespace)
  if (enabledFlag !== null) {
    return enabledFlag
  }

  const productionFlag = config.production
  if (typeof productionFlag === 'boolean') {
    return !productionFlag
  }

  return false
}

function readDebugFlag(value: CanvasDebugValue, namespace: string): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === namespace || normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return null
}

function redactDebugValue(value: CanvasDebugValue, key: string, seen: Set<object>): CanvasDebugValue {
  if (value === undefined || value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return redactDebugString(value, key)
  }

  if (value instanceof ArrayBuffer) {
    return `[ArrayBuffer byteLength=${value.byteLength}]`
  }

  if (isBlobLike(value)) {
    return `[${value.constructor.name} type=${value.type || 'n/a'} size=${value.size}]`
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (seen.has(value)) {
    return '[Circular]'
  }

  if (Array.isArray(value)) {
    seen.add(value)
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactDebugValue(item, key, seen))
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[${value.length - MAX_ARRAY_ITEMS} more items]`)
    }
    return items
  }

  if (SECRET_KEY_PATTERN.test(key)) {
    return '[redacted]'
  }

  if (DATA_PAYLOAD_KEY_PATTERN.test(key)) {
    return summarizePayloadValue(value, key)
  }

  const specialSummary = summarizeSpecialObject(value, key)
  if (specialSummary) {
    return specialSummary
  }

  seen.add(value)
  const output: CanvasDebugObject = {}
  const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS)
  for (const [entryKey, entryValue] of entries) {
    output[entryKey] = redactDebugValue(entryValue, entryKey, seen)
  }
  const totalKeys = Object.keys(value).length
  if (totalKeys > MAX_OBJECT_KEYS) {
    output.__truncatedKeys = totalKeys - MAX_OBJECT_KEYS
  }
  return output
}

function redactDebugString(value: string, key: string) {
  if (SECRET_KEY_PATTERN.test(key)) {
    return '[redacted]'
  }
  if (DATA_PAYLOAD_KEY_PATTERN.test(key) || value.startsWith('data:')) {
    return `[redacted:${value.startsWith('data:') ? 'data-url' : 'payload'} length=${value.length}]`
  }
  if (value.length > MAX_STRING_LENGTH) {
    return `[string length=${value.length}]`
  }
  return value
}

function summarizePayloadValue(value: CanvasDebugValue, key: string): CanvasDebugValue {
  if (typeof value === 'string') {
    return redactDebugString(value, key)
  }
  if (value instanceof ArrayBuffer) {
    return `[ArrayBuffer byteLength=${value.byteLength}]`
  }
  if (isBlobLike(value)) {
    return `[${value.constructor.name} type=${value.type || 'n/a'} size=${value.size}]`
  }
  if (Array.isArray(value)) {
    return `[Array length=${value.length}]`
  }
  if (isDebugObject(value)) {
    return `[Object keys=${Object.keys(value).length}]`
  }
  return '[redacted:payload]'
}

function summarizeSpecialObject(value: CanvasDebugObject, key: string): CanvasDebugObject | null {
  if (key === 'snapshot' && isDebugObject(value.store)) {
    return {
      __summary: 'snapshot',
      recordCount: Object.keys(value.store).length
    }
  }
  if (key === 'store') {
    return {
      __summary: 'store',
      recordCount: Object.keys(value).length
    }
  }
  return null
}

function isDebugObject(value: CanvasDebugValue): value is CanvasDebugObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof ArrayBuffer) && !isBlobLike(value))
}

function isBlobLike(value: CanvasDebugValue): value is Blob | File {
  return typeof Blob !== 'undefined' && value instanceof Blob
}

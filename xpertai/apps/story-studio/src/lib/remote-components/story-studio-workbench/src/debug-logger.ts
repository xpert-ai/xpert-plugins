export type DebugPrimitive = string | number | boolean | null
export type DebugValue =
  | DebugPrimitive
  | DebugObject
  | DebugValue[]
  | ArrayBuffer
  | Date
  | undefined

export interface DebugObject {
  [key: string]: DebugValue
}

type DebugPayload = DebugObject | null | undefined
type ConsoleWriter = (message?: string, data?: DebugValue) => void

const NAMESPACE = 'story-studio-workbench'
const SECRET_KEY_PATTERN =
  /(token|secret|password|credential|authorization|api[-_]?key|tenantId|organizationId)/i
const MAX_STRING_LENGTH = 300
const MAX_ARRAY_ITEMS = 20
const MAX_OBJECT_KEYS = 40

let hostEnabled = false

export const storyStudioDebug = {
  debug(event: string, data?: DebugPayload) {
    if (isEnabled()) {
      write(console.debug, event, data)
    }
  },
  info(event: string, data?: DebugPayload) {
    if (isEnabled()) {
      write(console.info, event, data)
    }
  },
  warn(event: string, data?: DebugPayload) {
    write(console.warn, event, data)
  },
  error(event: string, data?: DebugPayload) {
    write(console.error, event, data)
  }
}

export function setDebugHostConfig(config: DebugValue) {
  if (typeof config === 'boolean') {
    hostEnabled = config
    return
  }
  if (isDebugObject(config)) {
    if (typeof config.enabled === 'boolean') {
      hostEnabled = config.enabled
      return
    }
    if (typeof config.production === 'boolean') {
      hostEnabled = !config.production
      return
    }
  }
  hostEnabled = false
}

export function redactDebugData(data: DebugPayload): DebugValue {
  return redactValue(data, '', new Set<object>())
}

function isEnabled() {
  try {
    const stored = globalThis.localStorage?.getItem(
      `xpert.debug.${NAMESPACE}`
    )
    if (stored === '0') {
      return false
    }
    if (stored === '1') {
      return true
    }
    return (
      new URLSearchParams(globalThis.location?.search ?? '').get(
        'xpertDebug'
      ) === NAMESPACE || hostEnabled
    )
  } catch {
    return hostEnabled
  }
}

function write(
  writer: ConsoleWriter,
  event: string,
  data?: DebugPayload
) {
  const message = `[${NAMESPACE}] ${event}`
  if (data === undefined) {
    writer(message)
  } else {
    writer(message, redactDebugData(data))
  }
}

function redactValue(
  value: DebugValue,
  key: string,
  seen: Set<object>
): DebugValue {
  if (
    value === undefined ||
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'string') {
    if (SECRET_KEY_PATTERN.test(key)) {
      return '[redacted]'
    }
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[${value.length}]`
      : value
  }
  if (value instanceof ArrayBuffer) {
    return `[ArrayBuffer byteLength=${value.byteLength}]`
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (seen.has(value)) {
    return '[Circular]'
  }
  seen.add(value)
  if (Array.isArray(value)) {
    const result = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactValue(item, key, seen))
    if (value.length > MAX_ARRAY_ITEMS) {
      result.push(`[${value.length - MAX_ARRAY_ITEMS} more items]`)
    }
    return result
  }
  const result: DebugObject = {}
  for (const [entryKey, entryValue] of Object.entries(value).slice(
    0,
    MAX_OBJECT_KEYS
  )) {
    result[entryKey] = SECRET_KEY_PATTERN.test(entryKey)
      ? '[redacted]'
      : redactValue(entryValue, entryKey, seen)
  }
  return result
}

function isDebugObject(value: DebugValue): value is DebugObject {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof ArrayBuffer)
  )
}

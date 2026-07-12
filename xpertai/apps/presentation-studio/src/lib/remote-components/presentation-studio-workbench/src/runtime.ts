import type { JsonObject, JsonValue, RemoteContext } from './types'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1
type PendingRequest = { resolve: (value: JsonObject) => void; reject: (error: Error) => void; timer: number }
const pending = new Map<string, PendingRequest>()
let instanceId: string | null = null
let requestSequence = 0

export function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function post(type: string, body: JsonObject = {}, transfer: Transferable[] = []) {
  if (!instanceId && type !== 'ready') return
  parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type, ...body }, '*', transfer)
}

function request(type: string, body: JsonObject = {}, transfer: Transferable[] = [], timeoutMs = 60000) {
  const requestId = String(++requestSequence)
  return new Promise<JsonObject>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (!pending.has(requestId)) return
      pending.delete(requestId)
      reject(new Error('Presentation Studio request timed out.'))
    }, timeoutMs)
    pending.set(requestId, { resolve, reject, timer })
    post(type, { requestId, ...body }, transfer)
  })
}

export function requestData(query: JsonObject, timeoutMs = 60000) { return request('requestData', { query }, [], timeoutMs) }
export function executeAction(actionKey: string, targetId: string | null, input: JsonObject, parameters: JsonObject = {}) {
  return request('executeAction', { actionKey, targetId, input, parameters }, [], 120000)
}
export async function executeFileAction(actionKey: string, targetId: string | null, input: JsonObject, file: File) {
  const buffer = await file.arrayBuffer()
  return request('executeFileAction', {
    actionKey, targetId, input, parameters: {},
    file: { name: file.name, type: file.type, size: file.size, buffer } as never
  }, [buffer], 120000)
}
export function invokeClientCommand(commandKey: string, payload: JsonObject) {
  return request('invokeClientCommand', { commandKey, payload }, [], 60000)
}
export function notify(level: 'success' | 'error' | 'info' | 'warning', message: string) { post('notify', { level, message }) }
export function reportResize() {
  post('resize', { height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 760), viewportBound: true })
}
export function payload<T>(response: JsonObject): T {
  const value = response.payload ?? response.data ?? response.result ?? response
  return value as T
}

export function startRemoteBridge(setContext: (context: RemoteContext) => void, onHostEvent: (event: JsonObject) => void) {
  let currentContext: RemoteContext = {}

  function applyHostTheme(theme: JsonValue | undefined) {
    const remoteUi = (window as typeof window & { XpertRemoteUI?: { applyTheme?: (value: JsonValue | undefined) => void } }).XpertRemoteUI
    remoteUi?.applyTheme?.(theme)
    currentContext = { ...currentContext, theme: isObject(theme) ? theme : undefined }
    setContext(currentContext)
    window.setTimeout(reportResize, 0)
  }

  const listener = (event: MessageEvent<JsonValue>) => {
    if (event.source !== parent) return
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      currentContext = {
        locale: typeof message.locale === 'string' ? message.locale : undefined,
        theme: isObject(message.theme) ? message.theme : undefined,
        debug: isObject(message.debug) ? {
          enabled: typeof message.debug.enabled === 'boolean' ? message.debug.enabled : undefined,
          production: typeof message.debug.production === 'boolean' ? message.debug.production : undefined
        } : undefined
      }
      applyHostTheme(message.theme)
      window.setTimeout(reportResize, 0)
      return
    }
    if (message.instanceId !== instanceId) return
    if (isThemeMessage(message)) {
      applyHostTheme(extractTheme(message))
      return
    }
    if (message.type === 'hostEvent') { onHostEvent(message); return }
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined
    if (!requestId) return
    const item = pending.get(requestId)
    if (!item) return
    pending.delete(requestId)
    window.clearTimeout(item.timer)
    if (message.type === 'error') item.reject(new Error(typeof message.message === 'string' ? message.message : 'Remote request failed.'))
    else item.resolve(message)
  }
  window.addEventListener('message', listener)
  post('ready')
  return () => window.removeEventListener('message', listener)
}

function isThemeMessage(message: JsonObject) {
  return ['theme', 'themeChanged', 'theme-change', 'hostThemeChanged', 'host-theme-changed'].includes(String(message.type ?? ''))
}

function extractTheme(message: JsonObject) {
  if (message.theme !== undefined) return message.theme
  if (isObject(message.payload) && message.payload.theme !== undefined) return message.payload.theme
  if (isObject(message.data) && message.data.theme !== undefined) return message.data.theme
  return message.payload ?? message.data
}

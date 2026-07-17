import { configureCutDebug, cutDebug } from './debug'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1

export type RemotePrimitive = string | number | boolean | null
export type RemoteValue = RemotePrimitive | RemoteObject | RemoteValue[] | ArrayBuffer
export interface RemoteObject { [key: string]: RemoteValue | undefined }
export interface RemoteResponse extends RemoteObject {
  payload?: RemoteValue
  data?: RemoteValue
  result?: RemoteValue
  message?: string
}
export type RemoteContext = {
  manifest?: RemoteValue
  payload?: RemoteValue
  initialQuery?: RemoteObject
  locale?: string
  theme?: RemoteValue
  debug?: RemoteObject
}

type Pending = { resolve: (value: RemoteResponse) => void; reject: (error: Error) => void }
type RemoteMessage = RemoteResponse & {
  channel?: string
  protocolVersion?: number
  instanceId?: string | null
  type?: string
  requestId?: string | number
  event?: RemoteValue
  manifest?: RemoteValue
  initialQuery?: RemoteValue
  locale?: string
  theme?: RemoteValue
  debug?: RemoteValue
}
type RemoteWindow = Window & { XpertRemoteUI?: { applyTheme?: (theme: RemoteValue | undefined) => void } }

const pending = new Map<string, Pending>()
const contextListeners = new Set<(context: RemoteContext) => void>()
const eventListeners = new Set<(event: RemoteValue | undefined) => void>()
let instanceId: string | null = null
let sequence = 0
let installed = false

export function isRemoteObject(value: RemoteValue | object | null | undefined): value is RemoteObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof ArrayBuffer))
}

export function post(type: string, body: RemoteObject = {}, transfer: Transferable[] = []) {
  if (!instanceId && type !== 'ready') return
  parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type, ...body }, '*', transfer)
}

export function request(type: string, body: RemoteObject = {}, transfer: Transferable[] = []) {
  const requestId = String(++sequence)
  return new Promise<RemoteResponse>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    post(type, { requestId, ...body }, transfer)
    window.setTimeout(() => {
      if (!pending.has(requestId)) return
      pending.delete(requestId)
      reject(new Error('Cut Workbench request timed out.'))
    }, 30000)
  })
}

export function requestData(query: RemoteObject = {}) {
  return request('requestData', { query })
}

export function requestFileAccess(fileKey: string, targetId: string, purpose: 'preview' | 'download' = 'preview') {
  return request('requestFileAccess', { fileKey, targetId, purpose })
}

export function executeAction(actionKey: string, targetId: string | null, input: RemoteObject = {}, parameters: RemoteObject = {}) {
  return request('executeAction', { actionKey, targetId, input, parameters })
}

export async function executeFileAction(actionKey: string, targetId: string, input: RemoteObject, file: File) {
  const buffer = await file.arrayBuffer()
  return request('executeFileAction', {
    actionKey,
    targetId,
    input,
    parameters: {},
    file: { name: file.name, type: file.type, size: file.size, buffer }
  }, [buffer])
}

export function invokeClientCommand(commandKey: string, payload: RemoteObject) {
  return request('invokeClientCommand', { commandKey, payload })
}

export function notify(level: 'success' | 'error' | 'info' | 'warning', message: string) {
  post('notify', { level, message })
}

export function reportResize() {
  post('resize', { height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight, 720), viewportBound: true })
}

export function responsePayload(response: RemoteResponse | RemoteValue | null | undefined): RemoteValue | null {
  if (!response) return null
  if (!isRemoteObject(response)) return response
  return response.payload ?? response.data ?? response.result ?? response
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Cut Workbench request failed.'
}

export function startRemoteBridge(onContext: (context: RemoteContext) => void, onHostEvent: (event: RemoteValue | undefined) => void) {
  contextListeners.add(onContext)
  eventListeners.add(onHostEvent)
  if (!installed) {
    installed = true
    window.addEventListener('message', receiveMessage)
    post('ready')
  }
  return () => {
    contextListeners.delete(onContext)
    eventListeners.delete(onHostEvent)
  }
}

function receiveMessage(event: MessageEvent) {
  const message = event.data as RemoteMessage
  if (!isRemoteObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
  if (message.type === 'init') {
    instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
    const context: RemoteContext = {
      manifest: message.manifest,
      payload: message.payload,
      initialQuery: isRemoteObject(message.initialQuery) ? message.initialQuery : {},
      locale: typeof message.locale === 'string' ? message.locale : undefined,
      theme: message.theme,
      debug: isRemoteObject(message.debug) ? message.debug : undefined
    }
    configureCutDebug(context.debug)
    cutDebug.debug('bridge.init', { locale: context.locale, hasManifest: Boolean(context.manifest), debugEnabled: context.debug?.enabled === true })
    ;(window as RemoteWindow).XpertRemoteUI?.applyTheme?.(message.theme)
    contextListeners.forEach((listener) => listener(context))
    window.setTimeout(reportResize, 0)
    return
  }
  if (message.instanceId !== instanceId) return
  if (message.type === 'hostEvent') {
    cutDebug.debug('host-event.received', { hasEvent: Boolean(message.event), hasPayload: Boolean(message.payload) })
    eventListeners.forEach((listener) => listener(message.event ?? message.payload ?? message.data ?? message))
    return
  }
  if (['theme', 'themeChanged', 'hostThemeChanged'].includes(String(message.type ?? ''))) {
    ;(window as RemoteWindow).XpertRemoteUI?.applyTheme?.(message.theme)
    return
  }
  if (message.requestId) {
    const item = pending.get(String(message.requestId))
    if (!item) return
    pending.delete(String(message.requestId))
    if (message.type === 'error') {
      cutDebug.error('bridge.request.failed', { requestId: String(message.requestId), message: message.message })
      item.reject(new Error(message.message ?? 'Cut Workbench request failed.'))
    } else {
      cutDebug.debug('bridge.request.completed', { requestId: String(message.requestId), responseType: message.type })
      item.resolve(message)
    }
  }
}

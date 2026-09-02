import { configureDebug, debug } from './debug'
import type { HostContext, RemoteObject, RemoteValue } from './types'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1

interface RemoteResponse extends RemoteObject {
  payload?: RemoteValue
  data?: RemoteValue
  result?: RemoteValue
  message?: string
}

interface RemoteMessage extends RemoteResponse {
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

type RemoteWindow = Window & { XpertRemoteUI?: { applyTheme?: (theme: RemoteValue) => void } }

let instanceId: string | null = null
let sequence = 0
const pending = new Map<string, { resolve: (value: RemoteResponse) => void; reject: (error: Error) => void }>()

export function isObject(value: unknown): value is RemoteObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function startBridge(
  onInit: (context: HostContext) => void,
  onHostEvent: (event: RemoteValue) => void
) {
  let context: HostContext = {}
  const listener = (event: MessageEvent) => {
    if (!isObject(event.data)) return
    const message = event.data as RemoteMessage
    if (message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      configureDebug(message.debug)
      context = {
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: isObject(message.initialQuery) ? message.initialQuery : {},
        locale: message.locale,
        theme: message.theme,
        debug: message.debug
      }
      applyTheme(message.theme)
      onInit(context)
      debug('bridge.init', { locale: context.locale ?? '', hasTheme: message.theme !== undefined })
      setTimeout(reportResize, 0)
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'theme' || message.type === 'themeChanged' || message.type === 'hostTheme') {
      context = { ...context, theme: message.theme ?? message.payload ?? message.data }
      applyTheme(context.theme)
      onInit(context)
      return
    }
    if (message.type === 'hostEvent') {
      onHostEvent(message.event ?? message.payload ?? message.data ?? message)
      return
    }
    if (message.requestId !== undefined) {
      const key = String(message.requestId)
      const request = pending.get(key)
      if (!request) return
      pending.delete(key)
      if (message.type === 'error') request.reject(new Error(message.message ?? 'Remote request failed.'))
      else request.resolve(message)
    }
  }
  window.addEventListener('message', listener)
  post('ready')
  return () => window.removeEventListener('message', listener)
}

function post(type: string, body: RemoteObject = {}) {
  if (!instanceId && type !== 'ready') return
  window.parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type, ...body }, '*')
}

function request(type: string, body: RemoteObject = {}, timeoutMs = 30_000) {
  const requestId = String(++sequence)
  return new Promise<RemoteResponse>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    post(type, { requestId, ...body })
    setTimeout(() => {
      if (!pending.has(requestId)) return
      pending.delete(requestId)
      reject(new Error('Remote request timed out.'))
    }, timeoutMs)
  })
}

export function requestData(query: RemoteObject = {}) {
  return request('requestData', { query })
}

export function executeAction(actionKey: string, targetId: string | null, input: RemoteObject) {
  return request('executeAction', { actionKey, targetId, input })
}

export function invokeClientCommand(commandKey: string, payload: RemoteObject) {
  return request('invokeClientCommand', { commandKey, payload })
}

export function notify(level: 'success' | 'error' | 'info' | 'warning', message: string) {
  post('notify', { level, message })
}

export function reportResize() {
  const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, window.innerHeight, 720)
  post('resize', { height, viewportBound: true })
}

export function unwrap(value: RemoteValue | RemoteResponse): RemoteValue {
  if (!isObject(value)) return value
  if (value.payload !== undefined) return value.payload
  if (value.data !== undefined) return value.data
  if (value.result !== undefined) return value.result
  return value
}

export function requireSuccess(value: RemoteValue | RemoteResponse) {
  const result = unwrap(value)
  if (isObject(result) && result.success === false) {
    throw new Error(localizedMessage(result.message) ?? 'Factory Operations action failed.')
  }
  return result
}

function localizedMessage(value: RemoteValue) {
  if (typeof value === 'string') return value
  if (!isObject(value)) return null
  const zh = document.documentElement.lang.toLowerCase().startsWith('zh')
  const candidates = zh ? ['zh_Hans', 'zh_Hant', 'en_US'] : ['en_US', 'zh_Hans']
  for (const key of candidates) {
    const message = value[key]
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return null
}

function applyTheme(theme: RemoteValue) {
  ;(window as RemoteWindow).XpertRemoteUI?.applyTheme?.(theme)
}


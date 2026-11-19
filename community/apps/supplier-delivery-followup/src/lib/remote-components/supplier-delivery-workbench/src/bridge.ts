// Remote component bridge for the Xpert view host (protocol `xpertai.remote_component` v1).
// Adapted from the valve-business-workbench bridge. The iframe never receives tokens,
// tenant or organization ids: every data request and action goes through the host.
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import { i18n } from './i18n'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1
const REQUEST_TIMEOUT_MS = 30_000

export interface HostTheme {
  mode?: 'light' | 'dark'
  density?: 'default' | 'compact'
  tokens?: Record<string, string | number>
}

export interface HostContext {
  manifest?: { key?: string }
  payload?: unknown
  initialQuery?: unknown
  locale?: string
  theme?: HostTheme
}

interface BridgeMessage extends HostContext {
  channel: string
  protocolVersion: number
  type: string
  instanceId?: string
  requestId?: string
  data?: unknown
  result?: unknown
  message?: string
  event?: unknown
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: number
}

export class BridgeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BridgeError'
  }
}

let instanceId: string | null = null
let sequence = 0
const pending = new Map<string, PendingRequest>()
const hostEventListeners = new Set<(event: unknown) => void>()

/** Forwarded host events, e.g. `assistant.tool.completed` after an assistant tool wrote data. */
export function subscribeHostEvents(listener: (event: unknown) => void) {
  hostEventListeners.add(listener)
  return () => {
    hostEventListeners.delete(listener)
  }
}

export function connectBridge(handlers: { onInit: (context: HostContext) => void }) {
  const listener = (event: MessageEvent) => {
    if (event.source !== window.parent || !isBridgeMessage(event.data)) return
    const message = event.data
    if (message.type === 'init') {
      instanceId = message.instanceId ?? null
      applyTheme(message.theme)
      i18n.setLocale(message.locale)
      handlers.onInit({
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: message.initialQuery,
        locale: message.locale,
        theme: message.theme
      })
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'theme') {
      applyTheme(message.theme)
      return
    }
    if (message.type === 'locale') {
      i18n.setLocale(message.locale)
      return
    }
    if (message.type === 'hostEvent') {
      const hostEvent = message.event ?? message.payload ?? message.data ?? message
      for (const listener of hostEventListeners) listener(hostEvent)
      return
    }
    const request = message.requestId ? pending.get(message.requestId) : undefined
    if (!request || !message.requestId) return
    pending.delete(message.requestId)
    window.clearTimeout(request.timer)
    if (message.type === 'error') request.reject(new BridgeError(message.message ?? 'Remote request failed'))
    else request.resolve(message.data ?? message.result)
  }
  window.addEventListener('message', listener)
  post('ready')
  return () => window.removeEventListener('message', listener)
}

export function requestData(query: Record<string, unknown>) {
  return requestHost('requestData', { query })
}

export function executeAction(actionKey: string, targetId: string, input: object) {
  return requestHost('executeAction', { actionKey, targetId, input })
}

export function invokeClientCommand(commandKey: string, payload: Record<string, unknown>) {
  return requestHost('invokeClientCommand', { commandKey, payload })
}

function requestHost(type: string, body: Record<string, unknown>) {
  const requestId = `${Date.now().toString(36)}-${++sequence}`
  return new Promise<unknown>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (!pending.delete(requestId)) return
      reject(new BridgeError('Host request timed out'))
    }, REQUEST_TIMEOUT_MS)
    pending.set(requestId, { resolve, reject, timer })
    post(type, { requestId, ...body })
  })
}

function post(type: string, body: Record<string, unknown> = {}) {
  window.parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type, ...body }, '*')
}

function isBridgeMessage(value: unknown): value is BridgeMessage {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record['channel'] === CHANNEL && record['protocolVersion'] === VERSION
}

function applyTheme(theme?: HostTheme) {
  const mode = theme?.mode === 'dark' ? 'dark' : 'light'
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.dataset.theme = mode
  root.style.colorScheme = mode
  for (const [key, value] of Object.entries(theme?.tokens ?? {})) {
    const property = key.startsWith('--')
      ? key
      : `--xui-${key.replace(/[._]/g, '-').replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`
    root.style.setProperty(property, String(value))
  }
  installShadcnThemeVars({ density: theme?.density ?? 'compact' })
}

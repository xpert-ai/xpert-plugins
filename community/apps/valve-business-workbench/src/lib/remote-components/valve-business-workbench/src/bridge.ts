import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui'
import type { BridgeMessage, HostContext, Object360 } from './types'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1
const CONTEXT_KEY = 'valve_business_workbench'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

let instanceId: string | null = null
let sequence = 0
const pending = new Map<string, PendingRequest>()

export function installBridgeListener(handlers: { onInit: (context: HostContext) => void; onHostEvent: () => void }) {
  const listener = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    if (!isBridgeMessage(event.data)) return
    const message = event.data
    if (message.type === 'init') {
      instanceId = message.instanceId ?? null
      applyTheme(message.theme)
      document.documentElement.lang = normalizeDocumentLocale(message.locale)
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
    if (message.type === 'hostEvent') {
      handlers.onHostEvent()
      return
    }
    const request = message.requestId ? pending.get(message.requestId) : undefined
    if (!request || !message.requestId) return
    pending.delete(message.requestId)
    if (message.type === 'error') request.reject(new Error(message.message ?? 'Remote request failed'))
    else request.resolve(message.data ?? message.result)
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

export function postReady() {
  post('ready')
}

export function requestData(query: Record<string, unknown>) {
  return requestHost('requestData', { query })
}

export function executeAction(actionKey: string, targetId: string, input: Record<string, unknown> = {}) {
  return requestHost('executeAction', { actionKey, targetId, input })
}

export function invokeClientCommand(commandKey: string, payload: Record<string, unknown>) {
  return requestHost('invokeClientCommand', { commandKey, payload })
}

export function notify(message: string, level: 'success' | 'error' = 'success') {
  post('notify', { message, level })
}

export function syncAssistantContext(object: Object360) {
  return invokeClientCommand('assistant.context.set', {
    key: CONTEXT_KEY,
    context: {
      version: 1,
      resourceId: object.resourceId,
      snapshotId: object.snapshotId,
      graphVersion: object.graphVersion,
      partitionKey: object.partitionKey ?? undefined,
      entityId: object.entity.entityId,
      entityTypeCode: object.entity.entityTypeCode,
      externalKey: object.entity.externalKey,
      label: object.entity.label
    }
  })
}

function requestHost(type: string, body: Record<string, unknown>) {
  const requestId = `${Date.now()}-${++sequence}`
  return new Promise<unknown>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    post(type, { requestId, ...body })
    window.setTimeout(() => {
      if (!pending.has(requestId)) return
      pending.delete(requestId)
      reject(new Error('Host request timed out'))
    }, 30_000)
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

function applyTheme(theme?: HostContext['theme']) {
  const mode = theme?.mode === 'dark' ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.documentElement.dataset.theme = mode
  document.documentElement.style.colorScheme = mode
  for (const [key, value] of Object.entries(theme?.tokens ?? {})) {
    const property = key.startsWith('--')
      ? key
      : `--xui-${key.replace(/[._]/g, '-').replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`
    document.documentElement.style.setProperty(property, String(value))
  }
  installShadcnThemeVars({ density: theme?.density ?? 'compact' })
}

function normalizeDocumentLocale(locale?: string) {
  const normalized = locale?.replace('_', '-').toLowerCase()
  if (normalized === 'zh-hant' || normalized === 'zh-tw' || normalized === 'zh-hk') return 'zh-Hant'
  if (normalized === 'zh-hans' || normalized === 'zh-cn' || normalized === 'zh-sg') return 'zh-Hans'
  return 'en-US'
}

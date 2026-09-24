import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui'
import type { BridgeMessage, HostContext } from './types'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

let instanceId: string | null = null
let sequence = 0
const pending = new Map<string, PendingRequest>()

export function installBridgeListener(handlers: { onInit: (context: HostContext) => void; onHostEvent: () => void }) {
  const listener = (event: MessageEvent) => {
    if (event.source !== window.parent || !isBridgeMessage(event.data)) return
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

export function postReady() { post('ready') }
export function requestData(query: Record<string, unknown>) { return requestHost('requestData', { query }) }
export async function executeAction(actionKey: string, targetId: string, input: Record<string, unknown>) {
  const result = await requestHost('executeAction', { actionKey, targetId, input })
  if (!isSuccessfulActionResult(result)) {
    throw new Error(readActionError(result))
  }
  return result
}
export async function executeFileAction(
  actionKey: string,
  targetId: string | null,
  input: Record<string, unknown>,
  file: File
) {
  const buffer = await file.arrayBuffer()
  const result = await requestHost('executeFileAction', {
    actionKey,
    targetId: targetId ?? undefined,
    input,
    file: {
      name: file.name,
      type: file.type,
      size: file.size,
      buffer
    }
  }, [buffer])
  if (!isSuccessfulActionResult(result)) {
    throw new Error(readActionError(result))
  }
  return result
}
export function invokeClientCommand(commandKey: string, payload: Record<string, unknown>) {
  return requestHost('invokeClientCommand', { commandKey, payload })
}
export function notify(message: string, level: 'success' | 'error' = 'success') { post('notify', { message, level }) }

function requestHost(type: string, body: Record<string, unknown>, transfer: Transferable[] = []) {
  const requestId = `${Date.now()}-${++sequence}`
  return new Promise<unknown>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    post(type, { requestId, ...body }, transfer)
    window.setTimeout(() => {
      if (!pending.has(requestId)) return
      pending.delete(requestId)
      reject(new Error('Host request timed out'))
    }, 30_000)
  })
}

function post(type: string, body: Record<string, unknown> = {}, transfer: Transferable[] = []) {
  window.parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type, ...body }, '*', transfer)
}

function isBridgeMessage(value: unknown): value is BridgeMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record['channel'] === CHANNEL && record['protocolVersion'] === VERSION
}

function isSuccessfulActionResult(value: unknown): value is { success: true } {
  return !!value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>)['success'] === true
}

function readActionError(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Remote action failed'
  const message = (value as Record<string, unknown>)['message']
  if (typeof message === 'string' && message.trim()) return message
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    const localized = message as Record<string, unknown>
    const language = document.documentElement.lang.toLowerCase()
    const preferred = language.startsWith('zh') ? localized['zh_Hans'] : localized['en_US']
    if (typeof preferred === 'string' && preferred.trim()) return preferred
    const fallback = Object.values(localized).find((item) => typeof item === 'string' && item.trim())
    if (typeof fallback === 'string') return fallback
  }
  const data = (value as Record<string, unknown>)['data']
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const errorCode = (data as Record<string, unknown>)['errorCode']
    if (typeof errorCode === 'string' && errorCode.trim()) return `Remote action failed (${errorCode})`
  }
  return 'Remote action failed'
}

function applyTheme(theme?: HostContext['theme']) {
  const mode = theme?.mode === 'dark' ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.documentElement.dataset.theme = mode
  document.documentElement.style.colorScheme = mode
  for (const [key, value] of Object.entries(theme?.tokens ?? {})) {
    const property = key.startsWith('--') ? key : `--xui-${key.replace(/[._]/g, '-').replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`
    document.documentElement.style.setProperty(property, String(value))
  }
  installShadcnThemeVars({ density: theme?.density ?? 'compact' })
}

function normalizeDocumentLocale(locale?: string) {
  return resolveDocumentLocale(locale)
}

function resolveDocumentLocale(locale?: string) {
  const normalized = locale?.replace('_', '-').toLowerCase()
  if (normalized === 'zh-hans' || normalized === 'zh-cn' || normalized === 'zh-sg') return 'zh-Hans'
  return 'en-US'
}

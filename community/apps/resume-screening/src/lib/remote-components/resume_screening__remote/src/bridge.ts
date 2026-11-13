import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui'
import type { BridgeMessage, HostContext } from './types'
import { configureRemoteDebug, debugCheckpoint } from './debug'
import { RESUME_REVISION_CONFLICT, RESUME_CRITERIA_LOCKED, type ResumeActionFailure } from '../../../action-contract.js'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1
const CONTEXT_KEY = 'resume_screening'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

let instanceId: string | null = null
let sequence = 0
const pending = new Map<string, PendingRequest>()

export class WorkbenchActionError extends Error {
  constructor(message: string, readonly code?: ResumeActionFailure['code']) {
    super(message)
  }
}

export function installBridgeListener(handlers: { onInit: (context: HostContext) => void; onHostEvent: () => void }) {
  const listener = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    if (!isBridgeMessage(event.data)) return
    const message = event.data
    if (message.type === 'init') {
      configureRemoteDebug(message.debug)
      debugCheckpoint('init')
      instanceId = message.instanceId ?? null
      applyTheme(message.theme)
      document.documentElement.lang = normalizeDocumentLocale(message.locale)
      handlers.onInit({
        manifest: message.manifest,
        debug: message.debug,
        payload: message.payload,
        initialQuery: message.initialQuery,
        locale: message.locale,
        theme: message.theme
      })
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'hostEvent') {
      debugCheckpoint('host-event')
      handlers.onHostEvent()
      return
    }
    const request = message.requestId ? pending.get(message.requestId) : undefined
    if (!request || !message.requestId) return
    pending.delete(message.requestId)
    debugCheckpoint('response', { outcome: message.type === 'error' ? 'error' : 'ok' })
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

export async function executeAction(actionKey: string, targetId: string, input: Record<string, unknown> = {}) {
  const result = await requestHost('executeAction', { actionKey, targetId, input })
  if (!result || typeof result !== 'object' || !('success' in result) || result.success !== true) {
    const message = result && typeof result === 'object' && 'message' in result ? result.message : null
    const failure = result && typeof result === 'object' && 'failure' in result ? result.failure : null
    const code = failure && typeof failure === 'object' && 'kind' in failure && failure.kind === 'business'
      && 'code' in failure && (failure.code === RESUME_REVISION_CONFLICT || failure.code === RESUME_CRITERIA_LOCKED) ? failure.code : undefined
    throw new WorkbenchActionError(typeof message === 'string' ? message : JSON.stringify(message ?? 'Action failed'), code)
  }
  return result as { success: true; data?: {
    screeningId?: string
    taskId?: string
    candidateIds?: string[]
    candidate?: import('../../../types.js').CandidateDetail
    screening?: {
      screeningId: string
      title: string
      jobTitle: string
      status: import('../../../types.js').ResumeScreeningStatus
      candidateCount: number
      edit: import('../../../types.js').ScreeningEditState
    }
  } }
}

export async function invokeClientCommand(commandKey: string, payload: Record<string, unknown>) {
  const result = await requestHost('invokeClientCommand', { commandKey, payload })
  if (!result || typeof result !== 'object' || !('success' in result) || result.success !== true) {
    const message = result && typeof result === 'object' && 'message' in result ? result.message : null
    throw new Error(typeof message === 'string' ? message : 'Client command failed')
  }
  return result
}

export function notify(message: string, level: 'success' | 'error' = 'success') {
  post('notify', { message, level })
}

export function syncAssistantContext(screeningId: string | null) {
  return invokeClientCommand('assistant.context.set', {
    key: CONTEXT_KEY,
    context: {
      version: 1,
      screeningId: screeningId ?? undefined
    }
  })
}

function requestHost(type: string, body: Record<string, unknown>) {
  debugCheckpoint('request', { requestType: type,
    actionKey: typeof body.actionKey === 'string' ? body.actionKey : undefined,
    commandKey: typeof body.commandKey === 'string' ? body.commandKey : undefined })
  const requestId = `${Date.now()}-${++sequence}`
  return new Promise<unknown>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    post(type, { requestId, ...body })
    window.setTimeout(() => {
      if (!pending.has(requestId)) return
      pending.delete(requestId)
      debugCheckpoint('timeout', { requestType: type })
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

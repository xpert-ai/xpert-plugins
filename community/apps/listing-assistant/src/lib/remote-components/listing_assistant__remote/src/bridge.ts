import type { BridgeMessage, HostContext } from './types'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1
const REQUEST_TIMEOUT_MS = 180_000

interface PendingRequest {
  resolve: (value: BridgeMessage) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface BridgeHandlers {
  onInit: (context: HostContext) => void
  onHostEvent: () => void
}

let instanceId: string | null = null
let requestSequence = 0
const pending = new Map<string, PendingRequest>()

export function installBridgeListener(handlers: BridgeHandlers) {
  const listener = (event: MessageEvent) => {
    const raw = event.data
    if (!raw || typeof raw !== 'object' || raw.channel !== CHANNEL || raw.protocolVersion !== VERSION) return
    const message = raw as BridgeMessage

    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      handlers.onInit({
        locale: message.locale,
        initialQuery: (message as unknown as { initialQuery?: HostContext['initialQuery'] }).initialQuery
      })
      setTimeout(reportResize, 0)
      return
    }

    if (message.instanceId !== instanceId) return

    if (message.type === 'hostEvent') {
      handlers.onHostEvent()
      return
    }

    const requestId = typeof message.requestId === 'string' ? message.requestId : ''
    const item = requestId ? pending.get(requestId) : undefined
    if (!item) return

    pending.delete(requestId)
    clearTimeout(item.timer)
    if (message.type === 'error') {
      item.reject(new Error(typeof message.message === 'string' ? message.message : 'Workbench request failed'))
    } else {
      item.resolve(message)
    }
  }

  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

export function post(type: string, body?: Record<string, unknown>) {
  if (!instanceId && type !== 'ready') return
  window.parent.postMessage(
    { channel: CHANNEL, protocolVersion: VERSION, instanceId, type, ...(body ?? {}) },
    '*'
  )
}

function request(type: string, body?: Record<string, unknown>) {
  const requestId = String(++requestSequence)
  return new Promise<BridgeMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('请求超时，请刷新工作台重试。'))
    }, REQUEST_TIMEOUT_MS)
    pending.set(requestId, { resolve, reject, timer })
    try {
      post(type, { requestId, ...(body ?? {}) })
    } catch (error) {
      pending.delete(requestId)
      clearTimeout(timer)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export function requestData(query: Record<string, unknown>) {
  return request('requestData', { query })
}

export function executeAction(
  actionKey: string,
  targetId: string | null,
  input: Record<string, unknown>,
  parameters?: Record<string, unknown>
) {
  return request('executeAction', { actionKey, targetId, input, parameters })
}

export function notify(message: string, level: 'success' | 'error' = 'success') {
  post('notify', { message, level })
}

export function reportResize() {
  const root = document.getElementById('root')
  const shell = root?.firstElementChild as HTMLElement | null
  const height = Math.max(shell?.scrollHeight ?? 0, 600)
  post('resize', { height: Math.ceil(height), viewportBound: false })
}

export function unwrap(response: unknown): unknown {
  if (!response || typeof response !== 'object') return {}
  const record = response as Record<string, unknown>
  if ('data' in record) return record.data
  if ('result' in record) return record.result
  if ('payload' in record) return record.payload
  return record
}

export function resolveLocaleText(value: unknown, locale: string) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const preferred = locale.toLowerCase().startsWith('zh') ? record.zh_Hans ?? record.zh : record.en_US ?? record.en
    return typeof preferred === 'string' ? preferred : ''
  }
  return ''
}

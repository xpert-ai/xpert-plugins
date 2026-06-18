import type { BridgeMessage, HostContext } from './types'
import { isObject } from './utils'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1

interface PendingRequest {
  resolve: (value: BridgeMessage) => void
  reject: (error: Error) => void
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
    const rawMessage = event.data
    if (!isObject(rawMessage) || rawMessage.channel !== CHANNEL || rawMessage.protocolVersion !== VERSION) return
    const message = rawMessage as unknown as BridgeMessage

    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      handlers.onInit({
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: message.initialQuery ?? {},
        locale: message.locale,
        theme: message.theme
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
    if (requestId && pending.has(requestId)) {
      const item = pending.get(requestId)
      pending.delete(requestId)
      if (!item) return
      if (message.type === 'error') {
        item.reject(new Error(typeof message.message === 'string' ? message.message : 'Remote CRM request failed'))
      } else {
        item.resolve(message)
      }
    }
  }

  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

export function post(type: string, body?: Record<string, unknown>) {
  if (!instanceId && type !== 'ready') return
  window.parent.postMessage(
    {
      channel: CHANNEL,
      protocolVersion: VERSION,
      instanceId,
      type,
      ...(body ?? {})
    },
    '*'
  )
}

function request(type: string, body?: Record<string, unknown>) {
  const requestId = String(++requestSequence)
  return new Promise<BridgeMessage>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    try {
      post(type, { requestId, ...(body ?? {}) })
    } catch (error) {
      pending.delete(requestId)
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

export function notify(message: string, level = 'success') {
  post('notify', { message, level })
}

export function reportResize() {
  const root = document.getElementById('root')
  const shell = root?.firstElementChild as HTMLElement | null
  const height = Math.max(shell?.scrollHeight ?? 0, 640)
  post('resize', { height: Math.ceil(height), viewportBound: false })
}


import type { BridgeMessage, HostContext } from './types'
import { isObject } from './utils'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1

interface PendingRequest {
  resolve: (value: BridgeMessage) => void
  reject: (error: Error) => void
}

let instanceId: string | null = null
let sequence = 0
const pending = new Map<string, PendingRequest>()

export function installBridge(handlers: {
  onInit: (context: HostContext) => void
  onHostEvent: (event: unknown) => void
}): () => void {
  const listener = (event: MessageEvent) => {
    const raw = event.data
    if (!isObject(raw) || raw.channel !== CHANNEL || raw.protocolVersion !== VERSION || typeof raw.type !== 'string') {
      return
    }
    const message = raw as BridgeMessage
    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      handlers.onInit({
        manifest: message.manifest,
        initialQuery: message.initialQuery ?? {},
        locale: message.locale,
        theme: message.theme
      })
      setTimeout(reportResize, 0)
      return
    }
    if (message.instanceId !== instanceId) {
      return
    }
    if (message.type === 'hostEvent') {
      handlers.onHostEvent(message.payload ?? message.data)
      return
    }
    const requestId = typeof message.requestId === 'string' ? message.requestId : ''
    const request = requestId ? pending.get(requestId) : undefined
    if (!request) {
      return
    }
    pending.delete(requestId)
    if (message.type === 'error') {
      request.reject(new Error(typeof message.message === 'string' ? message.message : 'Remote request failed.'))
    } else {
      request.resolve(message)
    }
  }

  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

export function post(type: string, body: Record<string, unknown> = {}) {
  if (!instanceId && type !== 'ready') {
    return
  }
  window.parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type, ...body }, '*')
}

export function requestData(query: Record<string, unknown>) {
  return request('requestData', { query })
}

export function executeAction(actionKey: string, targetId: string | null, input: Record<string, unknown> = {}) {
  return request('executeAction', { actionKey, targetId, input })
}

export function invokeClientCommand(commandKey: string, payload: Record<string, unknown>) {
  return request('invokeClientCommand', { commandKey, payload })
}

export function notify(message: string, level: 'success' | 'error' = 'success') {
  post('notify', { message, level })
}

export function reportResize() {
  const height = Math.max(window.innerHeight || document.documentElement.clientHeight || 0, 720)
  post('resize', { height, viewportBound: true })
}

function request(type: string, body: Record<string, unknown>) {
  const requestId = String(++sequence)
  return new Promise<BridgeMessage>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    post(type, { requestId, ...body })
    window.setTimeout(() => {
      if (!pending.has(requestId)) {
        return
      }
      pending.delete(requestId)
      reject(new Error('HOST_REQUEST_TIMEOUT'))
    }, 30000)
  })
}

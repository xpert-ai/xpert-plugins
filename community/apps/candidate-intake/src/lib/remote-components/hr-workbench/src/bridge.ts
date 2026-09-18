type Message = Record<string, unknown>
type Pending = { resolve: (message: Message) => void; reject: (error: Error) => void }

const CHANNEL = 'xpertai.remote_component'
let instanceId: string | null = null
let sequence = 0
const pending = new Map<string, Pending>()

export function connect(onInit: (message: Message) => void, onRefresh: () => void) {
  const listener = (event: MessageEvent) => {
    const message = isRecord(event.data) ? event.data : null
    if (!message || message.channel !== CHANNEL || message.protocolVersion !== 1) return
    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      onInit(message)
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'hostEvent') {
      onRefresh()
      return
    }
    const requestId = typeof message.requestId === 'string' ? message.requestId : ''
    const request = pending.get(requestId)
    if (!request) return
    pending.delete(requestId)
    if (message.type === 'error') request.reject(new Error(readString(message.message) ?? 'Host request failed.'))
    else request.resolve(message)
  }
  window.addEventListener('message', listener)
  window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, type: 'ready' }, '*')
  return () => window.removeEventListener('message', listener)
}

export function requestData(applicationId?: string) {
  return request('requestData', { query: { parameters: applicationId ? { applicationId } : {} } })
}

export function executeAction(actionKey: string, input: Record<string, unknown> = {}) {
  return request('executeAction', { actionKey, input })
}

export function invokeClientCommand(commandKey: string, payload: Record<string, unknown>) {
  return request('invokeClientCommand', { commandKey, payload })
}

export function resize() {
  if (!instanceId) return
  const height = Math.max(document.documentElement.scrollHeight, 720)
  window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, instanceId, type: 'resize', height, viewportBound: false }, '*')
}

function request(type: string, body: Record<string, unknown>) {
  if (!instanceId) return Promise.reject(new Error('Workbench is not connected.'))
  const requestId = String(++sequence)
  return new Promise<Message>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, instanceId, requestId, type, ...body }, '*')
  })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

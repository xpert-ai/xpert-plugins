const CHANNEL = 'xpertai.remote_component'
const VERSION = 1

type Envelope = Record<string, unknown>
type Pending = { resolve: (value: Envelope) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }

class HostBridge {
  private instanceId: string | null = null
  private pending = new Map<string, Pending>()
  private connected: Promise<{ locale: string }> | null = null
  private initResolve: ((value: { locale: string }) => void) | null = null
  private initReject: ((error: Error) => void) | null = null
  private listeners = new Set<() => void>()

  private readonly handle = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
    if (message.type === 'init' && message.instanceId) {
      this.instanceId = message.instanceId
      this.initResolve?.({ locale: message.locale ?? 'en-US' })
      this.initResolve = null
      return
    }
    if (!this.instanceId || message.instanceId !== this.instanceId) return
    if (message.type === 'hostEvent') {
      this.listeners.forEach((listener) => listener())
      return
    }
    const requestId = typeof message.requestId === 'string' ? message.requestId : ''
    if (requestId && this.pending.has(requestId)) {
      const item = this.pending.get(requestId)
      this.pending.delete(requestId)
      if (!item) return
      clearTimeout(item.timer)
      if (message.type === 'error') {
        item.reject(new Error('host_request_failed'))
      } else {
        item.resolve(message)
      }
    }
  }

  connect() {
    if (this.connected) return this.connected
    this.connected = new Promise<{ locale: string }>((resolve, reject) => {
      this.initResolve = resolve
      this.initReject = reject
      window.addEventListener('message', this.handle)
      window.parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, type: 'ready' }, '*')
    })
    return this.connected
  }

  private request(type: string, body: Record<string, unknown> = {}) {
    if (!this.instanceId) return Promise.reject(new Error('not_connected'))
    const requestId = randomId()
    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('host_timeout'))
      }, 30000)
      this.pending.set(requestId, { resolve, reject, timer })
      window.parent.postMessage(
        { channel: CHANNEL, protocolVersion: VERSION, instanceId: this.instanceId, requestId, type, ...body },
        '*'
      )
    })
  }

  async query(parameters: Record<string, unknown> = {}): Promise<unknown> {
    const result = await this.request('requestData', { query: { parameters } })
    if (result.type !== 'data') throw new Error('unexpected_response')
    return result.data
  }

  async action(actionKey: string, input: Record<string, unknown> = {}, parameters: Record<string, unknown> = {}): Promise<unknown> {
    const response = await this.request('executeAction', { actionKey, input, parameters })
    if (response.type !== 'actionResult') throw new Error('unexpected_response')
    return response.result
  }

  notify(message: string, level = 'success') {
    if (!this.instanceId) return
    window.parent.postMessage(
      { channel: CHANNEL, protocolVersion: VERSION, instanceId: this.instanceId, type: 'notify', message, level },
      '*'
    )
  }

  resize() {
    const root = document.getElementById('root')
    const shell = root?.firstElementChild as HTMLElement | null
    const height = Math.max(shell?.scrollHeight ?? 0, 600)
    if (this.instanceId) {
      window.parent.postMessage(
        { channel: CHANNEL, protocolVersion: VERSION, instanceId: this.instanceId, type: 'resize', height: Math.ceil(height), viewportBound: false },
        '*'
      )
    }
  }

  onHostEvent(callback: () => void) {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export const bridge = new HostBridge()

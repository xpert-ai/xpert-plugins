// Typed client for the host's remote-component postMessage protocol (channel/protocol v1).
// The iframe is sandboxed without allow-same-origin: no Web Storage, no cookies, no host globals.
// Everything the view needs arrives through `init`, and everything it does goes through the host.

const CHANNEL = 'xpertai.remote_component'
const PROTOCOL_VERSION = 1
const INIT_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MS = 30_000

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue | undefined }
export type JsonObject = { [key: string]: JsonValue | undefined }

export interface HostInit {
  locale: string
  debug: boolean
}

export interface HostEvent {
  type: string
  toolName: string | null
}

export interface ViewQuery {
  page?: number
  pageSize?: number
  search?: string
  selectionId?: string
  parameters?: { [key: string]: string }
}

export type ActionOutcome<T> = { ok: true; data: T } | { ok: false; code: string; fields: string[] }
export type CommandOutcome = { ok: true } | { ok: false; code: string; message: string }

interface Envelope {
  type: string
  instanceId?: string
  requestId?: string
  [key: string]: unknown
}

interface Pending {
  resolve: (message: Envelope) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class BridgeError extends Error {
  constructor(readonly code: 'host_timeout' | 'host_request_failed' | 'not_connected' | 'unexpected_response' | 'view_closed') {
    super(code)
    this.name = 'BridgeError'
  }
}

function isObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEnvelope(value: unknown): value is Envelope {
  return isObject(value) && value.channel === CHANNEL && value.protocolVersion === PROTOCOL_VERSION && typeof value.type === 'string'
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

// Tool events reach the iframe in several envelope shapes depending on the host surface; read the
// tool name from the places the platform is known to put it.
export function normalizeHostEvent(raw: unknown): HostEvent {
  const event = isObject(raw) ? raw : {}
  const data = isObject(event.data) ? event.data : {}
  const toolCall = isObject(data.toolCall) ? data.toolCall : isObject(data.tool_call) ? data.tool_call : {}
  return {
    type: readString(event.type) ?? 'unknown',
    toolName: readString(event.toolName) ?? readString(data.toolName) ?? readString(data.tool) ?? readString(toolCall.name)
  }
}

export class HostBridge {
  private instanceId: string | null = null
  private debug = false
  private connecting: Promise<HostInit> | null = null
  private readonly pending = new Map<string, Pending>()
  private readonly hostEventListeners = new Set<(event: HostEvent) => void>()

  private readonly onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent || !isEnvelope(event.data)) return
    const message = event.data
    if (message.type === 'init') return // handled by connect()
    if (!this.instanceId || message.instanceId !== this.instanceId) return

    if (message.type === 'hostEvent') {
      const normalized = normalizeHostEvent(message.event)
      this.trace('hostEvent', normalized)
      this.hostEventListeners.forEach((listener) => listener(normalized))
      return
    }

    const waiting = message.requestId ? this.pending.get(message.requestId) : undefined
    if (!waiting || !message.requestId) return
    clearTimeout(waiting.timer)
    this.pending.delete(message.requestId)
    if (message.type === 'error') waiting.reject(new BridgeError('host_request_failed'))
    else waiting.resolve(message)
  }

  connect(): Promise<HostInit> {
    if (this.connecting) return this.connecting
    this.connecting = new Promise<HostInit>((resolve, reject) => {
      const timer = setTimeout(() => reject(new BridgeError('host_timeout')), INIT_TIMEOUT_MS)
      const onInit = (event: MessageEvent) => {
        if (event.source !== window.parent || !isEnvelope(event.data) || event.data.type !== 'init') return
        const instanceId = readString(event.data.instanceId)
        if (!instanceId) return
        clearTimeout(timer)
        window.removeEventListener('message', onInit)
        this.instanceId = instanceId
        const debug = isObject(event.data.debug) && event.data.debug.enabled === true
        this.debug = debug
        this.trace('init')
        resolve({ locale: readString(event.data.locale) ?? 'en-US', debug })
      }
      window.addEventListener('message', onInit)
      window.addEventListener('message', this.onMessage)
      window.parent.postMessage({ channel: CHANNEL, protocolVersion: PROTOCOL_VERSION, type: 'ready' }, '*')
    })
    return this.connecting
  }

  async query(query: ViewQuery): Promise<{ [key: string]: unknown }> {
    const response = await this.request('requestData', { query: query as JsonObject })
    if (response.type !== 'data' || !isObject(response.data)) throw new BridgeError('unexpected_response')
    return response.data
  }

  // Domain failures come back as { success:false, data:{ code } }: they are outcomes, not exceptions.
  async action<T>(actionKey: string, input: JsonObject): Promise<ActionOutcome<T>> {
    const response = await this.request('executeAction', { actionKey, input })
    if (response.type !== 'actionResult' || !isObject(response.result)) throw new BridgeError('unexpected_response')
    const result = response.result
    if (result.success === true) return { ok: true, data: result.data as T }
    const failure = isObject(result.data) ? result.data : {}
    return {
      ok: false,
      code: readString(failure.code) ?? 'action_failed',
      fields: Array.isArray(failure.fields) ? failure.fields.filter((field): field is string => typeof field === 'string') : []
    }
  }

  async command(commandKey: string, payload: JsonObject): Promise<CommandOutcome> {
    let response: Envelope
    try {
      response = await this.request('invokeClientCommand', { commandKey, payload })
    } catch (error) {
      return { ok: false, code: error instanceof BridgeError ? error.code : 'command_failed', message: '' }
    }
    const result = isObject(response.result) ? response.result : {}
    if (response.type === 'clientCommandResult' && result.success === true) return { ok: true }
    return { ok: false, code: readString(result.code) ?? 'command_failed', message: readString(result.message) ?? '' }
  }

  onHostEvent(listener: (event: HostEvent) => void) {
    this.hostEventListeners.add(listener)
    return () => {
      this.hostEventListeners.delete(listener)
    }
  }

  // viewportBound: the view owns its scrolling (Studio floorplan) instead of growing the page.
  fillViewport() {
    this.post('resize', { height: 720, viewportBound: true })
  }

  dispose() {
    window.removeEventListener('message', this.onMessage)
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new BridgeError('view_closed'))
    }
    this.pending.clear()
    this.hostEventListeners.clear()
    this.instanceId = null
  }

  private request(type: string, body: JsonObject): Promise<Envelope> {
    if (!this.instanceId) return Promise.reject(new BridgeError('not_connected'))
    const requestId = crypto.randomUUID()
    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new BridgeError('host_timeout'))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(requestId, { resolve, reject, timer })
      this.trace(type)
      this.post(type, { requestId, ...body })
    })
  }

  private post(type: string, body: JsonObject) {
    if (!this.instanceId) return
    window.parent.postMessage({ channel: CHANNEL, protocolVersion: PROTOCOL_VERSION, instanceId: this.instanceId, type, ...body }, '*')
  }

  // Off in production (the host decides); never logs payloads, only checkpoints.
  private trace(checkpoint: string, detail?: HostEvent) {
    if (this.debug) console.debug('[complaint-triage] bridge', checkpoint, detail ?? '')
  }
}

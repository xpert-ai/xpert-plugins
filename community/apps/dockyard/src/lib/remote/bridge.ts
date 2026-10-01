import { z } from 'zod/v3'

const CHANNEL = 'xpertai.remote_component'
const envelopeSchema = z.object({
  channel: z.literal(CHANNEL), protocolVersion: z.literal(1), type: z.string(),
  instanceId: z.string().optional(), requestId: z.string().optional(),
  locale: z.string().optional(), debug: z.object({ enabled: z.boolean().optional() }).passthrough().optional(),
  data: z.unknown().optional(), result: z.unknown().optional(), message: z.string().optional()
}).passthrough()
type Envelope = z.infer<typeof envelopeSchema>
type Json = null | boolean | number | string | Json[] | { [key: string]: Json | undefined }
type Pending = { resolve: (message: Envelope) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }

export class HostBridge {
  private instanceId: string | null = null
  private pending = new Map<string, Pending>()
  private enabled = false
  private connected: Promise<{ locale: string }> | null = null
  private initResolve: ((value: { locale: string }) => void) | null = null
  private initReject: ((error: Error) => void) | null = null
  private initTimer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<() => void>()
  private readonly handle = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    const parsed = envelopeSchema.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'init' && message.instanceId) {
      if (this.instanceId && this.instanceId !== message.instanceId) {
        this.dispose(new Error('host_replaced'))
        return
      }
      this.instanceId = message.instanceId
      this.enabled = message.debug?.enabled === true
      if (this.initTimer) clearTimeout(this.initTimer)
      this.initResolve?.({ locale: message.locale ?? 'en-US' })
      this.initResolve = null
      this.trace('init')
      return
    }
    if (!this.instanceId || message.instanceId !== this.instanceId) return
    if (message.type === 'hostEvent') { this.listeners.forEach(listener => listener()); return }
    const waiting = message.requestId ? this.pending.get(message.requestId) : null
    if (!waiting) return
    clearTimeout(waiting.timer); this.pending.delete(message.requestId!)
    this.trace(message.type)
    if (message.type === 'error') waiting.reject(new Error('host_request_failed'))
    else waiting.resolve(message)
  }

  connect() {
    if (this.connected) return this.connected
    this.connected = new Promise<{ locale: string }>((resolve, reject) => {
      this.initResolve = resolve; this.initReject = reject
      window.addEventListener('message', this.handle)
      this.initTimer = setTimeout(() => reject(new Error('host_timeout')), 15000)
      window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, type: 'ready' }, '*')
    })
    return this.connected
  }

  private trace(event: string) { if (this.enabled) console.debug('[Dockyard bridge]', event) }
  private request(type: string, body: { [key: string]: Json | undefined }) {
    if (!this.instanceId) return Promise.reject(new Error('not_connected'))
    const requestId = crypto.randomUUID()
    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('host_timeout')) }, 30000)
      this.pending.set(requestId, { resolve, reject, timer })
      this.trace(type)
      window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, instanceId: this.instanceId, requestId, type, ...body }, '*')
    })
  }

  async query<T>(schema: z.ZodType<T>, parameters: { [key: string]: string } = {}): Promise<T> {
    const result = await this.request('requestData', { query: { parameters } })
    if (result.type !== 'data') throw new Error('unexpected_response')
    const record = z.object({ item: z.unknown() }).parse(result.data)
    return schema.parse(record.item)
  }

  async action<T>(actionKey: string, input: { [key: string]: Json | undefined }, schema: z.ZodType<T>) {
    const response = await this.request('executeAction', { actionKey, input })
    if (response.type !== 'actionResult') throw new Error('unexpected_response')
    const result = z.object({ success: z.boolean(), data: z.unknown() }).parse(response.result)
    if (!result.success) {
      const failure = z.object({ code: z.string() }).safeParse(result.data)
      throw new Error(failure.success ? failure.data.code : 'action_failed')
    }
    return schema.parse(result.data)
  }

  async appendReferences(references: { type: 'code'; label?: string; path: string; text: string; startLine: number; endLine: number }[]) {
    const response = await this.request('invokeClientCommand', {
      commandKey: 'assistant.composer.append_references', payload: { references }
    })
    if (response.type !== 'clientCommandResult') throw new Error('unexpected_response')
    const receipt = z.object({ success: z.boolean(), focused: z.boolean().optional() }).parse(response.result)
    if (!receipt.success) throw new Error('composer_unavailable')
    return receipt
  }

  onHostEvent(callback: () => void) { this.listeners.add(callback); return () => { this.listeners.delete(callback) } }
  resize() {
    if (this.instanceId) window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, instanceId: this.instanceId, type: 'resize', height: 760, viewportBound: true }, '*')
  }
  dispose(error = new Error('view_closed')) {
    window.removeEventListener('message', this.handle)
    if (this.initTimer) clearTimeout(this.initTimer)
    this.initReject?.(error)
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error) }
    this.pending.clear(); this.listeners.clear(); this.instanceId = null
  }
}

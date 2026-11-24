import { z } from 'zod/v3'
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import { recordSchema, viewDataSchema, type Report } from '../shared/contracts'
import { i18n } from './i18n'
import { configureDebug, trace } from './debug'

const channel = 'xpertai.remote_component'
const envelope = z.object({ channel: z.literal(channel), protocolVersion: z.literal(1), type: z.string(), instanceId: z.string().optional(), requestId: z.string().optional(), locale: z.string().optional(), debug: z.object({ enabled: z.boolean().optional() }).passthrough().optional(), data: z.unknown().optional(), result: z.unknown().optional() })
type Envelope = z.infer<typeof envelope>
type Json = null | boolean | number | string | Json[] | { [key: string]: Json | undefined }
type Pending = { resolve: (message: Envelope) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
export class HostBridge {
  private instanceId = ''
  private pending = new Map<string, Pending>()
  private sequence = 0
  private hostListeners = new Set<() => void>()
  private init: (() => void) | null = null
  private listener = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    const parsed = envelope.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'init' && message.instanceId) {
      if (this.instanceId && this.instanceId !== message.instanceId) return
      this.instanceId = message.instanceId
      configureDebug(message.debug?.enabled === true); trace('bridge.init')
      i18n.setLocale(message.locale ?? 'en-US')
      // The SDK installs host tokens before the application listener runs.
      installShadcnThemeVars({ density: 'compact' })
      this.post('resize', { height: 760, viewportBound: true })
      this.init?.(); return
    }
    if (message.instanceId !== this.instanceId) return
    if (message.type === 'hostEvent') { this.hostListeners.forEach(listener => listener()); return }
    if (!message.requestId) return
    const item = this.pending.get(message.requestId)
    if (!item) return
    clearTimeout(item.timer); this.pending.delete(message.requestId)
    if (message.type === 'error') item.reject(new Error('host_request_failed'))
    else item.resolve(message)
  }
  connect() {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('host_timeout')), 20000)
      this.init = () => { clearTimeout(timer); this.init = null; resolve() }
      window.addEventListener('message', this.listener)
      this.post('ready')
    })
  }
  dispose() {
    window.removeEventListener('message', this.listener)
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('host_request_failed')) }
    this.pending.clear()
    this.hostListeners.clear()
  }
  onHostEvent(listener: () => void) { this.hostListeners.add(listener); return () => { this.hostListeners.delete(listener) } }
  private post(type: string, body: { [key: string]: Json | undefined } = {}) {
    window.parent.postMessage({ channel, protocolVersion: 1, instanceId: this.instanceId, type, ...body }, '*')
  }
  private request(type: string, body: { [key: string]: Json | undefined }) {
    if (!this.instanceId) return Promise.reject(new Error('host_request_failed'))
    const requestId = String(++this.sequence)
    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('host_timeout')) }, 20000)
      this.pending.set(requestId, { resolve, reject, timer })
      this.post(type, { requestId, ...body })
    })
  }
  async query(recordId = '', search = '', page = 1) {
    const result = await this.request('requestData', { query: { parameters: recordId ? { recordId } : {}, search, page, pageSize: 25 } })
    if (result.type !== 'data') throw new Error('host_request_failed')
    return viewDataSchema.parse(result.data)
  }
  async action(actionKey: 'create' | 'save' | 'confirm' | 'analyze', targetId: string | null, input: { requestId?: string; originalFeedback?: string; revision?: number; report?: Report; supplement?: string; answers?: { questionId: string; text: string }[] }) {
    const response = await this.request('executeAction', { actionKey, targetId, input })
    const result = z.object({ success: z.boolean(), data: z.unknown() }).parse(response.result)
    if (!result.success) {
      const failure = z.object({ code: z.string() }).safeParse(result.data)
      throw new Error(failure.success ? failure.data.code : 'storage_unavailable')
    }
    return recordSchema.parse(result.data)
  }
}

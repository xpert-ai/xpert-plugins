import { z } from 'zod/v3'

const CHANNEL = 'xpertai.remote_component'
const envelopeSchema = z.object({
  channel: z.literal(CHANNEL),
  protocolVersion: z.literal(1),
  type: z.string(),
  instanceId: z.string().optional(),
  requestId: z.string().optional(),
  locale: z.string().optional(),
  data: z.unknown().optional(),
  result: z.unknown().optional(),
  message: z.string().optional()
}).passthrough()
type Envelope = z.infer<typeof envelopeSchema>

export interface ViewQuery {
  page?: number
  pageSize?: number
  search?: string
  selectionId?: string
  parameters?: Record<string, unknown>
}

type Pending = { resolve: (message: Envelope) => void; reject: (error: Error) => void }

/** 宿主桥：init/requestData/executeAction/hostEvent，与平台远程组件协议一致。 */
export class HostBridge {
  private instanceId: string | null = null
  private sequence = 0
  private pending = new Map<string, Pending>()
  private onReload: (() => void) | null = null
  locale: string | undefined

  connect(onReload: () => void): Promise<void> {
    this.onReload = onReload
    return new Promise((resolve) => {
      window.addEventListener('message', (event) => {
        const parsed = envelopeSchema.safeParse(event.data)
        if (!parsed.success) return
        const message = parsed.data
        if (message.type === 'init' && message.instanceId) {
          this.instanceId = message.instanceId
          this.locale = message.locale
          resolve()
          return
        }
        if (!this.instanceId || message.instanceId !== this.instanceId) return
        if (message.type === 'hostEvent') {
          this.onReload?.()
          return
        }
        if (!message.requestId) return
        const waiting = this.pending.get(message.requestId)
        if (!waiting) return
        this.pending.delete(message.requestId)
        if (message.type === 'error') waiting.reject(new Error(message.message || 'remote_request_failed'))
        else waiting.resolve(message)
      })
      this.post('ready')
    })
  }

  private post(type: string, body: Record<string, unknown> = {}) {
    window.parent.postMessage(
      { channel: CHANNEL, protocolVersion: 1, instanceId: this.instanceId, type, ...body },
      '*'
    )
  }

  private request(type: string, body: Record<string, unknown> = {}): Promise<Envelope> {
    const requestId = String(++this.sequence)
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject })
      this.post(type, { ...body, requestId })
    })
  }

  async requestData(query: ViewQuery) {
    const message = await this.request('requestData', { query })
    return { data: message.data }
  }

  async executeAction(actionKey: string, input: Record<string, unknown>, targetId?: string, parameters?: Record<string, unknown>) {
    const message = await this.request('executeAction', { actionKey, targetId, input, parameters })
    return { result: message.result }
  }

  resize(height: number) {
    this.post('resize', { height, viewportBound: true })
  }
}

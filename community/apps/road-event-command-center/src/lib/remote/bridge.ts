import { z } from 'zod/v3'

const CHANNEL = 'xpertai.remote_component'
const envelopeSchema = z.object({
  channel: z.literal(CHANNEL),
  protocolVersion: z.literal(1),
  type: z.string(),
  instanceId: z.string().optional(),
  requestId: z.string().optional(),
  locale: z.string().optional(),
  debug: z.object({ enabled: z.boolean().optional() }).passthrough().optional(),
  data: z.unknown().optional(),
  result: z.unknown().optional()
}).passthrough()
type Envelope = z.infer<typeof envelopeSchema>
type Pending = { resolve: (message: Envelope) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }

export interface HostInit {
  instanceId: string
  locale: string
  debug: boolean
}

export function connectToHost() {
  let instanceId: string | null = null
  let resolveInit: ((value: HostInit) => void) | undefined
  let rejectInit: ((error: Error) => void) | undefined
  const readyInterval = setInterval(() => {
    if (!instanceId) window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, type: 'ready' }, '*')
  }, 1000)
  const initTimer = setTimeout(() => rejectInit?.(new Error('host_timeout')), 15000)
  const pending = new Map<string, Pending>()
  const connected = new Promise<HostInit>((resolve, reject) => {
    resolveInit = resolve
    rejectInit = reject
  })

  const handleMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    const parsed = envelopeSchema.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'init' && message.instanceId) {
      if (instanceId && instanceId !== message.instanceId) return
      instanceId = message.instanceId
      resolveInit?.({ instanceId, locale: message.locale ?? 'en-US', debug: message.debug?.enabled === true })
      resolveInit = undefined
      rejectInit = undefined
      clearTimeout(initTimer)
      clearInterval(readyInterval)
      return
    }
    if (!instanceId || message.instanceId !== instanceId || !message.requestId) return
    const waiting = pending.get(message.requestId)
    if (!waiting) return
    clearTimeout(waiting.timer)
    pending.delete(message.requestId)
    if (message.type === 'error') waiting.reject(new Error('host_request_failed'))
    else waiting.resolve(message)
  }

  window.addEventListener('message', handleMessage)
  window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, type: 'ready' }, '*')

  function request(type: string, body: Record<string, unknown>) {
    if (!instanceId) return Promise.reject(new Error('not_connected'))
    const requestId = crypto.randomUUID()
    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error('host_timeout'))
      }, 30000)
      pending.set(requestId, { resolve, reject, timer })
      window.parent.postMessage({
        channel: CHANNEL, protocolVersion: 1, instanceId, requestId, type, ...body
      }, '*')
    })
  }

  return {
    connected,
    async query<T>(schema: z.ZodType<T>): Promise<T> {
      const response = await request('requestData', { query: { parameters: {} } })
      if (response.type !== 'data') throw new Error('unexpected_response')
      const data = z.object({ item: z.unknown() }).parse(response.data)
      return schema.parse(data.item)
    },
    async action<T>(actionKey: string, input: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
      const response = await request('executeAction', { actionKey, input })
      if (response.type !== 'actionResult') throw new Error('unexpected_response')
      const result = z.object({ success: z.boolean(), data: z.unknown() }).parse(response.result)
      if (!result.success) {
        const failure = z.object({ code: z.string() }).safeParse(result.data)
        throw new Error(failure.success ? failure.data.code : 'action_failed')
      }
      return schema.parse(result.data)
    },
    resize() {
      if (!instanceId) return
      window.parent.postMessage({
        channel: CHANNEL, protocolVersion: 1, instanceId, type: 'resize',
        height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        viewportBound: true
      }, '*')
    },
    dispose() {
      window.removeEventListener('message', handleMessage)
      rejectInit?.(new Error('view_closed'))
      clearTimeout(initTimer)
      clearInterval(readyInterval)
      pending.forEach(entry => {
        clearTimeout(entry.timer)
        entry.reject(new Error('view_closed'))
      })
      pending.clear()
      instanceId = null
    }
  }
}

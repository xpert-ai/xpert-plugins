import { z } from 'zod/v3'
const CHANNEL = 'xpertai.remote_component'
const envelope = z
  .object({
    channel: z.literal(CHANNEL),
    protocolVersion: z.literal(1),
    type: z.string(),
    instanceId: z.string().nullable().optional(),
    requestId: z.string().optional(),
    locale: z.string().optional(),
    viewState: z.object({ recordId: z.string().uuid().optional() }).nullable().optional(),
    initialQuery: z
      .object({ parameters: z.object({ recordId: z.string().uuid().optional() }).passthrough().optional() })
      .passthrough()
      .optional(),
    data: z.unknown().optional(),
    result: z.unknown().optional(),
    message: z.string().optional()
  })
  .passthrough()
type Message = z.infer<typeof envelope>
let instanceId: string | null = null
let sequence = 0
const pending = new Map<
  string,
  { resolve: (message: Message) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
>()
export function post(type: string, body: object = {}) {
  window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, instanceId, type, ...body }, '*')
}
export function listen(onInit: (message: Message) => void, onEvent: () => void) {
  const handler = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    const parsed = envelope.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'init' && message.instanceId) {
      if (instanceId && instanceId !== message.instanceId) {
        for (const request of pending.values()) {
          clearTimeout(request.timer)
          request.reject(new Error('operation_failed'))
        }
        pending.clear()
      }
      instanceId = message.instanceId
      onInit(message)
      post('resize', { height: 760, viewportBound: true })
      return
    }
    if (!instanceId || message.instanceId !== instanceId) return
    if (message.type === 'hostEvent') {
      onEvent()
      return
    }
    const request = message.requestId ? pending.get(message.requestId) : undefined
    if (request && message.requestId) {
      clearTimeout(request.timer)
      pending.delete(message.requestId)
      if (message.type === 'error') request.reject(new Error('operation_failed'))
      else request.resolve(message)
    }
  }
  window.addEventListener('message', handler)
  post('ready')
  return () => {
    window.removeEventListener('message', handler)
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(new Error('operation_failed'))
    }
    pending.clear()
  }
}
export function request(type: string, body: object) {
  if (!instanceId) return Promise.reject(new Error('missing_scope'))
  const requestId = String(++sequence)
  return new Promise<Message>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('bridge_timeout'))
    }, 30000)
    pending.set(requestId, { resolve, reject, timer })
    post(type, { requestId, ...body })
  })
}

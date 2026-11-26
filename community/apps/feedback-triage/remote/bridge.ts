import { z } from 'zod/v3'
import { ticketSchema } from '../src/domain'
import type { Analysis, Ticket } from '../src/domain'

const channel = 'xpertai.remote_component'
const envelope = z.object({
  channel: z.literal(channel),
  protocolVersion: z.literal(1),
  instanceId: z.string().min(1),
  type: z.string(),
  requestId: z.string().optional(),
  scopeRevision: z.number().optional(),
  data: z.unknown(),
  result: z.unknown(),
  event: z
    .object({
      type: z.string(),
      data: z.object({ revision: z.number().optional() }).passthrough().nullish()
    })
    .passthrough()
    .optional(),
  locale: z.string().optional(),
  theme: z.object({ mode: z.enum(['dark', 'light']).optional() }).optional(),
  debug: z.object({ enabled: z.boolean() }).optional()
})
const projection = z.object({ item: z.object({ tickets: ticketSchema.array().max(30), hasMore: z.boolean() }) })
const receipt = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), data: z.object({ ticket: ticketSchema }) }),
  z.object({ success: z.literal(false), data: z.object({ code: z.string() }).optional() })
])

type Message = z.infer<typeof envelope>
type Init = Pick<Message, 'locale' | 'theme'>
type Action =
  | { key: 'create_ticket'; input: { requestId: string; source: string } }
  | { key: 'analyze_ticket'; input: { id: string } }
  | { key: 'confirm_ticket'; input: { id: string; category?: Analysis['category'] } }
export interface WorkbenchBridge {
  list(page: number): Promise<{ tickets: Ticket[]; hasMore: boolean }>
  act(action: Action): Promise<Ticket>
  onRefresh(listener: () => void): () => void
}

export function connect(onSession: (key: string, init: Init, bridge: WorkbenchBridge) => void) {
  let instanceId = ''
  let revision: number | undefined
  let sessionBridge: WorkbenchBridge | undefined
  let generation = 0
  let debug = false
  const refreshListeners = new Set<() => void>()
  const pending = new Map<string, { receive(message: Message): void; cancel(): void }>()

  function request(session: number, type: 'requestData' | 'executeAction', body: object, timeoutMs: number) {
    if (session !== generation) return Promise.reject(Error('context_changed'))
    return new Promise<unknown>((resolve, reject) => {
      const requestId = crypto.randomUUID()
      const timer = window.setTimeout(() => finish(() => reject(Error('timeout'))), timeoutMs)
      function finish(settle: () => void) {
        window.clearTimeout(timer)
        pending.delete(requestId)
        settle()
      }
      pending.set(requestId, {
        cancel: () => finish(() => reject(Error('context_changed'))),
        receive(message) {
          if (message.type === 'error') return finish(() => reject(Error('transport_error')))
          const expected = type === 'requestData' ? 'data' : 'actionResult'
          if (message.type === expected) finish(() => resolve(type === 'requestData' ? message.data : message.result))
        }
      })
      if (debug) console.debug('[feedback-triage] host request', type)
      window.parent.postMessage(
        { channel, protocolVersion: 1, instanceId, scopeRevision: revision, type, requestId, ...body },
        '*'
      )
    })
  }

  function makeBridge(session: number): WorkbenchBridge {
    return {
      async list(page) {
        const response = projection.safeParse(await request(session, 'requestData', { query: { page } }, 20_000))
        if (!response.success) throw Error('invalid_response')
        return response.data.item
      },
      async act(action) {
        const body = {
          actionKey: action.key,
          input: action.input,
          ...('id' in action.input ? { targetId: action.input.id } : {})
        }
        const response = receipt.safeParse(
          await request(session, 'executeAction', body, action.key === 'analyze_ticket' ? 170_000 : 30_000)
        )
        if (!response.success) throw Error('invalid_response')
        if (!response.data.success) throw Error(response.data.data?.code ?? 'transport_error')
        return response.data.data.ticket
      },
      onRefresh(listener) {
        refreshListeners.add(listener)
        return () => {
          refreshListeners.delete(listener)
        }
      }
    }
  }

  let settings: Init = {}
  function establish(id: string, nextRevision: number | undefined) {
    if (!sessionBridge || id !== instanceId || revision !== nextRevision) {
      for (const entry of pending.values()) entry.cancel()
      refreshListeners.clear()
      instanceId = id
      revision = nextRevision
      sessionBridge = makeBridge(++generation)
    }
    onSession(`${instanceId}/${revision ?? ''}`, settings, sessionBridge)
  }
  function receive(event: MessageEvent<unknown>) {
    if (event.source !== window.parent) return
    const parsed = envelope.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'init') {
      settings = { locale: message.locale, theme: message.theme }
      debug = message.debug?.enabled === true
      establish(message.instanceId, message.scopeRevision)
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'hostEvent' && message.event?.type === 'view.context.changed') {
      const nextRevision = message.event.data?.revision
      if (typeof nextRevision === 'number' && (revision === undefined || nextRevision > revision))
        establish(instanceId, nextRevision)
      return
    }
    if (typeof message.scopeRevision === 'number' && message.scopeRevision !== revision) return
    if (message.type === 'hostEvent' && message.event?.type === 'assistant.tool.completed') {
      for (const listener of refreshListeners) listener()
    } else if (message.requestId) {
      pending.get(message.requestId)?.receive(message)
    }
  }
  window.addEventListener('message', receive)
  window.parent.postMessage({ channel, protocolVersion: 1, type: 'ready' }, '*')
  return () => {
    ++generation
    window.removeEventListener('message', receive)
    for (const entry of pending.values()) entry.cancel()
    refreshListeners.clear()
  }
}

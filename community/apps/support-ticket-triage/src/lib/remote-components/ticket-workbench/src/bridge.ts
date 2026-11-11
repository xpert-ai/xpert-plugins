export interface TicketItem {
  id: string; customerName: string; customerEmail?: string; subject: string; description: string;
  status: 'pending_ai' | 'awaiting_review' | 'approved' | 'rejected' | 'failed';
  category?: string; priority?: string; summary?: string; suggestedReply?: string; confidence?: number;
  evidence?: string[]; failureReason?: string; attemptCount: number; revision: number
}

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1
let instanceId: string | null = null
let sequence = 0
const pending = new Map<string, { resolve(value: unknown): void; reject(reason: Error): void }>()
let onInit: ((message: Record<string, unknown>) => void) | undefined
let onHostEvent: (() => void) | undefined

window.addEventListener('message', (event) => {
  const message = event.data as Record<string, unknown>
  if (!message || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
  if (message.type === 'init') { instanceId = String(message.instanceId); onInit?.(message); return }
  if (message.instanceId !== instanceId) return
  if (message.type === 'hostEvent') { onHostEvent?.(); return }
  const requestId = typeof message.requestId === 'string' ? message.requestId : ''
  const waiter = pending.get(requestId)
  if (!waiter) return
  pending.delete(requestId)
  if (message.type === 'error') waiter.reject(new Error(String(message.message ?? 'Remote request failed')))
  else waiter.resolve(message)
})

function request(type: string, body: Record<string, unknown> = {}) {
  const requestId = String(++sequence)
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject })
    parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type, requestId, ...body }, '*')
  })
}

export const bridge = {
  ready(init: (message: Record<string, unknown>) => void, hostEvent: () => void) {
    onInit = init; onHostEvent = hostEvent
    parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, type: 'ready' }, '*')
  },
  async load(search?: string) { const response = await request('requestData', { query: { search } }); return (response.data ?? {}) as { items?: TicketItem[]; meta?: Record<string, number> } },
  async action(actionKey: string, input: Record<string, unknown> = {}, targetId?: string) { return request('executeAction', { actionKey, input, targetId }) },
  async analyse(ticket: TicketItem) {
    return request('invokeClientCommand', { commandKey: 'assistant.chat.send_message', payload: {
      text: `请读取工单 ${ticket.id}，完成分类、优先级判断、摘要和回复草稿，并调用 support_ticket_record_analysis 保存结果。`,
      clientMessageId: `support-ticket:${ticket.id}:${Date.now()}`, followUpMode: 'queue', files: [], attachments: [], references: [],
      state: { supportTicketTriage: { ticketId: ticket.id, revision: ticket.revision } }
    } })
  }
}

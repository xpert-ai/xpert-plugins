import type { Resolution, TicketDetail, TicketListItem, TicketStatus } from '../domain/contracts.js'
import type { Channel } from '../domain/policy.js'
import type { ActionOutcome, CommandOutcome, HostBridge } from './bridge.js'

// The Workbench's view of the backend. Every call goes through the host bridge to the plugin's view
// provider; the iframe never sees tokens, API URLs or tenant / organization ids.

export interface TicketPage {
  items: TicketListItem[]
  total: number
  counts: Record<TicketStatus, number>
}

export interface ListQuery {
  page: number
  pageSize: number
  search: string
  status: TicketStatus | null
}

export interface AnalysisStart {
  ticket: TicketDetail
  attemptNo: number
  started: boolean
}

const EMPTY_COUNTS: Record<TicketStatus, number> = { draft: 0, analyzing: 0, pending_review: 0, analysis_failed: 0, confirmed: 0 }

function isObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// postMessage payloads are untyped: check the fields the UI dereferences before trusting the shape.
function isListItem(value: unknown): value is TicketListItem {
  return isObject(value) && typeof value.id === 'string' && typeof value.ticketNo === 'string' && typeof value.status === 'string'
}

function isDetail(value: unknown): value is TicketDetail {
  return isListItem(value) && 'sentences' in value && Array.isArray(value.sentences) && 'attempts' in value && Array.isArray(value.attempts)
}

export class TriageApi {
  constructor(private readonly bridge: HostBridge) {}

  async listTickets(query: ListQuery): Promise<TicketPage> {
    const data = await this.bridge.query({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.search ? { search: query.search } : {}),
      ...(query.status ? { parameters: { status: query.status } } : {})
    })
    const summary = isObject(data.summary) && isObject(data.summary.counts) ? data.summary.counts : {}
    return {
      items: Array.isArray(data.items) ? data.items.filter(isListItem) : [],
      total: typeof data.total === 'number' ? data.total : 0,
      counts: { ...EMPTY_COUNTS, ...(summary as Partial<Record<TicketStatus, number>>) }
    }
  }

  async getTicket(ticketId: string): Promise<TicketDetail | null> {
    const data = await this.bridge.query({ selectionId: ticketId })
    return isDetail(data.item) ? data.item : null
  }

  createTicket(input: { content: string; channel: Channel; customerName?: string; faultInjection: 'none' | 'first_attempt' }): Promise<ActionOutcome<TicketDetail>> {
    return this.bridge.action<TicketDetail>('create_ticket', input)
  }

  requestAnalysis(ticketId: string): Promise<ActionOutcome<AnalysisStart>> {
    return this.bridge.action<AnalysisStart>('request_analysis', { ticketId })
  }

  reportDispatchFailure(ticketId: string, attemptNo: number, reason: string): Promise<ActionOutcome<TicketDetail>> {
    return this.bridge.action<TicketDetail>('report_dispatch_failure', { ticketId, attemptNo, ...(reason ? { reason } : {}) })
  }

  confirmTicket(ticketId: string, attemptNo: number, resolution: Resolution): Promise<ActionOutcome<TicketDetail>> {
    return this.bridge.action<TicketDetail>('confirm_ticket', { ticketId, attemptNo, resolution: { ...resolution } })
  }

  // A fresh thread per ticket: one analysis never inherits another ticket's conversation.
  askAssistant(text: string): Promise<CommandOutcome> {
    return this.bridge.command('assistant.chat.send_message', { text, newThread: true })
  }
}

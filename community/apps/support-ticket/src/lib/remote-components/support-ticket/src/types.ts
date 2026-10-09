export type {
  SupportTicketChannel as TicketChannel,
  SupportTicketCategory as TicketCategory,
  SupportTicketDetail as TicketDetail,
  SupportTicketEvent as TicketEvent,
  SupportTicketListItem as TicketListItem,
  SupportTicketPriority as TicketPriority,
  SupportTicketStatus as TicketStatus
} from '../../../types'

export interface HostContext {
  manifest?: unknown
  initialQuery?: {
    page?: number
    pageSize?: number
    search?: string
    parameters?: Record<string, unknown>
  }
  locale?: string
  theme?: unknown
}

export interface BridgeMessage {
  channel?: string
  protocolVersion?: number
  instanceId?: string | null
  type?: string
  requestId?: string
  data?: unknown
  result?: unknown
  message?: string
  payload?: unknown
  manifest?: unknown
  initialQuery?: HostContext['initialQuery']
  locale?: string
  theme?: unknown
}

export interface TicketOption {
  value: string
  en_US: string
  zh_Hans: string
}

export interface TicketStats {
  total: number
  processing: number
  pending_review: number
  confirmed: number
  failed: number
}

export interface WorkbenchData {
  items: import('../../../types').SupportTicketListItem[]
  total: number
  item?: import('../../../types').SupportTicketDetail
  summary?: {
    mode: string
    stats: TicketStats
  }
  meta?: {
    statuses: TicketOption[]
    categories: TicketOption[]
    priorities: TicketOption[]
    channels: TicketOption[]
    maxMessageLength: number
    aiTimeoutSeconds: number
  }
}

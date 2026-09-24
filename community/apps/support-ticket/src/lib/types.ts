export type SupportTicketStatus = 'processing' | 'pending_review' | 'confirmed' | 'failed'

export type SupportTicketSourceType = 'workbench_form' | 'agent_chat'

export type SupportTicketChannel = 'email' | 'im' | 'phone' | 'other'

export type SupportTicketCategory =
  | 'product_issue'
  | 'billing'
  | 'delivery'
  | 'account_access'
  | 'how_to'
  | 'complaint'
  | 'other'

export type SupportTicketPriority = 'p0' | 'p1' | 'p2' | 'p3'

export type SupportTicketEventAction =
  | 'submitted'
  | 'ai_completed'
  | 'ai_failed'
  | 'retry_requested'
  | 'draft_saved'
  | 'confirmed'

export interface SupportTicketScope {
  tenantId: string
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface SupportTicketEvent {
  action: SupportTicketEventAction
  at: string
  detail?: string
  operatorId?: string
}

export interface CreateTicketInput {
  requestId: string
  customerName: string
  channel: SupportTicketChannel
  originalMessage: string
  sourceType?: SupportTicketSourceType
  assistantId?: string
  conversationId?: string
}

export interface SaveTriageInput {
  ticketId: string
  category: SupportTicketCategory
  priority: SupportTicketPriority
  priorityReason: string
  draftReply: string
  confidence?: number
  missingInfo?: string[]
  rawResult?: unknown
}

export interface SaveDraftInput {
  expectedRevision: number
  category?: SupportTicketCategory
  priority?: SupportTicketPriority
  draftReply?: string
}

export interface ConfirmTicketInput {
  expectedRevision: number
  category?: SupportTicketCategory
  priority?: SupportTicketPriority
  draftReply: string
  reviewerNote?: string
}

export interface FailTicketInput {
  reason: string
  code?: string
}

export interface SupportTicketListQuery {
  ticketId?: string
  status?: SupportTicketStatus
  category?: SupportTicketCategory
  priority?: SupportTicketPriority
  search?: string
  page?: number
  pageSize?: number
}

export interface SupportTicketListItem {
  id: string
  ticketNo: string
  status: SupportTicketStatus
  customerName: string
  channel: SupportTicketChannel
  category?: SupportTicketCategory
  priority?: SupportTicketPriority
  confirmedReplyPreview?: string
  draftReplyPreview?: string
  attemptCount: number
  revision: number
  createdAt?: string
  updatedAt?: string
}

export interface SupportTicketDetail {
  id: string
  ticketNo: string
  status: SupportTicketStatus
  sourceType: SupportTicketSourceType
  customerName: string
  channel: SupportTicketChannel
  originalMessage: string
  revision: number
  attemptCount: number
  ai?: {
    category: SupportTicketCategory
    priority: SupportTicketPriority
    priorityReason: string
    draftReply: string
    confidence?: number
    missingInfo?: string[]
    processedAt?: string
  }
  confirmed?: {
    category?: SupportTicketCategory
    priority?: SupportTicketPriority
    draftReply?: string
    reviewerNote?: string
    reviewedAt?: string
    reviewedBy?: string
  }
  failure?: {
    reason: string
    code?: string
    at?: string
  }
  events: SupportTicketEvent[]
  createdAt?: string
  updatedAt?: string
}

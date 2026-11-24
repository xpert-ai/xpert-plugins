export const COMPLAINT_CATEGORIES = ['logistics', 'product', 'refund', 'service', 'other'] as const
export const COMPLAINT_URGENCIES = ['low', 'normal', 'high'] as const
export const COMPLAINT_STATUSES = ['draft', 'ready', 'needs_info', 'failed', 'confirmed', 'returned'] as const

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]
export type ComplaintUrgency = (typeof COMPLAINT_URGENCIES)[number]
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number]
export type ComplaintLogAction =
  | 'draft_saved'
  | 'validation_failed'
  | 'model_failed'
  | 'retried'
  | 'fields_updated'
  | 'confirmed'
  | 'returned'

export interface ComplaintScope {
  tenantId?: string
  organizationId?: string
  userId?: string
  assistantId?: string
  conversationId?: string
}

export interface ComplaintDraftInput {
  caseId?: string
  rawText: string
  category?: ComplaintCategory
  urgency?: ComplaintUrgency
  customerDemand?: string
  missingFields?: string[]
  suggestedReply?: string
  escalationSuggested?: boolean
  escalationReason?: string
  orderNo?: string
  contact?: string
  simulateModelFailure?: boolean
  failureReason?: string
}

export interface ComplaintFieldEdits {
  category?: ComplaintCategory
  urgency?: ComplaintUrgency
  customerDemand?: string
  missingFields?: string[]
  suggestedReply?: string
  escalationSuggested?: boolean
  escalationReason?: string
  orderNo?: string
  contact?: string
  rawText?: string
}

export interface DraftEvaluation {
  status: ComplaintStatus
  validationErrors: string[]
  failureReason?: string
  missingFields: string[]
  escalationSuggested: boolean
  escalationReason?: string
  category?: ComplaintCategory
  urgency?: ComplaintUrgency
}

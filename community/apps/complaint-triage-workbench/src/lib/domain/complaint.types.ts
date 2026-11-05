export const COMPLAINT_STATUSES = [
  'DRAFT',
  'PROCESSING',
  'PENDING_REVIEW',
  'CONFIRMED',
  'FAILED'
] as const

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number]

export interface ComplaintTriageResult {
  summary: string
  category: string
  urgency: 'low' | 'medium' | 'high' | 'critical'
  customerIntent: string
  riskFlags: string[]
  suggestedAction: string
  replyDraft: string
}

export interface ComplaintScope {
  tenantId: string
  organizationId: string | null
  userId: string | null
}

export interface ComplaintCaseListResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

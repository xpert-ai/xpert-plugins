export type MeetingStatus = 'processing' | 'review_required' | 'confirmed' | 'failed'
export type ReviewStatus = 'pending' | 'confirmed' | 'edited' | 'rejected'
export type ActionStatus = 'pending_confirmation' | 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type ActionPriority = 'low' | 'medium' | 'high'
export type ExecutionReviewStatus = 'processing' | 'ready' | 'failed'
export type RiskSeverity = 'low' | 'medium' | 'high'
export type RiskSource = 'rule' | 'agent'
export type RiskReviewStatus = 'open' | 'accepted' | 'dismissed' | 'resolved'
export type RiskType =
  | 'overdue'
  | 'due_soon'
  | 'missing_owner'
  | 'missing_due_date'
  | 'ambiguous_commitment'
  | 'duplicate_action'
  | 'decision_conflict'
  | 'dependency_risk'
  | 'workload_concentration'
  | 'other'

export interface MeetingScope {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject {
  [key: string]: JsonValue
}

export interface MeetingSummaryDto {
  id: string
  title: string
  status: MeetingStatus
  revision: number
  extractionAttempt: number
  decisionCount: number
  actionItemCount: number
  errorCode: string | null
  updatedAt: string
  createdAt: string
}

export interface DecisionDto {
  id: string
  itemKey: string
  statement: string
  evidenceQuote: string
  confidence: number
  reviewStatus: ReviewStatus
  sortOrder: number
}

export interface ActionItemDto {
  id: string
  itemKey: string
  task: string
  owner: string | null
  dueDate: string | null
  priority: ActionPriority
  status: ActionStatus
  evidenceQuote: string
  confidence: number
  reviewStatus: ReviewStatus
  sortOrder: number
}

export interface MeetingDetailDto extends MeetingSummaryDto {
  sourceText: string
  errorMessage: string | null
  reviewedAt: string | null
  decisions: DecisionDto[]
  actionItems: ActionItemDto[]
}

export interface MeetingWorkbenchDto {
  summary: {
    total: number
    processing: number
    reviewRequired: number
    confirmed: number
    failed: number
  }
  meetings: MeetingSummaryDto[]
  selectedMeeting: MeetingDetailDto | null
  page: number
  pageSize: number
  total: number
  execution: ExecutionContextDto
}

export interface ExecutionActionDto extends ActionItemDto {
  meetingId: string
  meetingTitle: string
  meetingRevision: number
  ruleFlags: Array<'overdue' | 'due_soon' | 'missing_owner' | 'missing_due_date'>
}

export interface ExecutionDecisionDto {
  id: string
  meetingId: string
  meetingTitle: string
  statement: string
  evidenceQuote: string
  confidence: number
}

export interface RiskSignalDto {
  id: string
  reviewId: string | null
  signalKey: string
  source: RiskSource
  riskType: RiskType
  severity: RiskSeverity
  title: string
  rationale: string
  evidenceQuote: string
  recommendation: string
  meetingId: string | null
  actionItemId: string | null
  confidence: number
  reviewStatus: RiskReviewStatus
  createdAt: string
}

export interface ExecutionReviewDto {
  id: string
  status: ExecutionReviewStatus
  revision: number
  focus: string
  summary: string | null
  followUpBrief: string | null
  riskCount: number
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface ExecutionContextDto {
  summary: {
    total: number
    pending: number
    inProgress: number
    completed: number
    cancelled: number
    overdue: number
    dueSoon: number
    missingOwner: number
    missingDueDate: number
  }
  actions: ExecutionActionDto[]
  decisions: ExecutionDecisionDto[]
  ruleSignals: RiskSignalDto[]
  agentSignals: RiskSignalDto[]
  latestReview: ExecutionReviewDto | null
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export class MeetingDomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'MeetingDomainError'
  }
}

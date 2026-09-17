export type Locale = 'zh-Hans' | 'en-US'
export type MeetingStatus = 'processing' | 'review_required' | 'confirmed' | 'failed'
export type ReviewStatus = 'pending' | 'confirmed' | 'edited' | 'rejected'
export type ActionStatus = 'pending_confirmation' | 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type Priority = 'low' | 'medium' | 'high'
export type RiskSeverity = 'low' | 'medium' | 'high'
export type RiskReviewStatus = 'open' | 'accepted' | 'dismissed' | 'resolved'
export type RiskType = 'overdue' | 'due_soon' | 'missing_owner' | 'missing_due_date' | 'ambiguous_commitment' | 'duplicate_action' | 'decision_conflict' | 'dependency_risk' | 'workload_concentration' | 'other'

export interface HostTheme {
  mode?: 'light' | 'dark'
  density?: 'default' | 'compact'
  tokens?: Record<string, string | number>
}

export interface HostContext {
  locale?: string
  manifest?: unknown
  payload?: { parameters?: Record<string, unknown> }
  initialQuery?: { page?: number; pageSize?: number; search?: string; parameters?: Record<string, unknown> }
  theme?: HostTheme
}

export interface BridgeMessage {
  channel: string
  protocolVersion: number
  instanceId?: string | null
  type?: string
  requestId?: string
  manifest?: unknown
  payload?: HostContext['payload']
  initialQuery?: HostContext['initialQuery']
  locale?: string
  theme?: HostTheme
  data?: unknown
  result?: unknown
  message?: string
}

export interface MeetingSummary {
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

export interface Decision {
  id: string
  itemKey: string
  statement: string
  evidenceQuote: string
  confidence: number
  reviewStatus: ReviewStatus
  sortOrder: number
}

export interface ActionItem {
  id: string
  itemKey: string
  task: string
  owner: string | null
  dueDate: string | null
  priority: Priority
  status: ActionStatus
  evidenceQuote: string
  confidence: number
  reviewStatus: ReviewStatus
  sortOrder: number
}

export interface MeetingDetail extends MeetingSummary {
  sourceText: string
  errorMessage: string | null
  reviewedAt: string | null
  decisions: Decision[]
  actionItems: ActionItem[]
}

export interface WorkbenchData {
  summary: { total: number; processing: number; reviewRequired: number; confirmed: number; failed: number }
  meetings: MeetingSummary[]
  selectedMeeting: MeetingDetail | null
  page: number
  pageSize: number
  total: number
  execution: ExecutionContext
}

export interface ExecutionAction extends ActionItem {
  meetingId: string
  meetingTitle: string
  meetingRevision: number
  ruleFlags: Array<'overdue' | 'due_soon' | 'missing_owner' | 'missing_due_date'>
}

export interface RiskSignal {
  id: string
  reviewId: string | null
  signalKey: string
  source: 'rule' | 'agent'
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

export interface ExecutionReview {
  id: string
  status: 'processing' | 'ready' | 'failed'
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

export interface ExecutionContext {
  summary: { total: number; pending: number; inProgress: number; completed: number; cancelled: number; overdue: number; dueSoon: number; missingOwner: number; missingDueDate: number }
  actions: ExecutionAction[]
  decisions: Array<{ id: string; meetingId: string; meetingTitle: string; statement: string; evidenceQuote: string; confidence: number }>
  ruleSignals: RiskSignal[]
  agentSignals: RiskSignal[]
  latestReview: ExecutionReview | null
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

declare global {
  interface Window {
    React: typeof import('react')
    ReactDOM: typeof import('react-dom') & {
      createRoot?: (container: Element | DocumentFragment | null) => { render(node: import('react').ReactNode): void }
      hydrateRoot: typeof import('react-dom/client').hydrateRoot
    }
    __meetingWorkbenchReload?: () => void
  }
}

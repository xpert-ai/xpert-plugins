export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }
export interface Scope {
  tenantId: string
  organizationId: string
  userId: string
}
export interface RuntimeStatus {
  status: 'ready' | 'unavailable'
  pythonVersion: string | null
  message: string
}
export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
export interface Dataset {
  id: string
  name: string
  rowCount: number
  amount: string
  currency: 'CNY'
  firstAt: string
  lastAt: string
  createdAt: string
  sheet: string
}
export interface Account {
  accountId: string
  name: string
  aliases: string[]
}
export interface Transfer {
  transactionId: string
  time: string
  payerAccount: string
  payerName: string
  payeeAccount: string
  payeeName: string
  amount: string
  summary: string
  sourceRow: number
}
export interface QueryPlan {
  kind?: 'summary' | 'transactions' | 'counterparties' | 'trend'
  direction?: 'in' | 'out' | 'net'
  accountIds?: string[]
  accountName?: string
  period?: 'all' | 'this_month' | 'last_month' | 'this_week' | 'last_week' | 'custom'
  startDate?: string
  endDate?: string
  minAmount?: string
  maxAmount?: string
  minExclusive?: boolean
  maxExclusive?: boolean
  counterpartyName?: string
  counterpartyAccountId?: string
  limit?: number
  granularity?: 'day' | 'week' | 'month'
}
export type QueryStatus = 'completed' | 'needs_clarification' | 'pending' | 'failed' | 'waiting_timeout' | 'answered'
export type ProcessingStage = 'submitted' | 'thinking' | 'reading_context' | 'finding_accounts' | 'analyzing' | 'replying' | 'completed' | 'failed'
export interface Conversation {
  id: string
  datasetId: string
  title: string
  createdAt: string
  updatedAt: string
  conversationId: string | null
  threadId: string | null
  turnCount: number
  running: boolean
}
export interface ChatTurn {
  queryId: string
  sessionId: string
  question: string
  createdAt: string
  updatedAt: string
  status: QueryStatus
  stage: ProcessingStage
  reply: string
  replyStatus: 'pending' | 'completed' | 'unconfirmed' | 'rejected' | 'unavailable'
  baseQueryId: string | null
  result: QueryResult
}
export interface AgentRuntimeRef {
  conversationId?: string
  threadId?: string
  executionId?: string
}
export interface PreparedQuestion {
  queryId: string
  datasetId: string
  question: string
  sessionId: string | null
  baseQueryId: string | null
  conversationId: string | null
  threadId: string | null
}
export interface QueryResult {
  status: QueryStatus
  queryId: string
  question?: string
  kind?: string
  direction?: string
  amount?: string
  count?: number
  currency?: string
  groups?: { label: string; amount: string; count: number; accountId?: string }[]
  groupsTruncated?: boolean
  accounts?: Account[]
  window?: { startInclusive: string | null; endExclusive: string | null; timezone: string }
  plan?: QueryPlan
  dataset?: Dataset
  evidence?: Page<Transfer>
  policy?: string
  referenceTime?: string
  message?: string
  candidates?: Account[]
  error?: string
}
export interface Question {
  queryId: string
  question: string
  status: string
  created_at: string
  updated_at: string
  error: string | null
  baseQueryId?: string | null
}
export interface Context {
  currentDataset: Dataset | null
  datasets: Page<Dataset>
  now: string
  timezone: string
}
export interface Workbench {
  context: Context
  preview?: Page<Transfer>
  history?: Page<Question>
  result?: QueryResult
  dataset?: Dataset
  session?: Conversation
  sessions?: Page<Conversation>
  turns?: Page<ChatTurn>
}
export interface WorkerError {
  code: string
  message: string
  details?: JsonValue
}
export type WorkerReply<T> = { ok: true; data: T } | { ok: false; error: WorkerError }

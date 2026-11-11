/**
 * Typed contract between the Supplier Delivery Workbench remote view and its host adapter.
 *
 * The same shapes are produced by the preview fixture and by the production view provider,
 * so the React components never know where a response came from. Keep this file type-only:
 * it is imported by the browser bundle as well as by server code.
 */

export type ReplyStatus = 'received' | 'parsing' | 'pending_review' | 'confirmed' | 'needs_followup' | 'failed'
export type ChangeType = 'delay' | 'advance' | 'unchanged' | 'partial'
export type ProposalDecision = 'pending' | 'accepted' | 'edited' | 'rejected'
export type EvidenceField = 'poNumber' | 'proposedDate' | 'proposedQuantity' | 'batches' | 'reason'

export interface BatchDto {
  quantity: number
  /** YYYY-MM-DD */
  date: string
}

export interface EvidenceDto {
  field: EvidenceField
  quote: string
  /** Offsets into the reply raw text, computed on the server. */
  start: number
  end: number
}

export interface OverviewDto {
  orderLineCount: number
  delayedLineCount: number
  replyCounts: Record<ReplyStatus, number>
  /** Replies still parsing after this many minutes are shown as incomplete. */
  parseTimeoutMinutes: number
}

export interface ReplySummaryDto {
  id: string
  /** First characters of the raw text, already trimmed by the server. */
  preview: string
  /** Supplier of the current attempt's first order line sorted by (poNumber, lineNo), or null before parsing. */
  supplierName: string | null
  status: ReplyStatus
  parseTimedOut: boolean
  proposalCount: number
  createdAt: string
  updatedAt: string
}

export interface ProposalDto {
  id: string
  orderLineId: string
  poNumber: string
  lineNo: number
  supplierName: string
  materialName: string
  unit: string
  orderedQuantity: number
  originalDate: string
  /** Promised date of the order line when the assistant made this proposal; the change is relative to it. */
  baseDate: string
  /** Promised date of the order line at the time this proposal is read. */
  currentDate: string
  changeType: ChangeType
  proposedDate: string | null
  proposedQuantity: number | null
  batches: BatchDto[]
  reason: string | null
  evidence: EvidenceDto[]
  /** Model self-reported confidence between 0 and 1; informational only. */
  confidence: number
  decision: ProposalDecision
  finalDate: string | null
  finalQuantity: number | null
  /** True when the proposal is not yet written to its order and the order line changed after it was parsed. */
  stale: boolean
}

export interface ReplyDetailDto {
  id: string
  /** Review version: changes whenever the reply or any of its proposals changes. Send it back as `expectedRevision`. */
  revision: number
  rawText: string
  status: ReplyStatus
  /** Confirmation has started but has not finished. */
  confirmationInProgress: boolean
  parseTimedOut: boolean
  parseAttempt: number
  parseRequestedAt: string | null
  /** Stable language-neutral code such as `no_delivery_info`; the view localizes it. */
  failureCode: string | null
  /** Free text written by the assistant; shown as-is, never used as a translation key. */
  failureMessage: string | null
  createdAt: string
  confirmedAt: string | null
  confirmedBy: string | null
  confirmedByName: string | null
  proposals: ProposalDto[]
}

export interface OrderLineSummaryDto {
  id: string
  poNumber: string
  lineNo: number
  supplierName: string
  materialCode: string
  materialName: string
  quantity: number
  unit: string
  originalDate: string
  promisedDate: string
  /** promisedDate minus originalDate, in days; negative means earlier. */
  delayDays: number
}

export interface ChangeLogDto {
  id: string
  replyId: string
  oldDate: string
  newDate: string
  aiDate: string | null
  batches: BatchDto[]
  confirmedBy: string
  confirmedByName: string | null
  confirmedAt: string
}

export interface OrderLineDetailDto extends OrderLineSummaryDto {
  revision: number
  changes: ChangeLogDto[]
}

export interface PageDto<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** `requestData` query.parameters.table values. Parameters stay scalar per the view query contract. */
export type WorkbenchTable = 'overview' | 'replies' | 'reply' | 'orderLines' | 'orderLine'

export interface WorkbenchDataResponse {
  overview: OverviewDto
  replies: PageDto<ReplySummaryDto>
  reply: ReplyDetailDto
  orderLines: PageDto<OrderLineSummaryDto>
  orderLine: OrderLineDetailDto
}

export type WorkbenchActionKey =
  | 'import_demo_data'
  | 'create_reply'
  | 'request_parse'
  | 'resend_parse'
  | 'retry_parse'
  | 'decide_proposal'
  | 'confirm_reply'

export interface WorkbenchActionInput {
  import_demo_data: Record<string, never>
  create_reply: { rawText: string }
  request_parse: { locale: string }
  resend_parse: { locale: string }
  retry_parse: { locale: string }
  decide_proposal: { decision: ProposalDecision; finalDate?: string; finalQuantity?: number }
  confirm_reply: { expectedRevision: number }
}

export interface WorkbenchActionData {
  import_demo_data: { created: number; skipped: number }
  create_reply: { replyId: string; created: boolean }
  request_parse: { replyId: string; parseAttempt: number }
  resend_parse: { replyId: string; parseAttempt: number }
  retry_parse: { replyId: string; parseAttempt: number }
  decide_proposal: { proposalId: string; replyId: string }
  confirm_reply: { replyId: string; appliedCount: number }
}

/** A host command the view should invoke after a successful action, e.g. opening the assistant chat. */
export interface WorkbenchClientCommand {
  commandKey: 'assistant.chat.send_message'
  payload: Record<string, unknown>
}

export type WorkbenchActionResult<K extends WorkbenchActionKey> =
  | { success: true; data: WorkbenchActionData[K]; command?: WorkbenchClientCommand }
  | { success: false; code: string; params?: Record<string, string | number> }

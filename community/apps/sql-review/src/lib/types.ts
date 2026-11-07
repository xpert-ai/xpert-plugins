/** SQL review domain types: state machine, finding categories, decision records. */

export type SqlReviewDialect = 'postgresql' | 'mysql'

/**
 * Case state machine:
 *   draft -> pending_ai -> pending_confirmation -> confirmed | rejected
 *   any  -> failed (retryable, returns to pending_ai)
 */
export type SqlReviewCaseStatus =
  | 'draft'
  | 'pending_ai'
  | 'pending_confirmation'
  | 'confirmed'
  | 'rejected'
  | 'failed'

export const SqlReviewCaseStatusMachine: Record<SqlReviewCaseStatus, SqlReviewCaseStatus[]> = {
  draft: ['pending_ai'],
  pending_ai: ['pending_confirmation', 'failed'],
  pending_confirmation: ['confirmed', 'rejected', 'failed'],
  confirmed: [],
  rejected: [],
  failed: ['pending_ai']
}

export type SqlReviewSourceType = 'agent_chat' | 'workbench_form'

export type SqlReviewFindingSource = 'rule' | 'ai'

export type SqlReviewFindingCategory =
  | 'index'    // missing index / index unfriendly
  | 'scan'     // full table scan risk
  | 'spec'     // naming / style / convention
  | 'perf'     // unbounded result / expensive pattern
  | 'injection' // unsafe pattern (concat, dynamic order)
  | 'correctness' // semantic risk (implicit cast, ambiguous join)

export type SqlReviewSeverity = 'high' | 'medium' | 'low'

export type SqlReviewFindingDecision = 'pending' | 'accepted' | 'rejected'

export interface SqlReviewFindingPayload {
  source: SqlReviewFindingSource
  ruleId?: string
  category: SqlReviewFindingCategory
  severity: SqlReviewSeverity
  /** Human-readable location, e.g. "line 3, WHERE clause". */
  location: string
  /** Original SQL fragment quoted as evidence. */
  originalText: string
  explanation: string
  suggestion: string
}

export interface SqlReviewAiReport {
  summary: string
  confidence: number
  findings: SqlReviewFindingPayload[]
}

export interface SqlReviewCaseSnapshot {
  caseNo: string
  title?: string
  status: SqlReviewCaseStatus
  dbDialect: SqlReviewDialect
  sqlText: string
  ddlContext?: string
  summary?: string
  confidence?: number
  retryCount: number
  lastError?: string
  findings: Array<SqlReviewFindingPayload & { seq: number; decision: SqlReviewFindingDecision }>
}

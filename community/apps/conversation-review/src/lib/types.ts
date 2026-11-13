/**
 * Business state of one customer-conversation review.
 *
 * draft      — record created, AI has not run yet
 * processing — the analysis request has been handed to the Assistant
 * completed  — AI produced a structured result, waiting for the salesperson
 * confirmed  — the salesperson edited/accepted the result and saved it
 * failed     — the AI run could not produce a result; retry is offered
 */
export type ConversationReviewStatus = 'draft' | 'processing' | 'completed' | 'confirmed' | 'failed'

/** How strong the customer's buying intent looks, as judged from this one conversation. */
export type ConversationIntentLevel = 'high' | 'medium' | 'low' | 'unknown'

export type ConversationIssueSeverity = 'high' | 'medium' | 'low'

/** Which taxonomy an issue belongs to: the customer's hesitation, or the salesperson's wording. */
export type ConversationIssueKind = 'concern' | 'risk'

/**
 * Who produced this classification. `rule` is a deterministic keyword/phrase match — see
 * `rule-check.ts` — kept separate from `model` so the workbench never presents a regex hit as if
 * it were the model's own judgement, and so it stays visible even if the underlying model changes.
 */
export type ConversationIssueSource = 'model' | 'rule'

/**
 * One classified issue found in a conversation.
 *
 * `category` is what makes the dashboard possible — it comes from a fixed vocabulary so issues
 * from different conversations can be counted together. `evidence` is the quote it was derived
 * from, so every number on the dashboard can be traced back to the sentence that produced it;
 * without it the classification is unfalsifiable and the salesperson cannot correct it.
 */
export interface ConversationIssue {
  category: string
  severity: ConversationIssueSeverity
  /** Plain-language statement of the issue. */
  detail?: string
  /** Verbatim quote from the conversation that supports the classification. */
  evidence?: string
  /** Defaults to 'model' when absent — only the deterministic rule check sets 'rule'. */
  source?: ConversationIssueSource
}

/** 0-100 per dimension, keyed by `SCORE_DIMENSIONS`. Higher is always better, including risk. */
export type ConversationReviewScores = Record<string, number>

/**
 * The structured analysis. The same shape is produced by the AI (`aiResult`) and stored again
 * after human edit + confirmation (`confirmedResult`), so the two can be compared later.
 */
export interface ConversationReviewAnalysis {
  intentLevel?: ConversationIntentLevel
  summary?: string
  scores?: ConversationReviewScores
  requirements?: string[]
  concerns?: ConversationIssue[]
  risks?: ConversationIssue[]
  missingInformation?: string[]
  nextActions?: string[]
  /**
   * Items from a *previous* confirmed conversation with the same customer that this conversation
   * did not close — a follow-up that was promised and still has not happened, a question the
   * customer has now asked twice, information that was outstanding last time and still is.
   *
   * This is the one field that cannot be derived from the conversation under review alone; it
   * exists so that what the agent learned from `getCustomerHistory` is persisted and reviewable,
   * rather than only appearing in the chat reply.
   */
  carriedOver?: string[]
}

/** Tenant / organization / user scope resolved from the host — never from the iframe. */
export interface ConversationReviewScope {
  tenantId?: string
  organizationId?: string
  userId?: string
  assistantId?: string
  conversationId?: string
}

export interface CreateConversationReviewInput {
  customerName: string
  conversation: string
  /** Where this conversation came from. Defaults to manual entry. */
  source?: ConversationSource
  /** Id in the source system, when there is one. See `externalId` on the entity. */
  externalId?: string
  /** The customer's id in the source system, when there is one. See `customer-identity.ts`. */
  customerExternalId?: string
  /** When the conversation actually happened, which is not when it was imported. */
  occurredAt?: Date
}

// ------------------------------------------------------------------ ingestion

/**
 * Which adapter a record arrived through. `manual` is the workbench form; the rest are batch
 * ingestion. Kept on the record so the dashboard and the README can be honest about provenance,
 * and so a re-import can tell its own rows apart from hand-filed ones.
 */
export type ConversationSource = 'manual' | 'import:json' | 'import:csv' | 'import:excel'

export type ConversationImportFormat = 'json' | 'csv' | 'excel'

/** One conversation as it comes out of a source adapter, before business validation. */
export interface ConversationImportRow {
  customerName?: string
  conversation?: string
  externalId?: string
  /** The customer's id in the source system, when the export carries one. */
  customerExternalId?: string
  occurredAt?: Date
}

/** A row that was read but not imported, with the reason a user can act on. */
export interface ConversationImportSkip {
  /** 1-based position among the data rows, so it can be found in the source file. */
  row: number
  customerName?: string
  reason: string
}

export interface ConversationImportResult {
  imported: number
  /** Rows matching an `externalId` already imported, or repeated within the same file. */
  duplicates: number
  skipped: ConversationImportSkip[]
  recordIds: string[]
}

export interface SaveAnalysisInput extends ConversationReviewAnalysis {
  recordId: string
}

export interface ConfirmReviewInput extends ConversationReviewAnalysis {
  recordId: string
  expectedRevision?: number
}

/**
 * One earlier conversation with the same customer, as handed to the agent.
 *
 * Deliberately not the stored record: the original text, the scorecard breakdown and the evidence
 * quotes are left out. The agent is looking back for what was left open, and a full replay of
 * every past conversation would push the one under review out of the model's attention.
 */
export interface ConversationHistoryItem {
  id: string
  /** When that conversation happened — what the agent should cite when referring back to it. */
  occurredAt?: Date
  confirmedAt?: Date
  intentLevel?: ConversationIntentLevel
  /** Mean of the scored axes, or null when that conversation carried no scorecard. */
  totalScore: number | null
  summary?: string
  /** What the salesperson committed to do after that conversation. */
  nextActions?: string[]
  /** What was still unconfirmed when that conversation was signed off. */
  missingInformation?: string[]
  /** Wording risks, without the evidence quotes — category and statement are enough to compare. */
  risks?: { category: string; severity: ConversationIssueSeverity; detail?: string }[]
  carriedOver?: string[]
}

export interface ConversationReviewListQuery {
  recordId?: string
  status?: ConversationReviewStatus
  /** Dashboard drill-down, encoded as `concern:price` / `risk:over_promise`. */
  issue?: string
  intentLevel?: ConversationIntentLevel
  search?: string
  page?: number
  pageSize?: number
}

// ------------------------------------------------------------------ dashboard

export interface ConversationIssueBucket {
  kind: ConversationIssueKind
  category: string
  /** Total occurrences, one conversation can contribute several. */
  count: number
  /** How many conversations mention it at all — the number a salesperson actually reads. */
  recordCount: number
  highCount: number
}

export interface ConversationIntentBucket {
  level: ConversationIntentLevel
  count: number
}

/**
 * Agreement between the raw AI output and what the salesperson signed off on.
 *
 * This is a human-modification rate, not ground truth: a field the salesperson did not touch is
 * counted as agreement even though they may simply not have checked it. It is a usable quality
 * signal precisely because it needs no separate labelling pass, and it is reported as such.
 */
export interface ConversationReviewAccuracy {
  /** Confirmed records that have both an AI result and a confirmed result. */
  sampleSize: number
  intentAgreed: number
  /** Confirmed without changing a single field. */
  acceptedAsIs: number
  /** Per-field count of records where the human changed the AI's value. */
  fieldEdits: Record<string, number>
}

export interface ConversationScoreAverage {
  dimension: string
  /** Rounded mean over `sampleSize` records; 0 when nothing has been scored yet. */
  average: number
  sampleSize: number
}

export interface ConversationTrendPoint {
  /** Local `YYYY-MM-DD` of the day the conversation was filed. */
  date: string
  count: number
  /** Mean total score that day, or null when nothing on that day carried scores. */
  avgScore: number | null
  highIntent: number
}

/**
 * "Today" counts, separate from `trend` on purpose: `trend` bucket by `occurredAt` to describe
 * sales activity, so a bulk import lands on the day the conversations happened, not today. That
 * makes it unable to answer "how many records did we upload/touch today" — a question about the
 * tool's own ingestion, not about the customer's calendar. These two fields answer that instead.
 */
export interface ConversationActivityToday {
  /** Records whose `createdAt` is today, local time — "how many were uploaded/filed today." */
  createdToday: number
  /** Records whose `updatedAt` is today, local time — includes edits/retries/confirms on older records. */
  updatedToday: number
}

export interface ConversationReviewInsights {
  statusCounts: Record<ConversationReviewStatus | 'total', number>
  /** Records that carry a result at all — the denominator for every distribution below. */
  analyzed: number
  intentDistribution: ConversationIntentBucket[]
  concerns: ConversationIssueBucket[]
  risks: ConversationIssueBucket[]
  scoreAverages: ConversationScoreAverage[]
  trend: ConversationTrendPoint[]
  accuracy: ConversationReviewAccuracy
  activityToday: ConversationActivityToday
}

/** What `conversation_review_get_stats` hands the agent for team/aggregate-level questions. */
export interface ConversationReviewStats {
  totalRecords: number
  /** Distinct customers, grouped the same way `getCustomerHistory` resolves identity. */
  totalCustomers: number
  insights: ConversationReviewInsights
}

/**
 * One earlier conversation surfaced by a customer-name search — deliberately thinner than
 * `ConversationHistoryItem`: this is for the agent to relay to the user in a sentence or two
 * ("last contact 9/15, status confirmed"), not to analyse against.
 */
export interface ConversationCustomerSearchRecord {
  recordId: string
  status: ConversationReviewStatus
  occurredAt?: Date
  summary?: string
}

/** One distinct customer matching a search query — see CUSTOMER_SEARCH_DEFAULT_LIMIT. */
export interface ConversationCustomerSearchMatch {
  customerName: string
  recordCount: number
  confirmedCount: number
  latestStatus: ConversationReviewStatus
  latestOccurredAt?: Date
  /** Most recent records first, capped small — enough to describe, not to dump the account. */
  recentRecords: ConversationCustomerSearchRecord[]
}

export interface ConversationCustomerSearchResult {
  query: string
  /** Distinct customers found, before `limit` is applied — tells the agent whether more exist. */
  totalMatches: number
  matches: ConversationCustomerSearchMatch[]
}

export interface ConversationReviewListItem {
  id: string
  customerName: string
  /** Resolved identity this record is grouped under — see `customer-identity.ts`. */
  customerId?: string
  status: ConversationReviewStatus
  intentLevel?: ConversationIntentLevel
  summary?: string
  conversationPreview: string
  errorMessage?: string
  retryCount: number
  revision: number
  source: ConversationSource
  /** When the conversation happened; falls back to when the record was filed. */
  occurredAt?: Date
  createdAt?: Date
  updatedAt?: Date
  /**
   * Which version of the deterministic rule set (`RULE_VERSION` in `rule-check.ts`) produced this
   * record's rule-based risk hits. Set once, when the AI analysis is saved; absent on a `draft`
   * record that has never been analysed. Shown as a tag in both the record detail and the history
   * list so a rule change is visible on old records instead of silently reinterpreting them.
   */
  ruleVersion?: string
}

export interface ConversationReviewDetailItem extends ConversationReviewListItem {
  conversation: string
  aiResult?: ConversationReviewAnalysis
  confirmedResult?: ConversationReviewAnalysis
  analyzedAt?: Date
  confirmedAt?: Date
}

export const CONVERSATION_REVIEW_ANALYSIS_FIELDS = [
  'intentLevel',
  'summary',
  'scores',
  'requirements',
  'concerns',
  'risks',
  'missingInformation',
  'nextActions',
  'carriedOver'
] as const

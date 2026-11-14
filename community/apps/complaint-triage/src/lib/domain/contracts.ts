import { z } from 'zod/v3'
import { CATEGORIES, CHANNELS, CONTENT_MAX_LENGTH, CONTENT_MIN_LENGTH, SENTIMENTS, SEVERITIES } from './policy.js'

// ---- scope ---------------------------------------------------------------------------------------

// Tickets are business records shared by the customer-service team of one organization.
export const scopeSchema = z.object({
  tenantId: z.string().min(1),
  organizationId: z.string(),
  userId: z.string().min(1)
})
export type TicketScope = z.infer<typeof scopeSchema>

// ---- state machine -------------------------------------------------------------------------------

export const TICKET_STATUSES = ['draft', 'analyzing', 'pending_review', 'analysis_failed', 'confirmed'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const ATTEMPT_STATUSES = ['running', 'succeeded', 'failed', 'superseded'] as const
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number]

// Statuses from which a (re-)analysis may start. `analyzing` is only re-enterable after it expired.
export const ANALYZABLE_STATUSES: readonly TicketStatus[] = ['draft', 'analysis_failed', 'pending_review']

export const FAILURE_CODES = [
  'timeout', // no tool result arrived within ANALYSIS_TIMEOUT_MS (model/run failure is invisible to the view)
  'dispatch_failed', // the Workbench could not hand the request to the Assistant chat
  'model_reported', // the Assistant decided the text cannot be triaged and said why
  'simulated_downstream_failure' // fault injection used to rehearse the failure path
] as const
export type FailureCode = (typeof FAILURE_CODES)[number]

export const FAULT_INJECTIONS = ['none', 'first_attempt'] as const
export type FaultInjection = (typeof FAULT_INJECTIONS)[number]

// ---- errors --------------------------------------------------------------------------------------

export const ERROR_CODES = [
  'not_found',
  'invalid_input',
  'invalid_state',
  'already_confirmed',
  'stale_view',
  'conflict'
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

// Stable, language-neutral codes; the Workbench localizes them at the UI boundary.
export class TriageError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string
  ) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'TriageError'
  }
}

// ---- Workbench inputs ----------------------------------------------------------------------------

export const createTicketSchema = z
  .object({
    content: z.string().trim().min(CONTENT_MIN_LENGTH).max(CONTENT_MAX_LENGTH),
    channel: z.enum(CHANNELS),
    customerName: z.string().trim().max(60).optional(),
    faultInjection: z.enum(FAULT_INJECTIONS).default('none')
  })
  .strict()
export type CreateTicketInput = z.infer<typeof createTicketSchema>

export const requestAnalysisSchema = z.object({ ticketId: z.string().uuid() }).strict()

export const reportDispatchFailureSchema = z
  .object({
    ticketId: z.string().uuid(),
    attemptNo: z.number().int().positive(),
    reason: z.string().trim().max(300).optional()
  })
  .strict()

export const resolutionSchema = z
  .object({
    category: z.enum(CATEGORIES),
    severity: z.enum(SEVERITIES),
    summary: z.string().trim().min(1).max(300),
    handling: z.string().trim().min(1).max(1000),
    replyDraft: z.string().trim().min(1).max(2000),
    reviewerNote: z.string().trim().max(500).optional()
  })
  .strict()
export type Resolution = z.infer<typeof resolutionSchema>

export const confirmTicketSchema = z
  .object({
    ticketId: z.string().uuid(),
    // The attempt the reviewer was looking at. A newer analysis must be reviewed again before confirming.
    attemptNo: z.number().int().positive(),
    resolution: resolutionSchema
  })
  .strict()
export type ConfirmTicketInput = z.infer<typeof confirmTicketSchema>

// ---- Agent tool inputs: the model supplies judgments only ------------------------------------------
// Deliberately absent: tenant/organization/user ids (runtime context), the attempt number and status
// (server state), and quoted text (restored by the server from sentence ids).

const evidenceIdsSchema = z
  .array(z.string().trim().min(1).max(8))
  .max(6)
  .describe('Sentence ids copied from complaint_get_ticket, for example ["s2","s5"]. Never quote text here.')

export const getTicketSchema = z.object({
  ticketNo: z.string().trim().min(1).max(40).describe('Ticket number such as TCK-20260917-AB12, as given by the user.')
})

export const saveAnalysisSchema = z.object({
  ticketNo: z.string().trim().min(1).max(40).describe('The ticket number passed to complaint_get_ticket.'),
  category: z.enum(CATEGORIES).describe('Exactly one category key from policy.categories.'),
  severity: z.enum(SEVERITIES).describe('Severity graded strictly by policy.severities.'),
  severityReason: z.string().trim().min(1).max(300).describe('Which policy rule applies and why, in the language of the complaint.'),
  severityEvidenceIds: evidenceIdsSchema,
  sentiment: z.enum(SENTIMENTS),
  summary: z.string().trim().min(1).max(300).describe('One or two sentences a supervisor can read in five seconds.'),
  customerDemands: z.array(z.string().trim().min(1).max(120)).max(5).describe('What the customer asks for. Empty when nothing is requested.'),
  keyFacts: z
    .array(
      z.object({
        fact: z.string().trim().min(1).max(200).describe('One extracted fact: product, order number, date, amount, symptom...'),
        evidenceIds: evidenceIdsSchema
      })
    )
    .min(1)
    .max(8),
  suggestedActions: z.array(z.string().trim().min(1).max(200)).min(1).max(5).describe('Concrete next steps for the service team, most important first.'),
  replyDraft: z.string().trim().min(1).max(1500).describe('A polite reply to the customer in the language of the complaint. Promise nothing the policy does not allow.')
})
export type SaveAnalysisInput = z.infer<typeof saveAnalysisSchema>

export const reportFailureSchema = z.object({
  ticketNo: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(1).max(300).describe('Why this text cannot be triaged, in the language of the complaint.')
})
export type ReportFailureInput = z.infer<typeof reportFailureSchema>

// ---- persisted analysis and DTOs -------------------------------------------------------------------

export interface Evidence {
  sentenceId: string
  quote: string
}

export interface EvidencedFact {
  fact: string
  evidence: Evidence[]
  // False when the model cited no sentence that exists in the complaint: the reviewer must double-check.
  evidenceVerified: boolean
}

// What the AI suggested, with every quote restored server-side from the stored complaint.
export interface ComplaintAnalysis {
  attemptNo: number
  category: z.infer<typeof saveAnalysisSchema>['category']
  severity: z.infer<typeof saveAnalysisSchema>['severity']
  severityReason: string
  severityEvidence: Evidence[]
  sentiment: z.infer<typeof saveAnalysisSchema>['sentiment']
  summary: string
  customerDemands: string[]
  keyFacts: EvidencedFact[]
  suggestedActions: string[]
  replyDraft: string
  unknownEvidenceIds: string[]
  analyzedAt: string
}

export interface AttemptDto {
  attemptNo: number
  status: AttemptStatus
  failureCode: FailureCode | null
  failureMessage: string | null
  startedAt: string
  finishedAt: string | null
}

export interface TicketListItem {
  id: string
  ticketNo: string
  channel: z.infer<typeof createTicketSchema>['channel']
  customerName: string | null
  excerpt: string
  status: TicketStatus
  severity: z.infer<typeof saveAnalysisSchema>['severity'] | null
  attemptCount: number
  createdAt: string
  updatedAt: string
}

export interface TicketDetail extends TicketListItem {
  content: string
  sentences: { id: string; text: string }[]
  faultInjection: FaultInjection
  failureCode: FailureCode | null
  failureMessage: string | null
  analysisRequestedAt: string | null
  analysisTimeoutMs: number
  analysis: ComplaintAnalysis | null
  resolution: Resolution | null
  confirmedAt: string | null
  attempts: AttemptDto[]
}

import { z } from 'zod/v3'

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + 'T00:00:00Z')
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, 'Invalid calendar date')
const cents = z.number().int().min(0).max(100_000_000_000)
export const inputSchema = z
  .object({
    customerName: z.string().trim().min(1).max(100),
    invoiceNumber: z.string().trim().min(1).max(100),
    outstandingCents: cents.refine((n) => n > 0, 'Outstanding amount must be positive'),
    dueDate: dateSchema,
    communicationDate: dateSchema,
    source: z
      .string()
      .max(12000)
      .refine((value) => value.trim().length >= 5, 'Source is too short')
  })
  .strict()
const lineIds = z.array(z.number().int().min(1)).min(1).max(20)
export const promiseSchema = z
  .object({
    amountCents: cents.nullable().describe('Amount in CNY cents, null when not explicitly stated.'),
    paymentDate: dateSchema
      .nullable()
      .describe('YYYY-MM-DD, resolved using the communication date; null when ambiguous.'),
    condition: z.string().trim().max(300).describe('Payment prerequisite, or empty when unconditional.'),
    evidenceLineIds: lineIds.describe('Source line IDs returned by the read tool. Never invent quotes.')
  })
  .strict()
export const analysisSchema = z
  .object({
    summary: z.string().trim().min(1).max(500),
    promises: z.array(promiseSchema).max(10),
    blockers: z
      .array(z.object({ description: z.string().trim().min(1).max(300), evidenceLineIds: lineIds }).strict())
      .max(10),
    questions: z.array(z.string().trim().min(1).max(300)).max(10),
    suggestedAction: z.string().trim().min(1).max(500)
  })
  .strict()
export const confirmationSchema = z
  .object({
    analysis: analysisSchema,
    nextFollowupDate: dateSchema,
    note: z.string().trim().max(1000)
  })
  .strict()
export type CaseInput = z.infer<typeof inputSchema>
export type Analysis = z.infer<typeof analysisSchema>
export type Confirmation = z.infer<typeof confirmationSchema>
export type Scope = { tenantId: string; organizationId: string; userId: string; assistantId: string }
export type Status = 'draft' | 'processing' | 'review' | 'confirmed' | 'failed'
export type Attempt = {
  id: string
  startedAt: string
  finishedAt: string | null
  status: 'processing' | 'success' | 'failed'
  error: string | null
}
export type CaseState = {
  input: CaseInput
  status: Status
  revision: number
  attemptId: string | null
  attempts: Attempt[]
  aiResult: Analysis | null
  confirmedResult: Confirmation | null
  confirmedAt: string | null
  error: string | null
}
export class DomainError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'DomainError'
  }
}
export function requireScope(scope: Partial<{ [K in keyof Scope]: string | null }>): Scope {
  const parsed = z
    .object({
      tenantId: z.string().min(1),
      organizationId: z.string().min(1),
      userId: z.string().min(1),
      assistantId: z.string().min(1)
    })
    .safeParse(scope)
  if (!parsed.success) throw new DomainError('missing_scope')
  return parsed.data
}
export function sourceLines(source: string) {
  return source.split(/\r?\n/).map((text, index) => ({ id: index + 1, text }))
}
export function validateEvidence(input: CaseInput, analysis: Analysis) {
  const lines = sourceLines(input.source)
  for (const finding of [...analysis.promises, ...analysis.blockers]) {
    if (
      new Set(finding.evidenceLineIds).size !== finding.evidenceLineIds.length ||
      finding.evidenceLineIds.some((id) => !lines[id - 1]?.text.trim())
    ) {
      throw new DomainError('invalid_evidence')
    }
  }
  return analysis
}
export function warnings(input: CaseInput, analysis: Analysis) {
  const result: string[] = []
  const total = analysis.promises.reduce((sum, p) => sum + (p.amountCents ?? 0), 0)
  if (total > input.outstandingCents) result.push('amount_exceeds_balance')
  if (total < input.outstandingCents) result.push('balance_not_fully_scheduled')
  if (!analysis.promises.length) result.push('no_explicit_promise')
  if (analysis.promises.some((p) => p.amountCents === null || p.paymentDate === null)) result.push('incomplete_promise')
  if (analysis.promises.some((p) => p.paymentDate !== null && p.paymentDate < input.communicationDate))
    result.push('date_before_communication')
  if (analysis.promises.some((p) => p.condition)) result.push('conditional_payment')
  return result
}
export function newState(input: CaseInput): CaseState {
  return {
    input: inputSchema.parse(input),
    status: 'draft',
    revision: 0,
    attemptId: null,
    attempts: [],
    aiResult: null,
    confirmedResult: null,
    confirmedAt: null,
    error: null
  }
}
export function checkRevision(state: CaseState, revision: number) {
  if (state.revision !== revision) throw new DomainError('revision_conflict')
}
export function recoverTimeout(state: CaseState, now: Date) {
  const active = state.attempts.find((a) => a.id === state.attemptId)
  if (state.status === 'processing' && active && now.getTime() - Date.parse(active.startedAt) > 120000) {
    active.status = 'failed'
    active.finishedAt = now.toISOString()
    active.error = 'analysis_timeout'
    state.status = 'failed'
    state.error = 'analysis_timeout'
    state.revision++
    return true
  }
  return false
}
export function begin(state: CaseState, revision: number, id: string, now: Date) {
  checkRevision(state, revision)
  if (state.status === 'processing' || state.status === 'confirmed') throw new DomainError('invalid_state')
  state.status = 'processing'
  state.attemptId = id
  state.error = null
  state.aiResult = null
  state.attempts.push({ id, startedAt: now.toISOString(), finishedAt: null, status: 'processing', error: null })
  state.attempts = state.attempts.slice(-20)
  state.revision++
}
export function submit(state: CaseState, attemptId: string, analysis: Analysis, now: Date) {
  if (state.attemptId !== attemptId) throw new DomainError('stale_attempt')
  if (
    state.status === 'review' &&
    JSON.stringify(analysisSchema.parse(state.aiResult)) === JSON.stringify(analysisSchema.parse(analysis))
  )
    return
  if (state.status !== 'processing') throw new DomainError('invalid_state')
  state.aiResult = validateEvidence(state.input, analysisSchema.parse(analysis))
  state.status = 'review'
  state.error = null
  const attempt = state.attempts.find((a) => a.id === attemptId)!
  attempt.status = 'success'
  attempt.finishedAt = now.toISOString()
  state.revision++
}
export function fail(state: CaseState, attemptId: string, code: string, now: Date) {
  if (state.attemptId !== attemptId) throw new DomainError('stale_attempt')
  if (state.status === 'failed') return
  if (state.status !== 'processing') throw new DomainError('invalid_state')
  state.status = 'failed'
  state.error = code
  const attempt = state.attempts.find((a) => a.id === attemptId)!
  attempt.status = 'failed'
  attempt.error = code
  attempt.finishedAt = now.toISOString()
  state.revision++
}
export function confirm(state: CaseState, revision: number, result: Confirmation, now: Date) {
  if (
    state.status === 'confirmed' &&
    JSON.stringify(confirmationSchema.parse(state.confirmedResult)) === JSON.stringify(confirmationSchema.parse(result))
  )
    return
  checkRevision(state, revision)
  if (state.status !== 'review') throw new DomainError('invalid_state')
  const parsed = confirmationSchema.parse(result)
  validateEvidence(state.input, parsed.analysis)
  if (warnings(state.input, parsed.analysis).includes('amount_exceeds_balance'))
    throw new DomainError('amount_exceeds_balance')
  if (parsed.nextFollowupDate < state.input.communicationDate) throw new DomainError('invalid_followup_date')
  state.confirmedResult = parsed
  state.confirmedAt = now.toISOString()
  state.status = 'confirmed'
  state.revision++
}

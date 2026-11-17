import { z } from 'zod/v3'
import { FAILURE_CODES } from './case.js'
import { CATEGORY_IDS } from './categories.js'

export const MAX_EVALUATION_SAMPLES = 10
export const MODEL_TIMEOUT_MS = 60_000
export const ATTEMPT_LEASE_MS = 90_000
export const MAX_ATTEMPTS = 3
export const VARIANTS = ['a', 'b'] as const
export const categoryIdSchema = z.string().refine(id => CATEGORY_IDS.includes(id), 'Unknown category')
export const variantSchema = z.enum(VARIANTS)
export const verdictSchema = z.enum(['a', 'b', 'tie', 'neither'])
export const runStatusSchema = z.enum(['ready', 'running', 'completed', 'reviewed'])
export const attemptStatusSchema = z.enum(['pending', 'running', 'succeeded', 'failed'])
export const evaluationFailureSchema = z.enum(FAILURE_CODES)
/** Used for intake until a person adopts a version in an acceptance run. */
export const DEFAULT_PROMPT = '判断照片中的设施问题，选择最可能的类别。'
/** Requested for every classification call, live or under acceptance. */
export const MODEL_OPTIONS = { temperature: 0, max_tokens: 512, maxRetries: 0 } as const
export const createRunSchema = z.object({
  requestKey: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  sampleIds: z.array(z.string().uuid()).min(1).max(MAX_EVALUATION_SAMPLES)
    .refine(ids => new Set(ids).size === ids.length, 'Duplicate samples'),
  promptA: z.string().trim().min(1).max(6000),
  promptB: z.string().trim().min(1).max(6000)
}).strict()
export const runIdSchema = z.object({ runId: z.string().uuid() }).strict()
export const runRevisionSchema = runIdSchema.extend({ revision: z.number().int().positive() }).strict()
export const reviewSampleSchema = runRevisionSchema.extend({
  sampleId: z.string().uuid(), verdict: verdictSchema, note: z.string().trim().max(1000)
}).strict()
export const decideRunSchema = runRevisionSchema.extend({
  verdict: verdictSchema, note: z.string().trim().min(1).max(2000)
}).strict()
export const classificationSchema = z.object({
  categoryId: categoryIdSchema,
  reason: z.string().trim().min(1).max(1000)
}).strict()
export const sampleSnapshotSchema = z.object({
  id: z.string().uuid(), title: z.string(), referenceCategoryId: categoryIdSchema, sha256: z.string()
})
// Only allowlisted configuration is persisted. No SDK/provider objects or credentials.
export const modelSnapshotSchema = z.object({
  model: z.string(), copilotId: z.string(),
  options: z.object({ temperature: z.number(), max_tokens: z.number(), maxRetries: z.number() })
})
export const snapshotSchema = z.object({
  samples: z.array(sampleSnapshotSchema),
  prompts: z.object({ a: z.string(), b: z.string() }),
  categories: z.array(z.object({ id: z.string(), definition: z.string() })),
  protocolVersion: z.literal(1),
  model: modelSnapshotSchema.nullable()
})
export const usageSchema = z.object({
  inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative(), totalTokens: z.number().nonnegative(),
  source: z.enum(['provider', 'estimated'])
})
export const attemptSchema = z.object({
  id: z.string().uuid(), number: z.number(), status: attemptStatusSchema,
  startedAt: z.string().nullable(), finishedAt: z.string().nullable(),
  latencyMs: z.number().nullable(), rawOutput: z.string().nullable(),
  rawOutputTruncated: z.boolean().default(false),
  output: classificationSchema.nullable(), failureCode: evaluationFailureSchema.nullable(),
  usage: usageSchema.nullable()
})
export const cellSchema = z.object({
  sampleId: z.string().uuid(), variant: variantSchema, attempts: z.array(attemptSchema)
})
export const reviewSchema = z.object({
  sampleId: z.string().uuid(), verdict: verdictSchema, note: z.string(), reviewedAt: z.string(),
  attemptIds: z.array(z.string().uuid()).length(2)
})
export const decisionSchema = z.object({ verdict: verdictSchema, note: z.string(), decidedAt: z.string() })
/** Where the prompt used for an intake analysis came from. */
export const promptSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('default') }).strict(),
  z.object({ type: z.literal('adopted'), runId: z.string().uuid(), variant: variantSchema }).strict()
])
/** The prompt intake uses now: the version adopted by the latest decided acceptance run, else the default. */
export const activePromptSchema = z.object({
  text: z.string(), source: promptSourceSchema, runTitle: z.string().nullable()
})
export const runSummarySchema = z.object({
  id: z.string().uuid(), title: z.string(), revision: z.number(), status: runStatusSchema,
  sampleCount: z.number(), createdAt: z.string(), updatedAt: z.string()
})
export const runDetailSchema = runSummarySchema.extend({
  snapshot: snapshotSchema, cells: z.array(cellSchema), reviews: z.array(reviewSchema),
  decision: decisionSchema.nullable(), canRecover: z.boolean()
})
export type Variant = z.infer<typeof variantSchema>
export type Verdict = z.infer<typeof verdictSchema>
export type RunSnapshot = z.infer<typeof snapshotSchema>
export type ModelSnapshot = z.infer<typeof modelSnapshotSchema>
export type EvaluationAttempt = z.infer<typeof attemptSchema>
export type EvaluationCell = z.infer<typeof cellSchema>
export type EvaluationRunDetail = z.infer<typeof runDetailSchema>
export type EvaluationRunSummary = z.infer<typeof runSummarySchema>
export type EvaluationReview = z.infer<typeof reviewSchema>
export type EvaluationDecision = z.infer<typeof decisionSchema>
export type EvaluationUsage = z.infer<typeof usageSchema>
export type EvaluationFailure = z.infer<typeof evaluationFailureSchema>
export type CreateRunInput = z.infer<typeof createRunSchema>
export type Classification = z.infer<typeof classificationSchema>
export type PromptSource = z.infer<typeof promptSourceSchema>
export type ActivePrompt = z.infer<typeof activePromptSchema>

export const latestAttempt = (cell: EvaluationCell) => cell.attempts[cell.attempts.length - 1]

export function currentReview(run: Pick<EvaluationRunDetail, 'cells' | 'reviews'>, sampleId: string) {
  const ids = run.cells.filter(cell => cell.sampleId === sampleId).map(cell => latestAttempt(cell).id)
  return [...run.reviews].reverse().find(review => review.sampleId === sampleId
    && ids.every(id => review.attemptIds.includes(id)))
}

/** Latest attempts drive the decision; all earlier attempts remain inspectable. Errors count
 * against the full sample denominator, never disappear from a successful-only accuracy. */
export function evaluationMetrics(run: Pick<EvaluationRunDetail, 'snapshot' | 'cells'>, variant: Variant) {
  const cells = run.cells.filter(cell => cell.variant === variant)
  const attempts = cells.map(latestAttempt)
  const correct = cells.filter(cell => {
    const result = latestAttempt(cell)
    return result.status === 'succeeded'
      && result.output?.categoryId === run.snapshot.samples.find(sample => sample.id === cell.sampleId)?.referenceCategoryId
  }).length
  const completed = attempts.filter(attempt => attempt.status === 'succeeded' || attempt.status === 'failed')
  const timed = completed.filter(attempt => attempt.latencyMs !== null)
  return {
    total: cells.length, correct, completed: completed.length,
    valid: attempts.filter(attempt => attempt.status === 'succeeded').length,
    failed: attempts.filter(attempt => attempt.status === 'failed').length,
    meanLatencyMs: timed.length ? timed.reduce((sum, attempt) => sum + attempt.latencyMs!, 0) / timed.length : null
  }
}

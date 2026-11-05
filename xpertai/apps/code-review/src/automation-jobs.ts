import { z } from 'zod/v3'
import { idSchema } from './domain.js'
import type { ReviewRun } from './automation-entities.js'
import type { Review } from './entity.js'
import type { WorkflowDiagnosis } from './workflow-entity.js'

export const scanSchema = z.object({ repositoryId: idSchema, after: idSchema.optional() }).strict()
const identity = { repositoryId: idSchema, id: idSchema, version: z.string().datetime() }
export const stepSchema = z.discriminatedUnion('kind', [
  z.object({ ...identity, kind: z.literal('review'), phase: z.enum(['reserve', 'prepare', 'dispatch', 'observe']) }).strict(),
  z.object({ ...identity, kind: z.literal('workflow'), phase: z.enum(['prepare', 'dispatch', 'observe']) }).strict(),
  z.object({ ...identity, kind: z.literal('delivery'), phase: z.literal('accept') }).strict()
])
export type AutomationStep = z.infer<typeof stepSchema>
export function reviewPhase(run: ReviewRun, review?: Pick<Review, 'status' | 'errorCode'> | null): Extract<AutomationStep, { kind: 'review' }>['phase'] {
  if (!run.startedAt) return 'reserve'
  if (!run.reviewId) return 'prepare'
  if (run.settings.executionMode !== 'assistant') return run.pipelineInstanceId && run.pipelineRoundId ? 'observe' : 'dispatch'
  return review?.status === 'ready' || (review?.status === 'running' && review.errorCode === 'dispatch_pending_confirmation') ? 'dispatch' : 'observe'
}
export function workflowPhase(run: WorkflowDiagnosis): Extract<AutomationStep, { kind: 'workflow' }>['phase'] {
  return run.status === 'queued' ? 'prepare' : run.reason === 'dispatch_pending_confirmation' ? 'dispatch' : 'observe'
}

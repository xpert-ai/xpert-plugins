import { z } from 'zod'

export const NAMESPACE = 'customer_demand'
export const PLUGIN_NAME = '@xpert-ai/plugin-customer-demand'
export const FEATURE = `${NAMESPACE}.assessment`
export const PROVIDER = `${NAMESPACE}.view`
export const MIDDLEWARE = `${NAMESPACE}.tools`
export const VIEW = `${NAMESPACE}.workbench`
export const ENTRY = `${NAMESPACE}.remote`
export const TEMPLATE = `${NAMESPACE}.assistant`

export const categories = ['miniapp', 'website', 'internal_system', 'automation', 'other', 'unclear'] as const
export const priorities = ['high', 'normal', 'low'] as const
export const nextSteps = ['clarify', 'discovery', 'solution_review', 'defer'] as const
export const statuses = ['draft', 'evaluating', 'review', 'confirmed', 'failed'] as const
export type Category = typeof categories[number]
export type Priority = typeof priorities[number]
export type NextStep = typeof nextSteps[number]
export type Status = typeof statuses[number]
export type Scope = { tenantId: string; organizationId: string; userId: string }
export const intakeSchema = z.object({
  requestId: z.string().uuid(), customer: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(160), source: z.string().trim().min(10).max(12000)
}).strict()
export const editSchema = intakeSchema.omit({ requestId: true }).extend({ revision: z.number().int().positive() }).strict()
export const reviewSchema = z.object({
  revision: z.number().int().positive(), category: z.enum(categories), priority: z.enum(priorities),
  nextStep: z.enum(nextSteps), note: z.string().trim().min(1).max(2000)
}).strict()
export type Intake = z.infer<typeof intakeSchema>
export type Review = z.infer<typeof reviewSchema>

const probability = z.number().finite().min(0).max(1)
export const assessmentSchema = z.object({
  model: z.string().min(1), evaluatedAt: z.string(), category: z.enum(categories), categoryConfidence: probability,
  categoryProbabilities: z.record(probability), nextStep: z.enum(nextSteps), nextStepConfidence: probability,
  nextStepProbabilities: z.record(probability), urgency: z.number().min(0).max(3), urgencyConfidence: probability,
  completeness: z.object({ goal: probability, budget: probability, timeline: probability, decisionMaker: probability }),
  priority: z.enum(priorities), reviewRequired: z.boolean(),
  inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative()
}).strict()
export type Assessment = z.infer<typeof assessmentSchema>
export type Decision = Omit<Review, 'revision'> & { confirmedAt: string; confirmedBy: string }
export type Attempt = { id: string; startedAt: string; finishedAt?: string; status: 'running' | 'succeeded' | 'failed'; errorCode?: string }
export type Demand = {
  id: string; customer: string; title: string; source: string; status: Status; revision: number;
  assessment: Assessment | null; decision: Decision | null; attempts: Attempt[]; errorCode: string | null;
  createdAt: string; updatedAt: string
}
export type Page = { records: Demand[]; selected: Demand | null; total: number; page: number; pageSize: number }
export class BusinessError extends Error {
  constructor(public code: string) { super(code) }
}
export function requireScope(scope: Scope) {
  if (!scope.tenantId || !scope.organizationId || !scope.userId) throw new BusinessError('scope_required')
  return scope
}

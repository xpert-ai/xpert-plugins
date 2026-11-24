import { z } from 'zod/v3'
import { reportSchema } from './report'
import { analysisResultSchema, analysisStateSchema, answerInputSchema, answerSchema } from './analysis'
export { reportSchema, reportKeys, emptyReport } from './report'
export type { Report } from './report'
import type { Report } from './report'

export const createSchema = z.object({ requestId: z.string().uuid(), originalFeedback: z.string().max(20000).refine(value => value.trim().length > 0) }).strict()
export const saveSchema = z.object({ revision: z.number().int().positive(), supplement: z.string().max(20000), report: reportSchema, answers: z.array(answerInputSchema).max(50).optional() }).strict()
export const confirmSchema = z.object({ revision: z.number().int().positive() }).strict()
export const snapshotSchema = z.object({ report: reportSchema, supplement: z.string(), confirmedAt: z.string(), sourceRevision: z.number() })
export const recordSchema = z.object({
  id: z.string().uuid(), originalFeedback: z.string(), supplement: z.string(), report: reportSchema,
  status: z.enum(['draft', 'needs_information', 'ready_for_review', 'confirmed']), revision: z.number().int(),
  protectedFields: z.array(reportSchema.keyof()).default([]), answers: z.array(answerSchema).default([]),
  analysis: analysisStateSchema.nullable().default(null), aiResult: analysisResultSchema.nullable().default(null),
  confirmed: snapshotSchema.nullable(), createdAt: z.string(), updatedAt: z.string()
})
export type IntakeRecord = z.infer<typeof recordSchema>
export const listItemSchema = recordSchema.pick({ id: true, status: true, revision: true, updatedAt: true }).extend({ title: z.string(), preview: z.string() })
export const viewDataSchema = z.object({ items: z.array(listItemSchema), item: recordSchema.nullable(), total: z.number(), meta: z.object({ page: z.number(), pageSize: z.number() }) })
export type ViewData = z.infer<typeof viewDataSchema>
export type Scope = { tenantId: string; organizationId: string; userId: string }
export type ErrorCode = 'invalid_input' | 'scope_required' | 'not_found' | 'revision_conflict' | 'empty_report' | 'storage_unavailable' | 'unsupported_action' | 'analysis_pending'
export class IntakeError extends Error {
  constructor(readonly code: ErrorCode) { super(code) }
}

/** No inferred facts: only the user's own explicit report can be confirmed. */
export function ensureConfirmable(report: Report) {
  if (!report.title.trim() || !report.actual.trim()) throw new IntakeError('empty_report')
}

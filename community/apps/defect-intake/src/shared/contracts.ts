import { z } from 'zod/v3'

const textField = z.string().max(8000)
export const reportSchema = z.object({
  title: z.string().max(200), entry: textField, environment: textField, steps: textField,
  expected: textField, actual: textField, occurredAt: textField, frequency: textField,
  impact: textField, questions: textField
}).strict()
export type Report = z.infer<typeof reportSchema>
export const reportKeys = reportSchema.keyof().options
export const emptyReport = (): Report => ({ title: '', entry: '', environment: '', steps: '', expected: '', actual: '', occurredAt: '', frequency: '', impact: '', questions: '' })
export const createSchema = z.object({ requestId: z.string().uuid(), originalFeedback: z.string().max(20000).refine(value => value.trim().length > 0) }).strict()
export const saveSchema = z.object({ revision: z.number().int().positive(), supplement: z.string().max(20000), report: reportSchema }).strict()
export const confirmSchema = z.object({ revision: z.number().int().positive() }).strict()
export const snapshotSchema = z.object({ report: reportSchema, supplement: z.string(), confirmedAt: z.string(), sourceRevision: z.number() })
export const recordSchema = z.object({
  id: z.string().uuid(), originalFeedback: z.string(), supplement: z.string(), report: reportSchema,
  status: z.enum(['draft', 'confirmed']), revision: z.number().int(),
  confirmed: snapshotSchema.nullable(), createdAt: z.string(), updatedAt: z.string()
})
export type IntakeRecord = z.infer<typeof recordSchema>
export const listItemSchema = recordSchema.pick({ id: true, status: true, revision: true, updatedAt: true }).extend({ title: z.string(), preview: z.string() })
export const viewDataSchema = z.object({ items: z.array(listItemSchema), item: recordSchema.nullable(), total: z.number(), meta: z.object({ page: z.number(), pageSize: z.number() }) })
export type ViewData = z.infer<typeof viewDataSchema>
export type Scope = { tenantId: string; organizationId: string; userId: string }
export type ErrorCode = 'invalid_input' | 'scope_required' | 'not_found' | 'revision_conflict' | 'empty_report' | 'storage_unavailable' | 'unsupported_action'
export class IntakeError extends Error {
  constructor(readonly code: ErrorCode) { super(code) }
}

/** No inferred facts: only the user's own explicit report can be confirmed. */
export function ensureConfirmable(report: Report) {
  if (!report.title.trim() || !report.actual.trim()) throw new IntakeError('empty_report')
}

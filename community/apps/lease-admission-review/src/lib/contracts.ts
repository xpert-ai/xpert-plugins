import { z } from 'zod/v3'

export const fieldKey = z.enum([
  'managementStability',
  'pledgeRatio',
  'debtAssetRatio'
])
export const fieldSchema = z
  .object({
    key: fieldKey,
    status: z.enum(['present', 'missing', 'conflict', 'not_applicable']),
    value: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .describe(
        'Literal candidate value; null when unavailable. Percentages retain the percent unit.'
      ),
    unit: z.string().trim().max(40).nullable(),
    period: z
      .string()
      .trim()
      .max(100)
      .nullable()
      .describe(
        'Reporting period or time window explicitly stated in the source.'
      ),
    evidence: z
      .array(z.string().min(1).max(2000))
      .max(4)
      .describe(
        'Exact source substrings supporting the fact; never invent evidence.'
      )
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === 'present' && (!v.value || !v.evidence.length))
      ctx.addIssue({
        code: 'custom',
        message: 'Present facts require value and evidence'
      })
    if (v.status === 'missing' && v.value !== null)
      ctx.addIssue({ code: 'custom', message: 'Missing is null, never zero' })
    if (v.status === 'conflict' && v.evidence.length < 2)
      ctx.addIssue({
        code: 'custom',
        message: 'Conflict requires at least two evidence spans'
      })
  })
export const fieldsSchema = z
  .array(fieldSchema)
  .length(3)
  .refine(
    (v) => new Set(v.map((f) => f.key)).size === 3,
    'Each field appears exactly once'
  )
export const createSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    source: z.string().trim().min(1).max(20000),
    operationId: z.string().uuid()
  })
  .strict()
export const mutationSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    operationId: z.string().uuid()
  })
  .strict()
export const confirmSchema = mutationSchema
  .extend({ fields: fieldsSchema, reason: z.string().trim().max(1000) })
  .strict()
export const saveCandidateSchema = z
  .object({
    attemptId: z
      .string()
      .uuid()
      .describe(
        'Copy the attempt identifier returned by the workbench; supply it once.'
      ),
    fields: fieldsSchema
  })
  .strict()
export const failureSchema = z
  .object({
    attemptId: z.string().uuid(),
    failureCode: z.enum(['unreadable', 'insufficient_input'])
  })
  .strict()
export const readSchema = z.object({ attemptId: z.string().uuid() }).strict()
export const scopeSchema = z
  .object({
    tenantId: z.string().uuid(),
    organizationId: z.string().uuid(),
    userId: z.string().uuid(),
    assistantId: z.string().uuid()
  })
  .strict()
export type Scope = z.infer<typeof scopeSchema>
export type Field = z.infer<typeof fieldSchema>
export type Fields = z.infer<typeof fieldsSchema>
export type Status = 'draft' | 'extracting' | 'review' | 'confirmed' | 'failed'
export type FailureCode =
  | 'unreadable'
  | 'insufficient_input'
  | 'timeout'
  | 'dispatch_failed'
  | null
export type CaseDto = {
  id: string
  title: string
  source: string
  status: Status
  revision: number
  attemptId: string | null
  candidates: Fields | null
  confirmed: Fields | null
  reason: string | null
  failureCode: FailureCode
  updatedAt: string
}
export class ReviewError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'conflict'
      | 'invalid_state'
      | 'invalid_evidence'
      | 'reason_required'
      | 'scope_required'
  ) {
    super(code)
  }
}
export function validateEvidence(source: string, fields: Fields): void {
  for (const field of fields)
    for (const evidence of field.evidence)
      if (!source.includes(evidence)) throw new ReviewError('invalid_evidence')
}

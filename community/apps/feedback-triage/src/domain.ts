import { z } from 'zod/v3'

export const statusSchema = z.enum(['draft', 'processing', 'review', 'confirmed', 'failed'])
export const categorySchema = z.enum(['bug', 'usability', 'request', 'other'])
export const failureSchema = z.enum(['model_unavailable', 'invalid_model_output'])
export const analysisSchema = z
  .object({
    summary: z.string().trim().min(1).max(300),
    category: categorySchema,
    quote: z.string().trim().min(2).max(400),
    nextStep: z.string().trim().min(1).max(400),
  })
  .strict()

export const ticketSchema = z.object({
  id: z.string().uuid(),
  source: z.string(),
  status: statusSchema,
  analysis: analysisSchema.nullable(),
  confirmedCategory: categorySchema.nullable(),
  errorCode: failureSchema.nullable(),
  attempts: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Category = z.infer<typeof categorySchema>
export type Analysis = z.infer<typeof analysisSchema>
export type Ticket = z.infer<typeof ticketSchema>
export type FailureCode = z.infer<typeof failureSchema>

export const MIN_SOURCE_LENGTH = 10
export const MAX_SOURCE_LENGTH = 2400
export const createTicketSchema = z
  .object({
    requestId: z.string().uuid(),
    source: z.string().trim().min(MIN_SOURCE_LENGTH).max(MAX_SOURCE_LENGTH),
  })
  .strict()
export const ticketIdSchema = z.object({ id: z.string().uuid() }).strict()
export const confirmTicketSchema = ticketIdSchema.extend({ category: categorySchema.optional() }).strict()

const scopeSchema = z.object({
  tenantId: z.string().uuid(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
})
export type Scope = z.infer<typeof scopeSchema>

export class TicketError extends Error {
  constructor(readonly code: 'invalid_input' | 'not_found' | 'conflict' | 'request_id_reused' | 'scope_required') {
    super(code)
  }
}

export function requireScope(context: {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
}): Scope {
  const parsed = scopeSchema.safeParse(context)
  if (!parsed.success) throw new TicketError('scope_required')
  return parsed.data
}

export class ModelError extends Error {
  constructor(readonly code: FailureCode) {
    super(code)
  }
}

/** An exact excerpt lets the reviewer verify the model's claim against the original. */
export function validateAnalysis(source: string, candidate: unknown): Analysis {
  const parsed = analysisSchema.safeParse(candidate)
  if (!parsed.success || !source.includes(parsed.data.quote)) throw new ModelError('invalid_model_output')
  return parsed.data
}

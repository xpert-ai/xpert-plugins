import { z } from 'zod/v3'

export const NAMESPACE = 'support_triage'
export const key = (name: string) => `${NAMESPACE}.${name}`
export const FEATURE = key('triage')
export const PROVIDER = key('view')
export const VIEW = key('inbox')
export const MIDDLEWARE = key('tools')
export const scopeSchema = z.object({
  tenantId: z.string().min(1), organizationId: z.string().min(1), userId: z.string().min(1), xpertId: z.string().min(1)
}).strict()
export type Scope = z.infer<typeof scopeSchema>
export const intakeSchema = z.object({
  requestId: z.string().uuid(), subject: z.string().trim().min(3).max(160),
  body: z.string().trim().min(10).max(12000)
}).strict()
export const analysisSchema = z.object({
  category: z.enum(['account', 'billing', 'technical', 'other']),
  priority: z.enum(['low', 'normal', 'urgent']),
  summary: z.string().trim().min(1).max(600),
  evidence: z.string().trim().min(1).max(1000),
  reply: z.string().trim().min(1).max(4000)
}).strict()
export type Analysis = z.infer<typeof analysisSchema>
export const ticketSchema = z.object({
  id: z.string().uuid(), subject: z.string(), body: z.string(), revision: z.number().int(),
  status: z.enum(['new', 'processing', 'review', 'confirmed', 'failed']), attempts: z.number().int(),
  analysis: analysisSchema.nullable(), confirmed: analysisSchema.nullable(), failureCode: z.string().nullable(),
  updatedAt: z.string(), createdAt: z.string(), confirmedAt: z.string().nullable()
})
export type Ticket = z.infer<typeof ticketSchema>
export const snapshotSchema = z.object({ items: z.array(ticketSchema), total: z.number().int(), page: z.number().int() })
export const actionSchema = z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).strict()
export const confirmSchema = actionSchema.extend({ result: analysisSchema }).strict()
export const querySchema = z.object({ page: z.number().int().min(1).max(10000).default(1) }).strict()
export const configSchema = z.object({
  baseUrl: z.string().url().default('http://127.0.0.1:11434/v1'),
  model: z.string().trim().min(1).max(160).default('deepseek-r1:14b'),
  apiKey: z.string().default(''), timeoutMs: z.number().int().min(1000).max(120000).default(90000),
  enableFailureDemo: z.boolean().default(false), debug: z.boolean().default(false)
}).strict()
export type Config = z.infer<typeof configSchema>
export class TriageError extends Error {
  constructor(readonly code: 'not_found' | 'conflict' | 'invalid_state' | 'invalid_input' | 'model_unavailable' | 'invalid_model_output' | 'model_timeout' | 'demo_disabled' | 'demo_failure') {
    super(code)
  }
}

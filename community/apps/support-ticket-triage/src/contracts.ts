import { z } from 'zod/v3'

export const categoryCodes = ['account', 'billing', 'technical', 'delivery', 'other'] as const
export const priorityCodes = ['urgent', 'high', 'normal', 'low'] as const
export const ticketStatuses = ['new', 'processing', 'failed', 'review', 'confirmed'] as const
export const errorCodes = [
  'invalid_input', 'unavailable', 'not_found', 'conflict', 'invalid_evidence',
  'dispatch_failed', 'model_failed', 'incomplete', 'timed_out',
] as const

export const scopeSchema = z.object({
  tenantId: z.string().min(1),
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  xpertId: z.string().min(1),
})
export type TicketScope = z.infer<typeof scopeSchema>

const id = z.string().uuid()
export const reference = z.object({ id, attemptId: id }).strict()
export type AttemptRef = z.infer<typeof reference>
export const createTicket = z.object({
  id,
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(10).max(6000),
}).strict()
export const reviseTicket = z.object({ id, revision: z.number().int().positive() }).strict()
export const decision = z.object({
  category: z.enum(categoryCodes),
  priority: z.enum(priorityCodes),
  summary: z.string().trim().min(1).max(300),
}).strict()
export const suggestion = decision.extend({
  evidence: z.string().trim().min(3).max(240),
  rationale: z.string().trim().min(1).max(300),
})
export const confirmTicket = reviseTicket.extend(decision.shape)
export type TicketDecision = z.infer<typeof decision>
export type TicketSuggestion = z.infer<typeof suggestion>
export type TicketStatus = typeof ticketStatuses[number]
export type ErrorCode = typeof errorCodes[number]
export type AttemptFailure = Extract<ErrorCode, 'dispatch_failed' | 'model_failed' | 'incomplete' | 'timed_out'>
export class TicketError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code)
  }
}

export interface Ticket {
  id: string
  subject: string
  body: string
  status: TicketStatus
  revision: number
  ai: TicketSuggestion | null
  final: TicketDecision | null
  failure: AttemptFailure | null
  updatedAt: string
}

export const action = {
  create: 'create_ticket',
  begin: 'start_triage',
  dispatchFailed: 'report_dispatch_failure',
  confirm: 'confirm_ticket',
} as const

export function parseAttemptMessage(value: string): AttemptRef | undefined {
  const parts = /^TRIAGE ([0-9a-f-]{36}) ([0-9a-f-]{36})$/i.exec(value.trim())
  if (!parts) return undefined
  const parsed = reference.safeParse({ id: parts[1], attemptId: parts[2] })
  return parsed.success ? parsed.data : undefined
}

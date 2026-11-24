import { z } from 'zod/v3'

export const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const ticketCodeSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/, 'Invalid ticket code')

export const prioritySchema = z.enum(['P0', 'P1', 'P2', 'P3'])
export type Priority = z.infer<typeof prioritySchema>

export const teamSchema = z.enum(['technical_support', 'billing', 'logistics', 'product', 'customer_success'])
export type Team = z.infer<typeof teamSchema>

export const statusSchema = z.enum(['pending', 'proposed', 'confirmed', 'failed'])
export type TicketStatus = z.infer<typeof statusSchema>

// Trusted identity is supplied only by the host adapter, never by View or model inputs.
export const scopeSchema = z.object({
  tenantId: z.string().min(1).max(128),
  organizationId: z.string().max(128),
  workspaceId: z.string().max(128),
  userId: z.string().min(1).max(128),
  xpertId: z.string().min(1).max(128)
}).strict()
export type TicketScope = z.infer<typeof scopeSchema>

export const ticketViewSchema = z.object({
  ticketCode: z.string(),
  subject: z.string(),
  channel: z.string(),
  customerTier: z.string(),
  status: statusSchema,
  priority: prioritySchema.nullable(),
  team: teamSchema.nullable(),
  rationale: z.string().nullable(),
  draftReply: z.string().nullable(),
  reviewNote: z.string().nullable(),
  attemptCount: z.number().int(),
  lastErrorCode: z.string().nullable(),
  revision: z.number().int(),
  updatedAt: z.string()
}).strict()
export type TicketView = z.infer<typeof ticketViewSchema>

export const boardSchema = z.object({
  items: z.array(ticketViewSchema),
  summary: z.object({
    total: z.number().int(), pending: z.number().int(), proposed: z.number().int(),
    confirmed: z.number().int(), failed: z.number().int()
  }).strict()
}).strict()
export type TicketBoard = z.infer<typeof boardSchema>

// Every field is required: a partial proposal is rejected, so the tool schema spells out the
// allowed enums. Models skip optional-looking fields, so nothing here is optional.
export const proposeTriageSchema = z.object({
  ticketCode: ticketCodeSchema.describe('Ticket code copied from list_pending_tickets, for example T-1002'),
  expectedRevision: revisionSchema.describe('The revision of that ticket as returned by list_pending_tickets'),
  priority: prioritySchema.describe('REQUIRED. One of P0, P1, P2, P3'),
  team: teamSchema.describe(
    'REQUIRED. Owning team, one of technical_support, billing, logistics, product, customer_success'
  ),
  rationale: z.string().min(1).max(2000).describe('Why this priority and team, 1 to 2000 characters'),
  draftReply: z.string().min(1).max(4000).describe('Customer-facing reply draft, 1 to 4000 characters')
}).strict()
export type ProposeTriageInput = z.infer<typeof proposeTriageSchema>

/**
 * The model-facing shape of a proposal. It mirrors {@link proposeTriageSchema} but spells the
 * owning team as `owningTeam`: the hosted model adapters accepted these proposals consistently
 * only after the field stopped being called `team`.
 */
export const proposeTriageToolSchema = z.object({
  ticketCode: ticketCodeSchema.describe('Ticket code copied from list_pending_tickets, for example T-1002'),
  expectedRevision: revisionSchema.describe('The revision of that ticket as returned by list_pending_tickets'),
  priority: prioritySchema.describe('REQUIRED. One of P0, P1, P2, P3'),
  owningTeam: teamSchema.describe(
    'REQUIRED. Owning team, one of technical_support, billing, logistics, product, customer_success'
  ),
  rationale: z.string().min(1).max(2000).describe('Why this priority and team, 1 to 2000 characters'),
  draftReply: z.string().min(1).max(4000).describe('Customer-facing reply draft, 1 to 4000 characters')
}).strict()
export type ProposeTriageToolInput = z.infer<typeof proposeTriageToolSchema>

export const confirmTriageSchema = z.object({
  ticketCode: ticketCodeSchema,
  expectedRevision: revisionSchema,
  priority: prioritySchema.optional(),
  team: teamSchema.optional(),
  reviewNote: z.string().max(500).optional()
}).strict()
export type ConfirmTriageInput = z.infer<typeof confirmTriageSchema>

export const rejectTriageSchema = z.object({
  ticketCode: ticketCodeSchema,
  expectedRevision: revisionSchema,
  reason: z.string().min(1).max(500)
}).strict()
export type RejectTriageInput = z.infer<typeof rejectTriageSchema>

export const resetTicketSchema = z.object({
  ticketCode: ticketCodeSchema,
  expectedRevision: revisionSchema
}).strict()
export type ResetTicketInput = z.infer<typeof resetTicketSchema>

export const seedSchema = z.object({}).strict()

export const listTicketsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional()
}).strict()

export type DomainErrorCode = 'not_found' | 'conflict' | 'invalid_state' | 'invalid_input'
export class TicketTriageError extends Error {
  constructor(readonly code: DomainErrorCode, readonly ticketCode?: string) {
    super(code)
    this.name = 'TicketTriageError'
  }
}

/** The order in which the board lists tickets: work that needs a human first. */
export const statusOrder: Record<TicketStatus, number> = {
  proposed: 0, failed: 1, pending: 2, confirmed: 3
}

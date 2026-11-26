import { z } from 'zod/v3'

export const categories = ['access', 'billing', 'data', 'how_to', 'feature_request', 'service_incident', 'other'] as const
export const priorities = ['P0', 'P1', 'P2', 'P3'] as const
export type TicketStatus = 'new' | 'draft' | 'reviewed'
export type TicketScope = { tenantId: string; organizationId: string; ownerId: string }

export const ticketId = z.string().uuid().describe('UUID of the existing ticket.')
export const intakeSchema = z.object({
  id: ticketId,
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(5).max(4000)
}).strict()

export const draftSchema = z.object({
  category: z.enum(categories),
  priority: z.enum(priorities).describe('P0 core workflow blocked for all affected users; P1 broad impact or urgent financial risk; P2 limited impact; P3 inquiry or suggestion.'),
  summary: z.string().trim().min(1).max(500),
  rationale: z.string().trim().min(1).max(700).describe('Brief reason grounded in the reported symptoms and impact.'),
  reply: z.string().trim().min(1).max(1800).describe('Proposed reply, without invented findings, guarantees, or requests for secrets.'),
  needsClarification: z.boolean().describe('True if material information about the issue or its impact is missing.')
}).strict()

export const saveDraftSchema = draftSchema.extend({ id: ticketId }).strict()
export const reviewSchema = z.object({
  id: ticketId,
  draftRevision: z.number().int().positive(),
  category: z.enum(categories),
  priority: z.enum(priorities),
  reply: z.string().trim().min(1).max(1800)
}).strict()
export type Draft = z.infer<typeof draftSchema>
export type Review = Pick<z.infer<typeof reviewSchema>, 'category' | 'priority' | 'reply'>

export const labels = {
  title: { en_US: 'Support ticket triage', zh_Hans: '客服工单分诊' },
  description: { en_US: 'Prepare a triage draft for human review.', zh_Hans: '生成可供客服审核的分诊草稿。' }
}

export const ARTIFACT_NAMESPACE = 'support_ticket_triage'
export const middlewareKey = `${ARTIFACT_NAMESPACE}.middleware`
export const featureKey = `${ARTIFACT_NAMESPACE}.review`
export const providerKey = `${ARTIFACT_NAMESPACE}.workbench`
export const viewKey = `${ARTIFACT_NAMESPACE}.tickets`
export const templateKey = `${ARTIFACT_NAMESPACE}.assistant`
export const readTool = 'support_ticket_triage_read'
export const draftTool = 'support_ticket_triage_save_draft'

export class TicketError extends Error {
  constructor(readonly code: 'scope_required' | 'ticket_unavailable' | 'state_conflict' | 'invalid_input') {
    super(code)
  }
}

export function requireScope(tenantId?: string | null, organizationId?: string | null, ownerId?: string | null): TicketScope {
  if (!tenantId || !organizationId || !ownerId) throw new TicketError('scope_required')
  return { tenantId, organizationId, ownerId }
}

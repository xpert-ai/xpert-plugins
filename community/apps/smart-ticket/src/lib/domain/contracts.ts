import { z } from 'zod'

export const scopeSchema = z.object({
  tenantId: z.string().min(1),
  organizationId: z.string(),
  workspaceId: z.string(),
  userId: z.string().min(1),
  xpertId: z.string().min(1)
})
export type TicketScope = z.infer<typeof scopeSchema>

export const TICKET_CATEGORIES = [
  'billing',
  'technical_issue',
  'product_suggestion',
  'account_security',
  'other'
] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]

export const TICKET_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_SENTIMENTS = ['negative_urgent', 'neutral', 'positive'] as const
export type TicketSentiment = (typeof TICKET_SENTIMENTS)[number]

export const TICKET_STATUSES = ['pending_review', 'confirmed', 'archived'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const analyzeTicketInputSchema = z.object({
  rawContent: z.string().describe('原始用户反馈或客诉文本'),
  simulateFailure: z.boolean().optional().describe('是否模拟上游大模型/服务调用超时')
})
export type AnalyzeTicketInput = z.infer<typeof analyzeTicketInputSchema>

export const confirmTicketInputSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  sentiment: z.enum(TICKET_SENTIMENTS).optional(),
  summary: z.string().optional(),
  suggestedReply: z.string().optional()
})
export type ConfirmTicketInput = z.infer<typeof confirmTicketInputSchema>

export const saveTicketInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  rawContent: z.string().min(1),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  sentiment: z.enum(TICKET_SENTIMENTS),
  summary: z.string(),
  suggestedReply: z.string(),
  status: z.enum(TICKET_STATUSES).default('pending_review')
})
export type SaveTicketInput = z.infer<typeof saveTicketInputSchema>

export const deleteTicketInputSchema = z.object({
  id: z.string().min(1)
})
export type DeleteTicketInput = z.infer<typeof deleteTicketInputSchema>

export const retryTicketInputSchema = z.object({
  id: z.string().min(1),
  simulateFailure: z.boolean().optional()
})
export type RetryTicketInput = z.infer<typeof retryTicketInputSchema>

export class SmartTicketError extends Error {
  constructor(
    public readonly code:
      | 'CONTENT_TOO_SHORT'
      | 'SIMULATED_SERVICE_TIMEOUT'
      | 'TICKET_NOT_FOUND'
      | 'INVALID_STATUS'
      | 'VALIDATION_ERROR'
      | 'UNAUTHORIZED',
    message?: string
  ) {
    super(message ?? code)
    this.name = 'SmartTicketError'
  }
}

import { z } from 'zod/v3'

export const CATEGORY_VALUES = ['billing', 'technical', 'account', 'other'] as const
export const PRIORITY_VALUES = ['low', 'normal', 'high'] as const
export const STATUS_VALUES = ['new', 'processing', 'pending_review', 'confirmed', 'failed'] as const
export const categorySchema = z.enum(CATEGORY_VALUES)
export const prioritySchema = z.enum(PRIORITY_VALUES)
export const statusSchema = z.enum(STATUS_VALUES)
export type Category = z.infer<typeof categorySchema>
export type Priority = z.infer<typeof prioritySchema>
export type TicketStatus = z.infer<typeof statusSchema>

export const scopeSchema = z.object({
  tenantId: z.string().min(1), organizationId: z.string().min(1),
  workspaceId: z.string().min(1), userId: z.string().min(1), xpertId: z.string().min(1)
}).strict()
export type Scope = z.infer<typeof scopeSchema>

export const analysisSchema = z.object({
  summary: z.string().trim().min(1).max(500).describe('简明问题摘要；不增加客户未提供的事实'),
  category: categorySchema.describe('billing=账单支付，technical=技术故障，account=账户，other=其他'),
  priority: prioritySchema.describe('按原文影响判断优先级；无充分证据时 normal'),
  evidence: z.array(z.string().min(1).max(1000).refine(value => value.trim().length > 0, 'Evidence cannot be whitespace')).min(1).max(8).describe('必须是工单 message 中逐字存在的原文片段'),
  missingInfo: z.array(z.string().trim().min(1).max(200)).max(10).describe('解决问题尚缺的信息；充分时传空数组'),
  replyDraft: z.string().trim().min(1).max(4000).describe('待人工审核的回复草稿；不能承诺未经批准的退款或处置'),
  rationale: z.string().trim().min(1).max(1000).describe('分类和优先级的简要依据；不要输出思维链')
}).strict()
export type Analysis = z.infer<typeof analysisSchema>
export const createTicketSchema = z.object({
  requestId: z.string().uuid(), title: z.string().trim().min(1).max(120),
  customerAlias: z.string().trim().min(1).max(80), message: z.string().trim().min(1).max(12000)
}).strict()
export type CreateTicketInput = z.infer<typeof createTicketSchema>
export const ticketRevisionSchema = z.object({ ticketId: z.string().uuid(), expectedRevision: z.number().int().min(1) }).strict()
export type TicketRevisionInput = z.infer<typeof ticketRevisionSchema>
export const abortAnalysisSchema = ticketRevisionSchema.extend({
  attemptId: z.string().uuid(), reason: z.enum(['dispatcher_unavailable', 'user_cancelled'])
}).strict()
export type AbortAnalysisInput = z.infer<typeof abortAnalysisSchema>
export const readTicketSchema = z.object({ ticketId: z.string().uuid(), attemptId: z.string().uuid() }).strict()
export const saveAnalysisSchema = readTicketSchema.extend({ analysis: analysisSchema }).strict()
export type SaveAnalysisInput = z.infer<typeof saveAnalysisSchema>
export const reportFailureSchema = readTicketSchema.extend({ reason: z.string().trim().min(1).max(500) }).strict()
export type ReportFailureInput = z.infer<typeof reportFailureSchema>
export const confirmTicketSchema = ticketRevisionSchema.extend({
  confirmationId: z.string().uuid(), category: categorySchema, priority: prioritySchema,
  reply: z.string().trim().min(1).max(4000)
}).strict()
export type ConfirmTicketInput = z.infer<typeof confirmTicketSchema>
export const listQuerySchema = z.object({
  page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20),
  status: statusSchema.optional(), search: z.string().max(120).optional()
}).strict()
export type ListQuery = z.infer<typeof listQuerySchema>

export interface TicketSummary {
  id: string; title: string; customerAlias: string; status: TicketStatus; revision: number
  category: Category | null; priority: Priority | null; summary: string | null
  createdAt: string; updatedAt: string; failureReason: string | null; attemptDeadline: string | null
}
export interface TicketDetail extends TicketSummary {
  message: string; analysis: Analysis | null; attemptId: string | null
  confirmedReply: string | null; confirmedAt: string | null; confirmedBy: string | null
  history: TicketHistoryEntry[]; historyTotal?: number
}
export interface TicketHistoryEntry {
  event: 'created' | 'analysis_started' | 'analysis_saved' | 'analysis_failed' | 'analysis_expired' | 'confirmed'
  at: string; actor: 'human' | 'agent' | 'system'; revision: number; attemptId?: string
}
export interface TicketList { items: TicketSummary[]; total: number; page: number; pageSize: number }
export interface MutationReceipt { ticketId: string; revision: number; status: TicketStatus; duplicate?: boolean }
export interface AnalyzeReceipt extends MutationReceipt {
  attemptId: string; commandKey: 'assistant.chat.send_message'; payload: { text: string }
}
export type ErrorCode = 'invalid_input' | 'not_found' | 'conflict' | 'invalid_state' | 'stale_attempt' | 'attempt_expired' | 'invalid_evidence' | 'idempotency_conflict' | 'forbidden'
export class TriageError extends Error {
  constructor(readonly code: ErrorCode) { super(code); this.name = 'TriageError' }
}

export type TicketStatus = 'draft' | 'analyzing' | 'analysis_failed' | 'awaiting_review' | 'confirmed'
export interface TicketScope { tenantId: string; organizationId: string; ownerId: string }
export interface TicketInput { title: string; description: string }
export interface Analysis {
  category: 'product' | 'delivery' | 'refund' | 'other'
  priority: 'low' | 'normal' | 'high'
  questions: string[]
  replyDraft: string
}
export class TicketError extends Error {
  readonly code: string
  constructor(code: string) { super(code); this.code = code }
}
export function requireScope(scope: TicketScope): TicketScope {
  if (![scope.tenantId, scope.organizationId, scope.ownerId].every(value => typeof value === 'string' && value.trim())) {
    throw new TicketError('scope_required')
  }
  return scope
}
export function validateInput(input: TicketInput): TicketInput {
  const title = input.title.trim()
  const description = input.description.trim()
  if (!title || title.length > 160 || !description || description.length > 12000) {
    throw new TicketError('invalid_ticket')
  }
  return {title, description}
}
export const ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000

export function nextAnalysisAttempt(
  status: TicketStatus,
  attempt: number,
  updatedAt?: Date,
  now: Date = new Date(),
  timeoutMs: number = ANALYSIS_TIMEOUT_MS
): number {
  if (status === 'draft' || status === 'analysis_failed') return attempt + 1
  if (status === 'analyzing' && updatedAt instanceof Date && now.getTime() - updatedAt.getTime() > timeoutMs) {
    return attempt + 1
  }
  throw new TicketError('analysis_not_allowed')
}
export function requireCurrentAttempt(status: TicketStatus, current: number, received: number): void {
  if (status !== 'analyzing' || current !== received) throw new TicketError('stale_analysis')
}
export function confirmationReply(status: TicketStatus, current: number, reviewed: number, reply: string): string {
  if (status !== 'awaiting_review' || current !== reviewed) throw new TicketError('review_outdated')
  if (!reply.trim() || reply.trim().length > 12000) throw new TicketError('invalid_reply')
  return reply.trim()
}

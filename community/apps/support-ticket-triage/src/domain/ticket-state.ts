export type TicketStatus = 'pending_ai' | 'awaiting_review' | 'approved' | 'rejected' | 'failed'
export type TicketEvent = 'analysis_succeeded' | 'analysis_failed' | 'retry_requested' | 'approved' | 'rejected'

const transitions: Record<TicketStatus, Partial<Record<TicketEvent, TicketStatus>>> = {
  pending_ai: { analysis_succeeded: 'awaiting_review', analysis_failed: 'failed' },
  awaiting_review: { approved: 'approved', rejected: 'rejected', analysis_failed: 'failed' },
  approved: {}, rejected: {}, failed: { retry_requested: 'pending_ai' }
}

export function transitionTicket(status: TicketStatus, event: TicketEvent): TicketStatus {
  const next = transitions[status][event]
  if (!next) throw new Error(`Invalid ticket transition: ${status} -> ${event}`)
  return next
}

export function canRetry(status: TicketStatus): boolean { return status === 'failed' }

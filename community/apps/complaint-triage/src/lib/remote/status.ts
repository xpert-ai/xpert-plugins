import type { TicketStatus } from '../domain/contracts.js'

// Display order of the status filters: the supervisor's work queue first.
export const TICKET_STATUS_ORDER: readonly TicketStatus[] = ['pending_review', 'analysis_failed', 'analyzing', 'draft', 'confirmed']

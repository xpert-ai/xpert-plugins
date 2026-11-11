import type { TicketAnalysis } from '../domain/analysis-parser.js'
import type { TicketStatus } from '../domain/ticket-state.js'

export interface TicketScope { tenantId?: string; organizationId?: string | null; userId?: string; assistantId?: string; conversationId?: string }
export interface CreateTicketInput { customerName: string; customerEmail?: string; subject: string; description: string }
export interface TicketRecord extends CreateTicketInput, Partial<TicketAnalysis> {
  id: string; status: TicketStatus; revision: number; attemptCount: number; failureReason?: string | null; reviewComment?: string | null
}

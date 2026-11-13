import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { normalizeAnalysis, type TicketAnalysis } from '../domain/analysis-parser.js'
import { transitionTicket } from '../domain/ticket-state.js'
import { SupportTicketEntity } from './entities/support-ticket.entity.js'
import type { CreateTicketInput, TicketScope } from './types.js'

@Injectable()
export class SupportTicketService {
  constructor(@InjectRepository(SupportTicketEntity) private readonly tickets: Repository<SupportTicketEntity>) {}

  async create(scope: TicketScope, input: CreateTicketInput) {
    const ticket = this.tickets.create({
      ...input, customerName: input.customerName.trim(), subject: input.subject.trim(), description: input.description.trim(),
      tenantId: scope.tenantId, organizationId: scope.organizationId ?? undefined, createdBy: scope.userId,
      assistantId: scope.assistantId, conversationId: scope.conversationId, status: 'pending_ai', attemptCount: 0, revision: 1
    })
    return this.tickets.save(ticket)
  }

  async get(scope: TicketScope, id: string) {
    const ticket = await this.tickets.findOne({ where: this.where(scope, { id }) })
    if (!ticket) throw new NotFoundException('Support ticket not found in the current scope.')
    return ticket
  }

  async list(scope: TicketScope, search?: string) {
    const items = await this.tickets.find({ where: this.where(scope), order: { updatedAt: 'DESC' }, take: 100 })
    const needle = search?.trim().toLowerCase()
    return needle ? items.filter((item) => `${item.subject} ${item.customerName} ${item.category ?? ''}`.toLowerCase().includes(needle)) : items
  }

  async recordAnalysis(scope: TicketScope, id: string, input: TicketAnalysis) {
    const ticket = await this.get(scope, id)
    const analysis = normalizeAnalysis(input)
    ticket.status = transitionTicket(ticket.status, 'analysis_succeeded')
    Object.assign(ticket, analysis, { failureReason: null, attemptCount: ticket.attemptCount + 1, revision: ticket.revision + 1 })
    return this.tickets.save(ticket)
  }

  async recordFailure(scope: TicketScope, id: string, reason: string) {
    const ticket = await this.get(scope, id)
    ticket.status = transitionTicket(ticket.status, 'analysis_failed')
    ticket.failureReason = reason.trim().slice(0, 1000)
    ticket.attemptCount += 1
    ticket.revision += 1
    return this.tickets.save(ticket)
  }

  async retry(scope: TicketScope, id: string) {
    const ticket = await this.get(scope, id)
    ticket.status = transitionTicket(ticket.status, 'retry_requested')
    ticket.failureReason = null
    ticket.revision += 1
    return this.tickets.save(ticket)
  }

  async review(scope: TicketScope, id: string, decision: 'approved' | 'rejected', comment?: string) {
    const ticket = await this.get(scope, id)
    ticket.status = transitionTicket(ticket.status, decision)
    ticket.reviewComment = comment?.trim().slice(0, 1000)
    ticket.revision += 1
    return this.tickets.save(ticket)
  }

  private where(scope: TicketScope, extra: Partial<SupportTicketEntity> = {}) {
    return { tenantId: scope.tenantId, organizationId: scope.organizationId ?? undefined, ...extra }
  }
}

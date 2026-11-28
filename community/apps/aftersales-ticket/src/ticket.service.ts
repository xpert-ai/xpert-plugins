import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { z } from 'zod'
import { nextAnalysisAttempt, confirmationReply } from './domain.js'
import { Ticket } from './ticket.entity.js'
import { requireScope, validateInput, TicketError, type TicketInput, type TicketScope } from './domain.js'
@Injectable()
export class TicketService {
  constructor(@InjectRepository(Ticket) private readonly tickets: Repository<Ticket>) {}
  async create(scope: TicketScope, input: TicketInput, commandId?: string) {
    const fields = validateInput(input)
    const trusted = requireScope(scope)
    if (!commandId) return this.tickets.save(this.tickets.create({...trusted, ...fields, status: 'draft', attempt: 0}))
    const id = z.string().uuid().parse(commandId)
    const sameRequest = (ticket: Ticket) => {
      if (ticket.title !== fields.title || ticket.description !== fields.description) throw new TicketError('creation_conflict')
      return ticket
    }
    const existing = await this.tickets.findOneBy({...trusted, id})
    if (existing) return sameRequest(existing)
    try {
      await this.tickets.insert({...trusted, ...fields, id, status: 'draft', attempt: 0})
    } catch (error) {
      // A concurrent retry may have inserted the same command ID. Never update that row.
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== '23505') throw error
      const duplicate = await this.tickets.findOneBy({...trusted, id})
      if (!duplicate) throw new TicketError('creation_conflict')
      return sameRequest(duplicate)
    }
    return this.get(trusted, id)
  }
  async list(scope: TicketScope, requestedPage = 1) {
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1
    const [items, total] = await this.tickets.findAndCount({
      where: requireScope(scope), take: 20, skip: (page - 1) * 20, order: {createdAt: 'DESC', id: 'DESC'}
    })
    return {items: items.map(ticket => this.dto(ticket)), total}
  }
  async get(scope: TicketScope, id: string) {
    const ticket = await this.tickets.findOneBy({...requireScope(scope), id})
    if (!ticket) throw new NotFoundException('ticket_not_found')
    return ticket
  }
  async editDraft(scope: TicketScope, id: string, input: TicketInput) {
    const result = await this.tickets.update({...requireScope(scope), id, status: 'draft'}, validateInput(input))
    if (result.affected !== 1) throw new TicketError('draft_not_editable')
    return {id}
  }
  async beginAnalysis(scope: TicketScope, id: string) {
    const ticket = await this.get(scope, id)
    const attempt = nextAnalysisAttempt(ticket.status, ticket.attempt, ticket.updatedAt)
    const result = await this.tickets.update({...requireScope(scope), id, status: ticket.status, attempt: ticket.attempt, ...(ticket.status === 'analyzing' ? {updatedAt: ticket.updatedAt} : {})},
      {status: 'analyzing', attempt, analysis: null, errorCode: null})
    if (result.affected !== 1) throw new TicketError('analysis_conflict')
    return {id, attempt, title: ticket.title, description: ticket.description}
  }
  async saveAnalysis(scope: TicketScope, id: string, attempt: number, proposed: z.input<typeof analysisSchema>) {
    const analysis = analysisSchema.parse(proposed)
    const result = await this.tickets.update({...requireScope(scope), id, status: 'analyzing', attempt},
      {status: 'awaiting_review', analysis, errorCode: null})
    if (result.affected !== 1) throw new TicketError('stale_analysis')
    return {id, attempt, status: 'awaiting_review'}
  }
  async failAnalysis(scope: TicketScope, id: string, attempt: number) {
    const result = await this.tickets.update({...requireScope(scope), id, status: 'analyzing', attempt},
      {status: 'analysis_failed', errorCode: 'analysis_failed'})
    if (result.affected !== 1) throw new TicketError('stale_analysis')
    return {id, attempt, status: 'analysis_failed'}
  }
  // Human View action only: do not expose this operation as an Agent tool.
  async confirm(scope: TicketScope, id: string, reviewedAttempt: number, reply: string) {
    const ticket = await this.get(scope, id)
    const finalReply = confirmationReply(ticket.status, ticket.attempt, reviewedAttempt, reply)
    const result = await this.tickets.update({...requireScope(scope), id, status: 'awaiting_review', attempt: reviewedAttempt},
      {status: 'confirmed', finalReply, confirmedBy: scope.ownerId})
    if (result.affected !== 1) throw new TicketError('review_outdated')
    return {id, status: 'confirmed'}
  }
  dto(ticket: Ticket) {
    return {id: ticket.id, title: ticket.title, description: ticket.description,
      status: ticket.status, attempt: ticket.attempt, analysis: ticket.analysis,
      finalReply: ticket.finalReply, deliveryStatus: 'not_sent' as const, errorCode: ticket.errorCode, createdAt: ticket.createdAt.toISOString()}
  }
}

export const analysisSchema = z.object({
  category: z.enum(['product', 'delivery', 'refund', 'other']),
  priority: z.enum(['low', 'normal', 'high']),
  questions: z.array(z.string().trim().min(1).max(500)).max(10),
  replyDraft: z.string().trim().min(1).max(12000)
}).strict()

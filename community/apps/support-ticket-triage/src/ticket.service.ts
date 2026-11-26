import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  TicketError, draftSchema, intakeSchema, reviewSchema, ticketId, type TicketScope
} from './domain.js'
import { Ticket } from './ticket.entity.js'

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new TicketError('invalid_input')
  return parsed.data
}

function summary(row: Ticket) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    category: row.review?.category ?? row.draft?.category ?? null,
    priority: row.review?.priority ?? row.draft?.priority ?? null,
    createdAt: row.createdAt.toISOString()
  }
}

@Injectable()
export class TicketService {
  constructor(@InjectRepository(Ticket) private readonly tickets: Repository<Ticket>) {}

  private async find(scope: TicketScope, id: string) {
    const row = await this.tickets.findOneBy({ ...scope, id })
    if (!row) throw new TicketError('ticket_unavailable')
    return row
  }

  async list(scope: TicketScope, requestedPage?: number) {
    const page = Number.isSafeInteger(requestedPage) ? Math.max(1, Math.min(10000, requestedPage ?? 1)) : 1
    const pageSize = 15
    const [rows, total] = await this.tickets.findAndCount({
      where: scope,
      take: pageSize,
      skip: (page - 1) * pageSize,
      order: { createdAt: 'DESC', id: 'DESC' }
    })
    return { items: rows.map(summary), total, page, pageSize }
  }

  async get(scope: TicketScope, input: string) {
    const row = await this.find(scope, parse(ticketId, input))
    return {
      ...summary(row),
      description: row.description,
      revision: row.revision,
      draft: row.draft,
      review: row.review,
      reviewedAt: row.reviewedAt?.toISOString() ?? null
    }
  }

  async create(scope: TicketScope, input: unknown) {
    const { id, title, description } = parse(intakeSchema, input)
    await this.tickets.createQueryBuilder().insert().into(Ticket)
      .values({ ...scope, id, title, description }).orIgnore().execute()
    const row = await this.find(scope, id)
    if (row.title !== title || row.description !== description) throw new TicketError('state_conflict')
    return { id, status: row.status }
  }

  async saveDraft(scope: TicketScope, inputId: string, input: unknown) {
    const id = parse(ticketId, inputId)
    const draft = parse(draftSchema, input)
    const result = await this.tickets.update(
      { ...scope, id, status: 'new', revision: 0 },
      { draft, status: 'draft', revision: 1 }
    )
    if (result.affected === 1) return { id, status: 'draft' as const, revision: 1, changed: true }
    const existing = await this.find(scope, id)
    return { id, status: existing.status, revision: existing.revision, changed: false }
  }

  async review(scope: TicketScope, input: unknown) {
    const { id, draftRevision, ...review } = parse(reviewSchema, input)
    const result = await this.tickets.update(
      { ...scope, id, status: 'draft', revision: draftRevision },
      { review, status: 'reviewed', revision: draftRevision + 1, reviewedAt: new Date() }
    )
    if (result.affected === 1) return { id, status: 'reviewed' as const }
    const row = await this.find(scope, id)
    if (row.status === 'reviewed' && row.revision === draftRevision + 1 &&
        row.review?.category === review.category && row.review.priority === review.priority &&
        row.review.reply === review.reply) return { id, status: row.status }
    throw new TicketError('state_conflict')
  }
}

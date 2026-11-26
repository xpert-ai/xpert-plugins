import { Injectable } from '@nestjs/common'
import { Between, InjectRepository, LessThan } from './host-orm.js'
import { randomUUID } from 'node:crypto'
import type { Repository } from 'typeorm'
import {
  createTicketSchema,
  ModelError,
  TicketError,
  type Category,
  type FailureCode,
  type Scope,
  type Ticket,
} from './domain.js'
import { MODEL_TIMEOUT_MS, TriageModel } from './model.js'
import { FeedbackTicket } from './ticket.entity.js'

const LEASE_MS = MODEL_TIMEOUT_MS + 30_000
export const PAGE_SIZE = 30

function toTicket(row: FeedbackTicket): Ticket {
  const { id, source, status, analysis, errorCode, attempts, createdAt, updatedAt } = row
  const expired = status === 'processing' && Date.parse(updatedAt) < Date.now() - LEASE_MS
  const confirmedCategory = status === 'confirmed' ? row.confirmedCategory ?? analysis?.category ?? null : null
  return {
    id,
    source,
    confirmedCategory,
    status: expired ? 'failed' : status,
    analysis,
    errorCode: expired ? 'model_unavailable' : errorCode,
    attempts,
    createdAt,
    updatedAt,
  }
}

@Injectable()
export class TicketService {
  constructor(
    @InjectRepository(FeedbackTicket) private readonly tickets: Repository<FeedbackTicket>,
    private readonly model: TriageModel,
  ) {}

  private async expireInterrupted(scope: Scope, id: string) {
    const cutoff = new Date(Date.now() - LEASE_MS).toISOString()
    await this.tickets.update(
      { ...scope, id, status: 'processing', updatedAt: LessThan(cutoff) },
      { status: 'failed', errorCode: 'model_unavailable', updatedAt: new Date().toISOString() },
    )
  }

  async list(scope: Scope, page = 1) {
    const rows = await this.tickets.find({
      where: scope,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
    })
    return { tickets: rows.slice(0, PAGE_SIZE).map(toTicket), hasMore: rows.length > PAGE_SIZE }
  }

  async matchesAnalysisTarget(scope: Scope, suppliedId: unknown, references: string[]): Promise<boolean> {
    if (!references.length) return true
    if (typeof suppliedId !== 'string') return false
    const id = suppliedId.toLowerCase()
    if (references.some((ref) => ref.length === 8 ? !id.startsWith(ref + '-') : id !== ref)) return false
    if (references.includes(id)) return true
    const prefix = id.slice(0, 8)
    // Match every scoped ticket with this prefix, including older pages. Two rows establish ambiguity.
    const matches = await this.tickets.find({
      select: { id: true },
      where: { ...scope, id: Between(prefix + '-0000-0000-0000-000000000000', prefix + '-ffff-ffff-ffff-ffffffffffff') },
      take: 2,
    })
    return matches.length === 1 && matches[0]?.id.toLowerCase() === id
  }

  private async get(scope: Scope, id: string) {
    const row = await this.tickets.findOneBy({ ...scope, id })
    if (!row) throw new TicketError('not_found')
    return toTicket(row)
  }

  async create(scope: Scope, input: { requestId: string; source: string }): Promise<Ticket> {
    const { requestId, source } = createTicketSchema.parse(input)
    const now = new Date().toISOString()
    // The unique scoped request ID handles an interrupted response or simultaneous submits.
    await this.tickets
      .createQueryBuilder()
      .insert()
      .values({
        ...scope,
        requestId,
        id: randomUUID(),
        source,
        status: 'draft',
        analysis: null,
        confirmedCategory: null,
        errorCode: null,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      })
      .orIgnore()
      .execute()
    const row = await this.tickets.findOneByOrFail({ ...scope, requestId })
    if (row.source !== source) throw new TicketError('request_id_reused')
    return toTicket(row)
  }

  async analyze(scope: Scope, id: string): Promise<Ticket> {
    await this.expireInterrupted(scope, id)
    const ticket = await this.get(scope, id)
    if (ticket.status !== 'draft' && ticket.status !== 'failed') return ticket
    const attempt = ticket.attempts + 1
    const claim = await this.tickets.update(
      { ...scope, id, status: ticket.status, attempts: ticket.attempts },
      { status: 'processing', attempts: attempt, errorCode: null, updatedAt: new Date().toISOString() },
    )
    if (!claim.affected) return this.get(scope, id)

    // Never hold a database transaction across inference. The attempt fences late completions.
    let analysis: Ticket['analysis'] = null
    let errorCode: FailureCode | null = null
    try {
      analysis = await this.model.extract(ticket.source)
    } catch (error) {
      if (!(error instanceof ModelError)) throw error
      errorCode = error.code
    }
    await this.tickets.update(
      { ...scope, id, status: 'processing', attempts: attempt },
      { status: analysis ? 'review' : 'failed', analysis, errorCode, updatedAt: new Date().toISOString() },
    )
    return this.get(scope, id)
  }

  async confirm(scope: Scope, id: string, category?: Category): Promise<Ticket> {
    const current = await this.get(scope, id)
    if (current.status === 'review' && current.analysis) {
      await this.tickets.update(
        { ...scope, id, status: 'review' },
        {
          status: 'confirmed',
          confirmedCategory: category ?? current.analysis.category,
          updatedAt: new Date().toISOString(),
        },
      )
    }
    const saved = current.status === 'review' ? await this.get(scope, id) : current
    if (saved.status !== 'confirmed' || (category && category !== saved.confirmedCategory))
      throw new TicketError('conflict')
    return saved
  }
}

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { QueryFailedError, Repository } from 'typeorm'
import type { z } from 'zod/v3'
import { TicketError } from './contracts.js'
import type {
  AttemptFailure, AttemptRef, Ticket, TicketScope, TicketSuggestion,
  confirmTicket, createTicket, reviseTicket,
} from './contracts.js'
import { TicketRecord } from './ticket.entity.js'

const attemptDurationMs = 120_000
const listLimit = 50
const now = () => new Date().toISOString()

function isExpired(record: TicketRecord) {
  return record.status === 'processing' && !!record.deadline && record.deadline <= now()
}

function toTicket(record: TicketRecord): Ticket {
  const { id, subject, body, status, revision, ai, final, failure, updatedAt } = record
  return isExpired(record)
    ? { id, subject, body, status: 'failed', revision, ai, final, failure: 'timed_out', updatedAt }
    : { id, subject, body, status, revision, ai, final, failure, updatedAt }
}

@Injectable()
export class TicketService {
  constructor(@InjectRepository(TicketRecord) private readonly tickets: Repository<TicketRecord>) {}

  async list(scope: TicketScope) {
    const records = await this.tickets.find({ where: scope, order: { updatedAt: 'DESC', id: 'DESC' }, take: listLimit })
    return records.map(toTicket)
  }

  async create(scope: TicketScope, input: z.infer<typeof createTicket>) {
    const where = { ...scope, id: input.id }
    const record = this.tickets.create({
      ...where, subject: input.subject, body: input.body, revision: 1, status: 'new',
      attemptId: null, deadline: null, failure: null, ai: null, final: null, updatedAt: now(),
    })
    try {
      await this.tickets.insert(record)
      return toTicket(record)
    } catch (error) {
      if (!(error instanceof QueryFailedError)) throw error
      const existing = await this.tickets.findOneBy(where)
      if (!existing) throw error
      if (existing.subject !== input.subject || existing.body !== input.body) throw new TicketError('conflict')
      return toTicket(existing)
    }
  }

  async begin(scope: TicketScope, input: z.infer<typeof reviseTicket>): Promise<AttemptRef> {
    const record = await this.get(scope, input.id)
    if (record.revision !== input.revision ||
        !(record.status === 'new' || record.status === 'failed' || isExpired(record))) {
      throw new TicketError('conflict')
    }
    const attemptId = randomUUID()
    await this.update(scope, record, {
      attemptId, deadline: new Date(Date.now() + attemptDurationMs).toISOString(),
      status: 'processing', failure: null,
    })
    return { id: input.id, attemptId }
  }

  async readForTriage(scope: TicketScope, input: AttemptRef) {
    const { subject, body } = await this.processing(scope, input)
    return { subject, body }
  }

  async suggest(scope: TicketScope, input: AttemptRef, ai: TicketSuggestion) {
    const record = await this.processing(scope, input)
    if (!record.body.includes(ai.evidence)) throw new TicketError('invalid_evidence')
    await this.update(scope, record, { ai, status: 'review', deadline: null })
  }

  async fail(scope: TicketScope, input: AttemptRef, failure: AttemptFailure) {
    const record = await this.tickets.findOneBy({ ...scope, id: input.id, attemptId: input.attemptId, status: 'processing' })
    if (!record) return
    await this.tickets.update({ ...scope, id: input.id, revision: record.revision }, {
      status: 'failed', revision: record.revision + 1, failure, deadline: null, updatedAt: now(),
    })
  }

  async confirm(scope: TicketScope, input: z.infer<typeof confirmTicket>) {
    const record = await this.get(scope, input.id)
    if (record.revision !== input.revision || record.status !== 'review') throw new TicketError('conflict')
    const { category, priority, summary } = input
    return this.update(scope, record, { final: { category, priority, summary }, status: 'confirmed' })
  }

  private async get(scope: TicketScope, id: string) {
    const record = await this.tickets.findOneBy({ ...scope, id })
    if (!record) throw new TicketError('not_found')
    return record
  }

  private async processing(scope: TicketScope, input: AttemptRef) {
    const record = await this.get(scope, input.id)
    if (record.status !== 'processing' || record.attemptId !== input.attemptId || isExpired(record)) {
      throw new TicketError('conflict')
    }
    return record
  }

  private async update(scope: TicketScope, record: TicketRecord, change: Partial<TicketRecord>) {
    const patch = { ...change, revision: record.revision + 1, updatedAt: now() }
    const result = await this.tickets.update({ ...scope, id: record.id, revision: record.revision }, patch)
    if (result.affected !== 1) throw new TicketError('conflict')
    return toTicket(Object.assign(record, patch))
  }
}

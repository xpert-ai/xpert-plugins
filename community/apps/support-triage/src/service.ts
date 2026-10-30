import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import type { PluginContext } from '@xpert-ai/plugin-sdk'
import { TicketEntity } from './ticket.entity.js'
import { analyzeWithModel } from './model.js'
import { actionSchema, analysisSchema, configSchema, confirmSchema, intakeSchema, key, querySchema, scopeSchema, TriageError, type Config, type Scope, type Ticket } from './domain.js'

export const CONTEXT = key('context')
const now = () => new Date().toISOString()
function dto(row: TicketEntity): Ticket {
  return { id: row.id, subject: row.subject, body: row.body, revision: row.revision, status: row.status, attempts: row.attempts,
    analysis: row.analysisJson ? analysisSchema.parse(JSON.parse(row.analysisJson)) : null,
    confirmed: row.confirmedJson ? analysisSchema.parse(JSON.parse(row.confirmedJson)) : null,
    failureCode: row.failureCode, updatedAt: row.updatedAt, createdAt: row.createdAt, confirmedAt: row.confirmedAt }
}

@Injectable()
export class TriageService {
  constructor(@InjectRepository(TicketEntity) private readonly records: Repository<TicketEntity>,
    @Inject(CONTEXT) private readonly context: Pick<PluginContext<Config>, 'config'>) {}
  private config() { return configSchema.parse(this.context.config ?? {}) }
  async get(scope: Scope, id: string): Promise<Ticket> {
    const row = await this.records.findOneBy({ ...scopeSchema.parse(scope), id })
    if (!row) throw new TriageError('not_found')
    // Recover an interrupted server request after its lease expires, without inventing an AI result.
    if (row.status === 'processing' && Date.now() - Date.parse(row.updatedAt) > 150000) {
      await this.cas(scope, row, { status: 'failed', failureCode: 'model_timeout' })
      return this.get(scope, id)
    }
    return dto(row)
  }
  async list(scope: Scope, input: { page?: number } = {}) {
    const { page } = querySchema.parse(input)
    const [rows, total] = await this.records.findAndCount({ where: scopeSchema.parse(scope), order: { updatedAt: 'DESC', id: 'ASC' }, take: 30, skip: (page - 1) * 30 })
    return { items: await Promise.all(rows.map(row => this.get(scope, row.id))), total, page }
  }
  async create(scope: Scope, input: ReturnType<typeof intakeSchema.parse>) {
    const parsed = intakeSchema.parse(input)
    const existing = await this.records.findOneBy({ id: parsed.requestId })
    if (existing) {
      if (Object.entries(scopeSchema.parse(scope)).some(([field, value]) => existing[field as keyof Scope] !== value)) throw new TriageError('not_found')
      if (existing.subject !== parsed.subject || existing.body !== parsed.body) throw new TriageError('conflict')
      return dto(existing)
    }
    const timestamp = now()
    try {
      await this.records.insert({ ...scopeSchema.parse(scope), id: parsed.requestId, subject: parsed.subject, body: parsed.body, revision: 1,
        status: 'new', attempts: 0, analysisJson: null, confirmedJson: null, failureCode: null, updatedAt: timestamp, createdAt: timestamp, confirmedAt: null })
    } catch (error) {
      // Only a duplicate of this exact request is idempotent; other database failures propagate.
      const saved = await this.records.findOneBy({ ...scope, id: parsed.requestId })
      if (!saved || saved.subject !== parsed.subject || saved.body !== parsed.body) throw error
    }
    return this.get(scope, parsed.requestId)
  }
  private async cas(scope: Scope, ticket: Pick<Ticket, 'id' | 'revision'>, patch: Partial<TicketEntity>) {
    const result = await this.records.update({ ...scopeSchema.parse(scope), id: ticket.id, revision: ticket.revision }, { ...patch, revision: ticket.revision + 1, updatedAt: now() })
    if (result.affected !== 1) throw new TriageError('conflict')
  }
  async analyze(scope: Scope, input: ReturnType<typeof actionSchema.parse>, simulateFailure = false) {
    const { id, revision } = actionSchema.parse(input)
    const ticket = await this.get(scope, id)
    if (ticket.revision !== revision) throw new TriageError('conflict')
    if (!['new', 'failed'].includes(ticket.status)) throw new TriageError('invalid_state')
    const config = this.config()
    if (simulateFailure && !config.enableFailureDemo) throw new TriageError('demo_disabled')
    await this.cas(scope, ticket, { status: 'processing', failureCode: null, attempts: ticket.attempts + 1 })
    const lease = { id, revision: revision + 1 }
    try {
      if (simulateFailure) throw new TriageError('demo_failure')
      const analysis = await analyzeWithModel(config, ticket)
      await this.cas(scope, lease, { status: 'review', analysisJson: JSON.stringify(analysis), failureCode: null })
    } catch (error) {
      if (error instanceof TriageError && error.code === 'conflict') throw error
      const code = error instanceof TriageError ? error.code : 'model_unavailable'
      await this.cas(scope, lease, { status: 'failed', failureCode: code })
    }
    if (config.debug) console.debug('[support_triage]', 'analysis_complete', { operation: randomUUID(), durationRecorded: true })
    return this.get(scope, id)
  }
  async confirm(scope: Scope, input: ReturnType<typeof confirmSchema.parse>) {
    const { id, revision, result } = confirmSchema.parse(input)
    const ticket = await this.get(scope, id)
    if (ticket.revision !== revision) throw new TriageError('conflict')
    if (ticket.status !== 'review') throw new TriageError('invalid_state')
    if (!ticket.body.includes(result.evidence)) throw new TriageError('invalid_input')
    await this.cas(scope, ticket, { status: 'confirmed', confirmedJson: JSON.stringify(result), confirmedAt: now() })
    return this.get(scope, id)
  }
}

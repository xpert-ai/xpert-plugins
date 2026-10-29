import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { BusinessError, editSchema, intakeSchema, requireScope, reviewSchema, type Demand, type Page, type Scope } from './domain.js'
import { DemandEntity } from './entity.js'
import { EVALUATOR, type Evaluator } from './jev.js'

@Injectable()
export class DemandService {
  constructor(@InjectRepository(DemandEntity) private readonly repo: Repository<DemandEntity>,
    @Inject(EVALUATOR) private readonly evaluator: Evaluator) {}

  private where(scope: Scope) {
    requireScope(scope)
    return { tenantId: scope.tenantId, organizationId: scope.organizationId, createdById: scope.userId }
  }
  private async load(scope: Scope, id: string) {
    const row = await this.repo.findOneBy({ ...this.where(scope), id })
    if (!row) throw new BusinessError('not_found')
    return row
  }
  async get(scope: Scope, id: string): Promise<Demand> { return this.dto(await this.load(scope, id)) }

  async list(scope: Scope, query: { page?: number; pageSize?: number; search?: string; selectionId?: string; status?: string } = {}): Promise<Page> {
    const page = Math.max(1, Math.min(10000, Math.trunc(query.page || 1)))
    const pageSize = Math.max(1, Math.min(50, Math.trunc(query.pageSize || 12)))
    const qb = this.repo.createQueryBuilder('d').where(this.where(scope))
    if (query.search?.trim()) {
      const search = `%${query.search.trim().slice(0, 160).replace(/[\\%_]/g, '\\$&')}%`
      qb.andWhere("(d.title LIKE :search ESCAPE '\\' OR d.customer LIKE :search ESCAPE '\\')", { search })
    }
    if (query.status) qb.andWhere('d.status = :status', { status: query.status })
    const [rows, total] = await qb.orderBy('d.updatedAt', 'DESC').addOrderBy('d.id', 'ASC').skip((page - 1) * pageSize).take(pageSize).getManyAndCount()
    return { records: rows.map(row => this.dto(row)), total, page, pageSize,
      selected: query.selectionId ? await this.get(scope, query.selectionId) : null }
  }

  async create(scope: Scope, raw: object): Promise<Demand> {
    const input = intakeSchema.parse(raw)
    const where = { ...this.where(scope), requestId: input.requestId }
    const existing = await this.repo.findOneBy(where)
    if (existing) {
      if (existing.source !== input.source || existing.title !== input.title || existing.customer !== input.customer) throw new BusinessError('request_conflict')
      return this.dto(existing)
    }
    const now = new Date().toISOString()
    const row = this.repo.create({ ...where, ...input, revision: 1, status: 'draft', assessment: null, decision: null,
      attempts: [], errorCode: null, leaseUntil: null, createdAt: now, updatedAt: now })
    try { return this.dto(await this.repo.save(row)) }
    catch (error) {
      const raced = await this.repo.findOneBy(where)
      if (!raced) throw error
      if (raced.source !== input.source || raced.title !== input.title || raced.customer !== input.customer) throw new BusinessError('request_conflict')
      return this.dto(raced)
    }
  }

  async edit(scope: Scope, id: string, raw: object) {
    const input = editSchema.parse(raw)
    const row = await this.load(scope, id)
    if (row.status === 'evaluating') throw new BusinessError('evaluation_running')
    return this.save(scope, row, input.revision, { customer: input.customer, title: input.title, source: input.source,
      status: 'draft', assessment: null, decision: null, errorCode: null })
  }

  async evaluate(scope: Scope, id: string): Promise<Demand> {
    const row = await this.load(scope, id)
    if (row.status === 'review' || row.status === 'confirmed') return this.dto(row)
    if (row.status === 'evaluating' && row.leaseUntil && row.leaseUntil > new Date().toISOString()) throw new BusinessError('evaluation_running')
    const now = new Date().toISOString()
    const attempt = { id: randomUUID(), startedAt: now, status: 'running' as const }
    const previous = row.attempts.map(item => item.status === 'running'
      ? { ...item, status: 'failed' as const, finishedAt: now, errorCode: 'interrupted' } : item)
    const started = await this.save(scope, row, row.revision, { status: 'evaluating', errorCode: null,
      leaseUntil: new Date(Date.now() + 120000).toISOString(), attempts: [...previous.slice(-19), attempt] })
    let assessment
    try { assessment = await this.evaluator.evaluate(row.source) }
    catch (error) {
      const errorCode = error instanceof BusinessError ? error.code : 'model_unavailable'
      return this.save(scope, row, started.revision, { status: 'failed', leaseUntil: null, errorCode,
        attempts: [...previous.slice(-19), { ...attempt, status: 'failed', finishedAt: new Date().toISOString(), errorCode }] })
    }
    return this.save(scope, row, started.revision, { status: 'review', assessment, decision: null, leaseUntil: null, errorCode: null,
      attempts: [...previous.slice(-19), { ...attempt, status: 'succeeded', finishedAt: new Date().toISOString() }] })
  }

  async confirm(scope: Scope, id: string, raw: object): Promise<Demand> {
    const input = reviewSchema.parse(raw)
    const row = await this.load(scope, id)
    if (row.status !== 'review' && row.status !== 'confirmed') throw new BusinessError('assessment_required')
    if (!row.assessment) throw new BusinessError('assessment_required')
    const { revision, ...fields } = input
    return this.save(scope, row, revision, { status: 'confirmed', decision: {
      ...fields, confirmedBy: scope.userId, confirmedAt: new Date().toISOString()
    } })
  }

  private async save(scope: Scope, row: DemandEntity, expectedRevision: number, changes: Partial<DemandEntity>): Promise<Demand> {
    const result = await this.repo.update({ ...this.where(scope), id: row.id, revision: expectedRevision },
      { ...changes, revision: expectedRevision + 1, updatedAt: new Date().toISOString() })
    if (result.affected !== 1) throw new BusinessError('revision_conflict')
    return this.get(scope, row.id)
  }
  private dto(row: DemandEntity): Demand {
    return { id: row.id, customer: row.customer, title: row.title, source: row.source, status: row.status,
      revision: row.revision, assessment: row.assessment, decision: row.decision, attempts: row.attempts,
      errorCode: row.errorCode, createdAt: row.createdAt, updatedAt: row.updatedAt }
  }
}

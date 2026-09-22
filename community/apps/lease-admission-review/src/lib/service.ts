import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { ReviewCase, ReviewEvent } from './entities'
import {
  CaseDto,
  Scope,
  scopeSchema,
  createSchema,
  mutationSchema,
  confirmSchema,
  fieldsSchema,
  Fields,
  FailureCode,
  ReviewError,
  validateEvidence
} from './contracts'

const leaseMs = 5 * 60 * 1000
@Injectable()
export class ReviewService {
  constructor(private readonly db: DataSource) {}
  private scope(scope: Scope) {
    const parsed = scopeSchema.safeParse(scope)
    if (!parsed.success) throw new ReviewError('scope_required')
    return parsed.data
  }
  async create(scope: Scope, raw: unknown): Promise<CaseDto> {
    const input = createSchema.parse(raw),
      identity = this.scope(scope)
    return this.db.transaction(async (manager) => {
      // Serialize duplicate creation requests in the same user's assistant scope.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [JSON.stringify([identity, input.operationId])]
      )
      const repo = manager.getRepository(ReviewCase)
      const existing = await repo.findOneBy({
        ...identity,
        createdOperation: input.operationId
      })
      if (existing) return this.dto(existing)
      const row = await repo.save(
        repo.create({
          ...identity,
          createdOperation: input.operationId,
          title: input.title,
          source: input.source,
          status: 'draft',
          revision: 1
        })
      )
      await this.event(manager, row, input.operationId, 'created', null)
      return this.dto(row)
    })
  }
  async list(scope: Scope, page = 1) {
    const [rows, total] = await this.db
      .getRepository(ReviewCase)
      .findAndCount({
        where: this.scope(scope),
        order: { createdAt: 'DESC', id: 'DESC' },
        take: 20,
        skip: (page - 1) * 20
      })
    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        revision: r.revision,
        updatedAt: r.updatedAt.toISOString()
      })),
      total
    }
  }
  async detail(scope: Scope, id: string): Promise<CaseDto> {
    return this.db.transaction(async (manager) => {
      const row = await this.lock(manager, scope, id)
      await this.expire(manager, row)
      return this.dto(row)
    })
  }
  async start(scope: Scope, raw: unknown): Promise<CaseDto> {
    const input = mutationSchema.parse(raw)
    return this.db.transaction(async (manager) => {
      const row = await this.lock(manager, scope, input.id)
      if (await this.replayed(manager, row, input.operationId))
        return this.dto(row)
      await this.expire(manager, row)
      if (row.revision !== input.revision) throw new ReviewError('conflict')
      if (!['draft', 'failed'].includes(row.status))
        throw new ReviewError('invalid_state')
      row.status = 'extracting'
      row.attemptId = randomUUID()
      row.attemptStartedAt = new Date()
      row.failureCode = null
      row.revision++
      await manager.save(row)
      await this.event(manager, row, input.operationId, 'started', null)
      return this.dto(row)
    })
  }
  async readAttempt(scope: Scope, attemptId: string) {
    const row = await this.db
      .getRepository(ReviewCase)
      .findOneBy({ ...this.scope(scope), attemptId })
    if (!row) throw new ReviewError('not_found')
    if (
      row.status !== 'extracting' ||
      !row.attemptStartedAt ||
      Date.now() - row.attemptStartedAt.getTime() > leaseMs
    )
      throw new ReviewError('invalid_state')
    return { id: row.id, source: row.source }
  }
  async saveCandidates(scope: Scope, attemptId: string, raw: Fields) {
    const fields = fieldsSchema.parse(raw)
    return this.withAttempt(scope, attemptId, async (manager, row) => {
      if (row.status === 'review' || row.status === 'confirmed') {
        if (JSON.stringify(row.candidates) === JSON.stringify(fields))
          return this.receipt(row)
        throw new ReviewError('invalid_state')
      }
      this.assertActive(row)
      validateEvidence(row.source, fields)
      row.candidates = fields
      row.status = 'review'
      row.revision++
      await manager.save(row)
      await this.event(
        manager,
        row,
        `${attemptId}:candidate`,
        'candidate_saved',
        { fields }
      )
      return this.receipt(row)
    })
  }
  async failAttempt(
    scope: Scope,
    attemptId: string,
    failureCode: Exclude<FailureCode, null>
  ) {
    return this.withAttempt(scope, attemptId, async (manager, row) => {
      if (row.status === 'failed') return this.receipt(row)
      if (row.status !== 'extracting') throw new ReviewError('invalid_state')
      row.failureCode = failureCode
      row.status = 'failed'
      row.revision++
      await manager.save(row)
      await this.event(manager, row, `${attemptId}:failed`, 'failed', {
        failureCode
      })
      return this.receipt(row)
    })
  }
  async confirm(scope: Scope, raw: unknown): Promise<CaseDto> {
    const input = confirmSchema.parse(raw)
    return this.db.transaction(async (manager) => {
      const row = await this.lock(manager, scope, input.id)
      if (await this.replayed(manager, row, input.operationId))
        return this.dto(row)
      if (row.revision !== input.revision) throw new ReviewError('conflict')
      if (row.status !== 'review') throw new ReviewError('invalid_state')
      validateEvidence(row.source, input.fields)
      if (
        JSON.stringify(row.candidates) !== JSON.stringify(input.fields) &&
        !input.reason
      )
        throw new ReviewError('reason_required')
      row.confirmed = input.fields
      row.reason = input.reason
      row.status = 'confirmed'
      row.revision++
      await manager.save(row)
      await this.event(manager, row, input.operationId, 'confirmed', {
        fields: input.fields,
        reason: input.reason
      })
      return this.dto(row)
    })
  }
  private assertActive(row: ReviewCase) {
    if (
      row.status !== 'extracting' ||
      !row.attemptStartedAt ||
      Date.now() - row.attemptStartedAt.getTime() > leaseMs
    )
      throw new ReviewError('invalid_state')
  }
  private async expire(manager: EntityManager, row: ReviewCase) {
    if (
      row.status === 'extracting' &&
      row.attemptStartedAt &&
      Date.now() - row.attemptStartedAt.getTime() > leaseMs
    ) {
      row.status = 'failed'
      row.failureCode = 'timeout'
      row.revision++
      await manager.save(row)
      await this.event(manager, row, `${row.attemptId}:timeout`, 'failed', {
        failureCode: 'timeout'
      })
    }
  }
  private async withAttempt<T>(
    scope: Scope,
    attemptId: string,
    fn: (manager: EntityManager, row: ReviewCase) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(async (manager) => {
      const row = await manager
        .getRepository(ReviewCase)
        .findOne({
          where: { ...this.scope(scope), attemptId },
          lock: { mode: 'pessimistic_write' }
        })
      if (!row) throw new ReviewError('not_found')
      return fn(manager, row)
    })
  }
  private async lock(manager: EntityManager, scope: Scope, id: string) {
    const row = await manager
      .getRepository(ReviewCase)
      .findOne({
        where: { ...this.scope(scope), id },
        lock: { mode: 'pessimistic_write' }
      })
    if (!row) throw new ReviewError('not_found')
    return row
  }
  private replayed(
    manager: EntityManager,
    row: ReviewCase,
    operationId: string
  ) {
    return manager
      .getRepository(ReviewEvent)
      .existsBy({
        tenantId: row.tenantId,
        organizationId: row.organizationId,
        userId: row.userId,
        assistantId: row.assistantId,
        caseId: row.id,
        operationId
      })
  }
  private async event(
    manager: EntityManager,
    row: ReviewCase,
    operationId: string,
    kind: string,
    snapshot: ReviewEvent['snapshot']
  ) {
    await manager
      .getRepository(ReviewEvent)
      .save({
        tenantId: row.tenantId,
        organizationId: row.organizationId,
        userId: row.userId,
        assistantId: row.assistantId,
        caseId: row.id,
        operationId,
        kind,
        revision: row.revision,
        snapshot
      })
  }
  private receipt(row: ReviewCase) {
    return { id: row.id, status: row.status, revision: row.revision }
  }
  private dto(row: ReviewCase): CaseDto {
    return {
      id: row.id,
      title: row.title,
      source: row.source,
      status: row.status,
      revision: row.revision,
      attemptId: row.attemptId ?? null,
      candidates: row.candidates ?? null,
      confirmed: row.confirmed ?? null,
      reason: row.reason ?? null,
      failureCode: row.failureCode ?? null,
      updatedAt: row.updatedAt.toISOString()
    }
  }
}

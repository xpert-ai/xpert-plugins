import { Inject, Injectable } from '@nestjs/common'
import { DataSource, type EntityManager } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { MeetingRecord, AnalysisAttempt } from './entities.js'
import { fingerprint, segmentSource, reviewItems, assertFingerprint } from './domain.js'
import { CONFIG, INSTALLATION } from './constants.js'
import { createSchema, saveSchema, retrySchema, type PluginConfig, type CreateInput, type SaveInput, type RetryInput } from './schemas.js'
import { fail, type Scope, type Installation } from './types.js'

@Injectable()
export class MeetingRecordService {
  constructor(readonly db: DataSource, @Inject(CONFIG) private readonly config: PluginConfig,
    @Inject(INSTALLATION) private readonly installation: Installation) {}

  async record(scope: Scope, id: string, manager = this.db.manager, lock = false) {
    const row = await manager.findOne(MeetingRecord, { where: { ...scope, id }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) })
    return row ?? fail('NOT_FOUND')
  }
  async existingCreate(scope: Scope, input: CreateInput) {
    const row = await this.db.manager.findOneBy(MeetingRecord, { ...scope, createOperationId: input.operationId })
    if (row) assertFingerprint(row.createPayloadHash, fingerprint({ title: input.title, sourceText: input.sourceText }))
    return row
  }
  async create(scope: Scope, raw: CreateInput) {
    const input = createSchema.parse(raw)
    const previous = await this.existingCreate(scope, input)
    if (previous) return previous
    const now = new Date()
    try {
      return await this.db.transaction(async manager => {
        const row = manager.create(MeetingRecord, {
          ...scope, id: randomUUID(), title: input.title, sourceText: input.sourceText,
          sourceSegments: segmentSource(input.sourceText), sourceHash: fingerprint(input.sourceText), status: 'processing',
          revision: 1, activeAttemptId: null, initialItems: null, reviewItems: null,
          createOperationId: input.operationId, createPayloadHash: fingerprint({ title: input.title, sourceText: input.sourceText }),
          lastSaveOperationId: null, lastSavePayloadHash: null, confirmOperationId: null, confirmPayloadHash: null,
          confirmedAt: null, confirmedBy: null, createdAt: now, updatedAt: now
        })
        await manager.save(row)
        const attempt = await this.newAttempt(manager, row, input.operationId, fingerprint(input), 1)
        row.activeAttemptId = attempt.id
        return manager.save(row)
      })
    } catch (error) {
      const winner = await this.existingCreate(scope, input)
      if (winner) return winner
      throw error
    }
  }
  async newAttempt(manager: EntityManager, row: MeetingRecord, operationId: string, hash: string, no: number) {
    if (!this.installation.scopeKey || this.installation.tenantId !== row.tenantId) fail('BACKGROUND_UNAVAILABLE')
    const now = new Date(), id = randomUUID()
    return manager.save(manager.create(AnalysisAttempt, {
      id, recordId: row.id, tenantId: row.tenantId, organizationId: row.organizationId, ownerUserId: row.ownerUserId,
      attemptNo: no, requestOperationId: operationId, requestPayloadHash: hash, status: 'queued',
      installationScopeKey: this.installation.scopeKey, publishedVersion: null, agentKey: null,
      clientMessageId: `mar-${id}`, conversationId: randomUUID(), rootExecutionId: randomUUID(), threadId: null,
      dispatchInput: null, outputHash: null, platformStatus: null, errorCode: null, errorMessage: null,
      deadlineAt: new Date(now.getTime() + this.config.timeoutSeconds * 1000), nextCheckAt: now,
      leaseUntil: null, startedAt: null, finishedAt: null, createdAt: now, updatedAt: now
    }))
  }
  async retry(scope: Scope, raw: RetryInput) {
    const input = retrySchema.parse(raw)
    return this.db.transaction(async manager => {
      const row = await this.record(scope, input.meetingId, manager, true)
      const existing = await manager.findOneBy(AnalysisAttempt, { recordId: row.id, requestOperationId: input.operationId })
      if (existing) { assertFingerprint(existing.requestPayloadHash, fingerprint(input)); return row }
      if (row.revision !== input.expectedRevision) fail('VERSION_CONFLICT')
      if (row.status !== 'failed') fail('INVALID_STATE')
      const previous = await manager.findOneByOrFail(AnalysisAttempt, { id: row.activeAttemptId! })
      const next = await this.newAttempt(manager, row, input.operationId, fingerprint(input), previous.attemptNo + 1)
      row.activeAttemptId = next.id; row.status = 'processing'; row.revision++; row.updatedAt = new Date()
      return manager.save(row)
    })
  }
  async existingRetry(scope: Scope, input: RetryInput) {
    const row = await this.record(scope, input.meetingId)
    const attempt = await this.db.manager.findOneBy(AnalysisAttempt, { recordId: row.id, requestOperationId: input.operationId })
    if (!attempt) return null
    assertFingerprint(attempt.requestPayloadHash, fingerprint(input))
    return row
  }
  async save(scope: Scope, raw: SaveInput, confirm = false) {
    const input = saveSchema.parse(raw), hash = fingerprint(input)
    return this.db.transaction(async manager => {
      const row = await this.record(scope, input.meetingId, manager, true)
      const key = confirm ? row.confirmOperationId : row.lastSaveOperationId
      if (key === input.operationId) {
        assertFingerprint(confirm ? row.confirmPayloadHash : row.lastSavePayloadHash, hash)
        return row
      }
      if (row.status === 'confirmed') fail('ALREADY_CONFIRMED')
      if (row.revision !== input.expectedRevision) fail('VERSION_CONFLICT')
      if (row.status !== 'review_ready' || !row.initialItems) fail('INVALID_STATE')
      row.reviewItems = reviewItems(input.items, row.initialItems)
      row.revision++; row.updatedAt = new Date()
      if (confirm) {
        row.status = 'confirmed'; row.confirmOperationId = input.operationId; row.confirmPayloadHash = hash
        row.confirmedAt = new Date(); row.confirmedBy = scope.ownerUserId
      } else { row.lastSaveOperationId = input.operationId; row.lastSavePayloadHash = hash }
      return manager.save(row)
    })
  }
  async list(scope: Scope, cursor?: string, page = 1, pageSize = 20) {
    const query = this.db.getRepository(MeetingRecord).createQueryBuilder('r').where(scope)
    if (cursor) {
      const anchor = await this.record(scope, cursor)
      query.andWhere('(r.updated_at, r.id) < (:date, :id)', { date: anchor.updatedAt, id: anchor.id })
    }
    if (!cursor) query.skip((page - 1) * pageSize)
    const rows = await query.orderBy('r.updated_at', 'DESC').addOrderBy('r.id', 'DESC').take(pageSize + 1).getMany()
    return { items: rows.slice(0, pageSize).map(r => ({ id: r.id, title: r.title, status: r.status, updatedAt: r.updatedAt.toISOString() })), nextCursor: rows.length > pageSize ? rows[pageSize - 1].id : undefined }
  }
  async detail(scope: Scope, id: string) { return this.dto(await this.record(scope, id)) }
  async dto(row: MeetingRecord) {
    const attempt = row.activeAttemptId ? await this.db.manager.findOneBy(AnalysisAttempt, { id: row.activeAttemptId, recordId: row.id }) : null
    return {
      id: row.id, title: row.title, status: row.status, sourceText: row.sourceText, sourceSegments: row.sourceSegments,
      items: row.reviewItems, initialItems: row.initialItems, revision: row.revision,
      updatedAt: row.updatedAt.toISOString(), confirmedAt: row.confirmedAt?.toISOString() ?? null,
      lastSaveOperationId: row.lastSaveOperationId, confirmOperationId: row.confirmOperationId,
      attempt: attempt ? { number: attempt.attemptNo, status: attempt.status, errorCode: attempt.errorCode } : null,
      // UUIDs are allocated before dispatch. Only a receipt or accepted tool result proves existence.
      analysisSession: attempt && (attempt.startedAt || attempt.outputHash) ? {
        state: 'ready' as const, number: attempt.attemptNo, conversationId: attempt.conversationId,
        executionId: attempt.rootExecutionId, ...(attempt.threadId ? { threadId: attempt.threadId } : {})
      } : { state: attempt && ['queued','dispatching','running'].includes(attempt.status) ? 'pending' as const : 'unavailable' as const }
    }
  }
}

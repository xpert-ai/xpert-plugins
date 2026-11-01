import { Injectable } from '@nestjs/common'
import { DataSource, type EntityManager } from 'typeorm'
import { AnalysisAttempt, MeetingRecord } from './entities.js'
import { acceptItems, assertFingerprint, fingerprint } from './domain.js'
import { extractionSchema, type ExtractionInput } from './schemas.js'
import { fail, type ToolScope } from './types.js'

export const terminal = (a: AnalysisAttempt) => ['succeeded', 'failed', 'timed_out'].includes(a.status)
@Injectable()
export class AnalysisService {
  constructor(readonly db: DataSource) {}
  async locked<T>(attemptId: string, fn: (r: MeetingRecord, a: AnalysisAttempt, m: EntityManager) => Promise<T>) {
    const locator = await this.db.manager.findOneBy(AnalysisAttempt, { id: attemptId })
    if (!locator) fail('NOT_FOUND')
    return this.db.transaction(async manager => {
      const row = await manager.findOne(MeetingRecord, { where: { id: locator.recordId }, lock: { mode: 'pessimistic_write' } })
      const attempt = await manager.findOne(AnalysisAttempt, { where: { id: attemptId }, lock: { mode: 'pessimistic_write' } })
      if (!row || !attempt) fail('NOT_FOUND')
      return fn(row, attempt, manager)
    })
  }
  async toolAttempt(scope: ToolScope) {
    const attempt = await this.db.manager.findOneBy(AnalysisAttempt, {
      conversationId: scope.conversationId, tenantId: scope.tenantId,
      organizationId: scope.organizationId, ownerUserId: scope.ownerUserId
    })
    if (!attempt) fail('NO_ACTIVE_CONTEXT')
    return attempt
  }
  authorize(scope: ToolScope, row: MeetingRecord, attempt: AnalysisAttempt) {
    if (scope.tenantId !== row.tenantId || scope.organizationId !== row.organizationId || scope.ownerUserId !== row.ownerUserId ||
      scope.assistantId !== row.assistantId || scope.conversationId !== attempt.conversationId || scope.agentKey !== attempt.agentKey) fail('NOT_FOUND')
    if (row.activeAttemptId !== attempt.id) fail('ATTEMPT_EXPIRED')
  }
  async source(scope: ToolScope) {
    const current = await this.toolAttempt(scope)
    return this.locked(current.id, async (row, attempt) => {
      this.authorize(scope, row, attempt)
      if (terminal(attempt) || row.status !== 'processing' || attempt.deadlineAt.getTime() <= Date.now()) fail('ATTEMPT_EXPIRED')
      return { title: row.title, segments: row.sourceSegments.segments.map(s => ({ id: s.id, text: row.sourceText.slice(s.start, s.end) })),
        rules: 'Only explicit commitments. Do not infer missing owners/dates, retain original deadline wording, omit cancelled actions and suggestions. Return [] when no actions exist.' }
    })
  }
  async submit(scope: ToolScope, raw: ExtractionInput) {
    const input = extractionSchema.parse(raw), hash = fingerprint(input)
    const current = await this.toolAttempt(scope)
    return this.locked(current.id, async (row, attempt, manager) => {
      this.authorize(scope, row, attempt)
      if (attempt.status === 'succeeded') {
        assertFingerprint(attempt.outputHash, hash)
        return { accepted: true, count: row.initialItems!.length }
      }
      if (terminal(attempt) || row.status !== 'processing' || attempt.deadlineAt.getTime() <= Date.now()) fail('ATTEMPT_EXPIRED')
      const items = acceptItems(input, row.sourceSegments)
      row.initialItems = items; row.reviewItems = structuredClone(items); row.status = 'review_ready'
      row.revision++; row.updatedAt = new Date()
      attempt.status = 'succeeded'; attempt.outputHash = hash; attempt.finishedAt = new Date(); attempt.updatedAt = new Date()
      attempt.leaseUntil = null; attempt.errorCode = null; attempt.errorMessage = null
      await manager.save(attempt); await manager.save(row)
      return { accepted: true, count: items.length }
    })
  }
  async finishFailure(id: string, code: string, timeout = false) {
    return this.locked(id, async (row, attempt, manager) => {
      if (terminal(attempt) || row.activeAttemptId !== attempt.id || row.status !== 'processing') return false
      attempt.status = timeout ? 'timed_out' : 'failed'; attempt.errorCode = code; attempt.errorMessage = code
      attempt.finishedAt = new Date(); attempt.updatedAt = new Date(); attempt.leaseUntil = null
      row.status = 'failed'; row.revision++; row.updatedAt = new Date()
      await manager.save(attempt); await manager.save(row)
      return true
    })
  }
}

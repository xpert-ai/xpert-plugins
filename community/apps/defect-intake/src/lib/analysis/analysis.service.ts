import { Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { z } from 'zod/v3'
import { MANAGED_QUEUE_SERVICE_TOKEN, ViewMiddlewareRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type ManagedQueueService, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { IntakeError, recordSchema, type Scope } from '../../shared/contracts'
import { analyzeSchema, type AnalysisFailure, type AnalysisResult, type AnalysisState } from '../../shared/analysis'
import { artifact, feature, middlewareName, packageMeta } from '../constants'
import { IntakeEntity } from '../intake.entity'
import { activeAnalysis, buildAnalysisInput, mergeAnalysisReport } from './domain'
import { AnalysisAttempt } from './attempt.entity'

export const analysisQueue = artifact('analysis')
export const analysisJob = artifact('extract')
export type AnalysisHost = { assistantId: string; workspaceId: string }
export const scopeWhere = (scope: Scope) => {
  if (!scope.tenantId || !scope.organizationId || !scope.userId) throw new IntakeError('scope_required')
  return { tenantId: scope.tenantId, organizationId: scope.organizationId, ownerId: scope.userId }
}
export const attemptState = (attempt: AnalysisAttempt): AnalysisState => ({ id: attempt.id, status: attempt.status, sourceRevision: attempt.sourceRevision, createdAt: attempt.createdAt.toISOString(), completedAt: attempt.completedAt?.toISOString() || null, errorCode: attempt.errorCode })

@Injectable()
export class AnalysisService {
  constructor(
    @InjectDataSource() readonly db: DataSource,
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN) readonly queue: ManagedQueueService,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) readonly capabilities: RuntimeCapabilityRegistry
  ) {}

  resolveRuntime(scope: Scope, host: AnalysisHost) {
    scopeWhere(scope)
    return this.capabilities.require(ViewMiddlewareRuntimeCapability).resolve({ context: { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId, hostType: 'agent', hostId: host.assistantId, workspaceId: host.workspaceId, slots: [] }, provider: middlewareName, requiredFeature: feature })
  }

  async start(scope: Scope, recordId: string, host: AnalysisHost, input: z.infer<typeof analyzeSchema>) {
    analyzeSchema.parse(input)
    if (!z.string().uuid().safeParse(recordId).success) throw new IntakeError('not_found')
    // Authorization is checked now and again in the persisted worker context.
    await this.resolveRuntime(scope, host)
    await this.reconcile(scope, recordId)
    const attempt = await this.db.transaction(async manager => {
      const record = await manager.findOne(IntakeEntity, { where: { ...scopeWhere(scope), id: recordId }, lock: { mode: 'pessimistic_write' } })
      if (!record) throw new IntakeError('not_found')
      const duplicate = await manager.findOneBy(AnalysisAttempt, { ...scopeWhere(scope), recordId, requestId: input.requestId })
      if (duplicate) return duplicate
      if (activeAnalysis(record.analysis) && record.analysis) return manager.findOneByOrFail(AnalysisAttempt, { ...scopeWhere(scope), id: record.analysis.id })
      if (record.revision !== input.revision) throw new IntakeError('revision_conflict')
      const snapshot = buildAnalysisInput(recordSchema.parse({ ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() }))
      if (JSON.stringify(snapshot).length > 60000) throw new IntakeError('invalid_input')
      const id = randomUUID()
      const created = await manager.save(AnalysisAttempt, manager.create(AnalysisAttempt, { ...scopeWhere(scope), id, recordId, requestId: input.requestId, ...host, sourceRevision: record.revision, input: snapshot, status: 'queued', jobId: `${artifact('attempt')}-${id}`, errorCode: null, result: null, completedAt: null, startedAt: null, deadlineAt: new Date(Date.now() + 180000) }))
      record.analysis = attemptState(created)
      record.protectedFields = snapshot.protectedFields
      await manager.save(record)
      return created
    })
    if (attempt.status === 'queued') await this.enqueue(scope, attempt)
  }

  private async enqueue(scope: Scope, attempt: AnalysisAttempt) {
    try {
      await this.queue.enqueue({ pluginName: packageMeta.name, queueName: analysisQueue, jobName: analysisJob, payload: { attemptId: attempt.id }, ...scope, scopeKey: 'system:global', jobId: attempt.jobId || undefined, attempts: 1, removeOnComplete: { age: 86400, count: 500 }, removeOnFail: { age: 86400, count: 500 } })
    } catch { await this.finish(scope, attempt.id, null, 'queue_unavailable') }
  }

  /** Durable read repair: recover an enqueue gap or an interrupted worker; never infer success. */
  async reconcile(scope: Scope, recordId: string) {
    if (!z.string().uuid().safeParse(recordId).success) return
    const row = await this.db.getRepository(IntakeEntity).findOneBy({ ...scopeWhere(scope), id: recordId })
    if (!row?.analysis || !activeAnalysis(row.analysis)) return
    const attempt = await this.db.getRepository(AnalysisAttempt).findOneBy({ ...scopeWhere(scope), id: row.analysis.id })
    if (!attempt) return
    if (attempt.deadlineAt.getTime() < Date.now()) { await this.finish(scope, attempt.id, null, 'model_timeout'); return }
    try {
      const job = attempt.jobId ? await this.queue.getJob({ jobId: attempt.jobId }) : null
      if (!job && attempt.status === 'queued') await this.enqueue(scope, attempt)
      else if (!job || job.state === 'failed' || job.state === 'completed') await this.finish(scope, attempt.id, null, 'interrupted')
    } catch { /* A transient queue inspection failure must not erase a running attempt. */ }
  }

  async claim(scope: Scope, attemptId: string) {
    return this.db.transaction(async manager => {
      const attempt = await manager.findOne(AnalysisAttempt, { where: { ...scopeWhere(scope), id: attemptId }, lock: { mode: 'pessimistic_write' } })
      if (!attempt || attempt.status !== 'queued') return null
      const record = await manager.findOneBy(IntakeEntity, { ...scopeWhere(scope), id: attempt.recordId })
      if (!record || record.revision !== attempt.sourceRevision || record.analysis?.id !== attempt.id || !activeAnalysis(record.analysis)) {
        await manager.update(AnalysisAttempt, attempt.id, { status: 'superseded', completedAt: new Date() }); return null
      }
      attempt.status = 'running'; attempt.startedAt = new Date()
      await manager.save(attempt)
      await manager.update(IntakeEntity, { ...scopeWhere(scope), id: record.id, revision: attempt.sourceRevision }, { analysis: attemptState(attempt) })
      return attempt
    })
  }

  async finish(scope: Scope, attemptId: string, result: AnalysisResult | null, errorCode: AnalysisFailure | null) {
    await this.db.transaction(async manager => {
      const attempt = await manager.findOne(AnalysisAttempt, { where: { ...scopeWhere(scope), id: attemptId }, lock: { mode: 'pessimistic_write' } })
      if (!attempt || !['queued', 'running'].includes(attempt.status)) return
      const row = await manager.findOne(IntakeEntity, { where: { ...scopeWhere(scope), id: attempt.recordId }, lock: { mode: 'pessimistic_write' } })
      const current = row && row.revision === attempt.sourceRevision && row.analysis?.id === attempt.id && activeAnalysis(row.analysis)
      attempt.completedAt = new Date()
      attempt.status = !current ? 'superseded' : result ? 'succeeded' : 'failed'
      attempt.errorCode = current ? errorCode : null
      attempt.result = result
      await manager.save(attempt)
      if (!row || row.analysis?.id !== attempt.id) return
      row.analysis = attemptState(attempt)
      if (current && result) {
        row.report = mergeAnalysisReport(attempt.input, result)
        row.aiResult = result
        row.status = result.questions.length ? 'needs_information' : 'ready_for_review'
        row.revision++
      }
      await manager.save(row)
    })
  }
}

import { FactoryProfileMigration } from './migrations/assistant-profile.migration.js'
import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MANAGED_QUEUE_SERVICE_TOKEN, type ManagedQueueService } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm'
import { FACTORY_CONFIG, FACTORY_RUNTIME_SCOPE, type FactoryConfig, type FactoryRuntimeScope } from './config.js'
import { AGENT_KEYS, FACTORY_PLUGIN_NAME } from './constants.js'
import type { FactoryScope } from './domain/types.js'
import { FactoryCaseEntity, FactoryContinuationEntity, FactoryExecutionRecordEntity } from './entities/index.js'
import { FactoryApprovalPolicy } from './factory-approval-policy.service.js'
import { FactoryAssistantTaskService } from './factory-assistant-task.service.js'
import { FactoryOperationsService } from './factory-operations.service.js'
import type { ApproveRecoveryPlanInput } from './tool-schemas.js'

export const FACTORY_CONTINUATION_QUEUE = 'factory_ops.continuations'
export const FACTORY_CONTINUATION_JOB = 'advance'
export interface FactoryContinuationJob { id: string; generation: number }

@Injectable()
export class FactoryContinuationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FactoryContinuationService.name)
  private timer?: ReturnType<typeof setInterval>
  private sweeping = false
  constructor(
    @InjectRepository(FactoryContinuationEntity) private readonly continuations: Repository<FactoryContinuationEntity>,
    @InjectRepository(FactoryCaseEntity) private readonly cases: Repository<FactoryCaseEntity>,
    @InjectRepository(FactoryExecutionRecordEntity) private readonly executions: Repository<FactoryExecutionRecordEntity>,
    private readonly operations: FactoryOperationsService,
    private readonly tasks: FactoryAssistantTaskService,
    private readonly policy: FactoryApprovalPolicy,
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue: ManagedQueueService,
    @Inject(FACTORY_RUNTIME_SCOPE) private readonly runtime: FactoryRuntimeScope,
    @Inject(FACTORY_CONFIG) private readonly config: FactoryConfig,
    private readonly migration: FactoryProfileMigration
  ) {}

  async onModuleInit() {
    await this.migration.ensure()
    this.timer = setInterval(() => { void this.recoverOutbox() }, 5_000)
    this.timer.unref?.()
    void this.recoverOutbox()
  }
  onModuleDestroy() { clearInterval(this.timer) }

  async approveAndContinue(scope: FactoryScope, input: ApproveRecoveryPlanInput) {
    const result = await this.operations.approveRecoveryPlan(scope, input, async (manager, entity, next) => {
      const id = randomUUID()
      await manager.getRepository(FactoryContinuationEntity).save({
        id, executionOperationId: `fc-${id}-execute`, verificationOperationId: null, tenantId: scope.tenantId, organizationId: scope.organizationId ?? null,
        scopeKey: scopeKey(scope), installationScopeKey: this.runtime.scopeKey, caseId: entity.id,
        operationId: input.operationId, actorId: scope.userId!, coordinatorXpertId: entity.coordinatorXpertId ?? null,
        approvedRevision: next.revision, expectedRevision: next.revision, planRevision: next.plan!.artifactRevision,
        status: 'pending', step: 'execute', generation: 0, failures: 0, verificationAttempt: 0,
        availableAt: new Date(), leaseUntil: null, leaseToken: null, verificationRecordId: null, reasonCode: null
      })
    })
    const continuation = await this.continuations.findOneByOrFail({ scopeKey: scopeKey(scope), operationId: input.operationId })
    // The database intent survives even if Redis is unavailable immediately after approval.
    await this.enqueue(continuation).catch(() => this.logger.warn('Approved continuation awaits outbox recovery.'))
    return { ...result, continuation: publicContinuation(continuation) }
  }

  async retry(scope: FactoryScope, id: string, baseRevision: number) {
    const record = await this.continuations.findOneByOrFail({ id, scopeKey: scopeKey(scope) })
    const entity = await this.requireCase(record)
    await this.policy.assertHumanApprover(scope, entity)
    if (entity.revision !== baseRevision) throw new ConflictException('factory_revision_conflict')
    if (!['blocked', 'failed'].includes(record.status)) return publicContinuation(record)
    // The original approval authority must still be valid; retries do not replace its actor or version.
    await this.policy.assertHumanApprover(continuationScope(record), entity)
    assertApproval(record, entity)
    if (entity.revision !== record.expectedRevision) throw new ConflictException('factory_continuation_revision_changed')
    const execution = record.verificationRecordId ? await this.executions.findOneBy({ id: record.verificationRecordId }) : null
    const retryVerification = execution && ['failed', 'interrupted', 'cancelled'].includes(execution.status)
    await this.continuations.update({ id, generation: record.generation, status: record.status }, {
      status: 'pending', reasonCode: null, failures: 0, generation: record.generation + 1,
      verificationAttempt: record.verificationAttempt + (retryVerification ? 1 : 0),
      verificationRecordId: retryVerification ? null : record.verificationRecordId,
      leaseToken: null, leaseUntil: null, availableAt: new Date()
    })
    await this.recoverOutbox()
    return publicContinuation(await this.continuations.findOneByOrFail({ id }))
  }

  async recoverOutbox() {
    if (this.sweeping) return
    this.sweeping = true
    try {
      const records = await this.continuations.find({
        where: { installationScopeKey: this.runtime.scopeKey, status: In(['pending', 'waiting', 'running']), availableAt: LessThanOrEqual(new Date()) },
        order: { availableAt: 'ASC' }, take: 100
      })
      for (const record of records) {
        if (record.leaseUntil && record.leaseUntil > new Date()) continue
        await this.enqueue(record)
      }
    } catch {
      this.logger.warn('Continuation outbox will retry after infrastructure recovers.')
    } finally { this.sweeping = false }
  }

  private async enqueue(record: FactoryContinuationEntity) {
    await this.queue.enqueue({
      pluginName: FACTORY_PLUGIN_NAME, queueName: FACTORY_CONTINUATION_QUEUE, jobName: FACTORY_CONTINUATION_JOB,
      payload: { id: record.id, generation: record.generation } satisfies FactoryContinuationJob,
      jobId: `factory-continue-${record.id}-${record.generation}`, tenantId: record.tenantId,
      organizationId: record.organizationId, userId: record.actorId, scopeKey: record.installationScopeKey,
      delayMs: Math.max(0, record.availableAt.getTime() - Date.now()), attempts: 3, backoffMs: 2_000,
      removeOnComplete: true, removeOnFail: true
    })
  }

  async advance(payload: FactoryContinuationJob, actor: { tenantId?: string | null; organizationId?: string | null; userId?: string | null; scopeKey?: string | null }) {
    const record = await this.continuations.findOneBy({ id: payload.id })
    if (!record) return
    if (record.tenantId !== actor.tenantId || record.organizationId !== (actor.organizationId ?? null)
      || record.actorId !== actor.userId || record.installationScopeKey !== actor.scopeKey || actor.scopeKey !== this.runtime.scopeKey) {
      throw new ForbiddenException('factory_continuation_scope_mismatch')
    }
    if (record.generation !== payload.generation || !['pending', 'waiting', 'running'].includes(record.status)) return
    if (record.leaseUntil && record.leaseUntil.getTime() > Date.now()) return
    const leaseToken = randomUUID()
    const lease = await this.continuations.createQueryBuilder().update()
      .set({ leaseToken, leaseUntil: new Date(Date.now() + 90_000), status: 'running' })
      .where('id = :id AND generation = :generation', { id: record.id, generation: record.generation })
      .andWhere('("leaseUntil" IS NULL OR "leaseUntil" <= :now)', { now: new Date() }).execute()
    if (lease.affected !== 1) return
    record.leaseToken = leaseToken
    try {
      const entity = await this.requireCase(record)
      await this.policy.assertHumanApprover(continuationScope(record), entity)
      assertApproval(record, entity)
      if (!record.coordinatorXpertId || entity.coordinatorXpertId !== record.coordinatorXpertId) throw new StopContinuation('coordinator_binding_missing')
      if (entity.workspaceProjectSyncStatus !== 'ready') throw new StopContinuation('project_binding_not_ready')
      if (this.config.mode !== 'simulation') throw new StopContinuation('external_adapters_unconfigured')
      if (record.step === 'execute') await this.execute(record, entity)
      else await this.verify(record, entity)
    } catch (error) {
      const businessFailure = error instanceof HttpException && error.getStatus() >= 400 && error.getStatus() < 500
      if (error instanceof StopContinuation || businessFailure) {
        const reasonCode = error instanceof StopContinuation ? error.code
          : error instanceof ForbiddenException ? 'approval_permission_revoked'
          : error instanceof ConflictException ? 'case_revision_changed'
          : record.step === 'execute' ? 'execution_requires_attention' : 'verification_requires_attention'
        await this.checkpoint(record, { status: 'blocked', reasonCode })
      } else {
        const failures = record.failures + 1
        await this.checkpoint(record, { failures, status: failures >= 5 ? 'failed' : 'pending', reasonCode: 'infrastructure_failure' }, Math.min(60_000, 2_000 * 2 ** failures))
      }
    }
  }

  private async execute(record: FactoryContinuationEntity, entity: FactoryCaseEntity) {
    const operationId = record.executionOperationId
    // Idempotent mutation receipts recover a crash between execution and checkpoint persistence.
    const result = await this.operations.executeRecoveryPlan(continuationScope(record), {
      caseId: entity.id, baseRevision: record.expectedRevision, operationId,
      changeSummary: 'Execute the approved recovery plan in simulation mode.'
    })
    if (result.summary.execution?.status !== 'completed') throw new StopContinuation('execution_requires_attention')
    await this.checkpoint(record, { step: 'verify', expectedRevision: result.receipt.revision, status: 'pending', failures: 0, reasonCode: null })
  }

  private async verify(record: FactoryContinuationEntity, entity: FactoryCaseEntity) {
    const operationId = `fc-${record.id}-verify-${record.verificationAttempt}`
    let execution = await this.executions.findOneBy({ scopeKey: record.scopeKey, operationId, caseId: record.caseId })
    if (execution?.status === 'succeeded') {
      if (entity.status !== 'recovered' || entity.snapshot.verification?.outcome !== 'recovered'
        || execution.outputRevision !== entity.revision || entity.revision !== record.expectedRevision + 1
        || !execution.assistantTaskId || !execution.executorXpertId) throw new StopContinuation('verification_evidence_incomplete')
      await this.checkpoint(record, { status: 'completed', step: 'complete', verificationRecordId: execution.id, reasonCode: null })
      return
    }
    if (entity.revision !== record.expectedRevision) throw new StopContinuation('case_revision_changed')
    if (entity.status !== 'verifying') throw new StopContinuation('new_human_gate')
    if (execution && ['failed', 'interrupted', 'cancelled'].includes(execution.status)) throw new StopContinuation('verification_requires_attention')
    if (!execution) {
      await this.continuations.update({ id: record.id, leaseToken: record.leaseToken! }, { verificationOperationId: operationId })
      const result = await this.tasks.dispatch(continuationScope(record), {
        caseId: entity.id, nodeKey: 'verify-recovery', baseRevision: record.expectedRevision, operationId
      })
      execution = result.executionRecord
    } else {
      await this.tasks.reconcile(continuationScope(record), entity.id)
    }
    if (Date.now() - execution.startedAt.getTime() > 30 * 60_000) throw new StopContinuation('verification_timeout')
    await this.checkpoint(record, { status: 'waiting', verificationRecordId: execution.id, failures: 0, reasonCode: null }, 5_000)
  }

  private async checkpoint(record: FactoryContinuationEntity, update: Partial<FactoryContinuationEntity>, delay = 0) {
    await this.continuations.update({ id: record.id, generation: record.generation, leaseToken: record.leaseToken ?? IsNull() }, {
      ...update, generation: record.generation + 1, leaseToken: null, leaseUntil: null, availableAt: new Date(Date.now() + delay)
    })
  }
  private requireCase(record: FactoryContinuationEntity) {
    return this.cases.findOneByOrFail({ id: record.caseId, tenantId: record.tenantId, organizationId: record.organizationId ?? IsNull() })
  }
}

class StopContinuation extends Error { constructor(readonly code: string) { super(code) } }
function assertApproval(record: FactoryContinuationEntity, entity: FactoryCaseEntity) {
  if (entity.snapshot.plan?.approval.status !== 'approved' || entity.snapshot.plan.approval.caseRevision !== record.approvedRevision
    || entity.snapshot.plan.artifactRevision !== record.planRevision || entity.snapshot.plan.approval.actorId !== record.actorId) {
    throw new StopContinuation('approval_version_changed')
  }
}
function continuationScope(record: FactoryContinuationEntity): FactoryScope {
  return { tenantId: record.tenantId, organizationId: record.organizationId, userId: record.actorId,
    assistantId: record.coordinatorXpertId, agentKey: AGENT_KEYS.coordinator, actorType: 'user' }
}
function scopeKey(scope: FactoryScope) { return `${scope.tenantId}:${scope.organizationId ?? 'tenant'}` }
export function publicContinuation(record: FactoryContinuationEntity) {
  return { id: record.id, status: record.status, step: record.step, reasonCode: record.reasonCode,
    approvedRevision: record.approvedRevision, verificationRecordId: record.verificationRecordId }
}

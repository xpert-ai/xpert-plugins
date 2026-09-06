import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { DefaultRuntimeCapabilityRegistry, ProjectAccessRuntimeCapability, type ManagedQueueEnqueueInput, type ManagedQueueService, type ProjectHumanAccess } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FactoryArtifactEntity, FactoryAuditEntity, FactoryCaseEntity, FactoryContinuationEntity, FactoryExecutionRecordEntity } from './entities/index.js'
import { FactoryCaseProjectService } from './factory-case-project.service.js'
import { FactoryOperationsService } from './factory-operations.service.js'
import { FactoryApprovalPolicy } from './factory-approval-policy.service.js'
import { FactoryContinuationService } from './factory-continuation.service.js'
import { FactoryAssistantTaskService, type FactoryAssistantTaskQueuePayload } from './factory-assistant-task.service.js'
import { FactoryProfileMigration } from './migrations/assistant-profile.migration.js'
import { FactoryProfileAccessService } from './factory-profile-access.service.js'
import { FactoryProfileService } from './factory-profile.service.js'
import { FACTORY_PROFILE_ATTENTION, FACTORY_PROFILE_RECENT } from './factory-profile.views.js'
import type { FactoryScope } from './domain/types.js'

// Opt-in real PostgreSQL tests. Every table is isolated in a fresh, disposable schema.
const envFile = process.env.FACTORY_PROFILE_TEST_ENV_FILE
describe.skipIf(!envFile)('Assistant Profile PostgreSQL authorization and durable continuation', () => {
  let admin: DataSource
  let db: DataSource
  let service: FactoryOperationsService
  let tasks: FactoryAssistantTaskService
  let continuation: FactoryContinuationService
  let profiles: FactoryProfileService
  let queue: ManagedQueueService
  let migration: FactoryProfileMigration
  let policy: FactoryApprovalPolicy
  const registry = new DefaultRuntimeCapabilityRegistry()
  const schema = `factory_profile_test_${randomUUID().replaceAll('-', '')}`
  const config = { mode: 'simulation' as 'simulation' | 'external', debug: false }
  const scope: FactoryScope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'owner', assistantId: 'coordinator-a', actorType: 'user' }
  const memberships = new Map<string, ProjectHumanAccess['role']>()
  const projects = new Set<string>()
  const bindings = new Map<string, string[]>()
  const enqueued: ManagedQueueEnqueueInput[] = []

  beforeAll(async () => {
    const env = Object.fromEntries(readFileSync(envFile!, 'utf8').split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
      const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')]
    }))
    const connection = { type: 'postgres' as const, host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432), username: env.DB_USER, password: env.DB_PASS, database: env.DB_NAME }
    admin = await new DataSource(connection).initialize()
    await admin.query(`CREATE SCHEMA "${schema}"`)
    db = await new DataSource({ ...connection, schema, extra: { options: `-c search_path=${schema},public` },
      entities: [FactoryCaseEntity, FactoryArtifactEntity, FactoryAuditEntity, FactoryExecutionRecordEntity, FactoryContinuationEntity], synchronize: true }).initialize()
    migration = new FactoryProfileMigration(db)
    await migration.ensure()
  }, 30_000)
  afterAll(async () => {
    continuation?.onModuleDestroy()
    await db?.destroy()
    if (admin?.isInitialized) { await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.destroy() }
  })
  beforeEach(async () => {
    for (const entity of [FactoryContinuationEntity, FactoryExecutionRecordEntity, FactoryArtifactEntity, FactoryAuditEntity, FactoryCaseEntity]) await db.getRepository(entity).clear()
    projects.clear(); bindings.clear(); memberships.clear(); enqueued.length = 0
    memberships.set('owner', 'owner'); memberships.set('manager', 'manager'); memberships.set('editor', 'editor'); memberships.set('member', 'member')
    config.mode = 'simulation'
    registry.register('platform.project.provisioning', { ensure: async (input: { projectId: string; xpertId: string }) => {
      projects.add(input.projectId); return { projectId: input.projectId, xpertIds: [input.xpertId, 'specialist-a'], operation: 'created' }
    } })
    registry.register(ProjectAccessRuntimeCapability, {
      async listReadable({ actor, projectIds }) {
        const role = memberships.get(actor.userId)
        if (!role || actor.tenantId !== 'tenant-a' || actor.organizationId !== 'org-a') return []
        return [...projects].filter((id) => !projectIds || projectIds.includes(id)).map((projectId) => ({ projectId, role, assistantIds: bindings.get(projectId) ?? [], canManage: role === 'owner' || role === 'manager', archived: false }))
      },
      async assertManage(input) {
        const access = (await this.listReadable({ actor: input.actor, projectIds: [input.projectId] }))[0]
        if (!access?.canManage) throw new ForbiddenException('owner or manager required')
        return access
      }
    })
    registry.register('platform.assistant_task', { startTask: vi.fn(async () => ({ status: 'running', taskId: 'real-task-boundary', executorXpertId: 'verification-a', executionId: 'execution-a', conversationId: 'conversation-a' })), getTaskStatus: async () => ({ status: 'running' }) })
    queue = { enqueue: vi.fn(async (input) => { enqueued.push(input); return { jobId: input.jobId ?? randomUUID() } }),
      cancel: async (input) => ({ success: true, jobId: input.jobId }), getJob: async () => null,
      getExecutionPoolHealth: async () => ({ available: true, workerCount: 1, executionPool: 'default' }), getRedis: async () => { throw new Error('Redis is not used by this service test') } }
    policy = new FactoryApprovalPolicy(registry)
    const caseProjects = new FactoryCaseProjectService(db.getRepository(FactoryCaseEntity), registry)
    service = new FactoryOperationsService(db.getRepository(FactoryCaseEntity), db.getRepository(FactoryArtifactEntity), db.getRepository(FactoryAuditEntity), db.getRepository(FactoryExecutionRecordEntity), caseProjects, config, policy)
    tasks = new FactoryAssistantTaskService(db.getRepository(FactoryCaseEntity), db.getRepository(FactoryExecutionRecordEntity), queue, registry, { scopeKey: 'tenant:tenant-a' })
    continuation = makeContinuation()
    profiles = new FactoryProfileService(new FactoryProfileAccessService(db.getRepository(FactoryCaseEntity), registry), service, continuation, db.getRepository(FactoryContinuationEntity))
  })

  function makeContinuation() { return new FactoryContinuationService(db.getRepository(FactoryContinuationEntity), db.getRepository(FactoryCaseEntity), db.getRepository(FactoryExecutionRecordEntity), service, tasks, policy, queue, { scopeKey: 'tenant:tenant-a' }, config, migration) }
  function context(id = 'specialist-a', overrides: Partial<XpertResolvedViewHostContext> = {}): XpertResolvedViewHostContext {
    return { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: 'owner', hostType: 'agent', hostId: id, slots: [], assistant: { instanceId: id, currentId: id, versionIds: [id, `${id}-published`] }, ...overrides }
  }
  async function incident() {
    const created = await service.createDemoIncident(scope, { operationId: `case-${randomUUID()}`, changeSummary: 'Create isolated test incident' })
    return (await service.runDemoAnalysis(scope, { caseId: created.summary.id, baseRevision: created.summary.revision, operationId: `analysis-${randomUUID()}`, changeSummary: 'Complete deterministic analysis fixture' })).summary
  }
  function approval(caseId: string, baseRevision: number) { return { caseId, baseRevision, operationId: `approve-${randomUUID()}`, changeSummary: 'Approve and continue test recovery', reason: 'Explicit approval of the current test revision.' } }
  async function advance(id: string) {
    const record = await db.getRepository(FactoryContinuationEntity).findOneByOrFail({ id })
    await continuation.advance({ id, generation: record.generation }, { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: 'owner', scopeKey: 'tenant:tenant-a' })
    return db.getRepository(FactoryContinuationEntity).findOneByOrFail({ id })
  }

  it('isolates same-role instances, tenant/org and human Project membership before pagination', async () => {
    const item = await incident()
    expect((await profiles.getData(context(), FACTORY_PROFILE_RECENT, {})).total).toBe(1)
    expect((await profiles.getData(context('specialist-b'), FACTORY_PROFILE_RECENT, {})).total).toBe(0)
    expect((await profiles.getData(context('specialist-a', { userId: 'outsider' }), FACTORY_PROFILE_RECENT, {})).total).toBe(0)
    expect((await profiles.getData(context('specialist-a', { tenantId: 'tenant-b' }), FACTORY_PROFILE_RECENT, {})).total).toBe(0)
    expect((await profiles.getData(context('specialist-a', { organizationId: 'org-b' }), FACTORY_PROFILE_RECENT, {})).total).toBe(0)
    await expect(profiles.getData(context('specialist-b'), FACTORY_PROFILE_RECENT, { selectionId: item.id })).rejects.toMatchObject({ status: 403 })
    await db.getRepository(FactoryCaseEntity).update(item.id, { assignedAssistantIds: ['specialist-a-published'] })
    expect((await profiles.getData(context(), FACTORY_PROFILE_RECENT, {})).total).toBe(1)
    // Legacy cases have no cached assignments, but their explicit Project bindings still count.
    await db.getRepository(FactoryCaseEntity).update(item.id, { assignedAssistantIds: [] })
    const entity = await db.getRepository(FactoryCaseEntity).findOneByOrFail({ id: item.id })
    bindings.set(entity.workspaceProjectId, ['specialist-b-published'])
    expect((await profiles.getData(context('specialist-b'), FACTORY_PROFILE_RECENT, {})).total).toBe(1)
    expect((await profiles.getData(context('specialist-a'), FACTORY_PROFILE_RECENT, {})).total).toBe(0)
  })

  it('allows readable members to inspect but requires a human owner/manager to approve or reject', async () => {
    const item = await incident()
    for (const userId of ['editor', 'member']) {
      const data = await profiles.getData(context('specialist-a', { userId }), FACTORY_PROFILE_RECENT, {})
      expect(data.items[0]?.allowedActions).toEqual([])
      await expect(service.approveRecoveryPlan({ ...scope, userId }, approval(item.id, item.revision))).rejects.toMatchObject({ status: 403 })
      await expect(service.rejectRecoveryPlan({ ...scope, userId }, approval(item.id, item.revision))).rejects.toMatchObject({ status: 403 })
    }
    await expect(service.approveRecoveryPlan({ ...scope, actorType: 'agent' }, approval(item.id, item.revision))).rejects.toMatchObject({ status: 403 })
    await expect(service.approveRecoveryPlan({ ...scope, userId: 'manager' }, approval(item.id, item.revision))).resolves.toMatchObject({ summary: { status: 'approved' } })
  })

  it('does not keep a successfully retried execution failure in Needs attention', async () => {
    const item = await incident()
    const cases = db.getRepository(FactoryCaseEntity)
    const attempts = db.getRepository(FactoryExecutionRecordEntity)
    const entity = await cases.findOneByOrFail({ id: item.id })
    await cases.update(entity.id, { status: 'investigating' })
    const startedAt = new Date()
    const failed = await attempts.save(attempts.create({
      tenantId: scope.tenantId, organizationId: scope.organizationId, scopeKey: 'tenant-a:org-a', caseId: entity.id,
      workspaceProjectId: entity.workspaceProjectId, nodeKey: 'triage-event', roleKey: 'anomaly-triage-specialist',
      roleLabel: 'Anomaly Triage Specialist', agentKey: 'Agent_AnomalyTriage', operationId: `failed-${randomUUID()}`,
      sequence: 90, attemptNumber: 1, status: 'failed', inputRevision: entity.revision, outputRevision: null,
      safeSummary: 'The first attempt could not start.', requesterXpertId: 'coordinator-a', startedAt, finishedAt: startedAt
    }))
    const succeeded = await attempts.save(attempts.create({
      tenantId: scope.tenantId, organizationId: scope.organizationId, scopeKey: 'tenant-a:org-a', caseId: entity.id,
      workspaceProjectId: entity.workspaceProjectId, nodeKey: 'triage-event', roleKey: 'anomaly-triage-specialist',
      roleLabel: 'Anomaly Triage Specialist', agentKey: 'Agent_AnomalyTriage', operationId: `succeeded-${randomUUID()}`,
      sequence: 91, attemptNumber: 2, status: 'succeeded', inputRevision: entity.revision, outputRevision: entity.revision,
      safeSummary: 'The retry completed.', requesterXpertId: 'coordinator-a', startedAt, finishedAt: startedAt
    }))
    await attempts.update(failed.id, { supersededByRecordId: succeeded.id })

    expect((await profiles.getData(context(), FACTORY_PROFILE_ATTENTION, {})).total).toBe(0)
    await attempts.update(failed.id, { supersededByRecordId: null })
    expect((await profiles.getData(context(), FACTORY_PROFILE_ATTENTION, {})).total).toBe(1)
  })

  it('atomically persists approval and continuation, deduplicates retries and recovers a queue outage after service restart', async () => {
    const item = await incident(); const input = approval(item.id, item.revision)
    vi.mocked(queue.enqueue).mockRejectedValueOnce(new Error('queue unavailable'))
    const result = await continuation.approveAndContinue({ ...scope, assistantId: 'specialist-a' }, input)
    expect(result.continuation.status).toBe('pending')
    expect((await continuation.approveAndContinue(scope, input)).receipt.duplicate).toBe(true)
    expect(await db.getRepository(FactoryContinuationEntity).count()).toBe(1)
    continuation = makeContinuation()
    await continuation.recoverOutbox()
    expect(enqueued.some((job) => job.queueName === 'factory_ops.continuations')).toBe(true)
    const record = await advance(result.continuation.id)
    expect(record.step).toBe('verify')
    expect(record.coordinatorXpertId).toBe('coordinator-a')
    const waiting = await advance(record.id)
    const execution = await db.getRepository(FactoryExecutionRecordEntity).findOneByOrFail({ id: waiting.verificationRecordId! })
    expect(execution.requesterXpertId).toBe('coordinator-a')
    expect(execution.nodeKey).toBe('verify-recovery')
    // This integration test exercises the real task service boundary. The actual model is verified in local acceptance.
    await tasks.process({ tenantId: scope.tenantId, organizationId: 'org-a', scopeKey: 'tenant-a:org-a', userId: 'owner', caseId: item.id, nodeKey: 'verify-recovery', expectedRevision: waiting.expectedRevision, operationId: execution.operationId, requesterXpertId: 'coordinator-a', requesterAgentKey: 'Agent_FactoryCoordinator' })
    await service.verifyRecovery({ ...scope, actorType: 'agent', assistantId: 'verification-a', agentKey: 'Agent_RecoveryVerification' }, { caseId: item.id, baseRevision: waiting.expectedRevision, operationId: execution.operationId, changeSummary: 'Verification Assistant completed its business finalizer' })
    const completed = await advance(record.id)
    expect(completed.status).toBe('completed')
    expect((await db.getRepository(FactoryCaseEntity).findOneByOrFail({ id: item.id })).status).toBe('recovered')
  })

  it('rolls approval back if its durable intent cannot be saved', async () => {
    const item = await incident()
    await expect(service.approveRecoveryPlan(scope, approval(item.id, item.revision), async () => { throw new Error('intent write failed') })).rejects.toThrow('intent write failed')
    expect((await service.getCaseSummary(scope, { caseId: item.id })).status).toBe('awaiting_approval')
    expect(await db.getRepository(FactoryContinuationEntity).count()).toBe(0)
  })

  it('blocks revoked permission, stale approval and unconfigured external execution without advancing the Case', async () => {
    const item = await incident()
    await expect(continuation.approveAndContinue(scope, approval(item.id, item.revision - 1))).rejects.toMatchObject({ status: 409 })
    const approved = await continuation.approveAndContinue(scope, approval(item.id, item.revision))
    memberships.set('owner', 'member')
    expect((await advance(approved.continuation.id)).reasonCode).toBe('approval_permission_revoked')
    memberships.set('owner', 'owner')
    await continuation.retry(scope, approved.continuation.id, approved.summary.revision)
    config.mode = 'external'
    expect((await advance(approved.continuation.id)).reasonCode).toBe('external_adapters_unconfigured')
    expect((await service.getCaseSummary(scope, { caseId: item.id })).execution).toBeNull()
  })
  it('replays an execution receipt after a lost checkpoint without repeating business execution', async () => {
    const item = await incident()
    const approved = await continuation.approveAndContinue(scope, approval(item.id, item.revision))
    const executed = await advance(approved.continuation.id)
    const revision = (await service.getCaseSummary(scope, { caseId: item.id })).revision
    await db.getRepository(FactoryContinuationEntity).update(executed.id, {
      step: 'execute', expectedRevision: approved.summary.revision, generation: executed.generation + 1
    })
    continuation = makeContinuation()
    expect((await advance(executed.id)).step).toBe('verify')
    expect((await service.getCaseSummary(scope, { caseId: item.id })).revision).toBe(revision)
    expect(await db.getRepository(FactoryAuditEntity).count({ where: { caseId: item.id, operationId: executed.executionOperationId } })).toBe(1)
  })

  it('stops at a business rejection without retrying it as an infrastructure failure', async () => {
    const item = await incident()
    const approved = await continuation.approveAndContinue(scope, approval(item.id, item.revision))
    const rejected = vi.spyOn(service, 'executeRecoveryPlan').mockRejectedValue(new BadRequestException('New business gate'))
    try {
      const blocked = await advance(approved.continuation.id)
      expect(blocked).toMatchObject({ status: 'blocked', failures: 0, reasonCode: 'execution_requires_attention' })
      await advance(blocked.id)
      expect(rejected).toHaveBeenCalledTimes(1)
    } finally { rejected.mockRestore() }
  })

  it('bounds infrastructure retries and rejects a verification finalizer after approval permission is revoked', async () => {
    const item = await incident()
    const approved = await continuation.approveAndContinue(scope, approval(item.id, item.revision))
    const unavailable = vi.spyOn(service, 'executeRecoveryPlan').mockRejectedValue(new Error('temporary infrastructure failure'))
    for (let attempt = 1; attempt <= 5; attempt++) {
      const record = await advance(approved.continuation.id)
      expect(record.failures).toBe(attempt)
      expect(record.status).toBe(attempt === 5 ? 'failed' : 'pending')
    }
    unavailable.mockRestore()
    await continuation.retry(scope, approved.continuation.id, approved.summary.revision)
    await advance(approved.continuation.id)
    const waiting = await advance(approved.continuation.id)
    const execution = await db.getRepository(FactoryExecutionRecordEntity).findOneByOrFail({ id: waiting.verificationRecordId! })
    memberships.set('owner', 'member')
    await expect(service.verifyRecovery({ ...scope, actorType: 'agent', assistantId: 'verification-a', agentKey: 'Agent_RecoveryVerification' }, {
      caseId: item.id, baseRevision: waiting.expectedRevision, operationId: execution.operationId, changeSummary: 'Finalizer must recheck revoked approval authority'
    })).rejects.toMatchObject({ status: 403 })
    expect((await service.getCaseSummary(scope, { caseId: item.id })).status).toBe('verifying')
    expect((await advance(waiting.id)).reasonCode).toBe('approval_permission_revoked')
  })

})

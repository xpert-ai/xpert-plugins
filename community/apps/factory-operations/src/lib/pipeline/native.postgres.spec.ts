import { FactoryProfileAccessService } from '../factory-profile-access.service.js'
import { FactoryProfileService } from '../factory-profile.service.js'
import { FACTORY_PROFILE_RECENT } from '../factory-profile.views.js'
import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import { DefaultRuntimeCapabilityRegistry, ProjectAccessRuntimeCapability, ProjectPipelinesRuntimeCapability, ProjectPipelineEvidenceRuntimeCapability, type ProjectPipelineAssistantContext } from '@xpert-ai/plugin-sdk'
import { FactoryCaseEntity, FactoryArtifactEntity, FactoryAuditEntity, FactoryExecutionRecordEntity } from '../entities/index.js'
import { FactoryOperationsService } from '../factory-operations.service.js'
import { FactoryApprovalPolicy } from '../factory-approval-policy.service.js'
import { FactoryPipelineService } from './service.js'
import { FactoryPipelineEvidence } from './entity.js'
import { createDemoFactoryCase } from '../domain/flow.js'
import { FACTORY_ROLE_ASSISTANTS } from '../factory-assistant-definitions.js'
import type { FactoryScope } from '../domain/types.js'
import { steps, type FactoryStep } from './configuration.js'
const envFile = process.env.PIPELINE_TEST_ENV_FILE
describe.skipIf(!envFile)('native recovery acceptance (PostgreSQL)', () => {
  let admin: DataSource, db: DataSource, operations: FactoryOperationsService, pipeline: FactoryPipelineService, entity: FactoryCaseEntity
  const schema = `factory_pipeline_test_${randomUUID().replaceAll('-','')}`, registry = new DefaultRuntimeCapabilityRegistry()
  const scope: FactoryScope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), assistantId: randomUUID(), actorType: 'user' }
  let context: ProjectPipelineAssistantContext, cancelled = false
  let runtimeStatus: 'running' | 'failed' | 'cancelled' = 'running'
  beforeAll(async () => {
    const env = Object.fromEntries(readFileSync(envFile!, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')] }))
    const connection = { type: 'postgres' as const, host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432), username: env.DB_USER, password: env.DB_PASS, database: env.DB_NAME }
    admin = await new DataSource(connection).initialize(); await admin.query(`CREATE SCHEMA "${schema}"`)
    db = await new DataSource({ ...connection, schema, extra: { options: `-c search_path=${schema},public` }, entities: [FactoryCaseEntity, FactoryArtifactEntity, FactoryAuditEntity, FactoryExecutionRecordEntity, FactoryPipelineEvidence], synchronize: true }).initialize()
    registry.register(ProjectAccessRuntimeCapability, {
      listReadable: async ({ actor }) => actor.tenantId === scope.tenantId && actor.organizationId === scope.organizationId && actor.userId === scope.userId ? [{ projectId: entity.workspaceProjectId, role: 'owner', canManage: true, archived: false, assistantIds: [scope.assistantId!] }] : [],
      assertEdit: async () => ({ projectId: entity.workspaceProjectId, role: 'owner', canManage: true, archived: false }),
      assertManage: async ({ actor }) => { if (actor.userId !== scope.userId) throw Error('manager_required'); return { projectId: entity.workspaceProjectId, role: 'owner', canManage: true, archived: false } }
    })
    registry.register(ProjectPipelinesRuntimeCapability, { graph: async () => ({ runId: context.work.runId, roundId: context.work.roundId,
      tasks: { executions: [{ agentExecutionId: context.executor.executionId, status: runtimeStatus, threadId: 'platform-thread' }] }, runState: cancelled ? 'cancelled' : 'active', round: { generation: context.work.generation, inputDigest: context.work.inputDigest, state: 'active' } }) } as never)
    registry.register(ProjectPipelineEvidenceRuntimeCapability, { read: async () => ({ kind: 'human', outcome: 'approved', actorId: scope.userId!,
      inputDigest: context.work.inputDigest, generation: context.work.generation, evidence: [] }) })
    const policy = new FactoryApprovalPolicy(registry)
    operations = new FactoryOperationsService(db.getRepository(FactoryCaseEntity), db.getRepository(FactoryArtifactEntity), db.getRepository(FactoryAuditEntity),
      db.getRepository(FactoryExecutionRecordEntity), {} as never, { mode: 'simulation', debug: false }, policy, registry)
    pipeline = new FactoryPipelineService(db, operations, registry)
  })
  afterAll(async () => { await db?.destroy(); if (admin?.isInitialized) { await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.destroy() } })
  beforeEach(async () => {
    const id = randomUUID(), snapshot = createDemoFactoryCase(id, 'FAC-'+id.slice(0,8), new Date().toISOString())
    entity = await db.getRepository(FactoryCaseEntity).save({ tenantId: scope.tenantId, organizationId: scope.organizationId, id,
      scopeKey: `${scope.tenantId}:${scope.organizationId}`, caseKey: snapshot.caseKey, creationOperationId: randomUUID(), creationFingerprint: 'a'.repeat(64),
      status: snapshot.status, revision: 1, snapshot, createdById: scope.userId!, coordinatorXpertId: scope.assistantId,
      workspaceProjectId: randomUUID(), workspaceProjectSyncStatus: 'ready', workspaceProjectSyncedAt: new Date(), currentStage: snapshot.currentStage, deviceId: 'M-07',
      assignedAssistantIds: [scope.assistantId!], roleAssistants: Object.fromEntries(FACTORY_ROLE_ASSISTANTS.map(r => [r.roleKey, scope.assistantId!])) })
    context = { actor: { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId! }, projectId: entity.workspaceProjectId,
      subjects: [await pipeline.subject({ actor: { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId! }, projectId: entity.workspaceProjectId }, id)],
      work: { instanceId: randomUUID(), runId: randomUUID(), roundId: randomUUID(), nodeInstanceId: randomUUID(), operationId: randomUUID(), inputDigest: 'a'.repeat(64), generation: 1 },
      idempotencyKey: randomUUID(), inputs: {}, parameters: {}, executor: { xpertId: scope.assistantId!, workspaceId: randomUUID(), publishedVersion: '1', executionId: randomUUID(), conversationId: randomUUID() } }
    runtimeStatus = 'running'; cancelled = false
  })
  function next() { context = { ...context, inputs: {}, work: { ...context.work, nodeInstanceId: randomUUID(), operationId: randomUUID() },
    executor: { ...context.executor, executionId: randomUUID(), conversationId: randomUUID() } }; return context }
  async function finalize(node: FactoryStep) {
    const current = await db.getRepository(FactoryCaseEntity).findOneByOrFail({ id: entity.id })
    const role = FACTORY_ROLE_ASSISTANTS.find(r => r.roleKey === steps.find(([key]) => key === node)![1])!
    const agent: FactoryScope = { ...scope, actorType: 'agent', agentKey: role.agentKey, executionId: context.executor.executionId, conversationId: context.executor.conversationId }
    const input = { caseId: entity.id, baseRevision: current.revision, operationId: context.work.operationId, changeSummary: '依据固定版本输入完成角色验收' }
    const facts = current.snapshot.analysisFacts
    switch(node) {
      case 'triage-event': return operations.recordTriage(agent, { ...input, ...facts.triage })
      case 'diagnose-equipment': return operations.recordEquipmentFinding(agent, { ...input, ...facts.equipment })
      case 'assess-quality-impact': return operations.recordQualityFinding(agent, { ...input, ...facts.quality })
      case 'assess-production-impact': return operations.recordProductionFinding(agent, { ...input, ...facts.production })
      case 'check-resource-readiness': return operations.recordResourceFinding(agent, { ...input, ...facts.resources })
      case 'generate-recovery-plan': return operations.generateRecoveryPlan(agent, input)
      case 'verify-recovery': return operations.verifyRecovery(agent, input)
    }
  }
  it('preserves business acceptance, human approval and idempotent recovery through platform adapters', async () => {
    let plan: Awaited<ReturnType<FactoryPipelineService['collect']>> | undefined
    for (const [node] of steps.filter(([node]) => node !== 'verify-recovery')) {
      next(); await pipeline.prepare(context,node)
      await expect(pipeline.collect(context,node)).rejects.toThrow('business_finalizer_required')
      await finalize(node); const output = await pipeline.collect(context,node)
      expect(await pipeline.collect(context,node)).toEqual(output)
      if (node === 'generate-recovery-plan') plan = output
    }
    expect(await pipeline.current(context, context.subjects[0]!)).toBe(true)
    next(); context.inputs = { plan: { kind: 'evidence', value: plan!.result } }
    expect(await pipeline.authorize(context,'project-managers','approved')).toBe(true)
    await expect(pipeline.authorize({ ...context, actor: { ...context.actor, userId: randomUUID() } },'project-managers','approved')).rejects.toThrow('manager_required')
    context.inputs.approval = { kind: 'evidence', value: { resolverRef: 'platform.pipeline-decision@1', objectKey: randomUUID(), version: '1', digest: 'a'.repeat(64), schemaRef: 'platform.human-decision@1' } }
    const approved = await pipeline.service(context,'record-approval')
    expect(await pipeline.service(context,'record-approval')).toEqual(approved)
    next(); context.inputs = { approval: { kind: 'evidence', value: approved.outputs.result } }
    const executed = await pipeline.service(context,'execute-recovery-plan')
    expect(await pipeline.service(context,'execute-recovery-plan')).toEqual(executed)
    expect((await pipeline.read(context,executed.outputs.result)).outcome).toBe('complete')
    next(); await pipeline.prepare(context,'verify-recovery'); await finalize('verify-recovery')
    const verified = await pipeline.collect(context,'verify-recovery')
    expect((await pipeline.read(context,verified.result)).outcome).toBe('recovered')
    const saved = await db.getRepository(FactoryCaseEntity).findOneByOrFail({ id: entity.id })
    expect(saved.snapshot.execution?.actions).toHaveLength(12)
    expect(saved.snapshot.plan?.approval.actorId).toBe(scope.userId)
    await expect(pipeline.read({ ...context, actor: { ...context.actor, tenantId: randomUUID() } },verified.result)).rejects.toThrow()
  })
  it('rejects duplicate identity changes and late writes after cancellation', async () => {
    await pipeline.prepare(context,'triage-event'); await pipeline.prepare(context,'triage-event')
    expect(await db.getRepository(FactoryExecutionRecordEntity).countBy({ caseId: entity.id })).toBe(1)
    await expect(pipeline.prepare({ ...context, executor: { ...context.executor, executionId: randomUUID() } },'triage-event')).rejects.toThrow('operation_identity_mismatch')
    cancelled = true; await expect(finalize('triage-event')).rejects.toThrow('factory_platform_operation_superseded')
    expect((await db.getRepository(FactoryCaseEntity).findOneByOrFail({ id: entity.id })).revision).toBe(1)
  })
  it('filters profile results by Assistant instance and human project access before pagination', async () => {
    const profiles = new FactoryProfileService(new FactoryProfileAccessService(db.getRepository(FactoryCaseEntity), registry), operations, pipeline)
    const context = { ...scope, hostType: 'agent' as const, hostId: scope.assistantId!, slots: [], assistant: { instanceId: scope.assistantId!, currentId: scope.assistantId!, versionIds: [scope.assistantId!] } }
    expect((await profiles.getData(context, FACTORY_PROFILE_RECENT, {})).total).toBe(1)
    for (const override of [{ userId: randomUUID() }, { tenantId: randomUUID() }, { organizationId: randomUUID() }, { assistant: { ...context.assistant, instanceId: randomUUID(), versionIds: [randomUUID()] } }]) {
      expect((await profiles.getData({ ...context, ...override }, FACTORY_PROFILE_RECENT, {})).total).toBe(0)
      await expect(profiles.getData({ ...context, ...override }, FACTORY_PROFILE_RECENT, { selectionId: entity.id })).rejects.toThrow()
    }
  })

  it('reads failed/cancelled runtime state from the exact platform round without rewriting business acceptance', async () => {
    await pipeline.prepare(context, 'triage-event')
    const row = await db.getRepository(FactoryExecutionRecordEntity).findOneByOrFail({ operationId: context.work.operationId })
    for (const state of ['failed', 'cancelled'] as const) {
      runtimeStatus = state
      expect((await operations.presentExecutions(scope, [row]))[0]).toMatchObject({ status: state, threadId: 'platform-thread' })
    }
    expect((await db.getRepository(FactoryExecutionRecordEntity).findOneByOrFail({ id: row.id })).status).toBe('running')
  })

})

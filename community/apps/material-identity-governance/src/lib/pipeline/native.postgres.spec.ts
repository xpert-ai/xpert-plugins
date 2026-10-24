import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import { DefaultRuntimeCapabilityRegistry, ProjectAccessRuntimeCapability, ProjectPipelinesRuntimeCapability, ProjectPipelineEvidenceRuntimeCapability, type ProjectPipelineAssistantContext } from '@xpert-ai/plugin-sdk'
import { MATERIAL_ENTITIES, MaterialCaseEntity, MaterialExecutionEntity } from '../server/entities.js'
import { MaterialCaseService } from '../server/case.service.js'
import { MaterialPipelineService } from './service.js'
import { createDemoCase } from '../demo-scenarios.js'
import { steps } from './configuration.js'
import { roleDefinition } from '../roles.js'
import { scopeKey, type RuntimeScope } from '../server/scope.js'
const envFile = process.env.PIPELINE_TEST_ENV_FILE
describe.skipIf(!envFile)('native pipeline business acceptance (PostgreSQL)', () => {
  let admin: DataSource, db: DataSource, cases: MaterialCaseService, pipeline: MaterialPipelineService, entity: MaterialCaseEntity
  const schema = `material_pipeline_test_${randomUUID().replaceAll('-','')}`, registry = new DefaultRuntimeCapabilityRegistry()
  const scope: RuntimeScope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), assistantId: randomUUID(), actorType: 'user' }
  let context: ProjectPipelineAssistantContext, cancelled = false, decision: 'approved' | 'rejected' = 'approved'
  let runtimeStatus: 'running' | 'failed' | 'cancelled' = 'running'
  beforeAll(async () => {
    const env = Object.fromEntries(readFileSync(envFile!, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')] }))
    const connection = { type: 'postgres' as const, host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432), username: env.DB_USER, password: env.DB_PASS, database: env.DB_NAME }
    admin = await new DataSource(connection).initialize(); await admin.query(`CREATE SCHEMA "${schema}"`)
    db = await new DataSource({ ...connection, schema, extra: { options: `-c search_path=${schema},public` }, entities: MATERIAL_ENTITIES, synchronize: true }).initialize()
    registry.register(ProjectAccessRuntimeCapability, {
      listReadable: async () => [{ projectId: entity.projectId, role: 'owner', canManage: true, archived: false }],
      assertEdit: async () => ({ projectId: entity.projectId, role: 'owner', canManage: true, archived: false }),
      assertManage: async ({ actor }) => { if (actor.userId !== scope.userId) throw Error('manager_required'); return { projectId: entity.projectId, role: 'owner', canManage: true, archived: false } }
    })
    registry.register(ProjectPipelinesRuntimeCapability, { graph: async () => ({ runId: context.work.runId, roundId: context.work.roundId,
      tasks: { executions: [{ agentExecutionId: context.executor.executionId, status: runtimeStatus, threadId: 'platform-thread' }] }, runState: cancelled ? 'cancelled' : 'active', round: { generation: context.work.generation, inputDigest: context.work.inputDigest, state: 'active' } }) } as never)
    registry.register(ProjectPipelineEvidenceRuntimeCapability, { read: async () => ({ kind: 'human', outcome: decision, actorId: scope.userId!, inputDigest: context.work.inputDigest, generation: context.work.generation, evidence: [] }) })
    cases = new MaterialCaseService(db, registry, {} as never); pipeline = new MaterialPipelineService(cases)
  })
  afterAll(async () => { await db?.destroy(); if (admin?.isInitialized) { await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.destroy() } })
  beforeEach(async () => {
    const id = randomUUID(), snapshot = createDemoCase('code_collision', id)
    entity = await db.getRepository(MaterialCaseEntity).save({ ...scope, id, scopeKey: scopeKey(scope), caseKey: snapshot.caseKey, title: snapshot.title,
      kind: snapshot.kind, status: snapshot.status, revision: 1, snapshot, createdById: scope.userId, coordinatorId: scope.assistantId,
      projectId: randomUUID(), projectStatus: 'ready', assignedAssistantIds: [scope.assistantId], roleAssistants: Object.fromEntries(steps.map(([, role]) => [role, scope.assistantId])), criticalConflict: false, exposure: 0 })
    context = { actor: scope, projectId: entity.projectId, subjects: [await pipeline.subject({ actor: scope, projectId: entity.projectId }, id)],
      work: { instanceId: randomUUID(), runId: randomUUID(), roundId: randomUUID(), nodeInstanceId: randomUUID(), operationId: randomUUID(), inputDigest: 'a'.repeat(64), generation: 1 },
      idempotencyKey: randomUUID(), inputs: {}, parameters: {}, executor: { xpertId: scope.assistantId, workspaceId: randomUUID(), publishedVersion: '1', executionId: randomUUID(), conversationId: randomUUID() } }
    runtimeStatus = 'running'; cancelled = false
  })
  const finalize = () => cases.finalize({ ...scope, actorType: 'agent', agentKey: roleDefinition('intake').agentKey, executionId: context.executor.executionId,
    conversationId: context.executor.conversationId }, 'intake','collect-evidence', { caseId: entity.id, expectedRevision: 1, operationId: context.work.operationId,
      evidenceIds: entity.snapshot.evidence.map(e => e.id), assessment: '已依据受控来源核对材料和图纸证据，确认输入完整。' })
  it('prepares once, requires the matching business finalizer, and persists immutable scoped evidence', async () => {
    await pipeline.prepare(context,'collect-evidence'); await pipeline.prepare(context,'collect-evidence')
    expect(await db.getRepository(MaterialExecutionEntity).countBy({ caseId: entity.id })).toBe(1)
    await expect(pipeline.collect(context,'collect-evidence')).rejects.toThrow('business_finalizer_required')
    await finalize(); const output = await pipeline.collect(context,'collect-evidence')
    expect(await pipeline.read(context, output.result)).toMatchObject({ nodeKey: 'collect-evidence', revision: 2 })
    expect(await pipeline.collect(context,'collect-evidence')).toEqual(output)
    expect(await pipeline.current(context, context.subjects[0]!)).toBe(true)
    await expect(pipeline.read({ ...context, actor: { ...scope, tenantId: randomUUID() } }, output.result)).rejects.toThrow()
    await expect(pipeline.read(context, { ...output.result, digest: 'b'.repeat(64) })).rejects.toThrow('evidence_mismatch')
  })
  it('rejects forged executor identity and cancelled rounds without accepting domain outputs', async () => {
    await pipeline.prepare(context,'collect-evidence')
    await expect(pipeline.prepare({ ...context, executor: { ...context.executor, executionId: randomUUID() } },'collect-evidence')).rejects.toThrow('operation_identity_mismatch')
    cancelled = true
    await expect(finalize()).rejects.toThrow('platform_operation_superseded')
    const saved = await db.getRepository(MaterialCaseEntity).findOneByOrFail({ id: entity.id })
    expect(saved.revision).toBe(1); expect(saved.snapshot.artifacts).toHaveLength(0)
  })
  it('never adopts evidence from a different subject or input version', async () => {
    await expect(pipeline.prepare({ ...context, subjects: [{ ...context.subjects[0]!, digest: 'b'.repeat(64) }] },'collect-evidence')).rejects.toThrow('stale_subject')
    expect(await db.getRepository(MaterialExecutionEntity).countBy({ caseId: entity.id })).toBe(0)
  })
  it.each(['approved', 'rejected'] as const)('runs all governance steps and applies %s exactly once through native decision evidence', async outcome => {
    decision = outcome
    let proposal: import('@xpert-ai/contracts').ProjectPipelineEvidenceRef | undefined
    for (const [nodeKey, role] of steps.filter(([key]) => key !== 'publish-records')) {
      context = { ...context, work: { ...context.work, operationId: randomUUID(), nodeInstanceId: randomUUID() }, executor: { ...context.executor, executionId: randomUUID(), conversationId: randomUUID() } }
      const prepared = await pipeline.prepare(context, nodeKey)
      const row = await db.getRepository(MaterialCaseEntity).findOneByOrFail({ id: entity.id })
      await cases.finalize({ ...scope, actorType: 'agent', agentKey: roleDefinition(role).agentKey, executionId: context.executor.executionId, conversationId: context.executor.conversationId }, role, nodeKey,
        { caseId: entity.id, expectedRevision: prepared.humanInput.expectedRevision, operationId: context.work.operationId, evidenceIds: row.snapshot.evidence.map(e => e.id), assessment: '依据当前材料与图纸证据完成专业判断并提交可追溯的治理结果。' })
      proposal = (await pipeline.collect(context, nodeKey)).result
    }
    context = { ...context, work: { ...context.work, operationId: randomUUID(), nodeInstanceId: randomUUID() }, inputs: { proposal: { kind: 'evidence', value: proposal! } } }
    expect(await pipeline.authorize(context, 'project-managers', outcome)).toBe(true)
    await expect(pipeline.authorize({ ...context, actor: { ...scope, userId: randomUUID() } }, 'project-managers', outcome)).rejects.toThrow('manager_required')
    context.inputs.approval = { kind: 'evidence', value: { resolverRef: 'platform.human-decision@1', schemaRef: 'platform.human-decision@1', objectKey: randomUUID(), version: '1', digest: 'b'.repeat(64) } }
    const receipt = await pipeline.recordDecision(context, true)
    expect(await pipeline.recordDecision(context, true)).toEqual(receipt)
    const decided = await db.getRepository(MaterialCaseEntity).findOneByOrFail({ id: entity.id })
    expect(decided.snapshot.approval?.actor).toBe(scope.userId)
    if (outcome === 'rejected') {
      expect(decided.status).toBe('rejected'); expect(decided.snapshot.publications).toHaveLength(0)
    } else {
      context = { ...context, work: { ...context.work, operationId: randomUUID(), nodeInstanceId: randomUUID() }, executor: { ...context.executor, executionId: randomUUID(), conversationId: randomUUID() } }
      await pipeline.prepare(context, 'publish-records')
      await cases.finalize({ ...scope, actorType: 'agent', agentKey: roleDefinition('publisher').agentKey, executionId: context.executor.executionId, conversationId: context.executor.conversationId }, 'publisher', 'publish-records',
        { caseId: entity.id, expectedRevision: decided.revision, operationId: context.work.operationId, evidenceIds: decided.snapshot.evidence.map(e => e.id), assessment: '依据已由项目负责人批准的治理方案发布受控主数据记录。' })
      await pipeline.collect(context, 'publish-records')
      expect((await db.getRepository(MaterialCaseEntity).findOneByOrFail({ id: entity.id })).status).toBe('completed')
    }
  })

  it('reads failed/cancelled runtime state from the platform without rewriting business acceptance', async () => {
    await pipeline.prepare(context, 'collect-evidence')
    for (const state of ['failed', 'cancelled'] as const) {
      runtimeStatus = state
      expect((await cases.records(scope, entity.id))[0]).toMatchObject({ status: state, threadId: 'platform-thread' })
    }
    expect((await db.getRepository(MaterialExecutionEntity).findOneByOrFail({ operationId: context.work.operationId })).status).toBe('running')
  })

})

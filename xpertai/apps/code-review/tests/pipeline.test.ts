import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DataSource, Table } from 'typeorm'
import { checkProjectPipelineConfiguration, configureProjectPipelineFromForm, type ProjectPipelineEvidenceRef } from '@xpert-ai/contracts'
import { DefaultRuntimeCapabilityRegistry, ProjectAccessRuntimeCapability, ProjectPipelineCommandsRuntimeCapability,
  ProjectPipelineEvidenceRuntimeCapability, ProjectPipelineCatalogRuntimeCapability, projectPipelineContributionSchema,
  type ProjectPipelineOperationContext, type ProjectPipelineAssistantContext, type PluginContext } from '@xpert-ai/plugin-sdk'
import { Review } from '../src/entity.js'
import { Reviews } from '../src/backend.js'
import { GitHub } from '../src/github.js'
import type { Repositories } from '../src/repositories.js'
import { parsePullUrl, type Snapshot, type Scope } from '../src/domain.js'
import { ReviewPipelineService } from '../src/pipeline/service.js'
import { ReviewPipelineOperations } from '../src/pipeline/operations.js'
import { ReviewPipelineBinding, ReviewPipelineEvidence, ReviewPipelineDelivery } from '../src/pipeline/entity.js'
import { reviewPipelineConfiguration, reviewPipelineDescriptors, reviewPipelineConfigurationForm, ReviewPipelineContribution } from '../src/pipeline/configuration.js'
import { digest, refs } from '../src/pipeline/contract.js'

test('Code Review declares a portable parallel pipeline with complete registered ports', () => {
  const result = checkProjectPipelineConfiguration(reviewPipelineConfiguration(), [...reviewPipelineDescriptors,
    { kind: 'completion', ref: 'platform.output-validated@1' }, { kind: 'schema', ref: 'platform.human-decision@1' }])
  assert.deepEqual(result.issues, [])
  assert.equal(result.valid, true)
})
test('Code Review exposes typed public configuration without allowing a topology or approval override', () => {
  projectPipelineContributionSchema.parse(new ReviewPipelineContribution())
  const assistants = { correctness: randomUUID(), security: randomUUID(), verifier: randomUUID() }
  const parameters = { requireChecks: false, requiredChecks: ['unit'], blockingPriorities: ['P0'] }
  assert.deepEqual(configureProjectPipelineFromForm(reviewPipelineConfiguration(), reviewPipelineConfigurationForm, { assistants, parameters }),
    reviewPipelineConfiguration(assistants, parameters))
  assert.throws(() => configureProjectPipelineFromForm(reviewPipelineConfiguration(), reviewPipelineConfigurationForm, {
    assistants, parameters: { ...parameters, blockingPriorities: [] } }))
})

const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname)) throw new Error('Dedicated pipeline test database required')
for (const layout of ['empty', 'orm-precreated'] as const) test(`Code Review pipeline persistence and governed plugin operations (${layout})`, { skip: !url }, async t => {
  const schema = `code_review_pipeline_${randomUUID().replaceAll('-', '')}`
  const db = new DataSource({ type: 'postgres', url, schema, entities: [Review, ReviewPipelineBinding, ReviewPipelineEvidence, ReviewPipelineDelivery],
    uuidExtension: 'pgcrypto', extra: { options: `-c search_path=${schema},public` } })
  await db.initialize()
  t.after(async () => { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy() })
  await db.query(`CREATE SCHEMA "${schema}"`)
  const query = db.createQueryRunner()
  await query.createTable(Table.create(db.getMetadata(Review), db.driver))
  if (layout === 'orm-precreated') for (const entity of [ReviewPipelineBinding, ReviewPipelineEvidence, ReviewPipelineDelivery]) {
    await query.createTable(Table.create(db.getMetadata(entity), db.driver))
  }
  await query.release()
  const sql = readFileSync(new URL('../migrations/20261018-project-pipeline.sql', import.meta.url), 'utf8')
  await db.query(sql); await db.query(sql)
  await t.test('migration restores and validates scope and delivery constraints on both layouts', async () => {
    const constraints = await db.query("SELECT count(*)::int AS count FROM pg_constraint WHERE connamespace = to_regnamespace($1) AND conname LIKE 'code_review_pipeline_%' AND convalidated", [schema])
    assert.equal(constraints[0].count, 6)
    const binding = { id: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), projectId: randomUUID(), assistantId: randomUUID(), workspaceId: randomUUID() }
    await db.getRepository(ReviewPipelineBinding).save(binding)
    const evidence = { ...binding, id: randomUUID(), reviewId: binding.id, operationId: randomUUID(), port: 'review', schemaRef: 'test@1', digest: 'a'.repeat(64), content: {} }
    await assert.rejects(db.getRepository(ReviewPipelineEvidence).insert({ ...evidence, projectId: randomUUID() }), /code_review_pipeline_evidence_scope/)
    const delivery = { ...binding, id: randomUUID(), reviewId: binding.id, operationId: randomUUID(), headSha: 'a'.repeat(40), marker: 'test', authorId: 'test', body: 'test', status: 'confirmed' as const }
    await db.getRepository(ReviewPipelineDelivery).insert(delivery)
    await assert.rejects(db.query('UPDATE plugin_code_review_pipeline_delivery SET status = $1 WHERE id = $2', ['invalid', delivery.id]), /code_review_pipeline_delivery_status/)
    await db.query('ALTER TABLE plugin_code_review_pipeline_evidence DROP CONSTRAINT code_review_pipeline_evidence_scope')
    await db.query(sql)
    await assert.rejects(db.getRepository(ReviewPipelineEvidence).insert({ ...evidence, userId: randomUUID() }), /code_review_pipeline_evidence_scope/)
  })
  const capabilities = new DefaultRuntimeCapabilityRegistry()
  const s: Scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), assistantId: randomUUID(), workspaceId: randomUUID() }
  const projectId = randomUUID(), actor = { tenantId: s.tenantId, organizationId: s.organizationId, userId: s.userId }
  const reviews = new Reviews(db.getRepository(Review), {} as PluginContext, {} as Repositories, capabilities)
  const service = new ReviewPipelineService(db.getRepository(ReviewPipelineBinding), db.getRepository(ReviewPipelineEvidence), db.getRepository(Review), reviews, capabilities)
  const operations = new ReviewPipelineOperations(service, reviews, db.getRepository(ReviewPipelineDelivery), capabilities)
  let permitted = true, head = 'a'.repeat(40), posts = 0, receiptFound = false, marker = '', submittedBody = '', receiptAuthor = 12
  let checks = [{ id: 1, name: 'test', status: 'completed', conclusion: 'success', html_url: null }]
  capabilities.register(ProjectAccessRuntimeCapability, {
    async listReadable() { return [] }, async assertEdit(c) {
      assert.equal(c.actor.tenantId, actor.tenantId); assert.equal(c.projectId, projectId)
      if (!permitted) throw new Error('project_access_revoked')
      return { projectId, role: 'owner', canManage: true, archived: false }
    }, async assertManage(c) { return this.assertEdit(c) }
  })
  let configureCalls = 0, startedBinding = ''
  capabilities.register(ProjectPipelineCommandsRuntimeCapability, {
    async configure(_c, input) { configureCalls++; assert.equal(input.configuration.template.key, 'code-review.pull-request'); return { bindingId: randomUUID(), revision: 1, definitionDigest: 'c'.repeat(64) } },
    async start(_c, input) { startedBinding = input.bindingId; return { instanceId: randomUUID(), runId: randomUUID(), roundId: randomUUID(), revision: 1 } },
    async decide() { throw new Error('unused') }, async nextRound() { throw new Error('unused') }
  })
  const github = new GitHub('fixture-only', async (request, init) => {
    const path = new URL(String(request)).pathname
    if (init?.method === 'POST') {
      posts++
      const body: unknown = JSON.parse(String(init.body))
      assert.ok(body && typeof body === 'object' && 'body' in body && typeof body.body === 'string')
      marker = body.body.split('\n').at(-1)!
      submittedBody = body.body
      throw new Error('Response lost after GitHub accepted review')
    }
    const value = path === '/user' ? { id: 12 } : path.endsWith('/check-runs') ? { total_count: checks.length, check_runs: checks }
      : path.endsWith('/reviews') ? (receiptFound ? [{ id: 9, commit_id: 'a'.repeat(40), body: submittedBody, user: { id: receiptAuthor }, html_url: 'https://github.com/sample/repository/pull/1#review-9', state: 'COMMENTED' }] : [])
      : { title: 'Fixture', body: '', html_url: 'https://github.com/sample/repository/pull/1', state: 'open', draft: false,
        user: { login: 'tester', type: 'User' }, head: { sha: head }, base: { sha: 'b'.repeat(40), ref: 'main' }, changed_files: 1 }
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  reviews.github = async () => github
  const snapshot: Snapshot = { title: 'Fixture', body: '', url: 'https://github.com/sample/repository/pull/1', state: 'open', author: 'tester',
    baseSha: 'b'.repeat(40), headSha: head, fetchedAt: new Date().toISOString(), comments: [], checks: [], warnings: [],
    files: [{ filename: 'app.ts', status: 'modified', additions: 1, deletions: 1, patch: '@@ -2,1 +2,1 @@\n-old\n+new' }] }
  const root = await db.getRepository(Review).save({ ...s, ref: parsePullUrl(snapshot.url), snapshot, access: 'public', status: 'ready',
    findings: [], viewed: [], summary: '', instructions: '' })
  const parameters = { requireChecks: true, requiredChecks: ['test'], blockingPriorities: ['P0', 'P1'] as Array<'P0' | 'P1'> }
  await t.test('attaches a saved Project binding only after validating the exact supported configuration', async () => {
    const bindingId = randomUUID()
    const configured = reviewPipelineConfiguration({ correctness: randomUUID(), security: randomUUID(), verifier: randomUUID() }, parameters)
    let valid = true
    capabilities.register(ProjectPipelineCatalogRuntimeCapability, {
      async list() { throw new Error('unused') }, async configure() { throw new Error('unused') }, async bindings() { throw new Error('unused') },
      async binding(context, id) {
        assert.equal(context.projectId, projectId); assert.deepEqual(context.actor, actor); assert.equal(id, bindingId)
        return { id, revision: 1, createdAt: new Date().toISOString(), configuration: valid ? configured : { ...configured,
          binding: { ...configured.binding, roleBindings: { owner: { kind: 'human', selectionKey: 'other-approvers' } } } } }
      }
    })
    const detached = await db.getRepository(Review).save({ ...s, ref: root.ref, snapshot, access: 'public', status: 'ready',
      findings: [], viewed: [], summary: '', instructions: '' })
    valid = false
    await assert.rejects(service.attach(s, { id: detached.id, revision: detached.revision, projectId, bindingId, requestId: randomUUID() }), /pipeline_configuration_mismatch/)
    assert.equal(await db.getRepository(ReviewPipelineBinding).countBy({ id: detached.id }), 0)
    valid = true
    const before = configureCalls
    await service.attach(s, { id: detached.id, revision: detached.revision, projectId, bindingId, requestId: randomUUID() })
    assert.equal(startedBinding, bindingId); assert.equal(configureCalls, before)
  })
  await service.attach(s, { id: root.id, revision: root.revision, projectId, requestId: randomUUID(),
    assistants: { correctness: randomUUID(), security: randomUUID(), verifier: randomUUID() }, parameters })
  const pipelineRoot = await service.root({ projectId, actor }, root.id)
  assert.deepEqual(pipelineRoot.scope.runtime, { projectId })
  assert.equal(pipelineRoot.scope.userId, actor.userId)
  assert.equal(pipelineRoot.scope.assistantId, s.assistantId)
  await t.test('opens only the authorized review in its registered Workbench view', async () => {
    assert.deepEqual(await service.entry({ projectId, actor }, root.id), {
      xpertId: s.assistantId, viewKey: 'code_review.provider__code_review.workspace', selectionId: root.id
    })
    await assert.rejects(service.entry({ projectId: randomUUID(), actor }, root.id))
    await assert.rejects(service.entry({ projectId, actor: { ...actor, userId: randomUUID() } }, root.id))
    permitted = false
    await assert.rejects(service.entry({ projectId, actor }, root.id), /project_access_revoked/)
    permitted = true
  })
  const subject = await service.subject({ projectId, actor }, root.id)
  const work = { instanceId: randomUUID(), runId: randomUUID(), roundId: randomUUID(), nodeInstanceId: randomUUID(), operationId: randomUUID(),
    inputDigest: digest([subject]), generation: 1 }
  const context: ProjectPipelineOperationContext = { projectId, actor, work, idempotencyKey: work.operationId, subjects: [subject], inputs: {}, parameters }
  const step = (input = context.inputs): ProjectPipelineOperationContext => {
    const operationId = randomUUID()
    return { ...context, idempotencyKey: operationId, work: { ...work, operationId, nodeInstanceId: randomUUID() }, inputs: input }
  }
  const assistant = (base: ProjectPipelineOperationContext): ProjectPipelineAssistantContext => ({ ...base,
    executor: { xpertId: randomUUID(), workspaceId: s.workspaceId!, publishedVersion: '1', executionId: base.work.operationId, conversationId: randomUUID() } })
  const prepared = await service.prepare(context), snapshotRef = prepared.outputs.snapshot
  const outputs: ProjectPipelineEvidenceRef[] = []
  let verified: ProjectPipelineEvidenceRef, checkRef: ProjectPipelineEvidenceRef

  await t.test('creates isolated parallel review drafts and uses fixed upstream findings for verification', async () => {
    for (const pass of ['correctness', 'security'] as const) {
      const c = assistant(step({ snapshot: { kind: 'evidence', value: snapshotRef } }))
      const input = await service.prepareAssistant(c, pass)
      assert.equal(input.context.codeReview.headSha, head)
      const scope = { ...s, assistantId: c.executor.xpertId }
      await reviews.complete(scope, { configurable: { executionId: c.executor.executionId, context: input.context } }, { summary: `${pass} verified`, findings: [] })
      outputs.push((await service.collect(c, pass)).findings)
    }
    assert.notEqual(outputs[0].objectKey, outputs[1].objectKey)
    const ci = await operations.checks(step())
    assert.equal(ci.status, 'succeeded'); if (ci.status !== 'succeeded') throw new Error('checks missing')
    checkRef = ci.outputs.checks
    const c = assistant(step({ snapshot: { kind: 'evidence', value: snapshotRef }, candidates: { kind: 'evidence_collection', value: outputs },
      checks: { kind: 'evidence', value: checkRef } }))
    const input = await service.prepareAssistant(c, 'verify')
    assert.equal(input.context.codeReview.candidates.length, 2)
    await reviews.complete({ ...s, assistantId: c.executor.xpertId }, { configurable: { executionId: c.executor.executionId, context: input.context } },
      { summary: 'Both review passes independently verified', findings: [] })
    verified = (await service.collect(c, 'verify')).findings
    const policy = await operations.readiness(step({ findings: { kind: 'evidence', value: verified }, checks: { kind: 'evidence', value: checkRef } }))
    assert.equal(policy.status, 'decided'); assert.ok(policy.status === 'decided' && policy.outcome === 'human')
  })
  await t.test('versioned evidence rejects tampering, cross-project reads, revoked access and content replacement', async () => {
    await assert.rejects(service.read(context, { ...snapshotRef, digest: 'f'.repeat(64) }), /pipeline_evidence_unavailable/)
    await assert.rejects(service.read({ ...context, projectId: randomUUID() }, snapshotRef))
    permitted = false
    await assert.rejects(service.read(context, snapshotRef), /project_access_revoked/)
    permitted = true
    await assert.rejects(service.write(context, 'snapshot', refs.snapshot, { reviewId: root.id, ref: root.ref, snapshot, instructions: 'changed' }), /pipeline_evidence_immutable/)
    await assert.rejects(reviews.start(s, root.id, root.revision, ''), /pipeline_managed_review/)
  })
  await t.test('CI waits for exact required checks and returns failed evidence for the rule to evaluate', async () => {
    checks[0].status = 'in_progress'
    const c = step()
    assert.equal((await operations.checks(c)).status, 'pending')
    checks[0].status = 'completed'; checks[0].conclusion = 'failure'
    const failed = await operations.checks(c)
    assert.equal(failed.status, 'succeeded'); if (failed.status !== 'succeeded') throw new Error('checks missing')
    const decision = await operations.readiness(step({ findings: { kind: 'evidence', value: verified }, checks: { kind: 'evidence', value: failed.outputs.checks } }))
    assert.ok(decision.status === 'decided' && decision.outcome === 'rework')
    checks[0].conclusion = 'success'
  })
  await t.test('persists delivery before POST and resolves uncertain delivery by lookup without publishing twice', async () => {
    const decision = { kind: 'human', outcome: 'accepted', actorId: actor.userId, inputDigest: work.inputDigest, generation: 1 }
    const approval: ProjectPipelineEvidenceRef = { resolverRef: 'platform.pipeline-decision@1', schemaRef: 'platform.human-decision@1',
      objectKey: randomUUID(), version: '1', digest: digest(decision), producerOperationId: randomUUID() }
    capabilities.register(ProjectPipelineEvidenceRuntimeCapability, { read: async () => decision })
    const c = step({ approval: { kind: 'evidence', value: approval }, findings: { kind: 'evidence', value: verified } })
    assert.equal((await operations.publish(c, true)).status, 'unknown')
    assert.equal(await db.getRepository(ReviewPipelineDelivery).countBy({ status: 'unknown' }), 1)
    assert.equal((await operations.publish(c, true)).status, 'unknown')
    assert.equal(posts, 1)
    receiptFound = true
    receiptAuthor = 99
    assert.equal((await operations.inspect(c)).status, 'unknown')
    receiptAuthor = 12
    const result = await operations.inspect(c)
    assert.equal(result.status, 'succeeded'); if (result.status !== 'succeeded') throw new Error('delivery missing')
    assert.equal((await operations.confirmed(step({ receipt: { kind: 'evidence', value: result.outputs.receipt } }))).status, 'succeeded')
    assert.equal(posts, 1)
  })
  await t.test('new source versions reject old tool completion while preserving immutable historical evidence', async () => {
    const c = assistant(step({ snapshot: { kind: 'evidence', value: snapshotRef } }))
    const input = await service.prepareAssistant(c, 'correctness')
    head = 'd'.repeat(40)
    await db.getRepository(Review).update(root.id, { snapshot: { ...snapshot, headSha: head } })
    assert.equal(await service.current(context, subject), false)
    await assert.rejects(reviews.complete({ ...s, assistantId: c.executor.xpertId }, { configurable: { executionId: c.executor.executionId, context: input.context } },
      { summary: 'late', findings: [] }), /stale_revision/)
    assert.equal(digest(await service.read(context, snapshotRef)), snapshotRef.digest)
  })
})

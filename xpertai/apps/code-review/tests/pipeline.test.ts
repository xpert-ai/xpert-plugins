import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DataSource, Table } from 'typeorm'
import { checkProjectPipelineConfiguration, configureProjectPipelineFromForm, type ProjectPipelineEvidenceRef } from '@xpert-ai/contracts'
import { DefaultRuntimeCapabilityRegistry, ProjectAccessRuntimeCapability, ProjectPipelineCommandsRuntimeCapability, ProjectPipelinesRuntimeCapability,
  ProjectPipelineEvidenceRuntimeCapability, ProjectPipelineCatalogRuntimeCapability, projectPipelineContributionSchema,
  type ProjectPipelineOperationContext, type ProjectPipelineAssistantContext, type ProjectPipelinesApi, type PluginContext } from '@xpert-ai/plugin-sdk'
import { ReviewRepository, ReviewRun } from '../src/automation-entities.js'
import { defaultPolicy } from '../src/automation-contract.js'
import { Review } from '../src/entity.js'
import { Reviews } from '../src/backend.js'
import { GitHub } from '../src/github.js'
import { Repositories } from '../src/repositories.js'
import { parsePullUrl, VIEW, type Snapshot, type Scope } from '../src/domain.js'
import { ReviewPipelineService } from '../src/pipeline/service.js'
import { ReviewPipelineOperations } from '../src/pipeline/operations.js'
import { ReviewPipelineBinding, ReviewPipelineEvidence, ReviewPipelineDelivery } from '../src/pipeline/entity.js'
import { repositoryPipelineConfiguration, lightweightReviewPipelineConfiguration, reviewPipelineConfiguration, reviewPipelineDescriptors, reviewPipelineConfigurationForm, ReviewPipelineContribution } from '../src/pipeline/configuration.js'
import { digest, refs } from '../src/pipeline/contract.js'
import { ReviewView } from '../src/view.js'

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

test('lightweight review is a valid platform pipeline with one Agent and the same human gate', () => {
  const c = lightweightReviewPipelineConfiguration(randomUUID())
  assert.deepEqual(checkProjectPipelineConfiguration(c, [...reviewPipelineDescriptors,
    { kind: 'completion', ref: 'platform.output-validated@1' }, { kind: 'schema', ref: 'platform.human-decision@1' }]).issues, [])
  assert.equal(Object.values(c.binding.executorBindings ?? {}).filter(binding => binding.kind === 'assistant').length, 1)
  assert.equal(c.template.executionAuthority, 'platform')
  assert(c.template.nodes.some(node => node.kind === 'human_gate'))
})
test('repository publication policies validate for both PR pipelines and deliver reports before the rework decision', () => {
  for (const base of [reviewPipelineConfiguration(), lightweightReviewPipelineConfiguration()]) {
    for (const mode of ['store', 'comment'] as const) {
      const c = repositoryPipelineConfiguration(base, mode)
      assert.deepEqual(checkProjectPipelineConfiguration(c, [...reviewPipelineDescriptors,
        { kind: 'completion', ref: 'platform.output-validated@1' }, { kind: 'schema', ref: 'platform.human-decision@1' }]).issues, [])
      assert.equal(c.template.nodes.some(node => node.kind === 'human_gate'), false)
      assert(c.template.edges.some(edge => edge.from === 'route' && edge.to === 'rework'))
      assert.equal(c.template.nodes.some(node => node.kind === 'work' && node.operationRef === refs.repositoryComment), mode === 'comment')
      if (mode === 'comment') assert(c.template.edges.some(edge => edge.to === 'publish' && ['correctness', 'verify'].includes(edge.from)))
    }
    assert(repositoryPipelineConfiguration(base, 'confirm').template.nodes.some(node => node.kind === 'human_gate'))
  }
})
const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname)) throw new Error('Dedicated pipeline test database required')
for (const layout of ['empty', 'orm-precreated'] as const) test(`Code Review pipeline persistence and governed plugin operations (${layout})`, { skip: !url }, async t => {
  const schema = `code_review_pipeline_${randomUUID().replaceAll('-', '')}`
  const db = new DataSource({ type: 'postgres', url, schema, entities: [ReviewRepository, ReviewRun, Review, ReviewPipelineBinding, ReviewPipelineEvidence, ReviewPipelineDelivery],
    uuidExtension: 'pgcrypto', extra: { options: `-c search_path=${schema},public` } })
  await db.initialize()
  t.after(async () => { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy() })
  await db.query(`CREATE SCHEMA "${schema}"`)
  const query = db.createQueryRunner()
  await query.createTable(Table.create(db.getMetadata(Review), db.driver))
  await query.createTable(Table.create(db.getMetadata(ReviewRun), db.driver))
  await query.createTable(Table.create(db.getMetadata(ReviewRepository), db.driver))
  if (layout === 'orm-precreated') for (const entity of [ReviewPipelineBinding, ReviewPipelineEvidence, ReviewPipelineDelivery]) {
    await query.createTable(Table.create(db.getMetadata(entity), db.driver))
  }
  await query.release()
  const sql = readFileSync(new URL('../migrations/20261018-project-pipeline.sql', import.meta.url), 'utf8')
  await db.query(sql); await db.query(sql)
  // New binding columns must also be added to pre-existing schemas.
  await db.query('ALTER TABLE plugin_code_review_pipeline_binding ADD COLUMN IF NOT EXISTS "sourceKey" varchar, ADD COLUMN IF NOT EXISTS "savedBindingId" uuid, ADD COLUMN IF NOT EXISTS "currentReviewId" uuid')
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
  const reviews = new Reviews(db.getRepository(Review), {} as PluginContext, { access: Repositories.prototype.access } as Repositories, capabilities)
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
      assert.equal(path, '/repos/sample/repository/pulls/1/reviews')
      assert.equal(JSON.parse(String(init.body)).event, 'COMMENT')
      assert.equal(JSON.parse(String(init.body)).commit_id, head)
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
  await t.test('attached root snapshots cannot be overwritten by refresh', async () => {
    await assert.rejects(reviews.refresh(s, root.id, root.revision), /pipeline_managed_review/)
    assert.deepEqual((await reviews.get(s, root.id)).snapshot, snapshot)
  })
  await t.test('opens only the authorized review in its registered Workbench view', async () => {
    assert.deepEqual(await service.entry({ projectId, actor }, root.id), {
      xpertId: s.assistantId, viewKey: 'code_review.provider__code_review.workspace', selectionId: root.id
    })
    await assert.rejects(service.entry({ projectId: randomUUID(), actor }, root.id))
    // Explicitly attached reviews are shared with authorized Project members.
    assert.equal((await service.entry({ projectId, actor: { ...actor, userId: randomUUID() } }, root.id)).selectionId, root.id)
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
    executor: { userId: randomUUID(), xpertId: randomUUID(), workspaceId: s.workspaceId!, publishedVersion: '1', executionId: base.work.operationId, conversationId: randomUUID() } })
  const prepared = await service.prepare(context), snapshotRef = prepared.outputs.snapshot
  const outputs: ProjectPipelineEvidenceRef[] = []
  let verified: ProjectPipelineEvidenceRef, checkRef: ProjectPipelineEvidenceRef

  await t.test('creates isolated parallel review drafts and uses fixed upstream findings for verification', async () => {
    for (const pass of ['correctness', 'security'] as const) {
      const c = assistant(step({ snapshot: { kind: 'evidence', value: snapshotRef } }))
      const input = await service.prepareAssistant(c, pass)
      assert.equal(input.context.codeReview.headSha, head)
      const scope = { ...s, userId: c.executor.userId!, assistantId: c.executor.xpertId }
      await reviews.complete(scope, { configurable: { executionId: c.executor.executionId, context: input.context } }, { summary: `${pass} verified`, findings: [{ title: `${pass} candidate`, body: 'Candidate evidence to be independently checked', priority: 'P2', path: 'app.ts', side: 'RIGHT', line: 2 }] })
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
    // The model sees tool results, not the hidden runtime context object.
    const config = { configurable: { context: { codeReview: { reviewId: c.work.operationId, headSha: head } } } }
    const verifierScope = { ...s, userId: c.executor.userId!, assistantId: c.executor.xpertId }
    const exposed = await reviews.evidence(verifierScope, config)
    assert.equal(exposed.role, 'verify')
    const candidates = await reviews.candidates(verifierScope, config, 0, 1)
    assert.equal(candidates.total, 2)
    assert.equal(candidates.candidates.length, 1)
    assert.equal(candidates.next, 1)
    assert.equal((await reviews.candidates(verifierScope, config, 1, 1)).next, null)
    await assert.rejects(reviews.candidates(verifierScope, { configurable: { context: { codeReview: { reviewId: c.work.operationId, headSha: 'f'.repeat(40) } } } }, 0, 1), /stale_revision/)

    await reviews.complete({ ...s, userId: c.executor.userId!, assistantId: c.executor.xpertId }, { configurable: { executionId: c.executor.executionId, context: input.context } },
      { summary: 'Both review passes independently verified', findings: [] })
    verified = (await service.collect(c, 'verify')).findings
    const policy = await operations.readiness(step({ findings: { kind: 'evidence', value: verified }, checks: { kind: 'evidence', value: checkRef } }))
    assert.equal(policy.status, 'decided'); assert.ok(policy.status === 'decided' && policy.outcome === 'human')
  })
  await t.test('published PR detail reads only the accepted report of the selected round', async t => {
    const run = await db.getRepository(ReviewRun).save({ ...s, reviewId: root.id, repositoryPolicyId: randomUUID(),
      operationKey: randomUUID(), number: 1, headSha: head, title: 'Published review', trigger: 'opened',
      settings: { ...defaultPolicy, pipeline: { projectId, bindingId: randomUUID() } }, policyRevision: 1,
      status: 'published', pipelineInstanceId: work.instanceId, pipelineRoundId: work.roundId, notBefore: new Date() })
    await db.getRepository(Review).update(root.id, { automationRunId: run.id })
    const single = assistant(step({ snapshot: { kind: 'evidence', value: snapshotRef } }))
    const { context: reviewContext } = await service.prepareAssistant(single, 'review')
    const finding = { title: 'Regression', body: 'Reachable failure', priority: 'P2' as const, path: 'app.ts', side: 'RIGHT' as const, line: 2 }
    await reviews.complete({ ...s, userId: single.executor.userId!, assistantId: single.executor.xpertId },
      { configurable: { executionId: single.executor.executionId, context: reviewContext } },
      { summary: 'Single reviewer conclusion', findings: [finding] })
    const singleReport = (await service.collect(single, 'review')).findings
    let full = false, finalReady = true, roundDigest = work.inputDigest
    const memberId = randomUUID()
    let graphAvailable = true, graphReads = 0, expectedGraphUser = actor.userId
    capabilities.register(ProjectPipelinesRuntimeCapability, { async graph(context, instanceId, input) {
      graphReads++
      if (!graphAvailable) throw new Error('graph unavailable')
      assert.deepEqual(context.actor, { ...actor, userId: expectedGraphUser })
      assert.equal(input?.roundId, work.roundId, 'use the selected run even if another round has the same SHA')
      return { projectId, instance: { id: instanceId }, roundId: work.roundId, round: { inputDigest: roundDigest },
        definition: (full ? reviewPipelineConfiguration() : lightweightReviewPipelineConfiguration()).template,
        nodes: [
          { projection: { nodeKey: 'correctness', state: { lifecycle: 'completed' }, evidence: [full ? outputs[0] : singleReport] } },
          { projection: { nodeKey: 'verify', state: { lifecycle: finalReady ? 'completed' : 'pending' }, evidence: finalReady ? [verified] : [] } }
        ] } as never
    } } as ProjectPipelinesApi)
    const view = new ReviewView(reviews, {} as never, service, {} as never, {} as never)
    const host = { ...s, hostType: 'agent' as const, hostId: s.assistantId }
    const detail = async (scope: Partial<Scope> = {}) => (await view.getViewData({ ...host, ...scope } as never,
      VIEW, { selectionId: root.id } as never) as { meta: { detail: Review & { reportUnavailable?: boolean } } }).meta.detail
    assert.equal((await detail()).summary, 'Single reviewer conclusion')
    assert.deepEqual((await detail()).findings, [finding])
    full = true
    assert.equal((await detail()).summary, 'Both review passes independently verified')
    assert.deepEqual((await detail()).findings, [])
    finalReady = false
    assert.equal((await detail()).summary, '', 'candidate findings are not a final review')
    assert.equal((await reviews.get(s, root.id)).status, 'ready', 'viewing the result never changes the root or republishes')
    finalReady = true
    roundDigest = '0'.repeat(64)
    await assert.rejects(service.finalReport(s, await reviews.get(s, root.id)), /pipeline_evidence_unavailable/)
    const invalid = await detail()
    assert.equal(invalid.reportUnavailable, true)
    assert.deepEqual([invalid.summary, invalid.findings], ['', []])
    roundDigest = work.inputDigest
    permitted = false
    await assert.rejects(detail(), /project_access_revoked/)
    permitted = true
    await t.test('an organization reader retains the snapshot but not the protected report', async () => {
      const member = { userId: memberId, assistant: { instanceId: s.assistantId, currentId: s.assistantId, versionIds: [] } }
      await db.getRepository(Review).update(root.id, { organizationShared: true })
      try {
        expectedGraphUser = memberId
        full = false
        assert.deepEqual((await detail(member)).findings, [finding])
        permitted = false
        const value = await detail(member)
        assert.deepEqual(value.snapshot, snapshot)
        assert.equal(value.reportUnavailable, true)
        assert.equal(value.summary, '')
        assert.deepEqual(value.findings, [])
        assert.equal(value.status, 'ready')
        const before = graphReads
        await assert.rejects(detail({ userId: memberId }), /project_access_revoked/)
        await assert.rejects(detail({ ...member, organizationId: randomUUID() }), /review_not_found/)
        assert.equal(graphReads, before, 'never read a report for an unauthorized root')
      } finally {
        permitted = true
        expectedGraphUser = actor.userId
        full = true
        await db.getRepository(Review).update(root.id, { organizationShared: false })
      }
    })
    await t.test('mark returns its committed revision even when the subsequent report refresh fails', async () => {
      const before = graphReads, revision = (await reviews.get(s, root.id)).revision
      const mark = (input: object) => view.executeViewAction(host as never, VIEW, 'mark', { input } as never)
      graphAvailable = false
      try {
        const result = await mark({ id: root.id, revision, pinned: true, viewed: ['app.ts'] })
        assert.equal(result.success, true)
        assert.equal(result.refresh, true)
        const saved = await db.getRepository(Review).findOneByOrFail({ id: root.id })
        assert.deepEqual([saved.pinned, saved.viewed, saved.revision], [true, ['app.ts'], revision + 1])
        assert.equal((result.data as { revision: number }).revision, saved.revision)
        assert.equal(graphReads, before, 'writing must not query the report')
        const refreshed = await detail()
        assert.equal(refreshed.reportUnavailable, true)
        assert.deepEqual([refreshed.pinned, refreshed.viewed, refreshed.revision], [true, ['app.ts'], saved.revision])
        assert.equal(graphReads, before + 1)
        const stale = await mark({ id: root.id, revision, pinned: false })
        assert.equal(stale.success, false)
        assert.deepEqual(stale.data, { code: 'revision_conflict' })
        assert.equal((await mark({ id: root.id, revision: saved.revision, pinned: false })).success, true)
      } finally { graphAvailable = true }
      assert.equal((await detail()).summary, 'Both review passes independently verified')
    })
    await db.getRepository(Review).update(root.id, { automationRunId: null })
  })
  await t.test('versioned evidence rejects tampering, cross-project reads, revoked access and content replacement', async () => {
    await assert.rejects(service.read(context, { ...snapshotRef, digest: 'f'.repeat(64) }), /pipeline_evidence_unavailable/)
    await assert.rejects(service.read({ ...context, projectId: randomUUID() }, snapshotRef))
    permitted = false
    await assert.rejects(service.read(context, snapshotRef), /project_access_revoked/)
    permitted = true
    await assert.rejects(service.write(context, 'snapshot', refs.snapshot, { reviewId: root.id, ref: root.ref, snapshot, instructions: 'changed' }), /pipeline_evidence_immutable/)
    await assert.rejects(reviews.start(s, root.id, (await reviews.get(s, root.id)).revision, ''), /pipeline_managed_review/)
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
  await t.test('trial cannot approve or publish through the Project gate', async () => {
    const run = await db.getRepository(ReviewRun).save({ tenantId: s.tenantId, organizationId: s.organizationId, assistantId: s.assistantId,
      repositoryPolicyId: randomUUID(), operationKey: randomUUID(), number: 1, headSha: head, title: 'Trial', trigger: 'trial',
      status: 'running', policyRevision: 1, settings: defaultPolicy, notBefore: new Date() })
    await db.getRepository(Review).update(root.id, { automationRunId: run.id })
    await assert.rejects(operations.authorize(context, 'project-managers', 'accepted'), /trial_cannot_publish/)
    await assert.rejects(operations.publish(context, true), /trial_cannot_publish/)
    assert.equal(posts, 0)
    await db.getRepository(Review).update(root.id, { automationRunId: null })
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
  await t.test('repository-authorized publication requires the live rule and pinned round, and recovers without another POST', async () => {
    const source = await service.bindings.findOneByOrFail({ id: root.id })
    const publicationBindingId = randomUUID()
    const settings = { ...defaultPolicy, enabled: true, executionMode: 'pipeline' as const, publication: 'comment' as const,
      pipeline: { projectId, bindingId: randomUUID() }, publicationBindingId }
    const p = await db.getRepository(ReviewRepository).save({ ...s, executionUserId: s.userId, ownership: 'assistant',
      owner: 'sample', repository: 'repository', installationId: '1', repositoryId: '2', confirmedAt: new Date(), settings })
    const run = await db.getRepository(ReviewRun).save({ ...s, repositoryPolicyId: p.id, reviewId: root.id, number: 1,
      operationKey: randomUUID(), headSha: head, title: 'Automatic', trigger: 'opened', status: 'running', policyRevision: 1,
      settings, notBefore: new Date(), pipelineInstanceId: work.instanceId, pipelineRoundId: work.roundId })
    await service.bindings.update(root.id, { savedBindingId: publicationBindingId, currentReviewId: root.id })
    await db.getRepository(Review).update(root.id, { automationRunId: run.id, automationPolicyId: p.id })
    const c = step({ findings: { kind: 'evidence', value: verified } })
    const before = posts
    const original = reviews.recordGithub
    reviews.recordGithub = async () => github
    try {
      await db.getRepository(ReviewRepository).update(p.id, { settings: { ...settings, publication: 'store' } })
      await assert.rejects(operations.publish(c, true, 'repository'), /policy_changed/)
      await db.getRepository(ReviewRepository).update(p.id, { settings })
      await assert.rejects(operations.publish({ ...c, work: { ...c.work, roundId: randomUUID() } }, true, 'repository'), /pipeline_configuration_mismatch/)
      await assert.rejects(operations.publish(c, true, 'human'), /approval_required/)
      assert.equal(posts, before)
      assert.equal((await operations.publish(c, true, 'repository')).status, 'unknown')
      assert.match(submittedBody, /Both review passes independently verified/)
      assert.equal((await operations.publish(c, true, 'repository')).status, 'succeeded')
      assert.equal(posts, before + 1)
    } finally {
      reviews.recordGithub = original
      await db.getRepository(Review).update(root.id, { automationRunId: null, automationPolicyId: null })
      await service.bindings.update(root.id, { savedBindingId: source.savedBindingId, currentReviewId: source.currentReviewId })
    }
  })
  await t.test('new source versions reject old tool completion while preserving immutable historical evidence', async () => {
    const c = assistant(step({ snapshot: { kind: 'evidence', value: snapshotRef } }))
    const input = await service.prepareAssistant(c, 'correctness')
    head = 'd'.repeat(40)
    await db.getRepository(Review).update(root.id, { snapshot: { ...snapshot, headSha: head } })
    assert.equal(await service.current(context, subject), false)
    await assert.rejects(reviews.complete({ ...s, userId: c.executor.userId!, assistantId: c.executor.xpertId }, { configurable: { executionId: c.executor.executionId, context: input.context } },
      { summary: 'late', findings: [] }), /stale_revision/)
    assert.equal(digest(await service.read(context, snapshotRef)), snapshotRef.digest)
  })
})

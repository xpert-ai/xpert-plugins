import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { DataSource, Table } from 'typeorm'
import { checkProjectPipelineConfiguration } from '@xpert-ai/contracts'
import { DefaultRuntimeCapabilityRegistry, ProjectAccessRuntimeCapability, ProjectPipelineEvidenceRuntimeCapability,
  type ProjectPipelineOperationContext, type PluginContext } from '@xpert-ai/plugin-sdk'
import { Review } from '../src/entity.js'
import { Reviews } from '../src/backend.js'
import type { Repositories } from '../src/repositories.js'
import { localGitImportSchema } from '../src/local-git.js'
import { ReviewPipelineBinding, ReviewPipelineEvidence, ReviewPipelineDelivery } from '../src/pipeline/entity.js'
import { ReviewPipelineService } from '../src/pipeline/service.js'
import { ReviewPipelineOperations } from '../src/pipeline/operations.js'
import { localReviewPipelineConfiguration, reviewPipelineDescriptors } from '../src/pipeline/configuration.js'
import { digest, refs } from '../src/pipeline/contract.js'

const bundle = () => ({ requestId: randomUUID(), repository: 'code-review', title: 'Local Git acceptance',
  baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), instructions: '',
  files: [{ filename: 'src/example.ts', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new' }],
  sources: [{ path: 'src/example.ts', base: 'old', head: 'new' }] })
test('local import rejects traversal, duplicate paths, unrelated source files and unexpected properties', () => {
  localGitImportSchema.parse(bundle())
  for (const filename of ['/etc/passwd', '../secret', '.git/config', 'src\\secret', 'src//file'])
    assert.equal(localGitImportSchema.safeParse({ ...bundle(), files: [{ ...bundle().files[0], filename }] }).success, false)
  assert.equal(localGitImportSchema.safeParse({ ...bundle(), files: [...bundle().files, ...bundle().files] }).success, false)
  assert.equal(localGitImportSchema.safeParse({ ...bundle(), sources: [{ path: 'other.ts', base: null, head: 'secret' }] }).success, false)
  assert.equal(localGitImportSchema.safeParse({ ...bundle(), repositoryPath: '/server/path' }).success, false)
})
test('local configuration uses only platform delivery and an explicit no-checks default', () => {
  const c = localReviewPipelineConfiguration()
  assert.deepEqual(checkProjectPipelineConfiguration(c, [...reviewPipelineDescriptors,
    { kind: 'completion', ref: 'platform.output-validated@1' }, { kind: 'schema', ref: 'platform.human-decision@1' }]).issues, [])
  assert.equal(c.binding.parameters?.requireChecks, false)
  assert.equal(c.template.subjectResolverRef, refs.localSubject)
  assert.equal(c.template.executionAuthority, 'platform')
  if (c.template.executionAuthority !== 'platform') throw new Error('Expected managed template')
  assert.ok(c.template.nodes.some(node => node.kind === 'work' && node.operationRef === refs.archive))
  assert.ok(!c.template.nodes.some(node => node.kind === 'work' && node.operationRef === refs.publish))
})
const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname)) throw new Error('Dedicated pipeline test database required')
test('local Git review import, scope, source access and approved atomic archive', { skip: !url }, async t => {
  const schema = `code_review_local_${randomUUID().replaceAll('-', '')}`
  const entities = [Review, ReviewPipelineBinding, ReviewPipelineEvidence, ReviewPipelineDelivery]
  const db = new DataSource({ type: 'postgres', url, schema, entities })
  await db.initialize()
  t.after(async () => { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy() })
  const runner = db.createQueryRunner()
  await runner.createSchema(schema, true)
  for (const entity of entities) await runner.createTable(Table.create(db.getMetadata(entity), db.driver), false, false, false)
  await runner.release()
  const s = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), assistantId: randomUUID(), workspaceId: randomUUID() }
  const capabilities = new DefaultRuntimeCapabilityRegistry(), projectId = randomUUID()
  capabilities.register(ProjectAccessRuntimeCapability, { listReadable: async () => [],
    async assertEdit(c) { assert.equal(c.actor.userId, s.userId); assert.equal(c.projectId, projectId); return { projectId, role: 'owner', archived: false, canManage: true } },
    async assertManage(c) { return this.assertEdit(c) } })
  const reviews = new Reviews(db.getRepository(Review), {} as PluginContext, {} as Repositories, capabilities)
  reviews.github = async () => { throw new Error('Local review must never contact GitHub') }
  const service = new ReviewPipelineService(db.getRepository(ReviewPipelineBinding), db.getRepository(ReviewPipelineEvidence), db.getRepository(Review), reviews, capabilities)
  const ops = new ReviewPipelineOperations(service, reviews, db.getRepository(ReviewPipelineDelivery), capabilities)
  const input = bundle(), root = await reviews.importLocal(s, input)
  assert.equal((await reviews.importLocal(s, input)).id, root.id)
  await assert.rejects(reviews.importLocal(s, { ...input, title: 'changed' }), /local_import_conflict/)
  await assert.rejects(reviews.get({ ...s, userId: randomUUID() }, root.id), /review_not_found/)
  assert.equal((await reviews.get(s, root.id)).localSources, undefined)
  const selection = { configurable: { context: { codeReview: { reviewId: root.id, headSha: input.headSha } } } }
  assert.equal((await reviews.source(s, selection, 'src/example.ts', 'head', 0, 10)).content, '1: new')
  await assert.rejects(reviews.source(s, selection, '../secret', 'head', 0, 10), /local_source_unavailable/)
  await assert.rejects(reviews.submit(s, { id: root.id, revision: root.revision, headSha: input.headSha, confirmed: true, event: 'COMMENT', body: 'no', findings: [] }), /local_review_has_no_remote_delivery/)
  await db.getRepository(ReviewPipelineBinding).save({ ...s, id: root.id, projectId, instanceId: null })
  await db.getRepository(Review).update(root.id, { pipelineProjectId: projectId })
  const actor = { tenantId: s.tenantId, organizationId: s.organizationId, userId: s.userId }
  const subject = await service.subject({ actor, projectId }, root.id)
  assert.equal(subject.resolverRef, refs.localSubject)
  const operationId = randomUUID(), inputDigest = digest([subject])
  const c: ProjectPipelineOperationContext = { actor, projectId, idempotencyKey: operationId, subjects: [subject], parameters: {
    requireChecks: false, requiredChecks: [], blockingPriorities: ['P0'] }, inputs: {}, work: { instanceId: randomUUID(), runId: randomUUID(),
    roundId: randomUUID(), nodeInstanceId: randomUUID(), operationId, inputDigest, generation: 1 } }
  const checked = await ops.checks(c)
  assert.equal(checked.status, 'succeeded')
  if (checked.status !== 'succeeded') throw new Error('Missing check result')
  assert.equal((await service.read(c, checked.outputs.checks)).state, 'not_required')
  const report = { reviewId: root.id, headSha: input.headSha, pass: 'verify' as const, inputDigest, summary: 'Verified local change', findings: [] }
  const findings = await service.write(c, 'findings', refs.findings, report)
  const archiveId = randomUUID()
  const archive = { ...c, work: { ...c.work, operationId: archiveId }, idempotencyKey: archiveId, inputs: { findings: { kind: 'evidence' as const, value: findings } } }
  await assert.rejects(ops.archive(archive, true), /approval_required/)
  const decision = { kind: 'human', outcome: 'accepted', actorId: s.userId, inputDigest, generation: 1 }
  capabilities.register(ProjectPipelineEvidenceRuntimeCapability, { read: async () => decision })
  const approved = { ...archive, inputs: { ...archive.inputs, approval: { kind: 'evidence' as const, value: { resolverRef: 'platform.pipeline-decision@1',
    schemaRef: 'platform.human-decision@1', objectKey: randomUUID(), version: '1', digest: digest(decision), producerOperationId: randomUUID() } } } }
  await db.query(`CREATE FUNCTION "${schema}".reject_archive() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'archive unavailable'; END $$`)
  await db.query(`CREATE TRIGGER reject_archive BEFORE INSERT ON "${schema}".plugin_code_review_pipeline_evidence FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_archive()`)
  await assert.rejects(ops.archive(approved, true), /archive unavailable/)
  assert.equal((await reviews.get(s, root.id)).status, 'ready')
  await db.query(`DROP TRIGGER reject_archive ON "${schema}".plugin_code_review_pipeline_evidence`)
  assert.equal((await ops.archive(approved, true)).status, 'succeeded')
  assert.equal((await ops.archive(approved, false)).status, 'succeeded')
  assert.equal((await reviews.get(s, root.id)).summary, report.summary)
  assert.equal(await db.getRepository(ReviewPipelineDelivery).count(), 0)
  assert.equal(await db.getRepository(ReviewPipelineEvidence).countBy({ operationId: archiveId }), 1)
})

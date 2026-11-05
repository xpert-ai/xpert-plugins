import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { AIPermissionsEnum, PermissionsEnum, UserType, type IUser } from '@xpert-ai/contracts'
import { DataSource, Table } from 'typeorm'
import { ModuleRef } from '@nestjs/core'
import { NestContainer } from '@nestjs/core/injector/container.js'
import { DefaultRuntimeCapabilityRegistry, AssistantMiddlewareAccessRuntimeCapability, ProjectAccessRuntimeCapability, RequestContext, runWithRequestContext,
  type ManagedQueueService, type PluginContext, type PluginLogger } from '@xpert-ai/plugin-sdk'
import { ReviewRepository, ReviewRun, ReviewPolicyAudit, ReviewDelivery } from '../src/automation-entities.js'
import { Automation } from '../src/automation.js'
import type { ReviewWebhookInbox } from '../src/webhook-inbox.js'
import type { ReviewPipelineAutomation } from '../src/pipeline/automation.js'
import type { WorkflowDiagnostics } from '../src/workflow-diagnostics.js'
import { Review } from '../src/entity.js'
import { Repositories } from '../src/repositories.js'
import { Reviews } from '../src/backend.js'
import { ReviewEvents, ReviewEventSubscription } from '../src/event-subscription.js'
import { ReviewPipelineCatalog } from '../src/pipeline/catalog.js'
import { GitHub } from '../src/github.js'
import { GitHubApp } from '../src/github-app.js'
import { defaultPolicy } from '../src/automation-contract.js'
import { ReviewError, type Scope } from '../src/domain.js'

class FixtureModule extends ModuleRef {
  get(): never { throw new Error('Unexpected lookup') }
  resolve(): Promise<never> { throw new Error('Unexpected lookup') }
  create(): Promise<never> { throw new Error('Unexpected creation') }
}
const logger: PluginLogger = { child: () => logger, debug() {}, log() {}, warn() {}, error() {} }
const context: PluginContext = { module: new FixtureModule(new NestContainer()), config: {}, logger,
  resolve(): never { throw new Error('No runtime dispatch in policy tests') } }
const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname)) throw new Error('Dedicated test database required')

test('Assistant identity, migration, CAS and historical privacy use actual PostgreSQL transactions', { skip: !url }, async t => {
  const schema = `code_review_organization_${randomUUID().replaceAll('-', '')}`
  const entities = [ReviewRepository, ReviewRun, ReviewPolicyAudit, Review, ReviewEventSubscription]
  const db = new DataSource({ type: 'postgres', url, schema, entities, extra: { options: `-c search_path=${schema},public` } })
  await db.initialize(); await db.query(`CREATE SCHEMA "${schema}"`)
  t.after(async () => { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy() })
  const runner = db.createQueryRunner()
  for (const entity of entities) await runner.createTable(Table.create(db.getMetadata(entity), db.driver))
  await runner.release()
  const scope: Scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), assistantId: randomUUID(), workspaceId: randomUUID() }
  scope.assistant = { instanceId: scope.assistantId, currentId: scope.assistantId, versionIds: [scope.assistantId], principalUserId: randomUUID() }
  scope.permissions = [AIPermissionsEnum.XPERT_EDIT, PermissionsEnum.ALL_ORG_EDIT]
  scope.hostSnapshot = { name: 'Assistant A', workspace: { name: 'Workspace A' }, organization: { name: 'Organization A' } }
  const otherManager: Scope = { ...scope, userId: randomUUID(), assistantId: randomUUID(), workspaceId: randomUUID(),
    hostSnapshot: { name: 'Assistant B', workspace: { name: 'Workspace B' }, organization: { name: 'Organization A' } } }
  otherManager.assistant = { ...scope.assistant, principalUserId: randomUUID(), instanceId: otherManager.assistantId, currentId: otherManager.assistantId, versionIds: [otherManager.assistantId] }
  const nonManager: Scope = { ...scope, userId: randomUUID(), permissions: [] }
  let unavailable = false, enqueued = 0
  const registry = new DefaultRuntimeCapabilityRegistry()
  registry.register(AssistantMiddlewareAccessRuntimeCapability, { assertAccess: async input => {
    const target = [scope, otherManager].find(item => item.assistantId === input.assistantId)
    if (unavailable || !target || input.actor.tenantId !== target.tenantId || input.actor.organizationId !== target.organizationId ||
      ![target.userId, target.assistant?.principalUserId].includes(input.actor.userId)) throw new Error('Assistant unavailable')
  }, runAsAssistant: async (input, work) => {
    await registry.require(AssistantMiddlewareAccessRuntimeCapability).assertAccess(input)
    return new Promise((resolve, reject) => runWithRequestContext({ headers: {
      'tenant-id': input.actor.tenantId, 'organization-id': input.actor.organizationId, 'x-scope-level': 'organization'
    }, user: { id: input.actor.userId, tenantId: input.actor.tenantId, type: UserType.COMMUNICATION } }, {}, () => { work().then(resolve, reject) }))
  } })
  const queue = { enqueue: async input => {
    assert.equal(input.userId, RequestContext.currentUserId())
    assert.equal(RequestContext.currentUser()?.type, UserType.COMMUNICATION)
    assert(!('runtimePrincipal' in input))
    enqueued++; return { jobId: 'fixture-job' }
  } } as ManagedQueueService
  registry.register(ProjectAccessRuntimeCapability, { listReadable: async () => [], assertEdit: async () => { throw new Error('Project denied') },
    assertManage: async () => { throw new Error('Project denied') }, assertAssistant: async () => { throw new Error('Project denied') } })
  const app = new GitHubApp(context)
  t.mock.method(app, 'inspect', async () => ({ installationId: '42', repositoryId: '123', owner: 'fixture', repository: 'repo', githubIntegrationId: randomUUID(), githubAppId: '9' }))
  const records = db.getRepository(ReviewRepository), events = new ReviewEvents(db.getRepository(ReviewEventSubscription), registry)
  const service = new Repositories(records, app, new ReviewPipelineCatalog(registry), registry, events)
  const reviews = new Reviews(db.getRepository(Review), context, service, registry)
  const automation = new Automation(db.getRepository(ReviewRun), {} as ReviewWebhookInbox, service, reviews,
    registry, {} as ReviewPipelineAutomation, events, {} as WorkflowDiagnostics, queue)
  const [created, replay] = await Promise.all([service.add(scope, 'fixture', 'repo'), service.add(otherManager, 'fixture', 'repo')])
  assert.equal(created.id, replay.id, 'concurrent same-org additions return one policy')
  assert.equal(await records.count(), 1)
  const unrelatedManager = { ...otherManager, assistantId: randomUUID(), permissions: [AIPermissionsEnum.XPERT_EDIT] }
  await assert.rejects(service.add(unrelatedManager, 'fixture', 'repo'), /repository_owned_elsewhere/)
  await assert.rejects(service.bind(unrelatedManager, created.id, created.revision), /repository_not_found/)
  assert.equal(created.ownership, 'assistant'); assert.equal(created.settings.enabled, false)
  assert.equal((await service.list(otherManager))[0].id, created.id, 'metadata is independent of current Assistant/configurer')
  await assert.rejects(service.add({ ...scope, organizationId: randomUUID() }, 'fixture', 'repo'), /repository_owned_elsewhere/)
  await assert.rejects(service.add(nonManager, 'fixture', 'repo'), /assistant_manager_required/)
  await assert.rejects(service.save(nonManager, created.id, created.revision, created.settings), /assistant_manager_required/)
  const first = await new Promise<ReviewRepository>((resolve, reject) => runWithRequestContext({ headers: {}, user: {
    id: otherManager.userId, tenantId: otherManager.tenantId, type: UserType.USER, username: 'Manager B'
  } as IUser }, {}, () => { service.bind(otherManager, created.id, created.revision).then(resolve, reject) }))
  assert.equal(first.assistantId, otherManager.assistantId)
  assert.equal(first.configuredById, created.userId)
  assert.notEqual((await service.execution(first)).userId, created.userId)
  assert.notEqual(first.executionUserId, otherManager.userId)
  const saves = await Promise.allSettled([
    service.save(scope, first.id, first.revision, { ...first.settings, instructions: 'first' }),
    service.save(otherManager, first.id, first.revision, { ...first.settings, instructions: 'second' })
  ])
  assert.equal(saves.filter(result => result.status === 'fulfilled').length, 1)
  assert(saves.some(result => result.status === 'rejected' && result.reason instanceof ReviewError && result.reason.code === 'revision_conflict'))
  const updated = await records.findOneByOrFail({ id: first.id })
  assert.equal(updated.assistantId, otherManager.assistantId, 'rule changes cannot silently retarget execution')
  assert.equal(updated.executionUserId, first.executionUserId)
  await records.update({ id: updated.id }, { errorCode: 'assistant_execution_unavailable' })
  await automation.schedule(await records.findOneByOrFail({ id: updated.id }))
  assert.equal((await records.findOneByOrFail({ id: updated.id })).errorCode, null, 'live recovery clears a stale bootstrap health error')
  assert.equal(enqueued, 1)
  const audit = await db.getRepository(ReviewPolicyAudit).find({ where: { repositoryPolicyId: first.id }, order: { revision: 'ASC' } })
  assert.deepEqual(audit.map(row => row.action), ['created', 'rebound', 'saved'])
  assert.equal(audit[1].actorId, otherManager.userId)
  assert.equal(audit[1].snapshot.actorLabel, 'Manager B', 'audit names come from the authenticated request')
  assert.equal(audit[1].snapshot.assistantLabel, 'Assistant B')
  const labels = await service.labels(otherManager, [updated])
  assert.equal(labels.users.find(user => user.id === otherManager.userId)?.label, 'Manager B')
  assert.equal((await service.access(scope)).organizationName, 'Organization A')
  assert.deepEqual((await service.list(nonManager)).map(p => p.id), [], 'runtime users cannot inspect another Assistant policy')
  const staleMetadata = { ...nonManager, assistant: { ...nonManager.assistant!, access: { canManage: true, canManageOrganization: true }, actor: { id: scope.userId, label: 'Forged' } } }
  await assert.rejects(service.maintain(staleMetadata, updated.id, updated.revision), /assistant_manager_required/)

  const github = new GitHub()
  t.mock.method(github, 'snapshot', async () => ({ headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), title: 'shared review', body: '',
    files: [{ filename: 'fixture.ts', status: 'added', additions: 1, deletions: 0 }], warnings: [], checks: [] }))
  t.mock.method(service, 'github', async () => github)
  const shared = await reviews.prepareAutomatic(await service.execution(updated), { id: randomUUID(), number: 2,
    headSha: 'a'.repeat(40), settings: updated.settings } as ReviewRun)
  const viewer = { ...otherManager, userId: randomUUID(), permissions: [] }
  assert.equal(shared.organizationShared, true)
  assert.equal((await reviews.get(viewer, shared.id)).id, shared.id, 'Assistant members can see new shared results')
  await assert.rejects(reviews.get({ ...viewer, assistantId: randomUUID() }, shared.id), /review_not_found/)

  const legacy = await records.save(records.create({ ...scope, id: randomUUID(), installationId: '43', repositoryId: '124', owner: 'fixture', repository: 'legacy',
    ownership: 'user', settings: defaultPolicy }))
  const historical = await db.getRepository(Review).save({ ...scope, ref: { provider: 'github', owner: 'fixture', repository: 'legacy', number: 1 },
    snapshot: { headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), title: 'private', body: '', files: [], warnings: [], checks: [] },
    status: 'ready', findings: [], viewed: [], summary: '', instructions: '', automationPolicyId: legacy.id })
  await assert.rejects(service.execution(legacy), /assistant_binding_required/)
  const preview = await service.preview(otherManager, legacy.id)
  assert.equal(preview.preservesHistoricalPrivacy, true); assert.equal(preview.pausesAutomation, true)
  // The external inspection now identifies the legacy repository.
  t.mock.method(app, 'inspect', async () => ({ installationId: '43', repositoryId: '124', owner: 'fixture', repository: 'legacy', githubIntegrationId: randomUUID(), githubAppId: '9' }))
  const adopted = await service.bind(otherManager, legacy.id, legacy.revision)
  assert.equal(adopted.id, legacy.id); assert.equal(adopted.settings.enabled, false)
  assert.equal(adopted.configuredById, scope.userId)
  await assert.rejects(reviews.get(otherManager, historical.id), /review_not_found/)
  assert(!(await (await reviews.visibleQuery(otherManager)).getMany()).some(row => row.id === historical.id))
  assert.equal((await reviews.get(scope, historical.id)).id, historical.id)
  const maintained = await service.maintain(scope, updated.id, updated.revision)
  const maintenanceAudit = await db.getRepository(ReviewPolicyAudit).findOneByOrFail({ repositoryPolicyId: maintained.id, revision: maintained.revision })
  assert.equal(maintenanceAudit.snapshot.assistantLabel, '', 'cross-Assistant management cannot relabel the target with the current host name')
  assert.equal((await service.labels(scope, [maintained])).assistants.find(item => item.id === otherManager.assistantId)?.label, 'Assistant B')
  assert.equal(maintained.executionRevision, updated.executionRevision, 'changing maintainers does not interrupt a review')
  assert.equal(maintained.executionUserId, updated.executionUserId)
  assert.equal(maintained.executionUserId, otherManager.assistant.principalUserId, 'rules reuse the existing Assistant account')
  unavailable = true
  await automation.schedule(maintained)
  assert.equal((await records.findOneByOrFail({ id: maintained.id })).errorCode, 'assistant_execution_unavailable')
  assert.equal(enqueued, 1, 'an unavailable Assistant cannot enqueue work')
  await assert.rejects(service.execution(maintained), /assistant_execution_unavailable/)
  await assert.rejects(service.get({ ...scope, tenantId: randomUUID() }, updated.id), /repository_not_found/)
})

test('organization migration is additive and replayable over legacy rows', { skip: !url }, async t => {
  const { readFile } = await import('node:fs/promises')
  const schema = `code_review_migration_${randomUUID().replaceAll('-', '')}`
  const db = new DataSource({ type: 'postgres', url, schema, extra: { options: `-c search_path=${schema},public` } })
  await db.initialize(); await db.query(`CREATE SCHEMA "${schema}"`)
  t.after(async () => { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy() })
  await db.query('CREATE TABLE plugin_code_review_repository (id uuid PRIMARY KEY, "userId" varchar NOT NULL, revision integer NOT NULL, settings jsonb NOT NULL)')
  await db.query('CREATE TABLE plugin_code_review_run (id uuid PRIMARY KEY, "repositoryPolicyId" uuid NOT NULL, settings jsonb NOT NULL)')
  await db.query('CREATE TABLE plugin_code_review_review (id uuid PRIMARY KEY)')
  await db.query('CREATE TABLE plugin_code_review_workflow_diagnosis (id uuid PRIMARY KEY)')
  const id = randomUUID(), runId = randomUUID(), reviewId = randomUUID(), userId = randomUUID()
  const settings = { enabled: true, visibility: 'private', delivery: 'automatic' }
  await db.query('INSERT INTO plugin_code_review_repository VALUES ($1,$2,7,$3)', [id, userId, settings])
  await db.query('INSERT INTO plugin_code_review_run VALUES ($1,$2,$3)', [runId, id, settings])
  await db.query('INSERT INTO plugin_code_review_review VALUES ($1)', [reviewId])
  const sql = await readFile(new URL('../migrations/20261104-organization-ownership.sql', import.meta.url), 'utf8')
  await db.query(sql); await db.query(sql)
  const [policy] = await db.query('SELECT * FROM plugin_code_review_repository WHERE id=$1', [id])
  const [run] = await db.query('SELECT * FROM plugin_code_review_run WHERE id=$1', [runId])
  assert.equal(policy.ownership, 'user'); assert.equal(policy.executionRevision, 7)
  assert.equal(policy.configuredById, userId); assert.equal(policy.executionGrantId, null)
  assert.deepEqual(policy.settings, settings); assert.deepEqual(run.settings, settings)
  assert.equal(run.evidenceUserId, userId); assert.equal(run.organizationShared, false)
  assert.equal((await db.query('SELECT * FROM plugin_code_review_review WHERE id=$1', [reviewId]))[0].organizationShared, false)
  // A replay never overwrites a later execution revision with a metadata revision.
  await db.query('UPDATE plugin_code_review_repository SET revision=9, "executionRevision"=8 WHERE id=$1', [id])
  await db.query(sql)
  assert.equal((await db.query('SELECT "executionRevision" FROM plugin_code_review_repository WHERE id=$1', [id]))[0].executionRevision, 8)
  await db.query('ALTER TABLE plugin_code_review_repository ADD COLUMN "errorCode" varchar')
  const current = await readFile(new URL('../migrations/20261104020000-assistant-execution.sql', import.meta.url), 'utf8')
  await db.query(current); await db.query(current)
  const [migrated] = await db.query('SELECT * FROM plugin_code_review_repository WHERE id=$1', [id])
  assert.equal(migrated.settings.enabled, false); assert.equal(migrated.executionRevision, 9)
  assert.equal(migrated.configuredById, userId); assert.equal(migrated.executionUserId, null)
  assert(!('executionGrantId' in migrated))
  assert.deepEqual((await db.query('SELECT settings FROM plugin_code_review_run WHERE id=$1', [runId]))[0].settings, settings)
})

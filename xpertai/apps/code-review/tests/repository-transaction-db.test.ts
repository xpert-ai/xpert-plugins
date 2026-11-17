import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { AssistantMiddlewareAccessRuntimeCapability, DefaultRuntimeCapabilityRegistry, type PluginContext } from '@xpert-ai/plugin-sdk'
import { ReviewPolicyAudit, ReviewRepository } from '../src/automation-entities.js'
import { Repositories } from '../src/repositories.js'
import { GitHubApp } from '../src/github-app.js'
import { ReviewPipelineCatalog } from '../src/pipeline/catalog.js'
import type { ReviewEvents } from '../src/event-subscription.js'
import type { Scope } from '../src/domain.js'
import { fixture, url } from './automation-db.fixture.js'
import { deferred } from './automation-lease.fixture.js'

for (const concurrent of ['none', 'policy_change', 'new_run', 'metadata_change'] as const) {
  test(`repository bind performs external checks without locks and rechecks ${concurrent}`, { skip: !url }, async t => {
    const f = await fixture(t), entered = deferred(), release = deferred()
    const scope: Scope = { tenantId: f.p.tenantId, organizationId: f.p.organizationId, userId: f.p.userId,
      assistantId: f.p.assistantId, workspaceId: f.p.workspaceId, permissions: [AIPermissionsEnum.XPERT_EDIT],
      assistant: { currentId: f.p.assistantId, instanceId: f.p.assistantId, versionIds: [f.p.assistantId], principalUserId: f.p.executionUserId! } }
    const registry = new DefaultRuntimeCapabilityRegistry(), app = new GitHubApp({} as PluginContext), catalog = new ReviewPipelineCatalog(registry)
    async function assertNoTransaction() {
      const [activity] = await f.db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1 AND state = 'idle in transaction'", [f.schema])
      assert.equal(activity.count, 0)
    }
    registry.register(AssistantMiddlewareAccessRuntimeCapability, { assertAccess: assertNoTransaction })
    t.mock.method(catalog, 'validate', assertNoTransaction)
    t.mock.method(app, 'inspect', async () => {
      await assertNoTransaction(); entered.resolve(); await release.promise
      return { owner: f.p.owner, repository: f.p.repository, installationId: f.p.installationId, repositoryId: f.p.repositoryId, githubIntegrationId: null, githubAppId: '3' }
    })
    const service = new Repositories(f.records, app, catalog, registry, {} as ReviewEvents)
    const binding = service.bind(scope, f.p.id, f.p.revision)
    try {
      await entered.promise
      const lock = f.db.createQueryRunner()
      try {
        await lock.startTransaction()
        await lock.manager.findOneOrFail(ReviewRepository, { where: { id: f.p.id }, lock: { mode: 'pessimistic_write', onLocked: 'nowait' } })
        await lock.rollbackTransaction()
      } finally { await lock.release() }
      if (concurrent === 'policy_change') await f.records.update(f.p.id, { revision: 2, executionRevision: 2 })
      if (concurrent === 'new_run') await f.addRun()
      if (concurrent === 'metadata_change') await f.records.update(f.p.id, { lastEventAt: new Date('2026-11-05T00:00:00Z') })
    } finally { release.resolve() }
    if (concurrent === 'none' || concurrent === 'metadata_change') {
      const rebound = await binding
      assert.equal(rebound.revision, 2); assert.equal(rebound.executionRevision, 2); assert.equal(rebound.settings.enabled, false)
      assert.equal(await f.db.getRepository(ReviewPolicyAudit).countBy({ action: 'rebound' }), 1)
      if (concurrent === 'metadata_change') assert.equal(rebound.lastEventAt?.toISOString(), '2026-11-05T00:00:00.000Z')
    } else {
      await assert.rejects(binding, concurrent === 'policy_change' ? /revision_conflict/ : /publication_reconciliation_required/)
      assert.equal(await f.db.getRepository(ReviewPolicyAudit).count(), 0)
      assert.equal((await f.records.findOneByOrFail({ id: f.p.id })).settings.enabled, true)
    }
  })
}

test('repository conflict authority lookup runs after the advisory transaction has released', { skip: !url }, async t => {
  const f = await fixture(t), registry = new DefaultRuntimeCapabilityRegistry(), app = new GitHubApp({} as PluginContext)
  const assistantId = randomUUID()
  const scope: Scope = { tenantId: f.p.tenantId, organizationId: f.p.organizationId, userId: randomUUID(), assistantId,
    workspaceId: randomUUID(), permissions: [AIPermissionsEnum.XPERT_EDIT],
    assistant: { currentId: assistantId, instanceId: assistantId, versionIds: [assistantId], principalUserId: randomUUID() } }
  t.mock.method(app, 'inspect', async () => ({ owner: f.p.owner, repository: f.p.repository, installationId: f.p.installationId,
    repositoryId: f.p.repositoryId, githubIntegrationId: null, githubAppId: '3' }))
  let checked = false, verified = false
  registry.register(AssistantMiddlewareAccessRuntimeCapability, { assertAccess: async () => {
    checked = true
    const [activity] = await f.db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1 AND state = 'idle in transaction'", [f.schema])
    assert.equal(activity.count, 0)
    const runner = f.db.createQueryRunner()
    try {
      await runner.startTransaction()
      const [lock] = await runner.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired', [`code-review-repository:${f.p.installationId}:${f.p.repositoryId}`])
      assert.equal(lock.acquired, true)
      await runner.rollbackTransaction()
    } finally { await runner.release() }
    verified = true
  } })
  const service = new Repositories(f.records, app, new ReviewPipelineCatalog(registry), registry, {} as ReviewEvents)
  await assert.rejects(service.add(scope, f.p.owner, f.p.repository), /repository_owned_elsewhere/)
  assert.equal(checked, true)
  assert.equal(verified, true, 'conflict disclosure must not swallow a transaction-boundary regression')
  assert.equal(await f.records.count(), 1)
  assert.equal((await f.records.findOneByOrFail({ id: f.p.id })).assistantId, f.p.assistantId)
})

test('saving a repository rule selects its publication binding on the server and replaces it when PR mode changes', { skip: !url }, async t => {
  const f = await fixture(t)
  const registry = new DefaultRuntimeCapabilityRegistry()
  const app = new GitHubApp({} as PluginContext), catalog = new ReviewPipelineCatalog(registry)
  const scope: Scope = { ...f.p, permissions: [AIPermissionsEnum.XPERT_EDIT],
    assistant: { currentId: f.p.assistantId, instanceId: f.p.assistantId, versionIds: [], principalUserId: f.p.executionUserId! } }
  registry.register(AssistantMiddlewareAccessRuntimeCapability, { assertAccess: async () => {} })
  const bindingId = randomUUID()
  t.mock.method(catalog, 'configurePublication', async (_scope, target, mode) => {
    assert.deepEqual(target, f.p.settings.pipeline)
    assert.equal(mode, 'comment')
    return bindingId
  })
  t.mock.method(app, 'inspect', async () => ({ ...f.p, githubIntegrationId: null, githubAppId: '3' }))
  const service = new Repositories(f.records, app, catalog, registry, { access: async () => {} } as ReviewEvents)
  const configured = await service.save(scope, f.p.id, f.p.revision, { ...f.p.settings, visibility: 'project', publication: 'comment',
    publicationBindingId: randomUUID() })
  assert.equal(configured.settings.publicationBindingId, bindingId)
  await service.save(scope, f.p.id, configured.revision, { ...configured.settings, executionMode: 'assistant', pipeline: null, visibility: 'organization' })
  const latest = await f.records.findOneByOrFail({ id: f.p.id })
  assert.equal(latest.settings.publication, 'comment')
  assert.equal(latest.settings.publicationBindingId, undefined)
})

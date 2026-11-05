import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { DataSource, Table } from 'typeorm'
import { AIPermissionsEnum, PermissionsEnum } from '@xpert-ai/contracts'
import { AssistantMiddlewareAccessRuntimeCapability, DefaultRuntimeCapabilityRegistry, type PluginContext } from '@xpert-ai/plugin-sdk'
import { ReviewRepository, ReviewPolicyAudit } from '../src/automation-entities.js'
import { Repositories } from '../src/repositories.js'
import { RepositoryConflictError, repositoryConflict } from '../src/repository-conflict.js'
import { repositoryConflictSchema } from '../src/repository-conflict-contract.js'
import { GitHubApp } from '../src/github-app.js'
import { ReviewPipelineCatalog } from '../src/pipeline/catalog.js'
import type { ReviewEvents } from '../src/event-subscription.js'
import { defaultPolicy } from '../src/automation-contract.js'
import { ReviewError, VIEW, type Scope } from '../src/domain.js'
import { ReviewView } from '../src/view.js'
import type { Automation } from '../src/automation.js'

const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname)) throw new Error('Dedicated test database required')

test('repository conflict disclosure uses live authority, bounded metadata and unchanged ownership', { skip: !url }, async t => {
  const schema = `conflict_${randomUUID().replaceAll('-', '')}`
  const db = new DataSource({ type: 'postgres', url, schema, entities: [ReviewRepository, ReviewPolicyAudit], extra: { options: `-c search_path=${schema},public` } })
  await db.initialize(); await db.query(`CREATE SCHEMA "${schema}"`)
  t.after(async () => { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy() })
  const runner = db.createQueryRunner()
  for (const entity of [ReviewRepository, ReviewPolicyAudit]) await runner.createTable(Table.create(db.getMetadata(entity), db.driver))
  await runner.release()
  const s: Scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), assistantId: randomUUID(), workspaceId: randomUUID(),
    permissions: [AIPermissionsEnum.XPERT_EDIT], hostSnapshot: { name: 'Current assistant', organization: { name: 'Current organization' } } }
  s.assistant = { instanceId: s.assistantId, currentId: s.assistantId, versionIds: [s.assistantId], principalUserId: randomUUID() }
  const records = db.getRepository(ReviewRepository), audits = db.getRepository(ReviewPolicyAudit)
  const configuredById = randomUUID(), maintainerId = randomUUID(), organizationId = randomUUID()
  const prior = await records.save(records.create({ ...s, assistantId: randomUUID(), organizationId, userId: configuredById,
    configuredById, responsibleUserId: maintainerId, executionUserId: randomUUID(), ownership: 'assistant',
    owner: 'old-owner', repository: 'old-name', installationId: '42', repositoryId: '123',
    settings: { ...defaultPolicy, enabled: false, instructions: 'PRIVATE RULES' } }))
  await audits.save([
    { tenantId: s.tenantId, organizationId, repositoryPolicyId: prior.id, revision: 1, actorId: configuredById, action: 'created',
      snapshot: { actorLabel: 'Original configurer', organizationLabel: 'Owning organization', assistantId: prior.assistantId,
        assistantLabel: 'Private assistant', settings: { instructions: 'PRIVATE AUDIT' } } },
    { tenantId: s.tenantId, organizationId, repositoryPolicyId: prior.id, revision: 200, actorId: maintainerId, action: 'maintained',
      snapshot: { actorLabel: 'Current maintainer', assistantId: randomUUID(), assistantLabel: 'Unrelated assistant' } }
  ])
  let githubError: string | null = null, assistantAllowed = false, assistantChecks = 0
  const app = new GitHubApp({} as PluginContext)
  const inspect = t.mock.method(app, 'inspect', async () => {
    if (githubError) throw new ReviewError(githubError)
    return { owner: 'canonical', repository: 'renamed', installationId: '42', repositoryId: '123', githubIntegrationId: randomUUID(), githubAppId: '9' }
  })
  const capabilities = new DefaultRuntimeCapabilityRegistry()
  capabilities.register(AssistantMiddlewareAccessRuntimeCapability, { async assertAccess(input) {
    assistantChecks++
    assert.deepEqual(input.actor, { tenantId: s.tenantId, organizationId: s.organizationId, userId: s.userId })
    assert.equal(input.assistantId, prior.assistantId)
    if (!assistantAllowed) throw new Error('Assistant access denied')
  }, async runAsAssistant() { throw new Error('Must not impersonate Assistant') } })
  const service = new Repositories(records, app, new ReviewPipelineCatalog(capabilities), capabilities, {} as ReviewEvents)
  async function conflict(scope = s) {
    try { await service.add(scope, 'canonical', 'renamed'); assert.fail('Conflict expected') }
    catch (error) { assert(error instanceof RepositoryConflictError); return repositoryConflictSchema.parse(error.conflict) }
  }

  await assert.rejects(service.add({ ...s, permissions: [] }, 'canonical', 'renamed'), /assistant_manager_required/)
  assert.equal(inspect.mock.callCount(), 0, 'platform permission is checked before GitHub or binding lookup')
  for (githubError of ['github_auth_required', 'repository_management_required', 'installation_permissions_required']) {
    await assert.rejects(service.add(s, 'canonical', 'renamed'), error => {
      assert(error instanceof ReviewError); assert(!(error instanceof RepositoryConflictError)); return error.code === githubError
    })
  }
  githubError = null
  const foreignOrg = await conflict()
  assert.equal(foreignOrg.kind, 'other_organization')
  assert(foreignOrg.kind !== 'other_tenant')
  assert.equal(foreignOrg.organization.label, 'Owning organization')
  assert.equal(foreignOrg.configuredBy.label, 'Original configurer', 'old creator label is not lost after many revisions')
  assert.equal(foreignOrg.maintainer?.label, 'Current maintainer')
  assert.equal(foreignOrg.assistant, null)
  assert.equal(foreignOrg.enabled, false, 'paused bindings still explain conflicts')
  assert.deepEqual(foreignOrg.repository, { owner: 'canonical', name: 'renamed' })
  assert.equal(assistantChecks, 0, 'cross-organization disclosure does not broaden actor scope')
  assert.doesNotMatch(JSON.stringify(foreignOrg), /PRIVATE|executionUserId|installationId|repositoryId|settings|Private assistant/)

  const foreignTenant = await conflict({ ...s, tenantId: randomUUID(), permissions: [AIPermissionsEnum.XPERT_EDIT, PermissionsEnum.SUPER_ADMIN_EDIT] })
  assert.deepEqual(foreignTenant, { kind: 'other_tenant', repository: { owner: 'canonical', name: 'renamed' } })
  assert.deepEqual(await repositoryConflict({} as never, { ...s, tenantId: randomUUID() }, prior, foreignTenant.repository,
    async () => { assert.fail('Cross-tenant assistant lookup forbidden') }), foreignTenant, 'no cross-tenant audit lookup')

  await records.update(prior.id, { organizationId: s.organizationId })
  await audits.update({ repositoryPolicyId: prior.id }, { organizationId: s.organizationId })
  const sameOrg = await conflict()
  assert.equal(sameOrg.kind, 'other_assistant'); assert(sameOrg.kind !== 'other_tenant')
  assert.equal(sameOrg.organization.label, 'Current organization'); assert.equal(sameOrg.assistant, null)
  assistantAllowed = true
  const readable = await conflict()
  assert(readable.kind !== 'other_tenant'); assert.equal(readable.assistant?.label, 'Private assistant')
  await assert.rejects(service.bind(s, prior.id, prior.revision), /repository_not_found/)
  await assert.rejects(service.history(s, prior.id), /repository_not_found/)
  await assert.rejects(service.maintain(s, prior.id, prior.revision), /repository_not_found/)
  assert.equal((await service.add({ ...s, permissions: [...s.permissions!, PermissionsEnum.ALL_ORG_EDIT] }, 'canonical', 'renamed')).id, prior.id)

  const view = new ReviewView({} as never, { repositories: service, schedule: async () => assert.fail('No scheduling on conflict') } as unknown as Automation,
    {} as never, {} as never, {} as never)
  const result = await view.executeViewAction({ ...s, hostType: 'agent', hostId: s.assistantId }, VIEW, 'repository.add',
    { input: { owner: 'canonical', repository: 'renamed' } })
  assert.deepEqual(result, { success: false, refresh: false, data: { code: 'repository_owned_elsewhere', conflict: readable } })
  const forged = await view.executeViewAction({ ...s, hostType: 'agent', hostId: s.assistantId }, VIEW, 'repository.add',
    { input: { owner: 'canonical', repository: 'renamed', tenantId: prior.tenantId } })
  assert.deepEqual(forged.data, { code: 'invalid_input' })
  const unchanged = await records.findOneByOrFail({ id: prior.id })
  assert.equal(unchanged.revision, prior.revision); assert.equal(unchanged.assistantId, prior.assistantId)
  assert.equal(await records.count(), 1); assert.equal(await audits.count(), 2)

  await audits.delete({ repositoryPolicyId: prior.id })
  const legacy = await conflict()
  assert(legacy.kind !== 'other_tenant')
  assert.deepEqual(legacy.configuredBy, { id: configuredById, label: null })
  assert.equal(legacy.maintainer?.label, null)

  await db.query('CREATE TABLE organization (id uuid, "tenantId" uuid, name varchar)')
  await db.query('CREATE TABLE "user" (id uuid, "tenantId" uuid, "firstName" varchar, "lastName" varchar, username varchar)')
  await db.query('INSERT INTO organization VALUES ($1,$2,$3)', [s.organizationId, s.tenantId, 'Backfilled organization'])
  await db.query('INSERT INTO "user" VALUES ($1,$2,$3,$4,$5)', [configuredById, s.tenantId, 'Backfilled', 'Configurer', 'account'])
  await audits.save({ tenantId: s.tenantId, organizationId: s.organizationId, repositoryPolicyId: prior.id, revision: 1,
    actorId: configuredById, action: 'created', snapshot: { settings: { instructions: 'unchanged' } } })
  const migration = await readFile(new URL('../migrations/20261105-repository-conflict-labels.sql', import.meta.url), 'utf8')
  await db.query(migration); await db.query('UPDATE organization SET name = $1', ['Renamed later']); await db.query(migration)
  const backfilled = await conflict()
  assert(backfilled.kind !== 'other_tenant'); assert.equal(backfilled.configuredBy.label, 'Backfilled Configurer')
  const audit = await audits.findOneByOrFail({ repositoryPolicyId: prior.id })
  assert.equal(audit.snapshot.organizationLabel, 'Backfilled organization', 'replay preserves recorded labels')
  assert.deepEqual(audit.snapshot.settings, { instructions: 'unchanged' })
})

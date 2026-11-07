const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { ProjectAccessRuntimeCapability } = require('@xpert-ai/plugin-sdk')
const { fixture } = require('./dataset-fixture.cjs')
const { datasetSaveSchema } = require('../dist/lib/dataset.schema')
const { DashboardDatasetArtifactType } = require('../dist/lib/dataset-artifact.provider')

test('reusable dataset validates live queries, persists definitions only, and reopens with CAS revision', async () => {
  const f = fixture(), first = await f.library.save(f.context, { definition: f.definition, expectedRevision: 0 })
  assert.equal(first.revision, 1)
  assert.ok(f.calls.queries.length)
  const stored = JSON.parse([...f.files.values()][0].toString())
  assert.deepEqual(stored, f.definition)
  assert.equal(stored.rows, undefined)
  assert.equal((await f.library.list(f.context)).items[0].name, 'Regional sales')
  assert.deepEqual((await f.library.open(f.context, first.artifactId)).definition, f.definition)
  const second = await f.library.save(f.context, { artifactId: first.artifactId, definition: { ...f.definition, name: 'Renamed' }, expectedRevision: 1 })
  assert.equal(second.revision, 2)
  await assert.rejects(f.library.save(f.context, { definition: f.definition, expectedRevision: 1 }), /DRAFT_CONFLICT/)
  assert.equal((await f.library.open(f.context, first.artifactId)).name, 'Renamed')
})
test('source revocation stops preview and save before durable writes', async () => {
  const f = fixture(), saved = await f.library.save(f.context, { definition: f.definition, expectedRevision: 0 })
  f.calls.denied = true
  await assert.rejects(f.library.preview(f.context, saved.artifactId), /SOURCE_ACCESS_REVOKED/)
  await assert.rejects(f.library.save(f.context, { definition: f.definition, expectedRevision: 1 }), /SOURCE_ACCESS_REVOKED/)
  assert.equal(f.drafts.get(saved.artifactId).revision, 1)
})
test('dataset identity and tenant/organization/user/host boundaries are enforced', async () => {
  const f = fixture(), saved = await f.library.save(f.context, { definition: f.definition, expectedRevision: 0 })
  for (const key of ['tenantId','organizationId','userId','hostId']) await assert.rejects(f.library.open({ ...f.context, [key]: 'other' }, saved.artifactId), /DENIED/)
  await assert.rejects(f.library.save(f.context, { definition: f.definition, expectedRevision: 1, artifactId: randomUUID() }), /CONFLICT/)
  assert.equal(datasetSaveSchema.safeParse({ definition: f.definition, expectedRevision: 0, actor: { userId: 'other' } }).success, false)
})

test('refresh executes current data and recycling requires the current revision', async () => {
  const f = fixture(), saved = await f.library.save(f.context, { definition: f.definition, expectedRevision: 0 })
  const first = await f.library.preview(f.context, saved.artifactId)
  const second = await f.library.preview(f.context, saved.artifactId)
  assert.notEqual(first.provenance.executionId, second.provenance.executionId)
  const edited = await f.library.save(f.context, { definition: { ...f.definition, name: 'Updated' }, expectedRevision: 1 })
  await assert.rejects(f.library.remove(f.context, saved.artifactId, 1), /DRAFT_CONFLICT/)
  assert.equal((await f.library.open(f.context, saved.artifactId)).revision, edited.revision)
  await f.library.remove(f.context, saved.artifactId, edited.revision)
  assert.equal((await f.library.list(f.context)).items.length, 0)
  await assert.rejects(f.library.open(f.context, saved.artifactId), /DENIED/)
})

test('project datasets follow the current project role and assistant binding', async () => {
  const f = fixture(), projectId = randomUUID()
  f.context.runtimeScope = { projectId }
  let role = 'editor', attached = true
  f.capabilities[ProjectAccessRuntimeCapability.id] = {
    async assertAssistant(input) {
      assert.equal(input.projectId, projectId)
      assert.equal(input.assistantId, f.context.hostId)
      if (!attached) throw Error('ASSISTANT_NOT_ATTACHED')
    },
    async listReadable() { return [{ projectId, role, archived: false, canManage: false }] },
    async assertEdit(input) {
      assert.equal(input.actor.userId, f.context.userId)
      if (role !== 'editor') throw Error('PROJECT_EDIT_DENIED')
      return { projectId, role, archived: false, canManage: false }
    }
  }
  const saved = await f.library.save(f.context, { definition: f.definition, expectedRevision: 0 })
  assert.equal(f.artifacts.get(saved.artifactId).userId, null)
  assert.equal(f.artifacts.get(saved.artifactId).projectId, projectId)
  role = 'member'
  await assert.rejects(f.library.open(f.context, saved.artifactId), /DENIED/)
  await assert.rejects(f.library.list(f.context), /DENIED/)
  await assert.rejects(f.library.save(f.context, { definition: f.definition, expectedRevision: 1 }), /DENIED/)
  await assert.rejects(f.library.remove(f.context, saved.artifactId, 1), /DENIED/)
  role = 'editor'; attached = false
  await assert.rejects(f.library.preview(f.context, saved.artifactId), /ASSISTANT_NOT_ATTACHED/)
  assert.equal(f.drafts.get(saved.artifactId).revision, 1)
})

test('Artifact access enforces personal ownership or current project edit access', async () => {
  const f = fixture(), checked = [], actor = { tenantId: 'tenant', userId: 'owner' }
  let allowed = true
  const provider = new DashboardDatasetArtifactType({ require: key => {
    assert.equal(key.id, ProjectAccessRuntimeCapability.id)
    return { async assertEdit(input) { checked.push(input); if (!allowed) throw Error('PROJECT_EDIT_DENIED') } }
  } })
  const personal = { pluginName: '@xpert-ai/plugin-live-dashboard', resourceType: 'live-dashboard-dataset',
    resourceId: `agent/assistant/${f.definition.id}`, tenantId: 'tenant', organizationId: 'org', userId: 'owner' }
  await provider.authorizeDraft(personal, actor, 'read')
  assert.equal(checked.length, 0)
  for (const change of [{ tenantId: 'other' }, { userId: 'other' }, { pluginName: 'other' }, { resourceType: 'other' }, { userId: null }]) {
    await assert.rejects(provider.authorize({ ...personal, ...change }, actor, 'read'), /DENIED/)
  }
  const project = { ...personal, userId: null, projectId: randomUUID() }
  await provider.authorizeDraft(project, actor, 'read')
  assert.deepEqual(checked[0], { projectId: project.projectId, actor: { ...actor, organizationId: 'org' } })
  allowed = false
  await assert.rejects(provider.authorizeDraft(project, actor, 'read'), /PROJECT_EDIT_DENIED/)
  await assert.rejects(provider.authorizeDraft(project, actor, 'write'), /PROJECT_EDIT_DENIED/)
})

test('Artifact content accepts query definitions and rejects result rows or oversized content', () => {
  const f = fixture(), provider = new DashboardDatasetArtifactType({ require() { throw Error('unexpected capability') } })
  provider.validateContent(Buffer.from(JSON.stringify(f.definition)), 'application/json')
  assert.throws(() => provider.validateContent(Buffer.from(JSON.stringify({ ...f.definition, rows: [{ amount: 1 }] })), 'application/json'))
  assert.throws(() => provider.validateContent(Buffer.alloc(200_001), 'application/json'), /UNAVAILABLE/)
  assert.throws(() => provider.validateContent(Buffer.from('{}'), 'text/plain'), /UNAVAILABLE/)
})

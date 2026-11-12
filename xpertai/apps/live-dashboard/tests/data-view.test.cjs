const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { dataViewFixture } = require('./data-view-fixture.cjs')
const { libraryDataSchema } = require('../dist/lib/library.schema')

test('Add Data is an on-demand iframe view using platform data and host pagination', async () => {
  const f = dataViewFixture()
  const view = f.provider.getViewManifests(f.context, 'agent.workbench').find(view => view.key === 'data')
  assert.equal(view.workbench.openMode, 'on-demand')
  assert.equal(view.view.component.isolation, 'iframe')
  assert.equal(view.view.component.entry, 'data')
  assert.equal(view.dataSource.cache.enabled, false)
  for (const action of ['discover', 'preview-query', 'dataset-open', 'dataset-save', 'dataset-preview', 'dataset-delete', 'dashboard-bindings']) {
    assert.ok(view.actions.some(item => item.key === action), action)
  }
  assert.deepEqual(f.provider.getViewManifests({ ...f.context, hostType: 'project' }, 'agent.workbench'), [])
  const result = await f.provider.getViewData(f.context, 'data', { page: 1, pageSize: 30, cursor: undefined, filters: [], sortBy: undefined })
  assert.equal(libraryDataSchema.parse(result).meta.sources[0].name, 'Synthetic sales source')
  await assert.rejects(f.provider.getViewData(f.context, 'data', { parameters: { actorId: randomUUID() } }), /Unrecognized/)
  await assert.rejects(f.provider.getViewData(f.context, 'unknown', {}), /UNSUPPORTED/)
})

test('discovery and dataset actions retain the current actor and enforce revision and confirmation', async () => {
  const f = dataViewFixture()
  const action = (key, input) => f.provider.executeViewAction(f.context, 'data', key, { input })
  await action('discover', { source: f.definition.binding.source, providerId: f.definition.binding.providerId, request: {} })
  assert.equal(f.discoveries[0].actor.userId, f.context.userId)
  const saved = (await action('dataset-save', { definition: f.definition, expectedRevision: 0 })).data
  assert.equal((await action('dataset-open', { artifactId: saved.artifactId })).data.revision, 1)
  assert.equal((await action('dataset-preview', { artifactId: saved.artifactId })).data.rows.length, 2)
  await assert.rejects(action('dataset-delete', { artifactId: saved.artifactId, expectedRevision: 1 }), /confirmed/)
  await assert.rejects(action('dataset-delete', { artifactId: saved.artifactId, expectedRevision: 2, confirmed: true }), /CONFLICT/)
  assert.equal((await action('dataset-open', { artifactId: saved.artifactId })).data.revision, 1)
  await action('dataset-delete', { artifactId: saved.artifactId, expectedRevision: 1, confirmed: true })
  assert.equal((await f.provider.getViewData(f.context, 'data', {})).meta.datasets.length, 0)
})

test('read-only access returns no definitions and cannot execute View actions', async () => {
  const f = dataViewFixture()
  f.service.access = async () => ({ canEdit: false })
  assert.deepEqual((await f.provider.getViewData(f.context, 'data', {})).meta,
    { canEdit: false, sources: [], datasets: [], page: 1, hasMore: false })
  for (const action of ['discover', 'dataset-save', 'dashboard-bindings']) {
    await assert.rejects(f.provider.executeViewAction(f.context, 'data', action, { input: {} }), /DENIED/)
  }
  assert.equal(f.discoveries.length, 0)
  assert.equal(f.artifacts.size, 0)
})

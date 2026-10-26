const { test } = require('node:test')
const assert = require('node:assert/strict')
const { queryDashboard, queryDashboardPartial } = require('../dist/lib/dashboard-queries.js')
const { toDataAnalyticsPayload } = require('../dist/lib/renderer.js')
const binding = id => ({ id, output: { datasetId: id }, parameters: [] })
const manifest = { title: 'Shared', controls: [], bindings: [binding('private'), binding('shared')], charts: [],
  tables: ['private', 'shared'].map(id => ({ id, title: id, datasetId: id, fields: ['value'] })) }
test('read-only partial query retains accessible results without leaking native errors; publish validation stays strict', async () => {
  const actor = { userId: 'viewer' }, calls = []
  const dataset = { datasetId: 'shared', rows: [], fields: [], completeness: { truncated: false } }
  const runtime = { require: () => ({ query: async (current, { binding }) => {
    assert.equal(current, actor); calls.push(binding.id)
    if (binding.id === 'private') throw new Error('secret native query configuration')
    return dataset
  } }) }
  const result = await queryDashboardPartial(runtime, actor, manifest, {})
  assert.deepEqual(result.datasets, [dataset])
  assert.deepEqual(result.failures, [{ bindingId: 'private', datasetId: 'private', reason: 'unavailable' }])
  assert.deepEqual(calls, ['private', 'shared'])
  const rendered = toDataAnalyticsPayload(manifest, result.datasets)
  assert.deepEqual(rendered.manifest.tables.map(table => table.id), ['shared'])
  assert.deepEqual(rendered.snapshot.datasets.shared, [])
  await assert.rejects(queryDashboard(runtime, actor, manifest, {}), /secret native query/)
})

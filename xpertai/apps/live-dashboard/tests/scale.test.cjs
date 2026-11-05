const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { dashboardSchema } = require('../dist/lib/dashboard.schema.js')
const { assertBindingCapacity } = require('../dist/lib/capacity.js')
const { createDashboardQuerySession } = require('../dist/lib/query-session.js')
const { encodeDashboardArchive, decodeDashboardArchive } = require('../dist/lib/dashboard-archive.js')
const { sourceMetadataSchema, dashboardComponentsSchema } = require('../dist/lib/dashboard-sources.js')
const { setup } = require('./service-fixture.cjs')
const example = require('../examples/postgres-sales.json')
function manifest(count) {
  return { ...structuredClone(example), id: randomUUID(), charts: [{ ...example.charts[0], datasetId: 'dataset0' }], tables: [], bindings: Array.from({ length: count }, (_, i) => ({
    ...structuredClone(example.bindings[0]), id: `binding${i}`, output: { ...structuredClone(example.bindings[0].output), datasetId: `dataset${i}` }
  })) }
}
for (const count of [8, 9, 16, 32, 64]) test(`${count} bindings survive manifest, Sources and archive round trip`, () => {
  const value = manifest(count)
  value.sourceMetadata = value.bindings.map(binding => ({ bindingId: binding.id, title: binding.id }))
  value.components = [{ id: 'overview', elementId: 'overview', title: 'Overview', kind: 'metric', sources: value.bindings.map(binding => ({ bindingId: binding.id })) }]
  assert.equal(dashboardSchema.parse(value).bindings.length, count)
  assert.equal(sourceMetadataSchema.parse(value.sourceMetadata).length, count)
  assert.equal(dashboardComponentsSchema.parse(value.components)[0].sources.length, count)
  assert.deepEqual(decodeDashboardArchive(encodeDashboardArchive(value, [])).manifest, value)
})
test('65 is outside storage, while authoring policy preserves historical maintenance', async () => {
  assert.throws(() => dashboardSchema.parse(manifest(65)))
  assert.throws(() => assertBindingCapacity(33), /CAPACITY/)
  assert.doesNotThrow(() => assertBindingCapacity(64, 64, 8))
  assert.throws(() => assertBindingCapacity(33, 32, 8), /CAPACITY/)
  const f = setup(), value = manifest(32)
  const saved = await f.service.save(f.context, value, null)
  f.service.config = { maxBindings: 8 }
  assert.equal((await f.service.update(f.context, saved.artifactId, 1, { title: 'Historical maintenance' }, null)).draftRevision, 2)
  await assert.rejects(f.service.update(f.context, saved.artifactId, 2, { bindings: manifest(33).bindings }, null), /CAPACITY/)
  await assert.rejects(f.service.save(f.context, manifest(9), null), /CAPACITY/)
})
test('incremental queries supersede old filters, preserve independent results and isolate failure/retry', async () => {
  const f = setup(), value = manifest(3), callbacks = [], events = [], release = []
  value.bindings[2].parameters = []
  let fail = true
  const session = createDashboardQuerySession(value, async input => {
    if (input.bindingId === 'binding0' && input.controls.region === 'east') await new Promise(resolve => release.push(resolve))
    if (input.bindingId === 'binding1' && fail) throw Error('private source error')
    const binding = value.bindings.find(b => b.id === input.bindingId)
    return f.capabilities['platform.analytics'].query({}, { binding, controls: input.controls })
  }, (datasets, failures) => callbacks.push({ ids: datasets.map(d => d.datasetId), failures, rows: datasets.flatMap(d => d.rows) }), e => events.push(e), () => {})
  await session.query({ region: 'all' }, 'initial')
  assert.deepEqual(callbacks.at(-1).failures, ['dataset1'])
  assert.deepEqual(callbacks.at(-1).ids.sort(), ['dataset0', 'dataset2'])
  const before = events.filter(e => e.type === 'start' && e.bindingId === 'binding2').length
  const slow = session.query({ region: 'east' })
  await new Promise(resolve => setImmediate(resolve))
  await session.query({ region: 'west' })
  release.shift()(); await slow
  assert(events.filter(e => e.type === 'success' && e.bindingId === 'binding0').at(-1).result.rows.every(r => r.region === 'west'))
  assert.equal(events.filter(e => e.type === 'start' && e.bindingId === 'binding2').length, before)
  fail = false
  await session.query({ region: 'west' }, 'refresh', ['binding1'])
  assert.deepEqual(callbacks.at(-1).failures, [])
  const length = callbacks.length
  session.dispose()
  assert.equal(callbacks.length, length)
})
module.exports = { manifest }


test('Sources samples have per-source and aggregate budgets, with explicit eviction state', () => {
  const { reduceSourceExecutions } = require('../dist/lib/source-executions.js')
  let state = {}
  for (let i = 0; i < 64; i++) {
    const bindingId = `b${i}`, requestId = `q${i}`, at = new Date(2026, 0, 1, 0, 0, i).toISOString()
    state = reduceSourceExecutions(state, { type: 'queue', bindingId, requestId, at, controls: {} })
    state = reduceSourceExecutions(state, { type: 'start', bindingId, requestId, at, controls: {} })
    state = reduceSourceExecutions(state, { type: 'success', bindingId, requestId, at,
      result: { rows: Array.from({ length: 100 }, () => ({ value: 'x'.repeat(4000) })), fields: [], completeness: { returnedRows: 100 }, freshness: {}, provenance: {} } })
  }
  assert(Buffer.byteLength(JSON.stringify(Object.values(state).map(value => value.result ?? null))) <= 2_000_000)
  assert(Object.values(state).some(value => value.previewEvicted))
  assert(Object.values(state).filter(value => value.result).every(value => value.result.rows.length <= 50 && Buffer.byteLength(JSON.stringify(value.result.rows)) <= 64000))
})


test('overlapping identical refreshes retain one Sources execution identity', async () => {
  const { reduceSourceExecutions } = require('../dist/lib/source-executions.js')
  const f = setup(), value = manifest(1)
  let state = {}, calls = 0, release
  const session = createDashboardQuerySession(value, async input => {
    calls++
    await new Promise(resolve => { release = resolve })
    return f.capabilities['platform.analytics'].query({}, { binding: value.bindings[0], controls: input.controls })
  }, () => {}, event => { state = reduceSourceExecutions(state, event) }, () => {})
  const first = session.query({ region: 'all' }, 'refresh')
  await new Promise(resolve => setImmediate(resolve))
  const requestId = state.binding0.requestId
  const second = session.query({ region: 'all' }, 'refresh')
  release()
  await Promise.all([first, second])
  assert.equal(calls, 1)
  assert.equal(state.binding0.requestId, requestId)
  assert.equal(state.binding0.state, 'succeeded')
  session.dispose()
})

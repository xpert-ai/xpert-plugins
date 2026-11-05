const { test } = require('node:test')
const assert = require('node:assert/strict')
const { discoverImportTargets, importTargetRequest } = require('../dist/lib/import-targets')
const { dataXpertQueryContract } = require('../dist/lib/discovery')
test('provider target mapping returns an explicit patch without changing native parameters or inferring query language', async () => {
  const payload = { resourceId: 'old', actionTypeCode: 'custom.action', target: { entityRef: 'old-target', entityTypeCode: 'cube' }, params: { query: 'opaque native value' }, parameterPaths: { x: ['value'] } }
  const calls = []
  const result = await discoverImportTargets(importTargetRequest.parse({ kind: 'import-targets', payload }), async request => {
    calls.push(request)
    return { queryContract: dataXpertQueryContract, items: [
      { id: 'resource', name: 'Resource', kind: 'catalog', inspectRequest: { kind: 'entities', resourceId: 'new' } },
      { id: 'cube', name: 'Not inferred from name', kind: 'dataset', inspectRequest: { kind: 'actions', resourceId: 'new', target: { entityTypeCode: 'cube', entityRef: 'new-target' } } },
      { id: 'wrong', name: 'Cube', kind: 'dataset', inspectRequest: { kind: 'actions', resourceId: 'new', target: { entityTypeCode: 'other', entityRef: 'wrong-target' } } }
    ], nextRequest: { kind: 'resources', after: 'next' } }
  })
  assert.deepEqual(calls, [{ kind: 'resources' }]); assert.equal(result.items.length, 2)
  assert.deepEqual(result.items[1].metadata, { schema: 'xpert.analytics.import-target', version: 1, payloadPatch: { resourceId: 'new', target: { entityTypeCode: 'cube', entityRef: 'new-target' } } })
  assert.deepEqual({ ...payload, ...result.items[1].metadata.payloadPatch }.params, payload.params)
  assert.deepEqual(result.items[0].inspectRequest.payload.params, {}, 'do not repeat large query text in every browsing row')
  assert.equal(result.nextRequest.kind, 'import-targets'); assert.equal(result.nextRequest.browse.after, 'next')
  assert.equal(payload.resourceId, 'old')
})

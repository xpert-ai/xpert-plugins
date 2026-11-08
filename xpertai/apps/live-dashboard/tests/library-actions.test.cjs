const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DashboardLibraryViewProvider } = require('../dist/lib/library-view.provider.js')
const { resourceActions, resourceFileActions } = require('../dist/lib/library/actions.js')
const { graph } = require('./library-v2-fixture.cjs')

function fixture() {
  const calls = [], context = { hostType: 'agent', hostId: randomUUID(), tenantId: randomUUID(),
    organizationId: randomUUID(), userId: randomUUID() }
  const dashboards = { access: async () => ({ canEdit: false }) }
  const catalog = {
    async list(actor, query) { calls.push({ action: 'list', actor, query }); return { items: [], total: 0 } },
    async upload(actor, descriptor, bytes) { calls.push({ action: 'upload', actor, descriptor, bytes }); return { sha256: descriptor.sha256 } }
  }
  const transfers = {
    async prepare(actor, bytes, mode, requestId) { calls.push({ action: 'prepare', actor, bytes, mode, requestId }); return { importId: requestId } },
    async exportFile(actor, releaseId) { calls.push({ action: 'export', actor, releaseId }); return { fileName: 'resources.zip' } }
  }
  const provider = new DashboardLibraryViewProvider(dashboards, null, null, catalog, transfers)
  return { calls, context, provider }
}

test('resource actions advertise file transport and validate catalog inputs before forwarding trusted scope', async () => {
  const f = fixture(), manifest = f.provider.getViewManifests(f.context, 'agent.workbench').find(view => view.key === 'data')
  assert.ok(manifest)
  for (const key of resourceActions) {
    const action = manifest.actions.find(action => action.key === key)
    assert.ok(action, key)
    assert.equal(action.transport, resourceFileActions.includes(key) ? 'file' : undefined)
  }
  const result = await f.provider.executeViewAction(f.context, 'data', 'resource-list', { input: { page: 2, pageSize: 5 } })
  assert.equal(result.success, true)
  assert.equal(f.calls[0].actor, f.context)
  assert.equal(f.calls[0].query.page, 2)
  for (const input of [{ ownerId: randomUUID() }, { tenantId: randomUUID() }, { pageSize: 51 }]) {
    await assert.rejects(f.provider.executeViewAction(f.context, 'data', 'resource-list', { input }))
  }
  assert.equal(f.calls.length, 1)
})

test('resource file actions preserve bytes and reject caller identity overrides', async () => {
  const f = fixture(), g = graph(), requestId = randomUUID(), file = { buffer: g.bytes }
  await f.provider.executeViewFileAction(f.context, 'data', 'resource-upload-asset', { input: g.file }, file)
  assert.equal(f.calls[0].actor, f.context)
  assert.equal(f.calls[0].bytes, g.bytes)
  await f.provider.executeViewFileAction(f.context, 'data', 'resource-import', { input: { mode: 'copy', requestId } }, file)
  assert.deepEqual(f.calls[1], { action: 'prepare', actor: f.context, bytes: g.bytes, mode: 'copy', requestId })
  await assert.rejects(f.provider.executeViewFileAction(f.context, 'data', 'resource-import', {
    input: { mode: 'copy', requestId, userId: randomUUID() }
  }, file))
  await assert.rejects(f.provider.executeViewFileAction(f.context, 'data', 'unknown', { input: {} }, file), /UNSUPPORTED/)
  assert.equal(f.calls.length, 2)
})

test('ZIP download grants require a supported purpose, resource key and View', async () => {
  const f = fixture(), releaseId = randomUUID(), request = { purpose: 'download', fileKey: `library-v2/${releaseId}` }
  await f.provider.resolveViewFile(f.context, 'data', request)
  assert.deepEqual(f.calls, [{ action: 'export', actor: f.context, releaseId }])
  await assert.rejects(f.provider.resolveViewFile(f.context, 'data', { ...request, purpose: 'preview' }))
  await assert.rejects(f.provider.resolveViewFile(f.context, 'data', { ...request, fileKey: 'library-v2/not-a-uuid' }))
  await assert.rejects(f.provider.resolveViewFile(f.context, 'missing-view', request), /UNSUPPORTED/)
  assert.equal(f.calls.length, 1)
})

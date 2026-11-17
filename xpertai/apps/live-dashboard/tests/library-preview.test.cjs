const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { LibraryCatalogService } = require('../dist/lib/library/catalog.service')
const { DashboardLibraryViewProvider } = require('../dist/lib/library-view.provider')
const { resourceHash } = require('../dist/lib/library/resource-json')
const { graph, asset } = require('./library-v2-fixture.cjs')

function fixture(overrides = {}) {
  const context = { hostType: 'agent', tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), hostId: randomUUID() }
  const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>')
  const descriptor = asset(bytes, { id: 'cover', mimeType: 'image/svg+xml', purpose: 'cover', fileName: 'cover.svg', ...overrides })
  const document = { ...graph().theme, assets: [descriptor] }
  const row = { id: randomUUID(), ...context, ownerId: context.userId, logicalId: document.logicalId, version: document.version,
    kind: document.kind, document, sha256: resourceHash(document), state: 'ready' }
  const state = { denied: false, public: false, reads: 0, accessChecks: 0, onRead() {} }
  const versions = { async findOneBy({ id }) { return id === row.id ? row : null },
    manager: { getRepository() { return { async existsBy() { return state.public } } } } }
  const dashboards = { async authorizeProject() { state.accessChecks++; if (state.denied) throw Error('PROJECT_DENIED') } }
  const files = { async read(actor, file) { state.reads++; assert.equal(actor.ownerId, context.userId); assert.equal(file.sha256, descriptor.sha256); state.onRead(); return bytes } }
  const catalog = new LibraryCatalogService(versions, dashboards, files)
  const read = () => catalog.thumbnail(context, row.id, descriptor.id)
  return { catalog, context, row, state, bytes, descriptor, read }
}

test('preview uses fixed-version ownership and re-authorizes after the file read', async () => {
  const f = fixture(), result = await f.read()
  assert.equal(result.src, `data:image/svg+xml;base64,${f.bytes.toString('base64')}`)
  assert.equal(f.state.reads, 1); assert.equal(f.state.accessChecks, 2)
  f.state.onRead = () => { f.state.denied = true }
  await assert.rejects(f.read(), /PROJECT_DENIED/)
})

test('public metadata does not grant another owner preview-file access', async () => {
  const f = fixture(); f.row.ownerId = randomUUID(); f.state.public = true
  await assert.rejects(f.read(), /LIBRARY_PUBLIC_FILE_COPY_UNAVAILABLE/)
  assert.equal(f.state.reads, 0)
})

test('preview rejects missing assets, oversized images and non-preview attachments before file IO', async () => {
  const f = fixture()
  await assert.rejects(f.catalog.thumbnail(f.context, f.row.id, 'missing'), /LIBRARY_PREVIEW_UNAVAILABLE/)
  for (const overrides of [{ size: 2_000_001 }, { purpose: 'supporting' }]) {
    const blocked = fixture(overrides)
    await assert.rejects(blocked.read(), /LIBRARY_PREVIEW_UNAVAILABLE/)
    assert.equal(blocked.state.reads, 0)
  }
})

test('changed resource content is rejected before reading a preview', async () => {
  const f = fixture(); f.row.document.title = 'Changed without a new version'
  await assert.rejects(f.read(), /LIBRARY_RESOURCE_INTEGRITY/)
  assert.equal(f.state.reads, 0)
})

test('thumbnail action rejects identity overrides and invalid references at the View boundary', async () => {
  const f = fixture(), provider = new DashboardLibraryViewProvider(null, null, null, f.catalog)
  const manifest = provider.getViewManifests(f.context, 'agent.workbench')[0]
  assert.equal(manifest.actions.filter(action => action.key === 'resource-thumbnail').length, 1)
  const input = { releaseId: f.row.id, assetId: 'cover' }
  const result = await provider.executeViewAction(f.context, 'data', 'resource-thumbnail', { input })
  assert.equal(result.success, true)
  for (const invalid of [{ ...input, ownerId: randomUUID() }, { ...input, releaseId: 'missing' }, { ...input, assetId: '../cover' }]) {
    await assert.rejects(provider.executeViewAction(f.context, 'data', 'resource-thumbnail', { input: invalid }))
  }
  assert.equal(f.state.reads, 1)
})

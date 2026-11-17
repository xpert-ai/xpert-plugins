const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { LibraryDirectoryService } = require('../dist/lib/library/directory.service')
const { DashboardLibraryViewProvider } = require('../dist/lib/library-view.provider')
const { libraryQuerySchema } = require('../dist/lib/library.schema')

test('directory projects fixed-version metadata and delegates paging, filtering and scope to the catalog', async () => {
  const context = { userId: randomUUID() }, calls = [], releaseId = randomUUID()
  const row = { releaseId, kind: 'example-task', title: 'Original title', description: 'Original description', categories: ['sales'], version: '1.2.0',
    translations: { 'zh-Hant': { title: '範例任務', description: '範例說明' } }, presentation: { coverAssetId: 'cover' }, taskData: { mode: 'external', tools: ['analytics'] } }
  const catalog = { async actor() {}, async list(actor, query) { calls.push({ actor, query }); return { items: [row], page: query.page, pageSize: query.pageSize, total: 39 } } }
  const service = new LibraryDirectoryService(catalog)
  const page = await service.list(context, { audience: 'mine', kind: 'example-task', page: 2, pageSize: 12, search: 'Task', appearance: 'all', locale: 'zh-Hant' })
  assert.equal(calls[0].actor, context); assert.equal(calls[0].query.category, undefined)
  assert.equal(calls[0].query.search, 'Task'); assert.equal(calls[0].query.page, 2)
  assert.equal(page.total, 39); assert.equal(page.items[0].title, '範例任務')
  assert.equal(page.items[0].releaseId, releaseId); assert.equal(page.items[0].state, 'released')
  assert.equal(page.items[0].coverAssetId, 'cover'); assert.deepEqual(page.items[0].requirements, ['analytics'])
  const fallback = await service.list(context, { audience: 'public', kind: 'example-task', locale: 'en' })
  assert.equal(fallback.items[0].title, row.title); assert.equal(calls.at(-1).query.audience, 'public')
})

test('invalid directory filters and host-identity overrides never reach catalog queries', async () => {
  let calls = 0
  const service = new LibraryDirectoryService({ async list() { calls++ }, async actor() {} })
  for (const extra of [{ pageSize: 51 }, { page: 0 }, { page: 100001 }, { search: 'x'.repeat(101) }, { ownerId: randomUUID() }, { locale: 'unknown' }]) {
    await assert.rejects(service.list({}, { audience: 'mine', kind: 'analysis-template', ...extra }))
  }
  assert.equal(calls, 0)
  assert.equal(libraryQuerySchema.safeParse({ parameters: { catalogPage: 100001 } }).success, false)
})

test('all resource pages are on demand and expose scoped directory actions through the SDK', async () => {
  const context = { hostType: 'agent', hostId: randomUUID() }, calls = []
  const dashboards = { async access() { return { canEdit: false } }, async sources() { throw Error('Unexpected source discovery') } }
  const directory = { async list(actor, query) { calls.push({ actor, query }); return { items: [], total: 0, page: 1, pageSize: 12 } } }
  const provider = new DashboardLibraryViewProvider(dashboards, null, null, null, null, null, null, directory)
  const views = provider.getViewManifests(context, 'agent.workbench')
  assert.deepEqual(views.map(view => view.key), ['explore', 'templates', 'data'])
  for (const view of views) {
    assert.equal(view.workbench.openMode, 'on-demand')
    assert.ok(view.actions.some(action => action.key === 'resource-directory'))
    assert.ok(view.clientCommands.some(command => command.key === 'workbench.navigation.open'))
    const result = await provider.executeViewAction(context, view.key, 'resource-directory', { input: { kind: 'public-dataset', audience: 'public' } })
    assert.equal(result.success, true); assert.equal(calls.at(-1).actor, context)
  }
  for (const key of ['explore', 'templates']) {
    const result = await provider.getViewData(context, key, {})
    assert.equal(result.meta.canEdit, false); assert.deepEqual(result.meta.datasets, []); assert.deepEqual(result.meta.sources, [])
  }
  await assert.rejects(provider.executeViewAction(context, 'unknown', 'resource-directory', { input: {} }), /UNSUPPORTED/)
})

test('template mapping data loads only for editable template pages', async () => {
  let listed = 0
  const provider = new DashboardLibraryViewProvider({ async access() { return { canEdit: true } } }, {
    async list(_context, page, size) { listed++; assert.equal(page, 2); assert.equal(size, 5); return { items: [], hasMore: true } }
  })
  await provider.getViewData({ hostType: 'agent' }, 'explore', {})
  assert.equal(listed, 0)
  assert.equal((await provider.getViewData({ hostType: 'agent' }, 'templates', { page: 2, pageSize: 5 })).meta.hasMore, true)
  assert.equal(listed, 1)
})

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DashboardViewProvider } = require('../dist/lib/view.provider')
const { dashboardViewDataSchema } = require('../dist/lib/dashboard-view.schema')
const example = require('../examples/postgres-sales.json')

for (const kind of ['data-source', 'definition', 'artifact']) {
  for (const isDraft of [true, false]) test(`viewer opens ${isDraft ? 'draft' : 'published'} dashboards with ${kind} sources`, async () => {
    const source = kind === 'data-source' ? { kind, dataSourceId: randomUUID() }
      : { kind, [kind === 'definition' ? 'definitionId' : 'artifactId']: randomUUID(), versionId: randomUUID() }
    const manifest = structuredClone(example)
    manifest.bindings[0].source = source
    const saved = { artifactId: randomUUID(), title: manifest.title, manifest, isDraft,
      ...(isDraft ? { versionId: null, draftRevision: 1 } : { versionId: randomUUID(), versionNumber: 1 }) }
    const sources = [{ source, name: 'Authorized source', providers: [{ id: manifest.bindings[0].providerId }] }]
    const view = new DashboardViewProvider({ access: async () => ({ project: false, canEdit: true, canManage: true, canReadDraft: true, archived: false }), listPage: async () => ({ items: [saved], page: 1, pageSize: 50, hasMore: false }), sources: async () => sources,
      openDocument: async () => saved, history: async () => isDraft ? [] : [saved] }, undefined, { current: async () => null })
    const response = await view.getViewData({ hostType: 'agent' }, 'live-dashboard', { parameters: { artifactId: saved.artifactId } })
    const parsed = dashboardViewDataSchema.parse(response).meta
    assert.deepEqual(parsed.sources[0], { source, name: 'Authorized source' })
    assert.equal(parsed.saved.artifactId, saved.artifactId)
    assert.equal(parsed.saved.isDraft, isDraft)
    assert.equal(parsed.saved.manifest.bindings[0].source.kind, kind)
    assert.equal(parsed.versions.length, isDraft ? 0 : 1)
  })
}

test('viewer rejects a definition source without its pinned version', () => {
  assert.equal(dashboardViewDataSchema.safeParse({ meta: { dashboards: [], sources: [
    { source: { kind: 'definition', definitionId: randomUUID() }, name: 'Missing version' }
  ] } }).success, false)
})

test('only Assistant Workbench hosts expose the dashboard, with paginated selection', () => {
  const view=new DashboardViewProvider({})
  for(const [hostType,slot] of [['agent','agent.workbench'],['agent','agent.workbench.fixed'],['agent','agent.workbench.main']]) {
    const manifest=view.getViewManifests({hostType},slot)[0]
    assert.equal(manifest.dataSource.querySchema.supportsPagination,true)
    assert.equal(manifest.dataSource.querySchema.defaultPageSize,50)
  }
  assert.equal(view.supports({hostType:'project'}),false)
  assert.deepEqual(view.getViewManifests({hostType:'project'},'detail.sections'),[])
})

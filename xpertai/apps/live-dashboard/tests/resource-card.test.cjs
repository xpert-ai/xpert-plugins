const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { parseResourceCard, resourceCardId } = require('@xpert-ai/plugin-sdk')
const { dashboardResourceCard, emitDashboardCard } = require('../dist/lib/resource-card')
const { dashboardNavigationSchema, DASHBOARD_VIEW_KEY } = require('../dist/lib/dashboard-navigation')
const { DashboardViewProvider } = require('../dist/lib/view.provider')
const scope = { hostType: 'agent', hostId: randomUUID(), tenantId: 't', organizationId: 'o', userId: 'u', slots: [] }
const artifactId = randomUUID()
const draft = { artifactId, title: 'Sales dashboard', state: 'draft', revision: 3 }

test('resource cards are compact snapshots with stable identity and typed navigation, not page/data payloads', () => {
  const card = dashboardResourceCard(scope, draft)
  assert.deepEqual(parseResourceCard(card), card)
  assert.equal(resourceCardId(card), resourceCardId(dashboardResourceCard(scope, { ...draft, revision: 4, title: 'Renamed' })))
  assert.deepEqual(card.open, { target: 'workbench.view', viewKey: DASHBOARD_VIEW_KEY, selectionId: artifactId })
  assert.equal(card.resource.artifactId, artifactId)
  assert.equal(card.description, 'Dashboard · Draft r3')
  const versionId = randomUUID()
  const history = dashboardResourceCard({ ...scope, hostType: 'project' }, { artifactId, title: draft.title, state: 'published', versionNumber: 2, versionId })
  assert.deepEqual(history.open, { target: 'assistant.project', projectId: scope.hostId, viewKey: DASHBOARD_VIEW_KEY, selectionId: artifactId, parameters: { versionId } })
})

test('card delivery failure does not undo or fail a successful operation', async (t) => {
  t.mock.method(require('@xpert-ai/plugin-sdk'), 'emitResourceCard', async () => { throw Error('offline') })
  assert.deepEqual(await emitDashboardCard(scope, draft), { status: 'unavailable' })
})

test('view navigation uses exact selection, rejects conflicting/malformed/version-only targets and keeps authorization in service', async () => {
  const versionId = randomUUID(), calls = []
  const provider = new DashboardViewProvider({
    list: async () => [], sources: async () => [], history: async () => [],
    openDocument: async (...args) => { calls.push(args); throw Error('DASHBOARD_ACCESS_DENIED') }
  })
  assert.deepEqual(dashboardNavigationSchema.parse({ selectionId: artifactId, page: 1, parameters: { versionId } }), { artifactId, versionId })
  for (const query of [{ selectionId: 'wrong' }, { parameters: { versionId } }, { selectionId: artifactId, parameters: { artifactId: randomUUID() } }, { selectionId: artifactId, parameters: { sql: 'SELECT 1' } }]) {
    assert.equal(dashboardNavigationSchema.safeParse(query).success, false)
    await assert.rejects(provider.getViewData(scope, 'live-dashboard', query))
  }
  assert.equal(calls.length, 0)
  await assert.rejects(provider.getViewData(scope, 'live-dashboard', { selectionId: artifactId, parameters: { versionId } }), /ACCESS_DENIED/)
  assert.deepEqual(calls, [[scope, artifactId, versionId]])
  assert.equal(provider.getViewManifests(scope, 'agent.workbench')[0].dataSource.querySchema.supportsSelection, true)
})

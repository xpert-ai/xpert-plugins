const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { readFileSync } = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { DashboardViewProvider } = require('../dist/lib/view.provider')
const { DASHBOARD_VIEW_KEY } = require('../dist/lib/dashboard-navigation')

// Execute the real bridge against a parent-window transport without a browser dependency in CI.
function transport() {
  const messages = [], listeners = new Set(), api = {}
  const parent = { postMessage: message => messages.push(structuredClone(message)) }
  const receive = message => {
    for (const listener of listeners) listener({ source: parent, data: {
      channel: 'xpertai.remote_component', protocolVersion: 1, instanceId: 'test-host', ...message
    } })
  }
  const source = readFileSync(require.resolve('../src/remote/bridge.ts'), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: api, clearTimeout,
    window: { parent, setTimeout, addEventListener: (_type, listener) => listeners.add(listener), removeEventListener: (_type, listener) => listeners.delete(listener) },
    document: { documentElement: { classList: { toggle() {} }, style: { setProperty() {} } } },
    require: id => id === '@xpert-ai/plugin-shadcn-ui/theme' ? { installShadcnThemeVars() {} }
      : require(id.startsWith('../lib/') ? id.replace('../lib/', '../dist/lib/') : id)
  })
  const complete = () => receive({ type: 'actionResult', requestId: messages.at(-1).requestId, data: { success: true } })
  return { api, messages, receive, complete }
}

test('mounted library re-handshakes after project/conversation changes instead of staying empty', t => {
  const { api, receive, messages } = transport()
  let ready = 0, resets = 0
  t.after(api.startBridge(() => { ready++ }, () => {}, () => { resets++ }))
  receive({ type: 'init', scopeRevision: 1 })
  receive({ type: 'hostEvent', scopeRevision: 2, event: { type: 'view.context.changed', data: { revision: 2 } } })
  assert.equal(resets, 2)
  assert.equal(messages.at(-1).type, 'ready')
  assert.equal(messages.at(-1).scopeRevision, 2)
  receive({ type: 'init', scopeRevision: 2 })
  assert.equal(ready, 2)
  const count = messages.length
  receive({ type: 'hostEvent', scopeRevision: 1, event: { type: 'view.context.changed', data: { revision: 1 } } })
  assert.equal(messages.length, count, 'stale scope must not restart the view')
})

test('refresh visibility follows scoped Workbench visibility, ignoring other frames and stale messages', t => {
  const { api, receive } = transport()
  t.after(api.startBridge(() => {}, () => {}))
  receive({ type: 'init', scopeRevision: 2, visible: false })
  assert.equal(api.isViewVisible(), false)
  receive({ type: 'visibility', scopeRevision: 1, visible: true })
  receive({ type: 'visibility', instanceId: 'other-host', scopeRevision: 2, visible: true })
  assert.equal(api.isViewVisible(), false)
  receive({ type: 'visibility', scopeRevision: 2, visible: true })
  assert.equal(api.isViewVisible(), true)
  receive({ type: 'visibility', scopeRevision: 2, visible: false })
  assert.equal(api.isViewVisible(), false)
})

for (const project of [false, true]) test(`Assistant dashboard navigation retains ${project ? 'Project' : 'personal'} scope for selections, versions and tool receipts`, async t => {
  const scope = { hostType: 'agent', ...(project ? { runtimeScope: { projectId: randomUUID() } } : {}), hostId: randomUUID(), tenantId: 'tenant', organizationId: 'org', userId: 'owner', slots: [] }
  const provider = new DashboardViewProvider({ access: async () => ({ project: false, canEdit: true, canManage: true, canReadDraft: true, archived: false }), listPage: async () => ({ items: [], page: 1, pageSize: 50, hasMore: false }), sources: async () => [] }, undefined, { current: async () => null })
  const data = await provider.getViewData(scope, 'live-dashboard', { navigationTarget: { target: 'assistant.project', projectId: randomUUID() } })
  const expected = { target: 'workbench.view', viewKey: DASHBOARD_VIEW_KEY }
  assert.deepEqual(data.meta.navigationTarget, expected, 'navigation must come from the resolved context, not request parameters')
  const { api, messages, receive, complete } = transport()
  let opening
  t.after(api.startBridge(() => {}, artifactId => { opening = api.navigateDashboard(data.meta.navigationTarget, artifactId) }))
  receive({ type: 'init' })
  const artifactId = randomUUID()
  for (const versionId of [undefined, randomUUID()]) {
    const request = api.navigateDashboard(data.meta.navigationTarget, artifactId, versionId)
    assert.equal(messages.at(-1).commandKey, 'workbench.navigation.open')
    assert.deepEqual(messages.at(-1).payload, { ...expected, selectionId: artifactId, parameters: versionId ? { versionId } : {} })
    complete(); await request
  }
  receive({ type: 'hostEvent', event: { type: 'assistant.tool.completed', toolName: 'dashboard_update',
    data: { output: { dashboard: { artifactId, draftRevision: 2, status: 'draft' } } } } })
  assert.deepEqual(messages.at(-1).payload, { ...expected, selectionId: artifactId, parameters: {} })
  complete(); await opening
  const before = messages.length
  await assert.rejects(api.navigateDashboard(undefined, artifactId))
  await assert.rejects(api.navigateDashboard({ target: 'assistant.project', viewKey: DASHBOARD_VIEW_KEY }, artifactId))
  assert.equal(messages.length, before, 'missing host context must not silently navigate outside the project')
})


test('catalog navigation preserves the stable tab across version selections and rejects stale scope replies', async t => {
  const { api, messages, receive, complete } = transport()
  t.after(api.startBridge(() => {}, () => {}))
  const artifactId = randomUUID(), contentId = randomUUID()
  receive({ type: 'init', scopeRevision: 1, initialQuery: { selectionId: artifactId, parameters: { contentId, contentProvider: 'live-dashboard.content', contentTitle: 'Team dashboard' } } })
  const opening = api.navigateDashboard({ target: 'workbench.view', viewKey: DASHBOARD_VIEW_KEY }, artifactId, randomUUID())
  assert.equal(messages.at(-1).payload.parameters.contentId, contentId)
  const id = messages.at(-1).requestId
  let settled = false; opening.then(() => { settled = true })
  receive({ type: 'actionResult', requestId: id, scopeRevision: 0, data: { success: true } })
  await Promise.resolve(); assert.equal(settled, false)
  receive({ type: 'actionResult', requestId: id, scopeRevision: 1, data: { success: true } }); await opening
  const stop = api.onPrepareClose(() => false)
  receive({ type: 'editorEvent', kind: 'prepareClose', resourceId: artifactId, requestId: 'close', scopeRevision: 1 })
  assert.equal(messages.at(-1).ready, false)
  stop()
})

test('deleting the selected dashboard clears Assistant context and stale catalog navigation', async t => {
  const { api, messages, receive, complete } = transport()
  t.after(api.startBridge(() => {}, () => {}))
  receive({ type: 'init', initialQuery: { selectionId: randomUUID(), parameters: { contentId: randomUUID(), contentProvider: 'live-dashboard.content', versionId: randomUUID() } } })
  const clearContext = api.selectDashboard(null)
  assert.deepEqual(messages.at(-1).payload, { key: 'live_dashboard', context: { schemaVersion: 1, mode: 'new' } })
  complete(); await clearContext
  const clearNavigation = api.navigateDashboard({ target: 'workbench.view', viewKey: DASHBOARD_VIEW_KEY })
  assert.deepEqual(messages.at(-1).payload, { target: 'workbench.view', viewKey: DASHBOARD_VIEW_KEY, parameters: { newDashboard: true } })
  complete(); await clearNavigation
})

test('collection and document register separate views; document reads do not enumerate the project', async () => {
  const { DOCUMENT_VIEW_KEY } = require('../dist/lib/view.provider')
  const artifactId = randomUUID(), ctx = { hostType: 'agent', hostId: randomUUID(), slots: [] }
  let listed = false
  const service = { access: async () => ({ canReadDraft: true }),
    listPage: async () => { listed = true; return { items: [] } },
    selectedSummary: async () => ({ artifactId }), history: async () => [],
    openDocument: async () => undefined, sources: async () => [] }
  const provider = new DashboardViewProvider(service, undefined, { current: async () => null })
  const views = provider.getViewManifests(ctx, 'agent.workbench')
  assert.equal(views.length, 2)
  assert.equal(views[1].key, DOCUMENT_VIEW_KEY)
  assert.equal(views[1].workbench.menu.enabled, false)
  assert.equal(views[1].workbench.fixed, true, 'Workbench discovers document manifests through the fixed slot; content IDs create instances')
  await assert.rejects(provider.getViewData(ctx, DOCUMENT_VIEW_KEY, {}), /DASHBOARD_ID_REQUIRED/)
  const data = await provider.getViewData(ctx, DOCUMENT_VIEW_KEY, { selectionId: artifactId })
  assert.equal(data.meta.navigationTarget.viewKey, 'live-dashboard__dashboard')
  assert.equal(listed, false)
})

test('source tab opening resolves catalog identity and cannot navigate after scope changes', async t => {
  const { api, messages, receive } = transport(), opener = {}
  t.after(api.startBridge(() => {}, () => {}))
  vm.runInNewContext(ts.transpileModule(readFileSync(require.resolve('../src/remote/open-dashboard-tab.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports: opener, require: id => id === './bridge' ? api
    : require(id.startsWith('../lib/') ? id.replace('../lib/', '../dist/lib/') : id) })
  receive({ type: 'init', scopeRevision: 1 })
  const artifactId = randomUUID(), contentId = randomUUID(), versionId = randomUUID()
  const opening = opener.openDashboardTab(artifactId, versionId, 'published')
  assert.equal(messages.at(-1).commandKey, 'workbench.content.resolve')
  const navigation = { target: 'workbench.view', viewKey: 'live-dashboard__dashboard', selectionId: artifactId, parameters: { contentId } }
  receive({ type: 'actionResult', requestId: messages.at(-1).requestId, scopeRevision: 1, data: { success: true, navigation } })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(messages.at(-1).payload, { ...navigation, parameters: { contentId, versionId, mode: 'published' } })
  receive({ type: 'actionResult', requestId: messages.at(-1).requestId, scopeRevision: 1, data: { success: true } }); await opening
  const stale = opener.openDashboardTab(artifactId)
  receive({ type: 'actionResult', requestId: messages.at(-1).requestId, scopeRevision: 1, data: { success: true, navigation } })
  receive({ type: 'hostEvent', scopeRevision: 2, event: { type: 'view.context.changed', data: { revision: 2 } } })
  await assert.rejects(stale, /Context changed/)
  assert.equal(messages.filter(item => item.commandKey === 'workbench.navigation.open').length, 1)
})

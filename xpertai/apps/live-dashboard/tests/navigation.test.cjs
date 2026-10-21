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

for (const hostType of ['agent', 'project']) test(`${hostType} dashboard navigation retains the authorized host for selections, versions and tool receipts`, async t => {
  const scope = { hostType, hostId: randomUUID(), tenantId: 'tenant', organizationId: 'org', userId: 'owner', slots: [] }
  const provider = new DashboardViewProvider({ list: async () => [], sources: async () => [] })
  const data = await provider.getViewData(scope, 'live-dashboard', { navigationTarget: { target: 'assistant.project', projectId: randomUUID() } })
  const expected = { target: hostType === 'project' ? 'assistant.project' : 'workbench.view',
    ...(hostType === 'project' ? { projectId: scope.hostId } : {}), viewKey: DASHBOARD_VIEW_KEY }
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
  assert.throws(() => api.navigateDashboard(undefined, artifactId))
  assert.throws(() => api.navigateDashboard({ target: 'assistant.project', viewKey: DASHBOARD_VIEW_KEY }, artifactId))
  assert.equal(messages.length, before, 'missing host context must not silently navigate outside the project')
})

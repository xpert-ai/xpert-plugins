const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const vm = require('node:vm')
const ts = require('typescript')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')
const { setup: serviceFixture } = require('./service-fixture.cjs')
const { DashboardViewProvider } = require('../dist/lib/view.provider')
const example = require('../examples/postgres-sales.json')

// Mount the real App and route its requests through the real View/Service with in-memory storage.
// Use the real scoped bridge; only host transport, child rendering and the interval clock are stubbed.
async function setup(t, stage = 'edited', html = false) {
  const backend = serviceFixture()
  backend.sources[0].name = 'Sales'
  const manifest = structuredClone(example)
  delete manifest.controls[0].allowedValues
  manifest.title = 'First version'
  if (html) { manifest.charts = []; manifest.tables = []; manifest.presentation = { type: 'html', html: '<html><body>Sales</body></html>' } }
  const draft = await backend.service.save(backend.context, manifest, null), id = draft.artifactId
  let v1, v2
  if (stage !== 'initial') {
    v1 = await backend.service.publish(backend.context, id, 1, null)
    await backend.service.update(backend.context, id, 1, { title: 'Second version' }, v1.versionId)
    v2 = await backend.service.publish(backend.context, id, 2, v1.versionId)
    if (stage === 'edited') await backend.service.update(backend.context, id, 2, { title: 'Third draft' }, v2.versionId)
  }
  const view = new DashboardViewProvider(backend.service, backend.sharing, { current: async () => null })
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://view.test', pretendToBeVisual: true })
  const previous = new Map()
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLFormElement', 'HTMLButtonElement', 'NodeFilter', 'DocumentFragment', 'SVGElement', 'Event', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'Node', 'Element', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] })
  }
  previous.set('IS_REACT_ACT_ENVIRONMENT', Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.__ANALYTICS_RENDERER_HTML__ = ''
  const intervals = new Map()
  let intervalId = 0
  dom.window.setInterval = callback => { intervals.set(++intervalId, callback); return intervalId }
  dom.window.clearInterval = id => intervals.delete(id)
  const uiRequire = createRequire(require.resolve('@xpert-ai/plugin-shadcn-ui'))
  const React = uiRequire('react'), { act } = React
  const ui = await import('@xpert-ai/plugin-shadcn-ui'), i18nUi = await import('@xpert-ai/plugin-shadcn-ui/i18n')
  let root, held, release
  const requests = [], selections = [], navigation = [], queries = [], htmlRenders = [], htmlRefreshes = []
  async function respond(message) {
    if (message.type === 'requestData') {
      requests.push(message.query)
      const response = await view.getViewData(backend.context, 'live-dashboard', message.query)
      if (held && message.query.parameters.artifactId) { held = false; await new Promise(resolve => { release = resolve }) }
      return response
    }
    if (message.type === 'executeAction') {
      queries.push(message)
      return view.executeViewAction(backend.context, 'live-dashboard', message.actionKey, message)
    }
    if (message.commandKey === 'assistant.context.set') selections.push(message.payload.context)
    if (message.commandKey === 'workbench.navigation.open') navigation.push(message.payload)
    return { success: true }
  }
  const parent = { postMessage(message) {
    if (message.type === 'ready') return
    void respond(message).then(data => receive({ type: 'data', requestId: message.requestId, data }),
      error => receive({ type: 'error', requestId: message.requestId, message: error.message }))
  } }
  Object.defineProperty(dom.window, 'parent', { configurable: true, value: parent })
  const receive = message => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { source: parent,
    data: { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId: 'refresh-test', scopeRevision: 1, ...message } }))
  const modules = new Map()
  function load(name) {
    if (modules.has(name)) return modules.get(name)
    const api = {}; modules.set(name, api)
    const path = require.resolve(`../src/remote/${name}`)
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true
    } }).outputText
    vm.runInNewContext(code, { exports: api, window: dom.window, document: dom.window.document, console, Error, clearTimeout, AbortController,
      require: key => {
        if (key === 'react') return React
        if (key === '@xpert-ai/plugin-shadcn-ui') return ui
        if (key === '@xpert-ai/plugin-shadcn-ui/i18n') return i18nUi
        if (key === '@xpert-ai/plugin-sdk/artifact-document') return { installArtifactDocumentFramePolicy() {} }
        if (key === 'react-dom/client') return { createRoot: element => { root = uiRequire('react-dom/client').createRoot(element); return root } }
        if (key === './open-dashboard-tab') return load('open-dashboard-tab.ts')
        if (key === './library-app') return { LibraryApp: () => null }
        if (key === './bridge') return load('bridge.ts')
        if (key === '@xpert-ai/plugin-shadcn-ui/theme') return { installShadcnThemeVars() {} }
        if (key.endsWith('.css')) return {}
        if (key === './html-dashboard') return { HtmlDashboard: React.forwardRef((props, ref) => {
          htmlRenders.push(props)
          React.useImperativeHandle(ref, () => ({ refresh: () => htmlRefreshes.push(props) }))
          return null
        }) }
        if (key === './standard-dashboard') return { StandardDashboard: () => null }
        if (key === './dashboard-picker') return { DashboardPicker: props => React.createElement('span', { 'data-testid': 'title' }, props.selectedTitle) }
        if (key === './toolbar-menu') return { ToolbarMenu: props => React.createElement('div', { 'data-testid': 'history', 'data-version': props.version },
          React.createElement(ui.Button, { onClick: () => props.onRefreshSeconds('30') }, 'Enable periodic refresh'),
          React.createElement(ui.Button, { disabled: props.disabled, onClick: props.onEdit }, 'Edit working draft')) }
        for (const [module, symbol] of [['sources-panel', 'SourcesPanel'], ['import-dialog', 'ImportDialog'], ['share-dialog', 'ShareDialog'], ['dashboard-starter', 'DashboardStarter']]) {
          if (key === `./${module}`) return { [symbol]: () => null }
        }
        if (key === './viewer-controls') return { ViewerControls: props => props.children }
        if (['./i18n', './save-progress'].includes(key)) return load(key.slice(2) + '.ts')
        if (key.startsWith('./locales/')) return require(`../src/remote/${key}`)
        return require(key.startsWith('../lib/') ? key.replace('../lib/', '../dist/lib/') : key)
      }
    }, { filename: path })
    return api
  }
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)) }) }
  await act(async () => load('main.tsx'))
  t.after(async () => {
    await act(async () => root.unmount()); await flush(); dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  })
  const button = label => [...document.querySelectorAll('button')].find(element => element.getAttribute('aria-label') === label || element.textContent === label)
  const click = async label => { const element = button(label); assert.ok(element, label); await act(async () => element.click()); await flush() }
  const startOpen = async parameters => { await act(async () => receive({ type: 'init', locale: 'en-US', initialQuery: { selectionId: id, parameters } })); await flush() }
  return { backend, id, v1, v2, requests, selections, navigation, queries, htmlRenders, htmlRefreshes, click, button, startOpen,
    open: async parameters => {
      await startOpen(parameters)
      assert.equal(document.querySelector('[role=alert]')?.textContent, undefined)
      assert.ok(document.querySelector('[data-testid=title]').textContent)
    },
    title: () => document.querySelector('[data-testid=title]').textContent,
    selectedVersion: () => document.querySelector('[data-testid=history]').dataset.version,
    tick: async () => { assert.equal(intervals.size, 1); await act(async () => [...intervals.values()][0]()); await flush() },
    notify: async (artifactId = id) => { await act(async () => receive({ type: 'hostEvent', event: { type: 'assistant.tool.completed', toolName: 'dashboard_update',
      data: { output: { dashboard: { artifactId, draftRevision: backend.drafts.get(artifactId).revision, status: 'draft' } } } } })); await flush() },
    resetScope: async () => { await act(async () => receive({ type: 'hostEvent', event: { type: 'view.context.changed', data: { revision: 2 } } })); await flush() },
    hold: () => { held = true },
    release: async () => { assert.ok(release); await act(async () => release()); await flush() },
    fill: async (selector, value) => {
      const element = document.querySelector(selector)
      await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    }
  }
}

test('refresh preserves the selected dashboard definition', async t => {
  for (const periodic of [false, true]) {
    await t.test(`${periodic ? 'periodic' : 'manual'} refresh stays on a newer draft after publication`, async t => {
      const h = await setup(t)
      await h.open({ mode: 'draft' })
      await h.backend.service.update(h.backend.context, h.id, 3, { title: 'Fourth draft' }, h.v2.versionId)
      if (periodic) { await h.click('Enable periodic refresh'); await h.tick() } else await h.click('Refresh')
      assert.equal(h.title(), 'Fourth draft')
      assert.equal(h.requests.at(-1).parameters.versionId, undefined)
      assert.equal(h.selections.at(-1).draftRevision, 4)
      assert.equal(h.selectedVersion(), 'draft')
      assert.equal(h.queries.at(-1).input.draftRevision, 4)
      assert.equal(h.navigation.length, 0)
    })
    await t.test(`${periodic ? 'periodic' : 'manual'} refresh pins a historical version opened without mode`, async t => {
      const h = await setup(t)
      await h.open({ versionId: h.v1.versionId })
      await h.backend.service.publish(h.backend.context, h.id, 3, h.v2.versionId)
      if (periodic) { await h.click('Enable periodic refresh'); await h.tick() } else await h.click('Refresh')
      assert.equal(h.title(), 'First version')
      assert.equal(h.selections.at(-1).versionId, h.v1.versionId)
      assert.equal(h.selectedVersion(), h.v1.versionId)
      assert.equal(h.queries.at(-1).input.versionId, h.v1.versionId)
      assert.equal(h.queries.at(-1).input.draftRevision, undefined)
      assert.equal(h.navigation.length, 0)
    })
  }
  for (const receipt of [false, true]) await t.test(`an unchanged published draft follows its next edit on ${receipt ? 'receipt' : 'refresh'}`, async t => {
    const h = await setup(t, 'published')
    await h.open({ mode: 'draft' })
    assert.equal(h.selectedVersion(), 'draft', 'publication status must not replace the selected editing mode')
    await h.backend.service.update(h.backend.context, h.id, 2, { title: 'Next working draft' }, h.v2.versionId)
    if (receipt) await h.notify(); else await h.click('Refresh')
    assert.equal(h.title(), 'Next working draft')
    assert.equal(h.selections.at(-1).draftRevision, 3)
  })
  await t.test('a first draft refresh preserves applied filters', async t => {
    const h = await setup(t, 'initial')
    await h.open({ mode: 'draft' })
    await h.fill('#region', 'west'); await h.click('Apply filters')
    await h.click('Refresh')
    assert.equal(h.selections.at(-1).draftRevision, 1)
    assert.equal(h.requests.at(-1).parameters.versionId, undefined)
    assert.equal(h.queries.at(-1).input.controls.region, 'west')
    assert.equal(document.querySelector('#region').value, 'west')
  })
  await t.test('a draft receipt cannot replace a pinned published version', async t => {
    const h = await setup(t)
    await h.open({ mode: 'published', versionId: h.v1.versionId })
    await h.notify()
    assert.equal(h.title(), 'First version')
    assert.equal(h.selections.at(-1).versionId, h.v1.versionId)
  })
  await t.test('HTML refresh retains the draft target and passes new revisions to the renderer', async t => {
    const h = await setup(t, 'edited', true)
    await h.open({ mode: 'draft' })
    await h.click('Refresh')
    assert.equal(h.htmlRefreshes.at(-1).draftRevision, 3)
    await h.backend.service.update(h.backend.context, h.id, 3, { title: 'New HTML draft' }, h.v2.versionId)
    await h.click('Enable periodic refresh'); await h.tick()
    assert.equal(h.htmlRenders.at(-1).draftRevision, 4)
    assert.equal(h.htmlRenders.at(-1).manifest.title, 'New HTML draft')
    assert.equal(h.htmlRefreshes.length, 1, 'a changed revision is rendered instead of refreshing the old document')
  })
  await t.test('HTML historical refresh keeps its exact published version', async t => {
    const h = await setup(t, 'edited', true)
    await h.open({ versionId: h.v1.versionId }); await h.click('Refresh')
    assert.equal(h.htmlRefreshes.at(-1).versionId, h.v1.versionId)
    assert.equal(h.htmlRefreshes.at(-1).draftRevision, undefined)
    assert.equal(h.title(), 'First version')
  })
  await t.test('an old refresh response cannot replace a newer version selection', async t => {
    const h = await setup(t)
    await h.open({ mode: 'draft' })
    h.hold(); await h.click('Refresh')
    await h.open({ mode: 'published', versionId: h.v1.versionId })
    await h.release()
    assert.equal(h.title(), 'First version')
    assert.equal(h.selections.at(-1).versionId, h.v1.versionId)
  })
  await t.test('periodic refresh and receipts preserve unsaved editor input', async t => {
    const h = await setup(t)
    await h.open({ mode: 'draft' }); await h.click('Enable periodic refresh')
    await h.click('Edit working draft')
    const draftText = document.querySelector('textarea').value.replace('Third draft', 'Unsaved local edit')
    await h.fill('textarea', draftText)
    const queryCount = h.queries.length
    await h.backend.service.update(h.backend.context, h.id, 3, { title: 'Server edit' }, h.v2.versionId)
    await h.tick(); await h.notify()
    assert.equal(document.querySelector('textarea').value, draftText)
    assert.equal(h.queries.length, queryCount)
    assert.equal(h.button('Refresh').disabled, true)
  })
})


test('refresh and Assistant receipts respect document transitions', async t => {
  await t.test('a receipt during historical navigation preserves the requested version', async t => {
    const h = await setup(t)
    await h.open({ mode: 'draft' })
    h.hold(); await h.startOpen({ mode: 'published', versionId: h.v1.versionId })
    await h.backend.service.update(h.backend.context, h.id, 3, { title: 'Fourth draft' }, h.v2.versionId)
    await h.notify(); await h.release()
    assert.equal(h.title(), 'First version')
    assert.equal(h.selectedVersion(), h.v1.versionId)
    assert.equal(h.selections.at(-1).versionId, h.v1.versionId)
    await h.click('Refresh')
    assert.equal(h.title(), 'First version')
  })
  for (const periodic of [false, true]) await t.test(`a receipt during draft navigation retains draft mode on ${periodic ? 'periodic' : 'manual'} refresh`, async t => {
    const h = await setup(t)
    await h.open({ mode: 'published', versionId: h.v1.versionId })
    if (periodic) await h.click('Enable periodic refresh')
    h.hold(); await h.startOpen({ mode: 'draft' })
    await h.backend.service.update(h.backend.context, h.id, 3, { title: 'Fourth draft' }, h.v2.versionId)
    await h.notify(); await h.release()
    assert.equal(h.selectedVersion(), 'draft')
    assert.equal(h.title(), 'Fourth draft', 'the receipt must be consumed after navigation, not dropped')
    if (periodic) await h.tick(); else await h.click('Refresh')
    assert.equal(h.title(), 'Fourth draft')
    assert.equal(h.requests.at(-1).parameters.mode, 'draft')
    assert.equal(h.requests.at(-1).parameters.versionId, undefined)
    assert.equal(h.selections.at(-1).draftRevision, 4)
  })
  await t.test('a pending periodic refresh cannot roll back the newly opened editor base', async t => {
    const h = await setup(t)
    await h.open({ mode: 'draft' }); await h.click('Enable periodic refresh')
    h.hold(); await h.tick()
    await h.backend.service.update(h.backend.context, h.id, 3, { title: 'Fourth draft' }, h.v2.versionId)
    await h.click('Edit working draft')
    assert.equal(JSON.parse(document.querySelector('textarea').value).title, 'Fourth draft')
    await h.release()
    assert.equal(h.title(), 'Fourth draft')
    assert.equal(h.selections.at(-1).draftRevision, 4)
    await h.click('Save')
    assert.equal(document.querySelector('[role=alert]')?.textContent, undefined)
    assert.equal(h.queries.findLast(request => request.actionKey === 'save').input.expectedRevision, 4)
    assert.equal(h.backend.drafts.get(h.id).revision, 5)
  })
  for (const periodic of [false, true]) await t.test(`a receipt arriving during ${periodic ? 'periodic' : 'manual'} refresh reaches the latest draft`, async t => {
    const h = await setup(t)
    await h.open({ mode: 'draft' })
    if (periodic) await h.click('Enable periodic refresh')
    h.hold()
    if (periodic) await h.tick(); else await h.click('Refresh')
    await h.backend.service.update(h.backend.context, h.id, 3, { title: 'Fourth draft' }, h.v2.versionId)
    await h.notify(); await h.release()
    assert.equal(h.title(), 'Fourth draft')
    assert.equal(h.selectedVersion(), 'draft')
    assert.equal(h.selections.at(-1).draftRevision, 4)
    assert.equal(document.querySelector('[role=alert]')?.textContent, undefined)
  })
  await t.test('a different dashboard receipt refreshes only the catalog during navigation', async t => {
    const h = await setup(t)
    const other = await h.backend.service.save(h.backend.context, { ...structuredClone(example), id: randomUUID(), title: 'Other dashboard' }, null)
    await h.open({ mode: 'published', versionId: h.v1.versionId })
    h.hold(); await h.startOpen({ mode: 'draft' })
    await h.notify(other.artifactId); await h.release()
    assert.equal(h.title(), 'Third draft')
    assert.equal(h.selectedVersion(), 'draft')
    await h.click('Refresh')
    assert.equal(h.title(), 'Third draft')
    assert.equal(h.selections.at(-1).draftRevision, 3)
  })
  await t.test('new published navigation discards a queued draft receipt', async t => {
    const h = await setup(t)
    await h.open({ mode: 'draft' })
    h.hold(); await h.click('Refresh')
    await h.backend.service.update(h.backend.context, h.id, 3, { title: 'Fourth draft' }, h.v2.versionId)
    await h.notify()
    await h.open({ mode: 'published', versionId: h.v1.versionId })
    await h.release()
    assert.equal(h.title(), 'First version')
    assert.equal(h.selectedVersion(), h.v1.versionId)
    assert.equal(h.selections.at(-1).versionId, h.v1.versionId)
  })
  await t.test('an editor defers receipts until cancellation without replacing local input', async t => {
    const h = await setup(t)
    await h.open({ mode: 'draft' }); await h.click('Edit working draft')
    const input = document.querySelector('textarea').value.replace('Third draft', 'Unsaved editor input')
    await h.fill('textarea', input)
    await h.backend.service.update(h.backend.context, h.id, 3, { title: 'Fourth draft' }, h.v2.versionId)
    await h.notify()
    assert.equal(document.querySelector('textarea').value, input)
    assert.equal(h.selections.at(-1).draftRevision, 3)
    await h.click('Cancel')
    assert.equal(h.title(), 'Fourth draft')
    assert.equal(h.selections.at(-1).draftRevision, 4)
  })
  await t.test('a late editor load cannot replace a newer version selection', async t => {
    const h = await setup(t)
    await h.open({ mode: 'draft' })
    h.hold(); await h.click('Edit working draft')
    await h.open({ mode: 'published', versionId: h.v1.versionId })
    await h.release()
    assert.equal(document.querySelector('textarea'), null)
    assert.equal(h.title(), 'First version')
    assert.equal(h.selections.at(-1).versionId, h.v1.versionId)
  })
  await t.test('a scope reset discards both pending navigation and saved receipts', async t => {
    const h = await setup(t)
    await h.open({ mode: 'published', versionId: h.v1.versionId })
    h.hold(); await h.startOpen({ mode: 'draft' })
    await h.backend.service.update(h.backend.context, h.id, 3, { title: 'Fourth draft' }, h.v2.versionId)
    await h.notify(); await h.resetScope()
    const queryCount = h.queries.length, selectionCount = h.selections.length
    await h.release()
    assert.equal(h.title(), '')
    assert.equal(h.selectedVersion(), undefined)
    assert.equal(h.queries.length, queryCount)
    assert.equal(h.selections.length, selectionCount)
    assert.equal(document.querySelector('[role=alert]')?.textContent, undefined)
  })
})

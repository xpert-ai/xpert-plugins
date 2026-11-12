const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const vm = require('node:vm')
const ts = require('typescript')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')
const { setup: serviceFixture } = require('./service-fixture.cjs')
const { DashboardViewProvider } = require('../dist/lib/view.provider')
const example = require('../examples/postgres-sales.json')

// Mount the real App and route its requests through the real View/Service with in-memory storage.
// Child rendering is stubbed; selection, refresh, queries and persistence are exercised together.
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
  let root, ready, created, held, release
  const requests = [], selections = [], navigation = [], queries = [], htmlRenders = [], htmlRefreshes = []
  const bridge = {
    startBridge: (onReady, onCreated) => { ready = onReady; created = onCreated; return () => {} },
    onPrepareClose: () => () => {}, isViewVisible: () => true,
    selectDashboard: async target => { selections.push(target) },
    navigateDashboard: async (...args) => { navigation.push(args) },
    requestHost: async (kind, request) => {
      if (kind === 'requestData') {
        requests.push(request.query)
        const response = await view.getViewData(backend.context, 'live-dashboard', request.query)
        if (held && request.query.parameters.artifactId) { held = false; await new Promise(resolve => { release = resolve }) }
        return response
      }
      if (kind === 'executeAction') {
        queries.push(request)
        return view.executeViewAction(backend.context, 'live-dashboard', request.actionKey, request)
      }
      return { success: true }
    }
  }
  const modules = new Map()
  function load(name) {
    if (modules.has(name)) return modules.get(name)
    const api = {}; modules.set(name, api)
    const path = require.resolve(`../src/remote/${name}`)
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true
    } }).outputText
    vm.runInNewContext(code, { exports: api, window: dom.window, document: dom.window.document, console, Error,
      require: key => {
        if (key === 'react') return React
        if (key === '@xpert-ai/plugin-shadcn-ui') return ui
        if (key === '@xpert-ai/plugin-shadcn-ui/i18n') return i18nUi
        if (key === '@xpert-ai/plugin-sdk/artifact-document') return { installArtifactDocumentFramePolicy() {} }
        if (key === 'react-dom/client') return { createRoot: element => { root = uiRequire('react-dom/client').createRoot(element); return root } }
        if (key === './bridge') return bridge
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
          React.createElement(ui.Button, { onClick: props.onEdit }, 'Edit working draft')) }
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
  return { backend, id, v1, v2, requests, selections, navigation, queries, htmlRenders, htmlRefreshes, click, button,
    open: async parameters => {
      await act(async () => ready('en-US', { selectionId: id, parameters })); await flush()
      assert.equal(document.querySelector('[role=alert]')?.textContent, undefined)
      assert.ok(document.querySelector('[data-testid=title]').textContent)
    },
    title: () => document.querySelector('[data-testid=title]').textContent,
    selectedVersion: () => document.querySelector('[data-testid=history]').dataset.version,
    tick: async () => { assert.equal(intervals.size, 1); await act(async () => [...intervals.values()][0]()); await flush() },
    notify: async () => { await act(async () => created(id)); await flush() },
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

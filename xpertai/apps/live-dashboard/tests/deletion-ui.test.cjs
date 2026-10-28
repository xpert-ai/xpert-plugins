const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const { randomUUID } = require('node:crypto')
const vm = require('node:vm')
const ts = require('typescript')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')
const example = require('../examples/postgres-sales.json')

// Exercise the real picker/dialog and App with an in-memory host, without opening a browser.
test('picker deletion confirms identity, preserves failures, and clears only the deleted selection', async t => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://view.test', pretendToBeVisual: true })
  const previous = new Map()
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLFormElement', 'HTMLButtonElement', 'NodeFilter', 'DocumentFragment', 'SVGElement', 'HTMLSelectElement', 'Event', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'Node', 'Element', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] })
  }
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  dom.window.HTMLElement.prototype.scrollIntoView = function () {}
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'), { act } = React
  const ui = await import('@xpert-ai/plugin-shadcn-ui'), i18nUi = await import('@xpert-ai/plugin-shadcn-ui/i18n')
  const { createRoot } = require('react-dom/client')
  let root, ready, rejectDelete = false, releaseDelete
  const calls = [], navigation = [], selections = []
  const items = [1, 2].map(n => ({ artifactId: randomUUID(), title: `Dashboard ${n}`, draftRevision: n,
    canDelete: true, isDraft: true, updatedAt: `2026-10-2${n}T01:00:00Z`,
    manifest: { ...example, id: randomUUID(), title: `Dashboard ${n}`, bindings: [], charts: [], tables: [], controls: [] } }))
  let dashboards = [...items]
  const bridge = {
    startBridge: callback => { ready = callback; return () => {} },
    onPrepareClose: () => () => {}, isViewVisible: () => true,
    selectDashboard: async target => { selections.push(target) },
    navigateDashboard: async (_target, id) => { navigation.push(id) },
    requestHost: async (kind, request) => {
      if (kind === 'requestData') {
        const id = request.query.parameters.artifactId
        return { meta: { dashboards, sources: [], navigationTarget: { target: 'workbench.view', viewKey: 'live-dashboard__live-dashboard' },
          ...(id ? { saved: dashboards.find(item => item.artifactId === id), versions: [] } : {}) } }
      }
      if (kind === 'executeAction') {
        calls.push(request)
        assert.equal(request.actionKey, 'delete')
        if (rejectDelete) throw Error('ARTIFACT_DRAFT_CONFLICT')
        await new Promise(resolve => { releaseDelete = resolve })
        dashboards = dashboards.filter(item => item.artifactId !== request.input.artifactId)
        return { success: true, data: { artifactId: request.input.artifactId } }
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
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
    } }).outputText
    vm.runInNewContext(code, { exports: api, window: dom.window, document: dom.window.document, console, Error,
      require: id => {
        if (id === '@xpert-ai/plugin-shadcn-ui') return ui
        if (id === '@xpert-ai/plugin-shadcn-ui/i18n') return i18nUi
        if (id === '@xpert-ai/plugin-sdk/artifact-document') return { installArtifactDocumentFramePolicy() {} }
        if (id === 'react-dom/client') return { createRoot: element => { root = createRoot(element); return root } }
        if (id === './bridge') return bridge
        if (id.endsWith('.css')) return {}
        if (id === './html-dashboard') return { HtmlDashboard: React.forwardRef(() => null) }
        if (id === './share-dialog') return { ShareDialog: () => null }
        if (id === './viewer-controls') return { ViewerControls: ({ children }) => children }
        if (id === './i18n') return load('i18n.ts')
        if (id === './dashboard-picker') return load('dashboard-picker.tsx')
        if (id.startsWith('./locales/')) return require(`../src/remote/${id}`)
        return require(id.startsWith('../lib/') ? id.replace('../lib/', '../dist/lib/') : id)
      }
    }, { filename: path })
    return api
  }
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
  const click = async element => { assert.ok(element); await act(async () => element.click()); await flush() }
  const button = label => [...document.querySelectorAll('button')].find(element => element.getAttribute('aria-label') === label || element.textContent === label)
  const picker = () => document.querySelector('[aria-label="Choose a dashboard"]')
  const dialog = () => document.querySelector('[role="alertdialog"]')
  t.after(async () => {
    await act(async () => root?.unmount()); dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
    delete globalThis.ResizeObserver; delete globalThis.IS_REACT_ACT_ENVIRONMENT
  })
  await act(async () => load('main.tsx'))
  await act(async () => ready('en-US', { selectionId: items[0].artifactId }))
  await flush()
  assert.equal(document.querySelector('[role=alert]')?.textContent ?? '', '')
  assert.match(picker().textContent, /Dashboard 1/)
  await click(picker())
  const deleteOther = button('Delete “Dashboard 2”')
  assert.equal(deleteOther.closest('[role="option"]'), null, 'delete is separate from the open/select option')
  await click(deleteOther)
  assert.match(dialog().textContent, /Dashboard 2/)
  assert.match(dialog().textContent, new RegExp(items[1].artifactId))
  await click(button('Cancel'))
  assert.equal(calls.length, 0)
  assert.equal(dialog(), null)

  await click(picker()); await click(button('Delete “Dashboard 2”'))
  rejectDelete = true
  await click(button('Delete dashboard'))
  assert.match(dialog().textContent, /ARTIFACT_DRAFT_CONFLICT/)
  assert.match(picker().textContent, /Dashboard 1/)
  await click(button('Cancel'))

  rejectDelete = false
  await click(picker()); await click(button('Delete “Dashboard 2”'))
  await click(button('Delete dashboard'))
  assert.equal(button('Deleting…').disabled, true)
  assert.equal(button('Cancel').disabled, true)
  await act(async () => releaseDelete()); await flush()
  assert.equal(dialog(), null)
  assert.match(picker().textContent, /Dashboard 1/)
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).input)), { artifactId: items[1].artifactId, expectedRevision: 2, confirmed: true })

  await click(picker())
  assert.equal(button('Delete “Dashboard 2”'), undefined)
  await click(button('Delete “Dashboard 1”')); await click(button('Delete dashboard'))
  await act(async () => releaseDelete()); await flush()
  assert.match(picker().textContent, /Choose a dashboard/)
  assert.equal(selections.at(-1), null)
  assert.equal(navigation.at(-1), undefined)
  assert.equal(dashboards.length, 0)
  assert.match(document.body.textContent, /Create a dashboard with your Assistant/)
})

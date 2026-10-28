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
async function setup(t) {
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
  let root, ready, created, rejectDelete = false, releaseDelete, holdOpen = false, releaseOpen
  const calls = [], navigation = [], selections = []
  const items = [1, 2].map(n => ({ artifactId: randomUUID(), title: `Dashboard ${n}`, draftRevision: n,
    canDelete: true, isDraft: true, updatedAt: `2026-10-2${n}T01:00:00Z`,
    manifest: { ...example, id: randomUUID(), title: `Dashboard ${n}`, bindings: [], charts: [], tables: [], controls: [] } }))
  let dashboards = [...items]
  const bridge = {
    startBridge: (callback, onCreated) => { ready = callback; created = onCreated; return () => {} },
    onPrepareClose: () => () => {}, isViewVisible: () => true,
    selectDashboard: async target => { selections.push(target) },
    navigateDashboard: async (_target, id) => { navigation.push(id) },
    requestHost: async (kind, request) => {
      if (kind === 'requestData') {
        const id = request.query.parameters.artifactId
        const response = { meta: { dashboards, sources: [], navigationTarget: { target: 'workbench.view', viewKey: 'live-dashboard__live-dashboard' },
          ...(id ? { saved: dashboards.find(item => item.artifactId === id), versions: [] } : {}) } }
        if (id && holdOpen) {
          holdOpen = false
          await new Promise(resolve => { releaseOpen = resolve })
        }
        return response
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
    await act(async () => root?.unmount()); await flush(); dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
    delete globalThis.ResizeObserver; delete globalThis.IS_REACT_ACT_ENVIRONMENT
  })
  async function reset() {
    await act(async () => root?.unmount())
    modules.clear(); dashboards = [...items]; calls.length = 0; navigation.length = 0; selections.length = 0
    rejectDelete = false; holdOpen = false
    document.body.innerHTML = '<div id="root"></div>'
    await act(async () => load('main.tsx'))
    await act(async () => ready('en-US', { selectionId: items[0].artifactId }))
    await flush()
  }
  return { reset, items, calls, navigation, selections, click, button, picker, dialog,
    failDelete: value => { rejectDelete = value },
    finishDelete: async () => { await act(async () => releaseDelete()); await flush() },
    notify: async (id, hold = false) => { holdOpen = hold; await act(async () => created(id)); await flush() },
    finishOpen: async () => { await act(async () => releaseOpen()); await flush() },
    remaining: () => dashboards
  }
}

test('dashboard deletion UI', async t => {
  const harness = await setup(t)
  await t.test('picker deletion confirms identity, preserves failures, and clears only the deleted selection', async () => {
    await harness.reset()
    const { items, calls, navigation, selections, click, button, picker, dialog, failDelete, finishDelete, remaining } = harness
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
    failDelete(true)
    await click(button('Delete dashboard'))
    assert.match(dialog().textContent, /ARTIFACT_DRAFT_CONFLICT/)
    assert.match(picker().textContent, /Dashboard 1/)
    await click(button('Cancel'))

    failDelete(false)
    await click(picker()); await click(button('Delete “Dashboard 2”'))
    await click(button('Delete dashboard'))
    assert.equal(button('Deleting…').disabled, true)
    assert.equal(button('Cancel').disabled, true)
    await finishDelete()
    assert.equal(dialog(), null)
    assert.match(picker().textContent, /Dashboard 1/)
    assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).input)), { artifactId: items[1].artifactId, expectedRevision: 2, confirmed: true })

    await click(picker())
    assert.equal(button('Delete “Dashboard 2”'), undefined)
    await click(button('Delete “Dashboard 1”')); await click(button('Delete dashboard'))
    await finishDelete()
    assert.match(picker().textContent, /Choose a dashboard/)
    assert.equal(selections.at(-1), null)
    assert.equal(navigation.at(-1), undefined)
    assert.equal(remaining().length, 0)
    assert.match(document.body.textContent, /Create a dashboard with your Assistant/)
  })

  for (const hold of [false, true]) {
    await t.test(`deletion clears the same dashboard after an Assistant update ${hold ? 'still loading' : 'finished opening'}`, async () => {
      await harness.reset()
      const { items, navigation, selections, click, button, picker, finishDelete, notify, finishOpen } = harness
      await click(picker()); await click(button('Delete “Dashboard 1”')); await click(button('Delete dashboard'))
      await notify(items[0].artifactId, hold)
      await finishDelete()
      if (hold) await finishOpen()
      assert.match(picker().textContent, /Choose a dashboard/)
      assert.equal(!!document.querySelector('header .toolbar-version'), false)
      assert.equal(selections.at(-1), null)
      assert.equal(navigation.at(-1), undefined)
      await click(picker())
      assert.ok(!button('Delete “Dashboard 1”'))
      assert.ok(button('Delete “Dashboard 2”'))
    })

    await t.test(`deletion preserves a different dashboard after an Assistant update ${hold ? 'still loading' : 'finished opening'}`, async () => {
      await harness.reset()
      const { items, navigation, selections, click, button, picker, finishDelete, notify, finishOpen } = harness
      await click(picker()); await click(button('Delete “Dashboard 1”')); await click(button('Delete dashboard'))
      await notify(items[1].artifactId, hold)
      await finishDelete()
      if (hold) await finishOpen()
      assert.match(picker().textContent, /Dashboard 2/)
      assert.equal(selections.at(-1).artifactId, items[1].artifactId)
      assert.equal(navigation.at(-1), items[1].artifactId)
      await click(picker())
      assert.ok(!button('Delete “Dashboard 1”'), 'an older open response must not restore the deleted list entry')
      assert.ok(button('Delete “Dashboard 2”'))
    })
  }

  await t.test('a failed deletion still allows subsequent Assistant updates', async () => {
    await harness.reset()
    const { items, selections, click, button, picker, dialog, failDelete, notify } = harness
    await click(picker()); await click(button('Delete “Dashboard 1”'))
    failDelete(true)
    await click(button('Delete dashboard'))
    assert.match(dialog().textContent, /ARTIFACT_DRAFT_CONFLICT/)
    await click(button('Cancel'))
    await notify(items[0].artifactId)
    assert.match(picker().textContent, /Dashboard 1/)
    assert.equal(selections.at(-1).artifactId, items[0].artifactId)
    await click(picker())
    assert.ok(button('Delete “Dashboard 1”'))
  })
})

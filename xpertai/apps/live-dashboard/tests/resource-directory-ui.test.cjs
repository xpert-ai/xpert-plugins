const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const { randomUUID } = require('node:crypto')
const vm = require('node:vm')
const ts = require('typescript')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')
const messages = require('../src/remote/locales/en.json')
test('resource directory pages', async t => {
  const dom = new JSDOM('<html lang="en"><body><div id="root"></div></body></html>', { url: 'https://view.test', pretendToBeVisual: true })
  const previous = new Map()
  const globals = ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLFormElement', 'HTMLButtonElement', 'HTMLSelectElement', 'NodeFilter', 'DocumentFragment', 'SVGElement',
    'Event', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'Node', 'Element', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']
  for (const key of [...globals, 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT']) previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] })
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.HTMLElement.prototype.scrollIntoView = function () {}
  const uiRequire = createRequire(require.resolve('@xpert-ai/plugin-shadcn-ui'))
  const React = uiRequire('react'), { act } = React, { createRoot } = uiRequire('react-dom/client')
  const ui = await import('@xpert-ai/plugin-shadcn-ui'), i18nUi = await import('@xpert-ai/plugin-shadcn-ui/i18n')
  const root = createRoot(document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    // Radix restores focus asynchronously after the portal unmounts.
    await act(async () => new Promise(resolve => setTimeout(resolve, 100)))
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  let ready, scopeReset, mount = 0, canEdit = true, failNext = false, holdNext = false, scopeName = 'Scope A', delayed
  let currentQuery = {}, locale = 'en'
  const calls = []
  const releaseId = randomUUID()
  const pageResult = input => ({ page: input.page, pageSize: input.pageSize, total: 25, items: [{
    id: releaseId, releaseId, kind: input.kind, title: `${scopeName} · ${input.search || input.kind}`, description: 'Synthetic directory entry',
    state: 'released', version: '1.0.0', categories: [], features: [], requirements: []
  }] })
  const bridge = {
    startBridge(onInit, _onReceipt, onReset) { ready = onInit; scopeReset = onReset; return () => {} },
    captureViewScope: () => () => {},
    async requestHost(type, request) {
      calls.push({ type, ...request })
      if (type === 'requestData') return { meta: { canEdit, sources: [], datasets: [], page: 1, hasMore: false } }
      if (type === 'invokeClientCommand') {
        assert.equal(request.commandKey, 'workbench.navigation.open')
        currentQuery = { parameters: request.payload.parameters }; ready(locale, currentQuery)
        return { success: true }
      }
      switch (request.actionKey) {
        case 'resource-directory': {
          if (failNext) { failNext = false; throw Error('DIRECTORY_TEMPORARILY_UNAVAILABLE') }
          const value = pageResult(request.input)
          if (holdNext) { holdNext = false; return new Promise(resolve => { delayed = () => resolve({ success: true, data: value }) }) }
          return { success: true, data: value }
        }
        case 'resource-jobs': return { success: true, data: [] }
        case 'resource-prepare-task': return { success: true, data: { text: 'Task', workspaceFiles: [], skillNames: [] } }
        default: throw Error(`Unexpected directory action: ${request.actionKey}`)
      }
    }
  }
  const modules = new Map()
  function load(name) {
    if (modules.has(name)) return modules.get(name)
    const exports = {}; modules.set(name, exports)
    const path = require.resolve(`../src/remote/${name}`)
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true
    } }).outputText
    vm.runInNewContext(code, { exports, document, console, Error, crypto: { randomUUID }, require: id => {
      if (id === 'react') return React
      if (id === '@xpert-ai/plugin-shadcn-ui') return ui
      if (id === './bridge') return bridge
      if (id === '@xpert-ai/plugin-shadcn-ui/i18n') return i18nUi
      if (/\.(svg|webp|png)$/.test(id)) return 'data:image/svg+xml,<svg/>'
      if (['./library-catalog','./library-catalog-images','./explore-covers'].includes(id)) return load(id.slice(2) + '.ts')
      if (id === './i18n') return load('i18n.ts')
      if (id === './library-data') return { DataLibrary: () => React.createElement('div', { 'data-private-data': true }, 'Private Dataset panel') }
      if (id.startsWith('./locales/')) return require(`../src/remote/${id}`)
      if (id === './library-gateway') return load('library-gateway.ts')
      if (['./explore-view', './resource-library', './library-directory', './resource-image', './resource-detail', './resource-import'].includes(id)) return load(id.slice(2) + '.tsx')
      return require(id.startsWith('../lib/') ? id.replace('../lib/', '../dist/lib/') : id)
    } }, { filename: path })
    return exports
  }
  const { LibraryApp } = load('library-app.tsx')
  const button = text => [...document.querySelectorAll('button')].find(element => element.textContent === text || element.getAttribute('aria-label') === text)
  const requests = () => calls.filter(call => call.actionKey === 'resource-directory')
  async function reset(page = 'templates', parameters = {}, editable = true) {
    canEdit = editable; failNext = false; holdNext = false; scopeName = 'Scope A'; calls.length = 0; currentQuery = { parameters }; locale = 'en'
    await act(async () => root.render(React.createElement(LibraryApp, { page, key: ++mount })))
    await act(async () => ready(locale, currentQuery))
  }
  async function click(element) { assert.ok(element); await act(async () => element.click()) }
  async function tab(label) {
    const element = [...document.querySelectorAll('[role=tab]')].find(item => item.textContent === label); assert.ok(element)
    await act(async () => element.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, button: 0 })))
  }
  async function search(value, submit = true) {
    const input = document.querySelector(`input[aria-label="${messages.catalogSearch}"]`)
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    if (submit) await act(async () => input.form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
  }
  await t.test('search, pagination and template-kind selection preserve navigation parameters', async () => {
    await reset()
    assert.equal(requests().at(-1).input.kind, 'analysis-template')
    assert.equal(requests().at(-1).input.audience, 'catalog')
    await search('Quarterly')
    assert.equal(requests().at(-1).input.search, 'Quarterly')
    await click(button(messages.catalogNext))
    assert.equal(requests().at(-1).input.page, 2)
    await tab(messages.libThemes)
    assert.equal(requests().at(-1).input.kind, 'visual-theme'); assert.equal(requests().at(-1).input.page, 1)
    assert.equal(currentQuery.parameters.catalogKind, 'visual-theme')
    assert.equal(currentQuery.parameters.search, 'Quarterly')
    await click(button(messages.catalogImport))
    assert.ok(document.querySelector('input[type=file]'))
    assert.ok(calls.some(call => call.actionKey === 'resource-jobs'))
  })
  await t.test('a failed page can retry without changing its filters', async () => {
    await reset(); failNext = true; await search('Retry')
    assert.match(document.querySelector('[role=alert]').textContent, /DIRECTORY_TEMPORARILY_UNAVAILABLE/)
    await click(button(messages.refresh))
    assert.match(document.querySelector('[data-catalog-entry]').textContent, /Retry/)
    assert.equal(requests().at(-1).input.search, 'Retry')
  })
  await t.test('locale-only initialization preserves an unsubmitted search', async () => {
    await reset(); await search('Not submitted', false)
    locale = 'zh-Hans'; await act(async () => ready(locale, currentQuery))
    assert.equal(document.querySelector('input').value, 'Not submitted')
    assert.equal(requests().at(-1).input.locale, 'zh-Hans')
    assert.equal(requests().at(-1).input.search, '')
  })
  await t.test('switching project scope discards a late directory response', async () => {
    await reset(); holdNext = true; await search('Old request')
    assert.ok(delayed)
    await act(async () => { scopeName = 'Scope B'; scopeReset(); currentQuery = { parameters: {} }; ready(locale, currentQuery) })
    assert.match(document.querySelector('[data-catalog-entry]').textContent, /Scope B/)
    await act(async () => delayed())
    assert.doesNotMatch(document.querySelector('[data-catalog-entry]').textContent, /Scope A|Old request/)
  })
  await t.test('public Dataset filters keep the public-data page and remain accessible in read-only mode', async () => {
    await reset('data', {}, false)
    assert.match(document.body.textContent, new RegExp(messages.draftAccessDenied))
    await click(button(messages.catalogPublicData))
    assert.equal(requests().at(-1).input.kind, 'public-dataset')
    await search('Dataset')
    assert.equal(currentQuery.parameters.audience, 'public')
    assert.ok(document.querySelector('[data-catalog-entry]'))
    assert.equal(document.querySelector('[data-private-data]'), null)
    assert.equal(button(messages.catalogImport).disabled, true)
  })
  await t.test('examples expose composer preparation while read-only users cannot start tasks', async () => {
    await reset('explore', { section: 'insights' }, false)
    assert.equal(requests().at(-1).input.kind, 'example-task')
    const uses = [...document.querySelectorAll('button')].filter(element => element.textContent === messages.exploreUse)
    assert.ok(uses.length); assert.ok(uses.every(element => element.disabled))
    assert.equal(calls.filter(call => call.actionKey === 'resource-prepare-task').length, 0)
  })
})

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const { randomUUID } = require('node:crypto')
const vm = require('node:vm')
const ts = require('typescript')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')
const messages = require('../src/remote/locales/en.json')
const { limits } = require('../dist/lib/library/resource-contract')

// Render the real dialog and shared controls; replace only the host transport.
test('resource ZIP import dialog', async t => {
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
  const ui = await import('@xpert-ai/plugin-shadcn-ui')
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
  let job, jobs, scope = 0, imported = 0, failCommit = false, mount = 0
  const calls = []
  const bridge = {
    captureViewScope() { const captured = scope; return () => { if (scope !== captured) throw Error('VIEW_SCOPE_CHANGED') } },
    async requestHost(type, request) {
      calls.push({ type, ...request })
      let data
      switch (request.actionKey) {
        case 'resource-jobs': data = jobs; break
        case 'resource-import': case 'resource-import-status': data = job; break
        case 'resource-import-commit':
          if (failCommit) { failCommit = false; throw Error('LIBRARY_IMPORT_RETRY') }
          data = job = { ...job, status: 'complete', releaseIds: [randomUUID()] }; break
        case 'resource-import-cancel': data = job = { ...job, status: 'cancelled' }; break
        default: throw Error(`Unexpected host action: ${request.actionKey}`)
      }
      return { success: true, data }
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
      if (id === './library-gateway') return load('library-gateway.ts')
      return require(id.startsWith('../lib/') ? id.replace('../lib/', '../dist/lib/') : id)
    } }, { filename: path })
    return exports
  }
  const { ResourceImport } = load('resource-import.tsx')
  const button = text => [...document.querySelectorAll('button')].find(item => item.textContent === text)
  async function click(element) { assert.ok(element); await act(async () => element.click()) }
  async function reset(status = 'prepared', outcome = 'create') {
    job = { importId: randomUUID(), status, createdAt: '2026-11-01T10:00:00.000Z', failureCode: null, releaseIds: [],
      items: [{ logicalId: randomUUID(), version: '1.0.0', title: 'Review fixture', outcome }] }
    jobs = [{ ...job }]; calls.length = 0; imported = 0; failCommit = false
    await act(async () => root.render(React.createElement(ResourceImport, { key: ++mount, open: true, t: messages, onClose() {}, onImported() { imported++ } })))
  }
  async function upload(file = { name: 'review.zip', type: 'application/zip', size: 3, async arrayBuffer() { return new ArrayBuffer(3) } }) {
    const input = document.querySelector('input[type=file]')
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => input.dispatchEvent(new dom.window.Event('change', { bubbles: true })))
  }
  await t.test('upload previews resources and requires confirmation before committing', async () => {
    await reset(); await upload()
    assert.match(document.querySelector('[role=dialog]').textContent, /Review fixture/)
    assert.equal(calls.filter(item => item.actionKey === 'resource-import-commit').length, 0)
    const request = calls.find(item => item.type === 'executeFileAction')
    assert.equal(request.input.mode, 'reuse'); assert.match(request.input.requestId, /^[0-9a-f-]{36}$/)
    await click(button(messages.catalogConfirmImport))
    assert.equal(imported, 1); assert.equal(button(messages.catalogConfirmImport).disabled, true)
  })
  await t.test('conflicts block commit, while cancellation makes the job terminal', async () => {
    await reset('prepared', 'conflict'); await upload()
    assert.equal(button(messages.catalogConfirmImport).disabled, true)
    await click(button(messages.cancel))
    assert.equal(job.status, 'cancelled'); assert.equal(button(messages.cancel).disabled, true)
    assert.equal(imported, 0)
  })
  await t.test('historical failed jobs can be inspected and retried without re-uploading', async () => {
    await reset('failed')
    await click([...document.querySelectorAll('button')].find(item => item.textContent.includes(' · Failed')))
    failCommit = true; await click(button(messages.catalogConfirmImport))
    assert.match(document.querySelector('[role=alert]').textContent, /LIBRARY_IMPORT_RETRY/)
    await click(button(messages.catalogConfirmImport))
    assert.equal(imported, 1)
    assert.equal(calls.filter(item => item.actionKey === 'resource-import').length, 0)
    assert.ok(calls.filter(item => item.actionKey === 'resource-import-commit').every(item => item.input.importId === job.importId))
  })
  await t.test('running jobs allow status inspection but no commit or cancellation', async () => {
    await reset('running'); await upload()
    assert.equal(button(messages.catalogConfirmImport).disabled, true)
    assert.equal(button(messages.cancel).disabled, true)
    await click(button(messages.refresh))
    assert.ok(calls.some(item => item.actionKey === 'resource-import-status'))
  })
  await t.test('oversized files and a changed scope cannot reach the upload transport', async () => {
    await reset(); await upload({ size: limits.archiveBytes + 1 })
    assert.match(document.querySelector('[role=alert]').textContent, /LIBRARY_ARCHIVE_LIMIT/)
    await upload({ size: 3, async arrayBuffer() { scope++; return new ArrayBuffer(3) } })
    assert.match(document.querySelector('[role=alert]').textContent, /VIEW_SCOPE_CHANGED/)
    assert.equal(calls.filter(item => item.type === 'executeFileAction').length, 0)
  })
})

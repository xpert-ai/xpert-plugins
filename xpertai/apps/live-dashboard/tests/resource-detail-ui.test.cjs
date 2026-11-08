const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const { randomUUID } = require('node:crypto')
const vm = require('node:vm')
const ts = require('typescript')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')
const messages = require('../src/remote/locales/en.json')
const { graph } = require('./library-v2-fixture.cjs')
const { fixture } = require('./dataset-fixture.cjs')

test('resource detail dialog', async t => {
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
  let detail, item, mount = 0, changed = 0, closed = 0, failInsert = false
  const calls = [], downloads = []
  dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push({ href: this.href, download: this.download }) }
  const draft = { text: 'Synthetic task prompt', workspaceFiles: [{ path: 'tasks/recipe.json', name: 'recipe.json', mimeType: 'application/json', size: 42 }], skillNames: ['live-dashboard'] }
  const datasetFixture = fixture(), saved = await datasetFixture.library.save(datasetFixture.context, { definition: datasetFixture.definition, expectedRevision: 0 })
  const dataset = await datasetFixture.library.open(datasetFixture.context, saved.artifactId)
  const bridge = {
    captureViewScope: () => () => {},
    async requestHost(type, request) {
      calls.push({ type, ...request })
      if (type === 'invokeClientCommand') {
        if (failInsert) { failInsert = false; return { success: false, code: 'COMPOSER_UNAVAILABLE' } }
        return { success: true }
      }
      if (type === 'requestFileAccess') return { url: 'https://download.test/resource.zip', fileName: 'resource.zip' }
      let data
      switch (request.actionKey) {
        case 'resource-open': data = detail; break
        case 'resource-prepare-task': case 'resource-prepare-template': data = draft; break
        case 'resource-publish': data = {}; break
        case 'resource-withdraw': data = { releaseId: item.releaseId }; break
        case 'dataset-open': data = dataset; break
        default: throw Error(`Unexpected action: ${request.actionKey}`)
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
      if (id === './resource-image' || id === './library-directory') return load('resource-image.tsx')
      if (id === './library-gateway') return load('library-gateway.ts')
      return require(id.startsWith('../lib/') ? id.replace('../lib/', '../dist/lib/') : id)
    } }, { filename: path })
    return exports
  }
  const { ResourceDetail } = load('resource-detail.tsx')
  const button = text => [...document.querySelectorAll('button')].find(element => element.textContent === text)
  async function click(element) { assert.ok(element); await act(async () => element.click()) }
  async function reset({ kind = 'example-task', state = 'released', canEdit = true, capabilities = {} } = {}) {
    const fixture = graph(), document = kind === 'analysis-template' ? fixture.template : fixture.task
    item = { id: randomUUID(), kind, title: document.title, description: document.description, categories: [], features: [], requirements: [], state,
      releaseId: state === 'released' ? randomUUID() : null, version: state === 'released' ? document.version : null }
    if (kind === 'analysis-template') {
      const fields = dataset.definition.binding.output.fields
      document.content.inputSlots[0].fields[0].logicalType = fields.find(field => field.role === 'dimension').logicalType
      document.content.inputSlots[0].fields[1].logicalType = fields.find(field => field.role === 'measure').logicalType
    }
    detail = { document, capabilities: { canExport: true, canPublish: false, canWithdraw: false, reasons: [], ...capabilities },
      execution: { supportsInstantiation: true, canPrepareTask: true, reasons: [] } }
    changed = 0; closed = 0; failInsert = false; calls.length = 0; downloads.length = 0
    await act(async () => root.render(React.createElement(ResourceDetail, { key: ++mount, item, t: messages,
      data: { canEdit, datasets: [dataset], sources: [], page: 1, hasMore: false }, onClose() { closed++ }, onChanged() { changed++ } })))
  }
  async function choose(trigger, label) {
    assert.ok(trigger)
    await act(async () => trigger.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    await click([...document.querySelectorAll('[role=option]')].find(element => element.textContent === label))
  }
  await t.test('uninstalled entries stay informational and never fetch or prepare content', async () => {
    await reset({ state: 'planned' })
    assert.match(document.querySelector('[role=dialog]').textContent, new RegExp(messages.shellPlanned))
    assert.equal(calls.length, 0); assert.equal(button(messages.exploreUse), undefined)
  })
  await t.test('example preparation inserts files and skills without sending, and retry keeps the same intent', async () => {
    await reset(); failInsert = true
    await click(button(messages.exploreUse))
    assert.match(document.querySelector('[role=alert]').textContent, /COMPOSER_UNAVAILABLE/)
    await click(button(messages.exploreUse))
    const preparations = calls.filter(call => call.actionKey === 'resource-prepare-task')
    assert.equal(preparations.length, 2); assert.equal(preparations[0].input.requestId, preparations[1].input.requestId)
    const commands = calls.filter(call => call.type === 'invokeClientCommand')
    assert.ok(commands.every(call => call.commandKey === 'assistant.composer.insert'))
    assert.deepEqual(JSON.parse(JSON.stringify(commands.at(-1).payload)), draft)
    assert.equal(button(messages.exploreUse).disabled, true)
  })
  await t.test('read-only callers cannot prepare tasks or publish resources', async () => {
    await reset({ canEdit: false, capabilities: { canPublish: true } })
    assert.equal(button(messages.exploreUse).disabled, true)
    assert.equal(button(messages.catalogPublish), undefined)
  })
  await t.test('publication requires confirmation and withdrawal uses the selected fixed version', async () => {
    await reset({ capabilities: { canPublish: true } })
    await click(button(messages.catalogPublish)); await click(button(messages.cancel))
    assert.equal(calls.filter(call => call.actionKey === 'resource-publish').length, 0)
    await click(button(messages.catalogPublish)); await click(button(messages.catalogConfirmPublish))
    const publish = calls.find(call => call.actionKey === 'resource-publish')
    assert.equal(publish.input.confirmed, true); assert.equal(publish.input.releaseId, item.releaseId)
    assert.equal(changed, 1); assert.equal(closed, 1)
    await reset({ capabilities: { canWithdraw: true } }); await click(button(messages.catalogUnpublish))
    assert.equal(calls.find(call => call.actionKey === 'resource-withdraw').input.releaseId, item.releaseId)
  })
  await t.test('export obtains a host download grant for the selected release', async () => {
    await reset(); await click(button(messages.catalogExport))
    const grant = calls.find(call => call.type === 'requestFileAccess')
    assert.equal(grant.fileKey, `library-v2/${item.releaseId}`); assert.equal(grant.purpose, 'download')
    assert.deepEqual(downloads, [{ href: 'https://download.test/resource.zip', download: 'resource.zip' }])
  })
  await t.test('template preparation requires typed mappings and preserves the Dataset revision', async () => {
    await reset({ kind: 'analysis-template' })
    assert.equal(button(messages.exploreUse).disabled, true)
    await choose(document.querySelector('[role=combobox]'), dataset.name)
    const dimension = dataset.definition.binding.output.fields.find(field => field.role === 'dimension')
    const measure = dataset.definition.binding.output.fields.find(field => field.role === 'measure')
    await choose(document.querySelectorAll('[role=combobox]')[1], dimension.label)
    assert.equal(button(messages.exploreUse).disabled, true)
    await choose(document.querySelectorAll('[role=combobox]')[2], measure.label)
    assert.equal(button(messages.exploreUse).disabled, false)
    await click(button(messages.exploreUse))
    const request = calls.find(call => call.actionKey === 'resource-prepare-template').input
    assert.equal(request.releaseId, item.releaseId)
    assert.deepEqual(JSON.parse(JSON.stringify(request.inputs)), [{ slot: 'sales', mapping: { month: dimension.id, revenue: measure.id },
      source: { type: 'dataset', artifactId: dataset.artifactId, revision: dataset.revision } }])
    assert.equal(calls.at(-1).commandKey, 'assistant.composer.insert')
  })
})

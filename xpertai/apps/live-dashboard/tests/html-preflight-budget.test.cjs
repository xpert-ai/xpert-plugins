const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const vm = require('node:vm')
const { webcrypto } = require('node:crypto')
const { pathToFileURL } = require('node:url')
const path = require('node:path')

const hostPath = path.join(__dirname, '../dist/sandbox-actions/bundle/host.js')
const validator = import(pathToFileURL(path.join(__dirname, '../sandbox-actions/validate.mjs')).href)

// Run the shipped host (including its real request limits) without opening a browser.
// Only DOM/Playwright interactions are simulated; each gesture fans out to the saved Bindings.
class PreviewPage {
  constructor(input, fixture) {
    this.input = input
    this.fixture = fixture
    this.controls = { ...input.context.defaults }
    this.queries = 0
    this.gestures = []
    this.closed = false
    this.pending = []
    this.elapsed = 0
    this.handlers = new Map()
    this.buttonHandles = new Map()
    const page = this
    const document = { querySelector: selector => selector === 'iframe' ? frame : {} }
    const frame = { ownerDocument: document, setAttribute() {}, contentWindow: {} }
    document.defaultView = { addEventListener() {}, removeEventListener() {} }
    Object.defineProperty(frame, 'srcdoc', { set() { page.pending.push(() => page.queryAll()) } })
    this.scope = vm.createContext({
      crypto: webcrypto, URL, TextEncoder, window: {}, document,
      // All scenarios stay in the same wall-clock rate window; no clock reset bypass.
      Date: class extends Date { static now() { return 1000 } },
      MessageChannel: class {
        constructor() {
          this.port1 = {
            start() {}, close() {},
            postMessage(message) {
              if (message.type === 'refresh') page.pending.push(() => page.queryAll())
            }
          }
          this.port2 = { close() {} }
          page.port = this.port1
        }
      }
    })
    this.frame = { locator: selector => this.locator(selector) }
  }
  async route(pattern, handler) { this.routeHandler = handler }
  on(event, handler) { this.handlers.set(event, handler) }
  async setContent() {}
  async addScriptTag({ path }) {
    if (this.fixture.failSetup) throw Error('host bundle unavailable')
    vm.runInContext(await fs.readFile(path, 'utf8'), this.scope)
  }
  async evaluate(fn, argument) {
    if (this.closed) throw Error('page closed')
    this.scope.argument = argument
    const value = await vm.runInContext(`(${fn.toString()})(argument)`, this.scope)
    while (this.pending.length) await this.pending.shift()()
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
  }
  async waitForFunction(fn, argument) {
    if (!(await this.evaluate(fn, argument))) throw Error('condition not met')
  }
  async waitForLoadState() {
    if (this.fixture.hang) return new Promise((resolve, reject) => { this.cancelLoad = reject })
    if (!this.fixture.resourceDelay) return
    const request = { method: () => 'GET', resourceType: () => 'script',
      url: () => 'https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js', redirectedFrom: () => null }
    const response = { request: () => request, status: () => 200, url: request.url,
      headers: () => ({ 'content-type': 'text/javascript' }), body: async () => Buffer.from('/* fixture library */') }
    await this.routeHandler({ request: () => request,
      continue: async () => { this.elapsed += this.fixture.resourceDelay; this.handlers.get('response')(response) },
      fulfill: async () => { this.elapsed += 500; this.handlers.get('response')(response) },
      abort: async () => { throw Error('unexpected resource rejection') } })
  }
  async waitForTimeout(ms) { this.elapsed += ms }
  frames() { return [this.frame] }
  mainFrame() { return null }
  async close() {
    this.closed = true
    this.cancelLoad?.(Error('page closed'))
    this.scope.window.documentHost?.dispose()
  }
  async query(bindingId) {
    const requestId = `request-${++this.queries}`
    await this.port.onmessage({ data: { type: 'query', requestId, bindingId, controls: { ...this.controls } } })
  }
  async queryAll() {
    for (const id of this.input.context.bindingIds) {
      if (this.fixture.stalePanel && this.controls.first !== 0 && id === 'panel1') continue
      await this.query(id)
    }
  }
  locator(selector) {
    const page = this
    const names = Object.keys(this.input.context.defaults)
    if (selector === 'body') return { innerText: async () => 'Sales dashboard' }
    if (selector === 'script[src], link[rel~="stylesheet"][href]') return { evaluateAll: async () => [] }
    return {
      count: async () => selector === 'select' ? names.length : page.fixture.inserted && !page.dialogOpen ? 1 : page.fixture.buttons ?? 12,
      elementHandles: async () => Promise.all(Array.from({ length: page.fixture.inserted && !page.dialogOpen ? 1 : page.fixture.buttons ?? 12 }, (_, index) => page.locator('button').nth(index))),
      nth(index) {
        if (selector === 'button') {
          if (page.buttonHandles.has(index)) return page.buttonHandles.get(index)
          const button = {
          isVisible: async () => !page.fixture.hidden || index === 0 || !!page.dialogOpen,
          isEnabled: async () => !page.fixture.disabled || index === 0 || !!page.dialogOpen,
          async evaluate(fn, argument) { return fn(button, argument) },
          async click() {
            page.gestures.push(`button:${index}`)
            if (page.fixture.hidden || page.fixture.disabled || page.fixture.inserted) {
              if (index === 0) page.dialogOpen = true
              else await page.query('undeclared')
              return
            }
            if (page.fixture.throwOnClick) throw Error('detached button')
            if (page.fixture.burst) {
              for (let i = 0; i < 61; i++) await page.query('panel0')
            } else if (page.fixture.concurrentBurst) {
              await Promise.all(Array.from({ length: 9 }, () => page.query('panel0')))
            } else await page.queryAll()
          }
          }
          page.buttonHandles.set(index, button)
          return button
        }
        const name = names[index]
        return {
          isVisible: async () => true, isEnabled: async () => true,
          inputValue: async () => String(page.controls[name]),
          locator: () => ({ evaluateAll: async () => ['0', '1', '2', '3'] }),
          getAttribute: async attribute => attribute === 'data-dashboard-control' ? name : null,
          async selectOption(value) {
            page.gestures.push(`select:${name}:${value}`)
            page.controls[name] = page.fixture.invalidType ? value : Number(value)
            if (!page.fixture.localOnly) await page.queryAll()
          }
        }
      }
    }
  }
}

function scenario(bindingCount = 4, fixture = {}) {
  const bindingIds = Array.from({ length: bindingCount }, (_, i) => `panel${i}`)
  const defaults = { first: 0, second: 0, third: 0 }
  const input = {
    html: '<html><body>Sales dashboard</body></html>',
    context: { bindingIds, defaults, theme: 'light', locale: 'en' },
    datasets: Object.fromEntries(bindingIds.map(id => [id, { rows: [{ amount: '120' }] }])),
    parameters: Object.fromEntries(bindingIds.map(id => [id, Object.keys(defaults).map(controlId =>
      ({ controlId, type: 'number', defaultValue: 0, allowedValues: [0, 1, 2, 3] }))]))
  }
  const pages = []
  let closed = false, peakPages = 0
  const browser = { async newContext() { return {
    async newPage() {
      const page = new PreviewPage(input, { ...fixture, failSetup: fixture.failSetup && pages.length > 0 })
      pages.push(page)
      peakPages = Math.max(peakPages, pages.filter(page => !page.closed).length)
      return page
    },
    async close() { closed = true; for (const page of pages) if (!page.closed) await page.close() }
  } } }
  return { input, browser, pages, isClosed: () => closed, peakPages: () => peakPages }
}

for (const count of [4, 8]) test(`${count} Bindings keep all select/button/refresh checks without exhausting one document`, async () => {
  const { validateDocument } = await validator
  const fixture = scenario(count)
  const result = await validateDocument(fixture.input, fixture.browser, hostPath)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.deepEqual(result.requestedBindings, fixture.input.context.bindingIds)
  const gestures = fixture.pages.flatMap(page => page.gestures)
  for (const control of ['first', 'second', 'third']) {
    for (const value of [1, 2, 3, 0]) assert.equal(gestures.filter(g => g === `select:${control}:${value}`).length, 1)
  }
  for (let i = 0; i < 12; i++) assert.equal(gestures.filter(g => g === `button:${i}`).length, 1)
  assert(fixture.pages.reduce((sum, page) => sum + page.queries, 0) > 60)
  assert(fixture.pages.every(page => page.queries <= 60 && page.closed))
  assert.equal(fixture.peakPages(), 2)
  assert(fixture.isClosed())
})

test('scenario setup failures close every page and the context', async () => {
  const { validateDocument } = await validator
  const fixture = scenario(4, { failSetup: true })
  await assert.rejects(validateDocument(fixture.input, fixture.browser, hostPath), /host bundle unavailable/)
  assert(fixture.pages.every(page => page.closed))
  assert(fixture.isClosed())
})

for (const mode of ['burst', 'concurrentBurst']) test(`a single ${mode} is still rejected by the shipped host`, async () => {
  const { validateDocument } = await validator
  const fixture = scenario(4, { [mode]: true, buttons: 1 })
  const result = await validateDocument(fixture.input, fixture.browser, hostPath)
  assert.equal(result.ok, false)
  assert(result.errors.includes('DOCUMENT_QUERY_LIMIT'))
  assert(fixture.pages.every(page => page.closed))
  assert(fixture.isClosed())
})

for (const [mode, code] of [
  ['localOnly', 'DOCUMENT_CONTROL_QUERY_MISSING'],
  ['stalePanel', 'DOCUMENT_SHARED_CONTROL_NOT_PROPAGATED'],
  ['invalidType', 'DOCUMENT_CONTROL_VALUE_INVALID'],
  ['throwOnClick', 'DOCUMENT_BUTTON_INTERACTION_FAILED']
]) test(`scenario isolation retains ${code}`, async () => {
  const { validateDocument } = await validator
  const fixture = scenario(4, { [mode]: true, buttons: 1 })
  const result = await validateDocument(fixture.input, fixture.browser, hostPath)
  assert.equal(result.ok, false)
  assert(result.errors.some(error => error.includes(code)), JSON.stringify(result.errors))
  assert(fixture.pages.every(page => page.closed))
  assert(fixture.isClosed())
})

for (const mode of ['hidden', 'disabled', 'inserted']) test(`button paths reach a ${mode} action enabled by a prior click`, async () => {
  const { validateDocument } = await validator
  const fixture = scenario(1, { [mode]: true, buttons: 2 })
  const result = await validateDocument(fixture.input, fixture.browser, hostPath)
  assert.equal(result.ok, false)
  assert(result.errors.includes('DOCUMENT_BINDING_DENIED'))
  assert(fixture.pages.some(page => page.gestures.includes('button:0') && page.gestures.includes('button:1')))
  assert(fixture.pages.every(page => page.closed))
})

test('slow allowed resources are loaded once instead of spending the Action deadline on every mount', async () => {
  const { validateDocument } = await validator
  const fixture = scenario(4, { resourceDelay: 6000 })
  const result = await validateDocument(fixture.input, fixture.browser, hostPath)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  // Include the real waits; the initial page is serial, remaining pages run in pairs.
  let elapsed = fixture.pages[0].elapsed
  for (let index = 1; index < fixture.pages.length; index += 2)
    elapsed += Math.max(fixture.pages[index].elapsed, fixture.pages[index + 1]?.elapsed ?? 0)
  assert(elapsed < 55000, `preflight needs at least ${elapsed} ms, exceeding its Action budget`)
})

test('a stalled scenario returns a bounded failure and closes the context', async () => {
  const { validateDocument } = await validator
  const fixture = scenario(1, { hang: true })
  const result = await validateDocument(fixture.input, fixture.browser, hostPath, { timeoutMs: 20 })
  assert.equal(result.ok, false)
  assert(result.errors.includes('DOCUMENT_PREFLIGHT_TIMEOUT'))
  assert(fixture.pages.every(page => page.closed))
  assert(fixture.isClosed())
})

// Explicit live-network acceptance: node tests/html-online-browser.mjs /path/to/xpert-pro
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { validateDocument } from '../sandbox-actions/validate.mjs'
const require = createRequire(`${process.argv[2]}/packages/sandbox-runtime/images/browser/runtime/runner-host.mjs`)
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ headless: true })
const hostPath = fileURLToPath(new URL('../dist/sandbox-actions/bundle/host.js', import.meta.url))
const responses = []
const html = `<html><head><script src="https://cdn.tailwindcss.com/3.4.17"></script></head><body>
  <main id="styled" class="grid grid-cols-2 gap-4 bg-blue-600 p-6 text-white"><output>Loading</output>
  <button id="refresh" class="rounded-lg bg-emerald-600 p-2">Refresh</button></main>
  <script>(async()=>{const live=window.xpertLiveArtifact;
  live.subscribe('sales',d=>document.querySelector('output').textContent=d.rows[0].value);
  document.querySelector('#refresh').onclick=()=>live.refresh('sales');
  await live.ready();await live.query('sales',{});})()</script></body></html>`
const input = { html, context: { bindingIds: ['sales'], defaults: {}, locale: 'en', theme: 'light' },
  parameters: { sales: [] }, datasets: { sales: { rows: [{ value: 'fixture value' }] } } }
try {
  const observedBrowser = { async newContext(options) {
    const context = await browser.newContext(options)
    return { async newPage() {
      const page = await context.newPage()
      page.on('response', response => responses.push({ url: response.url(), status: response.status() }))
      return page
    }, close: () => context.close() }
  } }
  const preflight = await validateDocument(input, observedBrowser, hostPath)
  assert.equal(preflight.ok, true, JSON.stringify(preflight))
  assert.ok(responses.some(item => item.url === 'https://cdn.tailwindcss.com/3.4.17' && item.status === 200), `Tailwind must be fetched from its actual HTTPS CDN: ${JSON.stringify(responses)}`)
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setContent('<html><head></head><body><iframe style="width:100%;height:600px"></iframe></body></html>')
  await page.addScriptTag({ path: hostPath })
  await page.evaluate(input => {
    DocumentHost.installArtifactDocumentFramePolicy(document)
    window.queryCount = 0
    window.host = DocumentHost.mountArtifactDocument(document.querySelector('iframe'), {
      html: input.html, context: input.context,
      query: async () => ({ rows: [{ value: `query ${++window.queryCount}` }] })
    })
  }, input)
  const frame = page.frames()[1]
  await frame.waitForFunction(() => {
    const element = document.querySelector('#styled')
    return element && getComputedStyle(element).padding === '24px' && document.querySelector('output')?.textContent === 'query 1'
  }, null, { timeout: 20000 })
  const style = await frame.locator('#styled').evaluate(element => { const css = getComputedStyle(element); return { display: css.display, padding: css.padding, backgroundColor: css.backgroundColor, color: css.color } })
  assert.deepEqual(style, { display: 'grid', padding: '24px', backgroundColor: 'rgb(37, 99, 235)', color: 'rgb(255, 255, 255)' })
  await frame.locator('#refresh').click()
  await frame.waitForFunction(() => document.querySelector('output').textContent === 'query 2')
  await page.evaluate(() => window.host.refresh())
  await frame.waitForFunction(() => document.querySelector('output').textContent === 'query 3')
  assert.deepEqual(errors, [])
  const offline = await validateDocument(input, { newContext: options => browser.newContext({ ...options, offline: true }) }, hostPath)
  assert.equal(offline.ok, false)
  assert.ok(offline.errors.some(error => error.includes('DOCUMENT_RESOURCE_LOAD_FAILED') || error.includes('DOCUMENT_RESOURCE_NOT_LOADED')))
  console.log(JSON.stringify({ passed: true, browserVersion: browser.version(), preflight, responses, style, queryCount: await page.evaluate(() => window.queryCount), offline, fixtureData: true }))
} finally { await browser.close() }

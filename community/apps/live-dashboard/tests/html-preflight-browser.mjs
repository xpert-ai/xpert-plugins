// Real Chromium regression test: node tests/html-preflight-browser.mjs /path/to/xpert-pro
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { validateDocument } from '../sandbox-actions/validate.mjs'
const require = createRequire(`${process.argv[2]}/package.json`)
const { chromium } = require('playwright')
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const hostPath = fileURLToPath(new URL('../dist/sandbox-actions/bundle/host.js', import.meta.url))
const input = { context: { bindingIds: ['sales'], defaults: { region: null }, theme: 'light', locale: 'en' }, datasets: { sales: { rows: [{ amount: '120' }] } } }
const html = script => `<html><body><output>Loading</output><script>(async()=>{const live=window.xpertLiveArtifact;${script}})()</script></body></html>`
try {
  const good = await validateDocument({ ...input, html: html("live.subscribe('sales',d=>document.querySelector('output').textContent=d.rows[0].amount);await live.query('sales',{region:null});") }, browser, hostPath)
  assert.equal(good.ok, true); assert.deepEqual(good.requestedBindings, ['sales'])
  const missing = await validateDocument({ ...input, html: html("try{await live.query('totals',{})}catch{}") }, browser, hostPath)
  assert.equal(missing.ok, false); assert(missing.errors.includes('DOCUMENT_BINDING_DENIED'))
  const render = await validateDocument({ ...input, html: html("live.subscribe('sales',()=>{const row=null;document.querySelector('output').textContent=row.amount});await live.query('sales',{});") }, browser, hostPath)
  assert.equal(render.ok, false); assert(render.errors.some(x=>x.includes('null')))
  console.log(JSON.stringify({ passed: ['real Dataset render', 'caught undeclared Binding blocks save', 'render callback exception blocks save'] }))
} finally { await browser.close() }

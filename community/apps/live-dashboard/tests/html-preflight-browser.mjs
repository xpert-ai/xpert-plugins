// Real Chromium regression test: node tests/html-preflight-browser.mjs /path/to/xpert-pro
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
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
  const libraries = JSON.parse(await readFile(new URL('../dist/libraries/catalog.json', import.meta.url)))
  const echarts = libraries.find(item => item.id === 'echarts'), three = libraries.find(item => item.id === 'three')
  const chartHtml = `<html><body><output>Loading</output><div id="chart" style="width:600px;height:300px"></div><script>
    const chart=echarts.init(document.getElementById('chart'),null,{renderer:'svg'});
    const live=xpertLiveArtifact;live.subscribe('sales',d=>{chart.setOption({animation:false,xAxis:{type:'category',data:['Sales']},yAxis:{type:'value'},series:[{type:'bar',data:[Number(d.rows[0].amount)]}]});
    if(!document.querySelector('#chart svg path'))throw Error('ECHARTS_NOT_RENDERED');document.querySelector('output').textContent=d.rows[0].amount;});live.query('sales',{region:null});</script></body></html>`
  const chart = await validateDocument({ ...input, html: chartHtml, dependencies: [echarts] }, browser, hostPath)
  assert.equal(chart.ok, true, JSON.stringify(chart.errors))
  const missingLibrary = await validateDocument({ ...input, html: chartHtml }, browser, hostPath)
  assert.equal(missingLibrary.ok, false); assert(missingLibrary.errors.some(error=>error.includes('echarts')))
  const scene = await validateDocument({ ...input, dependencies: [three], html: html("const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));if(scene.children.length!==1)throw Error('THREE_NOT_READY');live.subscribe('sales',d=>document.querySelector('output').textContent=d.rows[0].amount);live.query('sales',{region:null});") }, browser, hostPath)
  assert.equal(scene.ok, true, JSON.stringify(scene.errors))
  console.log(JSON.stringify({ passed: ['real Dataset render', 'caught undeclared Binding blocks save', 'render callback exception blocks save', 'packaged ECharts renders SVG', 'missing library blocks save', 'packaged Three.js scene'] }))
} finally { await browser.close() }

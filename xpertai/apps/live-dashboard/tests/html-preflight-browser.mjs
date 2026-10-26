// Real Chromium regression test: node tests/html-preflight-browser.mjs /path/to/xpert-pro
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { validateDocument as runValidation } from '../sandbox-actions/validate.mjs'
let scenario = 0
async function validateDocument(...args) {
  const current = ++scenario
  let timer
  try {
    return await Promise.race([runValidation(...args), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`Preflight scenario ${current} timed out`)), 45000)
    })])
  } finally { clearTimeout(timer) }
}
const require = createRequire(`${process.argv[2]}/packages/sandbox-runtime/images/browser/runtime/runner-host.mjs`)
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ headless: true })
const hostPath = fileURLToPath(new URL('../dist/sandbox-actions/bundle/host.js', import.meta.url))
const input = { context: { bindingIds: ['sales'], defaults: { region: null }, theme: 'light', locale: 'en' }, datasets: { sales: { rows: [{ amount: '120' }] } } }
const html = script => `<html><body><output>Loading</output><script>(async()=>{const live=window.xpertLiveArtifact;${script}})()</script></body></html>`
const parameterCases = [
  { name: 'optional null bypasses scalar enum', parameter: { type: 'string', required: false, allowedValues: ['East'] }, defaults: { value: null }, ok: true },
  { name: 'missing control uses Binding default', parameter: { type: 'number', required: true, defaultValue: 7, allowedValues: [3, 7, 14] }, defaults: {}, ok: true },
  { name: 'missing optional enum resolves to null', parameter: { type: 'string', required: false, allowedValues: ['East'] }, defaults: {}, ok: true },
  { name: 'required control cannot be null', parameter: { type: 'number', required: true, allowedValues: [7] }, defaults: { value: null }, ok: false },
  { name: 'invalid calendar date rejected', parameter: { type: 'date' }, defaults: { value: '2026-02-30' }, ok: false },
  { name: 'valid leap date accepted', parameter: { type: 'date' }, defaults: { value: '2028-02-29' }, ok: true }
]
try {
  const good = await validateDocument({ ...input, html: html("live.subscribe('sales',d=>document.querySelector('output').textContent=d.rows[0].amount);await live.query('sales',{region:null});") }, browser, hostPath)
  assert.equal(good.ok, true); assert.deepEqual(good.requestedBindings, ['sales'])
  const missing = await validateDocument({ ...input, html: html("try{await live.query('totals',{})}catch{}") }, browser, hostPath)
  assert.equal(missing.ok, false); assert(missing.errors.includes('DOCUMENT_BINDING_DENIED'))
  const mismatch = await validateDocument({ ...input, context: { ...input.context, defaults: {} }, html: html("await live.query('sales',{region:null});") }, browser, hostPath)
  assert.equal(mismatch.ok, false); assert(mismatch.errors.some(error => error.includes('DOCUMENT_INITIAL_CONTROLS_MISMATCH')))
  const render = await validateDocument({ ...input, html: html("live.subscribe('sales',()=>{const row=null;document.querySelector('output').textContent=row.amount});await live.query('sales',{});") }, browser, hostPath)
  assert.equal(render.ok, false); assert(render.errors.some(x=>x.includes('null')))
  const enumInput = { context: { ...input.context, defaults: { days: 7 } },
    parameters: { sales: [{ controlId: 'days', type: 'number', required: true, defaultValue: 7, allowedValues: [3, 7, 14] }] },
    datasets: { sales: { rows: [{ date: '2026-10-18', amount: '120' }] } } }
  const selectHtml = script => `<html><body><label>Days<select id="days" data-dashboard-control="days"></select></label><output>Weather</output><script>(async()=>{const live=xpertLiveArtifact;const select=document.getElementById('days');${script}})()</script></body></html>`
  const enumSelect = await validateDocument({ ...enumInput, html: selectHtml("[3,7,14].forEach(value=>select.add(new Option(String(value),String(value))));select.value='7';select.onchange=()=>live.query('sales',{days:Number(select.value)});await live.query('sales',{days:7});") }, browser, hostPath)
  assert.equal(enumSelect.ok, true, JSON.stringify(enumSelect.errors))
  const wrongSelect = await validateDocument({ ...enumInput, html: selectHtml("live.bindSelect(select,{bindingId:'sales',controlId:'days',fieldId:'date'});await live.query('sales',{days:7});") }, browser, hostPath)
  assert.equal(wrongSelect.ok, false); assert(wrongSelect.errors.some(error => error.includes('DOCUMENT_CONTROL_VALUE_INVALID')))
  const stringNumber = await validateDocument({ ...enumInput, html: selectHtml("[3,7,14].forEach(value=>select.add(new Option(String(value),String(value))));select.value='7';select.onchange=()=>live.query('sales',{days:select.value});await live.query('sales',{days:7});") }, browser, hostPath)
  assert.equal(stringNumber.ok, false); assert(stringNumber.errors.some(error => error.includes('DOCUMENT_CONTROL_VALUE_INVALID')))
  const multiBinding = await validateDocument({ ...enumInput,
    context: { ...enumInput.context, bindingIds: ['sales', 'totals'], defaults: { days: 7, region: null } },
    parameters: { ...enumInput.parameters, totals: [{ controlId: 'region', type: 'string', required: false, defaultValue: null }] },
    datasets: { ...enumInput.datasets, totals: { rows: [{ total: '120' }] } },
    html: html("await live.query('sales',{});await live.query('totals',{});") }, browser, hostPath)
  assert.equal(multiBinding.ok, true, JSON.stringify(multiBinding.errors))
  const omittedPanel = await validateDocument({ ...enumInput,
    context: { ...enumInput.context, bindingIds: ['sales', 'totals'] },
    datasets: { ...enumInput.datasets, totals: { rows: [{ total: '120' }] } },
    html: html("await live.query('sales',{});") }, browser, hostPath)
  assert.equal(omittedPanel.ok, false)
  assert(omittedPanel.errors.some(error => error.includes('DOCUMENT_INITIAL_BINDING_MISSING: totals')))
  const delayedInitial = await validateDocument({ ...enumInput,
    context: { ...enumInput.context, bindingIds: ['sales', 'totals'] },
    parameters: { ...enumInput.parameters, totals: [] },
    datasets: { ...enumInput.datasets, totals: { rows: [{ total: '120' }] } },
    html: html("await live.query('sales',{});await new Promise(resolve=>setTimeout(resolve,700));await live.query('totals',{});") }, browser, hostPath)
  assert.equal(delayedInitial.ok, true, JSON.stringify(delayedInitial.errors))
  const refreshFailure = await validateDocument({ ...input,
    html: html("let renders=0;live.subscribe('sales',()=>{if(++renders>1)throw Error('BROKEN_REFRESH_RENDER');document.querySelector('output').textContent='Sales';});await live.query('sales',{});") }, browser, hostPath)
  assert.equal(refreshFailure.ok, false)
  assert(refreshFailure.errors.some(error => error.includes('BROKEN_REFRESH_RENDER')))
  const pageButton = script => `<html><body><button id="refresh">Refresh</button><output>Sales</output><script>(async()=>{const live=xpertLiveArtifact;live.subscribe('sales',d=>document.querySelector('output').textContent=d.rows[0].amount);await live.query('sales',{});document.getElementById('refresh').onclick=()=>{${script}};})()</script></body></html>`
  const missingRefreshId = await validateDocument({ ...input, html: pageButton('live.refresh();') }, browser, hostPath)
  assert.equal(missingRefreshId.ok, false)
  assert(missingRefreshId.errors.some(error => error.includes('DOCUMENT_BINDING_DENIED')))
  const validPageRefresh = await validateDocument({ ...input, html: pageButton("live.refresh('sales');") }, browser, hostPath)
  assert.equal(validPageRefresh.ok, true, JSON.stringify(validPageRefresh.errors))
  const sharedInput = { ...input,
    context: { ...input.context, bindingIds: ['sales', 'totals'] },
    parameters: Object.fromEntries(['sales', 'totals'].map(id => [id, [{ controlId: 'region', type: 'string', required: false, defaultValue: null }]])),
    datasets: { sales: { rows: [{ region: 'East', amount: '120' }] }, totals: { rows: [{ region: 'East', total: '120' }] } }
  }
  const sharedHtml = script => `<html><body><label>Region<select id="region" data-dashboard-control="region"></select></label><output>Sales</output><script>(async()=>{const live=xpertLiveArtifact;const select=document.getElementById('region');${script}})()</script></body></html>`
  const localOnly = await validateDocument({ ...sharedInput, html: sharedHtml("[null,'East'].forEach(v=>select.add(new Option(v??'All',JSON.stringify(v))));select.onchange=()=>{document.querySelector('output').textContent=select.value;};await live.query('sales',{});await live.query('totals',{});") }, browser, hostPath)
  assert.equal(localOnly.ok, false)
  assert(localOnly.errors.some(error => error.includes('DOCUMENT_CONTROL_QUERY_MISSING')))
  const unmarkedSelect = await validateDocument({ ...sharedInput,
    html: sharedHtml("[null,'East'].forEach(v=>select.add(new Option(v??'All',JSON.stringify(v))));await live.query('sales',{});await live.query('totals',{});").replace('data-dashboard-control="region"', '') }, browser, hostPath)
  assert.equal(unmarkedSelect.ok, false)
  assert(unmarkedSelect.errors.some(error => error.includes('DOCUMENT_SELECT_BINDING_REQUIRED')))
  const presentationSelect = await validateDocument({ ...sharedInput,
    html: sharedHtml("['bar','line'].forEach(v=>select.add(new Option(v,v)));select.onchange=()=>{document.querySelector('output').textContent=select.value;};await live.query('sales',{});await live.query('totals',{});").replace('data-dashboard-control="region"', 'data-dashboard-presentation') }, browser, hostPath)
  assert.equal(presentationSelect.ok, true, JSON.stringify(presentationSelect.errors))
  const stalePanel = await validateDocument({ ...sharedInput, html: sharedHtml("live.bindSelect(select,{bindingId:'sales',controlId:'region',fieldId:'region'});await live.query('sales',{});await live.query('totals',{});") }, browser, hostPath)
  assert.equal(stalePanel.ok, false)
  assert(stalePanel.errors.some(error => error.includes('DOCUMENT_SHARED_CONTROL_NOT_PROPAGATED') && error.includes('totals')))
  const sharedSelect = await validateDocument({ ...sharedInput, html: sharedHtml("[null,'East'].forEach(v=>select.add(new Option(v??'All',JSON.stringify(v))));select.onchange=()=>Promise.all(['sales','totals'].map(id=>live.query(id,{region:JSON.parse(select.value)})));await live.query('sales',{});await live.query('totals',{});") }, browser, hostPath)
  assert.equal(sharedSelect.ok, true, JSON.stringify(sharedSelect.errors))
  const delayedPanel = await validateDocument({ ...sharedInput, html: sharedHtml("[null,'East'].forEach(v=>select.add(new Option(v??'All',JSON.stringify(v))));select.onchange=async()=>{const region=JSON.parse(select.value);await live.query('sales',{region});await new Promise(resolve=>setTimeout(resolve,300));await live.query('totals',{region});};await live.query('sales',{});await live.query('totals',{});") }, browser, hostPath)
  assert.equal(delayedPanel.ok, true, JSON.stringify(delayedPanel.errors))
  const independentSelect = await validateDocument({ ...sharedInput,
    context: { ...sharedInput.context, defaults: { region: null, otherRegion: null } },
    parameters: { ...sharedInput.parameters, totals: [{ controlId: 'otherRegion', type: 'string', required: false, defaultValue: null }] },
    html: sharedHtml("live.bindSelect(select,{bindingId:'sales',controlId:'region',fieldId:'region'});await live.query('sales',{});await live.query('totals',{});") }, browser, hostPath)
  assert.equal(independentSelect.ok, true, JSON.stringify(independentSelect.errors))
  const unrelatedBinding = await validateDocument({ ...sharedInput,
    parameters: { ...sharedInput.parameters, totals: [] },
    html: sharedHtml("[null,'East'].forEach(v=>select.add(new Option(v??'All',JSON.stringify(v))));select.onchange=()=>live.query('totals',{region:JSON.parse(select.value)});await live.query('sales',{});await live.query('totals',{});") }, browser, hostPath)
  assert.equal(unrelatedBinding.ok, false)
  assert(unrelatedBinding.errors.some(error => error.includes('DOCUMENT_CONTROL_QUERY_MISSING')))
  for (const entry of parameterCases) {
    const result = await validateDocument({ ...input, context: { ...input.context, defaults: entry.defaults },
      parameters: { sales: [{ controlId: 'value', ...entry.parameter }] }, html: html("await live.query('sales',{});") }, browser, hostPath)
    assert.equal(result.ok, entry.ok, `${entry.name}: ${JSON.stringify(result.errors)}`)
    if (!entry.ok) assert(result.errors.some(error => error.includes('DOCUMENT_CONTROL_VALUE_INVALID')), entry.name)
  }
  const disabledOptions = await validateDocument({ ...enumInput, html: selectHtml("select.innerHTML='<option value=7>7</option><optgroup disabled label=Unavailable><option value=99>99</option></optgroup><option value=14>14</option>';select.onchange=()=>live.query('sales',{days:Number(select.value)});await live.query('sales',{});") }, browser, hostPath)
  assert.equal(disabledOptions.ok, true, JSON.stringify(disabledOptions.errors))
  const emptySelect = await validateDocument({ ...enumInput, html: selectHtml("await live.query('sales',{});") }, browser, hostPath)
  assert.equal(emptySelect.ok, false)
  assert(emptySelect.errors.some(error => error.includes('DOCUMENT_SELECT_OPTIONS_MISSING')))
  assert(!emptySelect.errors.some(error => error.includes('DOCUMENT_SELECT_RESTORE_FAILED')))
  const disabledEmpty = await validateDocument({ ...enumInput, html: selectHtml("select.disabled=true;await live.query('sales',{});") }, browser, hostPath)
  assert.equal(disabledEmpty.ok, true, JSON.stringify(disabledEmpty.errors))
  const presentationEmpty = await validateDocument({ ...enumInput, html: selectHtml("await live.query('sales',{});").replace('data-dashboard-control="days"', 'data-dashboard-presentation') }, browser, hostPath)
  assert.equal(presentationEmpty.ok, true, JSON.stringify(presentationEmpty.errors))
  const libraries = JSON.parse(await readFile(new URL('../dist/libraries/catalog.json', import.meta.url)))
  const echarts = libraries.find(item => item.id === 'echarts'), three = libraries.find(item => item.id === 'three')
  const lifecycle = await readFile(new URL('../skills/live-dashboard/references/html-lifecycle.md', import.meta.url), 'utf8')
  const starter = lifecycle.match(/```html\n([\s\S]+?)\n```/)[1].replace('REPLACE_BINDING_ID', 'sales')
  const unfinished = await validateDocument({ ...input, html: starter, dependencies: [echarts] }, browser, hostPath)
  assert.equal(unfinished.ok, false)
  assert(unfinished.errors.some(error => error.includes('Implement render')))
  const implemented = starter.replace("throw new Error('Implement render(entry, state, dataset) using verified fields');",
    "state.status.textContent=String(dataset.rows.length);state.chart.setOption({animation:false,xAxis:{type:'category',data:['Sales']},yAxis:{type:'value'},series:[{type:'bar',data:[Number(dataset.rows[0].amount)]}]},{notMerge:true});")
  const lifecycleResult = await validateDocument({ ...input, html: implemented, dependencies: [echarts] }, browser, hostPath)
  assert.equal(lifecycleResult.ok, true, JSON.stringify(lifecycleResult.errors))
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
  console.log(JSON.stringify({ passed: ['real Dataset render', 'caught undeclared Binding blocks save', 'actionable control default mismatch', 'render callback exception blocks save', 'typed enum selects', 'Dataset options cannot replace enum values', 'numeric select must preserve number type', 'page-wide controls with multiple Bindings', 'every declared Binding initially queried', 'delayed initial panel supported', 'unfinished skill example blocks save', 'implemented skill lifecycle runs', 'refresh renderer failures block save', 'button refresh requires Binding ID', 'page refresh button runs', 'data select cannot only filter cached rows', 'native select intent must be explicit', 'presentation selects need no data query', 'shared filter cannot leave stale panels', 'shared filter fans out to every Binding', 'shared filter waits for delayed panels', 'independent filters use distinct IDs', 'filter must query a Binding that declares its control', ...parameterCases.map(entry => entry.name), 'disabled optgroup options skipped', 'empty enabled data select rejected', 'disabled empty select allowed', 'empty presentation select allowed', 'packaged ECharts renders SVG', 'missing library blocks save', 'packaged Three.js scene'] }))
} finally { await browser.close() }

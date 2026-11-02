// Real browser + production document SDK + file provider. No platform login is simulated.
// Usage: node tests/example-browser.mjs /path/to/platform [--screenshots]
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { validateDocument } from '../sandbox-actions/validate.mjs'
const require = createRequire(import.meta.url)
const platform = createRequire(`${process.argv[2]}/package.json`)
const { chromium } = platform('playwright-core')
const { datasetSchema, payloadSchema } = require('../../../tools/analytics-files/dist/lib/schema')
const { readRows } = require('../../../tools/analytics-files/dist/lib/readers')
const { executeQuery } = require('../../../tools/analytics-files/dist/lib/query')
const { bundledLibraries } = require('../dist/lib/document-libraries')
const { toDataAnalyticsPayload } = require('../dist/lib/renderer')
const { dashboardSchema } = require('../dist/lib/dashboard.schema')
const { normalizeAnalyticsResult } = require('@xpert-ai/plugin-sdk/analytics')
const root = new URL('../skills/live-dashboard/examples/', import.meta.url)
const json = async p => JSON.parse(await readFile(new URL(p,root),'utf8'))
const catalog = await json('catalog.json')
const dependencies = (await bundledLibraries()).filter(a=>a.id==='echarts')
const hostPath = fileURLToPath(new URL('../dist/sandbox-actions/bundle/host.js',import.meta.url))
const browser = await chromium.launch({headless:true})
const reports=[]
try {
for (const recipe of catalog.examples.filter(recipe=>recipe.dataMode==='synthetic-demo')) {
  const data=await json(recipe.key+'/definition.json'), query=await json(recipe.key+'/query.json'), expected=await json(recipe.key+'/expected.json')
  const {path:runtimePath,...definition}=data
  const dataset=datasetSchema.parse({...definition,id:'dataset',revision:'initial',file:{catalog:'projects',projectId:'11111111-1111-4111-8111-111111111111',filePath:runtimePath}})
  const rows=await readRows(await readFile(new URL(recipe.key+'/demo.csv',root)),dataset)
  const jsonRows=await readRows(await readFile(new URL(recipe.key+'/demo.json',root)),{...dataset,reader:{format:'json',rowsPath:[]}})
  assert.deepEqual(rows,jsonRows)
  const payload=payloadSchema.parse({datasetId:'dataset',revision:'initial',contractHash:'0'.repeat(64),...query.payloadFields})
  const fields=dataset.columns.map(({key,path,label,logicalType,nullable,role,unit})=>({id:key,sourceField:key,label,logicalType,nullable,role,...(unit?{unit}:{})}))
  const binding={id:'example',providerId:'file.table',operation:'query',contractVersion:1,source:{kind:'data-source',dataSourceId:'22222222-2222-4222-8222-222222222222'},payload,parameters:query.parameters,output:{datasetId:'example',grain:query.grain,fields}}
  let fail=false, incomplete=false, empty=false
  const control=query.controls[0].controlId
  function get(controls) {
    if(fail) throw Error('Intentional unavailable source')
    const result=executeQuery(empty?[]:rows,dataset,payload,controls,50000)
    const normalized=normalizeAnalyticsResult(binding,{...result,sourceFetchedAt:'2026-01-04T00:00:00Z'},'fixture',50000)
    if(incomplete) normalized.completeness.truncated=true
    return normalized
  }
  const defaults={[control]:null}
  const sums=d=>Object.fromEntries(fields.filter(f=>f.role==='measure').map(f=>[f.id,d.rows.reduce((s,r)=>s+Number(r[f.id]),0)]))
  for(const [value,want] of [[null,expected.all],...Object.entries(expected.filtered)]) {
    const actual=sums(get({[control]:value}))
    for(const [key,total] of Object.entries(want)) assert.ok(Math.abs((key==='yieldPercent'?actual.good/actual.produced*100:actual[key])-total)<1e-8,`${recipe.key}:${value}:${key}`)
  }
  if(recipe.mode==='standard') {
    const create=await json(recipe.source)
    const manifest=dashboardSchema.parse({schema:'xpert.live-dashboard',id:'33333333-3333-4333-8333-333333333333',title:create.title,bindings:[binding],controls:create.controls,charts:create.charts.map(c=>({...c,datasetId:'example'})),tables:create.tables.map(c=>({...c,datasetId:'example'}))})
    const payload=toDataAnalyticsPayload(manifest,[get(defaults)])
    assert.equal(payload.snapshot.datasets.example.length,4)
    const renderer=await readFile(new URL('../dist/remote/renderer.html',import.meta.url),'utf8')
    const page=await browser.newPage({viewport:{width:1280,height:900}})
    const escaped=JSON.stringify(payload).replace(/</g,'\\u003c')
    const setup=`<script>window.__DATASCIENCE_ARTIFACT_HOSTING__={mode:'site_creator',readOnly:true,controls:{edit:false,exportHostedLink:false,hostedLink:false}};window.xpertai={toolOutput:${escaped},toolResponseMetadata:${escaped},availableDisplayModes:['inline','fullscreen'],displayMode:'fullscreen',hostContext:{availableDisplayModes:['inline','fullscreen'],displayMode:'fullscreen'}};window.__datascienceArtifactFetchShimInstalled=true;window.fetch=async function(input){const path=new URL(typeof input==='string'?input:input.url,'https://renderer.invalid').pathname;const p=window.xpertai.toolOutput;const data={'/api/manifest':p.manifest,'/api/snapshot':p.snapshot,'/api/package':{manifestPath:'example',snapshotPath:'demo'}};return new Response(JSON.stringify(data[path]),{headers:{'Content-Type':'application/json'}})};<\/script>`
    await page.setContent(renderer.replace('<head>','<head>'+setup))
    await page.getByText('销售明细 · 演示数据',{exact:true}).waitFor()
    if(process.argv.includes('--screenshots')) await page.screenshot({path:fileURLToPath(new URL(recipe.preview,root)),fullPage:true})
    await page.close()
    reports.push({key:recipe.key,queries:'all + configured filters',standardSchema:true})
    continue
  }
  const html=await readFile(new URL(recipe.source,root),'utf8')
  const context={bindingIds:['example'],defaults,theme:'light',locale:'zh-Hans'}
  const preflight=await validateDocument({html,context,dependencies,datasets:{example:get(defaults)},parameters:{example:query.parameters}},browser,hostPath)
  assert.equal(preflight.ok,true,JSON.stringify(preflight))
  const page=await browser.newPage({viewport:{width:1280,height:1040}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.exposeFunction('queryExample', request=>get(request.controls))
  await page.setContent('<html><body style="margin:0"><iframe style="border:0;width:100%;height:1040px"></iframe></body></html>')
  await page.addScriptTag({path:hostPath})
  await page.evaluate(({html,context,dependencies})=>{
    DocumentHost.installArtifactDocumentFramePolicy(document)
    window.host=DocumentHost.mountArtifactDocument(document.querySelector('iframe'),{html,context,dependencies,query:request=>window.queryExample(request),onError:()=>{}})
  },{html,context,dependencies})
  const frame=page.frameLocator('iframe')
  await frame.locator('#rows tr').first().waitFor()
  const metric=recipe.key==='sales-overview'?'amount':'produced'
  for(const value of [null,...Object.keys(expected.filtered),null]) {
    await frame.locator('#scope').selectOption(JSON.stringify(value))
    const want=(value===null?expected.all:expected.filtered[value])[metric]
    await platform('@playwright/test').expect(frame.locator('#'+metric)).toHaveText(new Intl.NumberFormat('zh-CN').format(want))
    assert.equal(await frame.locator('#rows tr').count(),get({[control]:value}).rows.length)
    const plots=await page.frames()[1].evaluate(()=>['trend','breakdown'].map(id=>echarts.getInstanceByDom(document.getElementById(id)).getOption().series[0].data))
    assert.ok(plots.every(values=>values.length>0))
    await page.evaluate(()=>window.host.refresh())
    await platform('@playwright/test').expect(frame.locator('#'+metric)).toHaveText(new Intl.NumberFormat('zh-CN').format(want))
  }
  if(process.argv.includes('--screenshots')) await page.screenshot({path:fileURLToPath(new URL(recipe.preview,root)),fullPage:true})
  empty=true;await page.evaluate(()=>window.host.refresh());await platform('@playwright/test').expect(frame.locator('#feedback')).toContainText('没有数据');assert.equal(await frame.locator('#rows tr').count(),0);empty=false
  incomplete=true;await page.evaluate(()=>window.host.refresh());await platform('@playwright/test').expect(frame.locator('#feedback')).toContainText('不完整');incomplete=false
  fail=true;await frame.locator('#scope').selectOption(JSON.stringify(Object.keys(expected.filtered)[0]));await platform('@playwright/test').expect(frame.locator('#feedback')).toContainText('查询失败');assert.equal(await frame.locator('#rows tr').count(),0);fail=false
  await page.setViewportSize({width:390,height:844});await frame.locator('#scope').selectOption('null');await frame.locator('#rows tr').first().waitFor()
  assert.equal(await page.frames()[1].evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.deepEqual(errors,[])
  reports.push({key:recipe.key,preflight:true,filters:true,refresh:true,empty:true,incomplete:true,error:true,mobile:true})
  await page.close()
}
console.log(JSON.stringify(reports,null,2))
} finally {await browser.close()}

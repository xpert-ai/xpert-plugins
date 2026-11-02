// Production document SDK with independent packaged baselines, not a simulated platform login.
// Usage: node tests/superstore-browser.mjs /path/to/xpert-pro [--screenshots]
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { validateDocument } from '../sandbox-actions/validate.mjs'
const require = createRequire(import.meta.url)
const platform = createRequire(`${process.argv[2]}/package.json`)
const { chromium } = platform('playwright-core')
const { expect } = platform('@playwright/test')
const { bundledLibraries } = require('../dist/lib/document-libraries')
const root = new URL('../skills/live-dashboard/examples/superstore/', import.meta.url)
const read = async name => JSON.parse(await readFile(new URL(name,root),'utf8'))
const expected = await read('expected.json')
const catalog = await bundledLibraries()
const themes={overview:'trend-workspace',profitability:'profit-atlas',customers:'customer-brief'}
const hostPath = fileURLToPath(new URL('../dist/sandbox-actions/bundle/host.js',import.meta.url))
const browser = await chromium.launch({headless:true})
const reports=[]
try {
  for(const key of ['overview','profitability','customers']) {
    const dependencies=catalog.filter(item=>['echarts',themes[key]].includes(item.id))
    const plan=await read(key+'.queries.json'),html=await readFile(new URL(key+'.html',root),'utf8')
    const defaults={year:'',region:'',category:''},ids=plan.bindings.map(binding=>binding.id)
    let fail=false,incomplete=false,empty=false
    const calls=[]
    function dataset(id,controls) {
      calls.push({id,controls})
      if(fail)throw Error('Intentional denied source')
      const match=Object.values(expected.cases).find(c=>
        (c.filters.order_year??'')===controls.year&&(c.filters.region??'')===controls.region&&(c.filters.category??'')===controls.category)
      assert.ok(match,'test case has an independent baseline')
      const testCase=empty?expected.cases.empty:match
      const binding=plan.bindings.find(b=>b.id===id),dimension=binding.output.grain[0]
      const rows=dimension?testCase.groups[dimension]:[testCase.totals]
      return {id,fields:binding.output.fields,grain:binding.output.grain,
        rows:rows.map(row=>Object.fromEntries(binding.output.fields.map(field=>[field.id,typeof row[field.id]==='number'?String(row[field.id]):row[field.id]]))),
        completeness:{returnedRows:rows.length,totalRows:rows.length,totalAccuracy:'exact',scope:'full_query_result',truncated:incomplete},
        freshness:{sourceFetchedAt:'2026-11-01T00:00:00Z'},provenance:{providerId:'data-xpert.ontology'}}
    }
    const context={bindingIds:ids,defaults,theme:'light',locale:'zh-Hans'}
    const result=await validateDocument({html,context,dependencies,
      datasets:Object.fromEntries(ids.map(id=>[id,dataset(id,defaults)])),
      parameters:Object.fromEntries(plan.bindings.map(b=>[b.id,b.parameters]))},browser,hostPath)
    assert.equal(result.ok,true,JSON.stringify(result))
    const page=await browser.newPage({viewport:{width:1440,height:1050}})
    const errors=[];page.on('pageerror',e=>errors.push(e.message))
    await page.exposeFunction('querySuperstore',request=>dataset(request.bindingId,request.controls))
    await page.setContent('<html><body style="margin:0"><iframe style="border:0;width:100%;height:1050px"></iframe></body></html>')
    await page.addScriptTag({path:hostPath})
    await page.evaluate(({html,context,dependencies})=>{
      DocumentHost.installArtifactDocumentFramePolicy(document)
      window.host=DocumentHost.mountArtifactDocument(document.querySelector('iframe'),{html,context,dependencies,query:request=>window.querySuperstore(request),onError:()=>{},onBusy:busy=>{window.queryBusy=busy}})
    },{html,context,dependencies})
    const frame=page.frameLocator('iframe')
    const pick=async(control,value)=>{
      const label=await frame.locator('#filter-'+control+' option').evaluateAll((opts,v)=>opts.find(o=>o.value===JSON.stringify(v)).textContent,value)
      await frame.locator('#filter-'+control+'-trigger').click()
      await frame.getByRole('option',{name:label,exact:true}).click()
    }
    const metric=key==='customers'?'Customers':'Sales'
    const format=value=>new Intl.NumberFormat('en-US',{minimumFractionDigits:metric==='Sales'?2:0,maximumFractionDigits:metric==='Sales'?2:0}).format(Number(value))
    await expect(frame.locator('#metric-0')).toHaveText(format(expected.cases.all.totals[metric]))
    await expect(frame.locator('body')).toHaveAttribute('data-dashboard-theme',themes[key]+'@1')
    if(key==='profitability'){
      const scatter=await frame.locator('#chart-secondary').boundingBox(), ranking=await frame.locator('#chart-primary').boundingBox()
      assert.ok(scatter.x<ranking.x&&scatter.width>ranking.width,'dominant scatter is left of the signed ranking')
    }
    if(key==='customers'){
      const share=await frame.locator('#metric-4').boundingBox(), count=await frame.locator('#metric-3').boundingBox()
      assert.ok(share.x<count.x,'return share precedes return count without changing metric IDs')
    }
    const regionTrigger=frame.locator('#filter-region-trigger')
    await expect(regionTrigger).toBeEnabled()
    const beforeKeyboard=calls.length
    await regionTrigger.focus();await regionTrigger.press('ArrowDown');await regionTrigger.press('End')
    await expect(regionTrigger).toHaveAttribute('aria-expanded','true')
    await expect(frame.getByRole('option',{name:'全部区域',exact:true})).toHaveAttribute('aria-selected','true')
    assert.equal(calls.length,beforeKeyboard,'navigation does not prematurely apply a filter')
    await regionTrigger.press('Escape');await expect(regionTrigger).toBeFocused()
    await expect(regionTrigger).toHaveAttribute('aria-expanded','false')
    await regionTrigger.press('w');await regionTrigger.press('Enter')
    await expect(frame.locator('#metric-0')).toHaveText(format(expected.cases.west.totals[metric]))
    await pick('region','');await expect(frame.locator('#metric-0')).toHaveText(format(expected.cases.all.totals[metric]))
    await regionTrigger.click();await frame.locator('h1').click();await expect(regionTrigger).toHaveAttribute('aria-expanded','false')
    if(process.argv.includes('--screenshots')){
      await page.screenshot({path:fileURLToPath(new URL(key+'.png',root)),fullPage:true,animations:'disabled'})
      await regionTrigger.click();await page.screenshot({path:fileURLToPath(new URL(key+'-select.png',root)),fullPage:true,animations:'disabled'});await regionTrigger.press('Escape')
    }
    for(const [control,value,caseName]of [['region','West','west'],['region','East','east'],['region','','all'],['year','2024','year2024'],['year','','all'],['category','Furniture','furniture'],['category','','all']]){
      calls.length=0
      await pick(control,value)
      await expect(frame.locator('#metric-0')).toHaveText(format(expected.cases[caseName].totals[metric]))
      assert.deepEqual([...new Set(calls.map(c=>c.id))].sort(),[...ids].sort(),key+': shared filter fan-out')
      assert.ok(calls.every(c=>c.controls[control]===value))
      const series=await page.frames()[1].evaluate(()=>[...document.querySelectorAll('.chart')].map(el=>el.id).map(id=>echarts.getInstanceByDom(document.getElementById(id)).getOption().series))
      assert.ok(series.every(s=>s.length&&s.every(x=>x.data.length)))
    }
    // Isolate recovery scenarios in a fresh document. The production host intentionally
    // limits a document to 60 requests/minute; rapid test loops must not relax that guard.
    await page.evaluate(({html,context,dependencies})=>{
      window.host.dispose()
      window.host=DocumentHost.mountArtifactDocument(document.querySelector('iframe'),{html,context,dependencies,query:request=>window.querySuperstore(request),onError:()=>{},onBusy:busy=>{window.queryBusy=busy}})
    },{html,context,dependencies})
    await expect(frame.locator('#metric-0')).toHaveText(format(expected.cases.all.totals[metric]))
    const refresh=async()=>{const before=calls.length;await page.evaluate(()=>window.host.refresh());await expect.poll(()=>calls.length).toBeGreaterThanOrEqual(before+ids.length);await expect.poll(()=>page.evaluate(()=>window.queryBusy)).toBe(false)}
    await refresh();await expect(frame.locator('#metric-0')).toHaveText(format(expected.cases.all.totals[metric]))
    incomplete=true;await refresh();await expect(frame.locator('#status')).toContainText('不完整');assert.equal(await frame.locator('#details-rows tr').count(),0);incomplete=false
    await refresh();await expect(frame.locator('#metric-0')).toHaveText(format(expected.cases.all.totals[metric]))
    empty=true;await refresh();await expect(frame.locator('#status')).toContainText('没有订单');empty=false
    fail=true;await pick('region','West');await expect(frame.locator('#status')).toContainText('查询未完成');assert.equal(await frame.locator('#details-rows tr').count(),0);fail=false
    await pick('region','');await expect(frame.locator('#metric-0')).toHaveText(format(expected.cases.all.totals[metric]))
    await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.frames()[1].evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await regionTrigger.click()
    const bounds=await frame.locator('#filter-region-listbox').boundingBox()
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390,'menu fits narrow viewport')
    await regionTrigger.press('Tab');await expect(regionTrigger).toHaveAttribute('aria-expanded','false')
    await page.frames()[1].evaluate(()=>document.body.classList.add('dark'))
    await refresh();await expect(frame.locator('#metric-0')).toHaveText(format(expected.cases.all.totals[metric]))
    if(process.argv.includes('--screenshots'))await page.screenshot({path:fileURLToPath(new URL(key+'-mobile-dark.png',root)),fullPage:true,animations:'disabled'})
    assert.deepEqual(errors,[]);reports.push({key,preflight:true,filters:true,allBindingsUpdated:true,refresh:true,empty:true,incomplete:true,error:true,mobile:true,dark:true,keyboard:true,customSelect:true,menuBounds:true})
    await page.close()
  }
  console.log(JSON.stringify(reports,null,2))
} finally { await browser.close() }

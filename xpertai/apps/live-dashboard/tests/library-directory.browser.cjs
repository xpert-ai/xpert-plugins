/* Production iframe + real plugin services/PostgreSQL. SDK storage/composer are fixtures, not live acceptance. */
require('reflect-metadata')
const http = require('node:http'), assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto'), { writeFile, mkdir } = require('node:fs/promises'), { join } = require('node:path')
const { DataSource } = require('typeorm')
const { entities } = require('./library-v2-fixture.cjs')
const { executionFixture } = require('./library-execution-fixture.cjs')
const { LibraryDirectoryService } = require('../dist/lib/library/directory.service')
const { DashboardLibraryViewProvider } = require('../dist/lib/library-view.provider')
const { buildExplorePackage } = require('../scripts/explore-package.cjs')
const { buildHotelPackage } = require('../scripts/hotel-package.cjs')
const { encodePackage } = require('../dist/lib/library/archive')
async function main() {
  const url=process.env.LIVE_DASHBOARD_LIBRARY_TEST_DATABASE_URL, output=process.env.LIBRARY_BROWSER_OUTPUT
  if(!url||!output||!process.env.BROWSER_AUTOMATION_MODULE)throw Error('Set LIVE_DASHBOARD_LIBRARY_TEST_DATABASE_URL, LIBRARY_BROWSER_OUTPUT and BROWSER_AUTOMATION_MODULE (puppeteer).')
  const browserApi=require(process.env.BROWSER_AUTOMATION_MODULE)
  const schema=`directory_browser_${randomUUID().replaceAll('-','')}`
  const db=new DataSource({type:'postgres',url,schema,entities:entities.LIBRARY_V2_ENTITIES,synchronize:false,extra:{options:`-c search_path=${schema},public`}})
  let browser, server
  try {
  // Each run owns a new output directory and one random schema; never reuse business tables.
  await mkdir(output,{recursive:false})
  await db.initialize();await db.query(`CREATE SCHEMA "${schema}"`);await db.synchronize()
  // A previously imported hotel version lets the UI exercise reuse + upgrade as well as new resources.
  const f=await executionFixture(db,encodePackage(buildHotelPackage())), directory=new LibraryDirectoryService(f.catalog), commands=[], requests=[], failures=[]
  const resolved=await f.resolution.template(f.context,f.request()),bound=await f.bindings.bind(f.context,resolved.inputs[0],resolved.template.content.inputSlots[0],randomUUID())
  const dataset={artifactId:randomUUID(),revision:1,name:'酒店演示数据集',description:'Synthetic browser fixture',providerId:bound.binding.providerId,source:bound.binding.source,fields:bound.binding.output.fields.length,
    definition:{schema:'xpert.live-dashboard.dataset',id:randomUUID(),name:'酒店演示数据集',description:'Synthetic browser fixture',binding:bound.binding,controls:{}}}
  f.custom.set(dataset.artifactId,dataset)
  const library={async list(){return {items:[dataset],hasMore:false}},async open(_,id){assert.equal(id,dataset.artifactId);return dataset}}
  const provider=new DashboardLibraryViewProvider(f.dashboards,library,{},f.catalog,f.transfers,f.execution,f.tasks,directory)
  const packagePath=join(output,'explore-insights.xpert-library.zip');await writeFile(packagePath,encodePackage(buildExplorePackage()),{flag:'wx'})
  server=http.createServer(async(req,res)=>{
    try {
      const u=new URL(req.url,'http://fixture'), page=u.searchParams.get('page')||'templates'
      if(!['templates','explore','data'].includes(page))throw Error('BAD_PAGE')
      const context={...f.context,readonly:u.searchParams.get('readonly')==='true'}
      const theme={mode:u.searchParams.get('theme')==='dark'?'dark':'light',density:'compact',tokens:u.searchParams.get('theme')==='dark'?{
        'color.background':'#09090b','color.foreground':'#fafafa','color.card':'#18181b','color.cardForeground':'#fafafa',
        'color.popover':'#18181b','color.popoverForeground':'#fafafa','color.muted':'#27272a','color.mutedForeground':'#a1a1aa',
        'color.secondary':'#27272a','color.secondaryForeground':'#fafafa','color.primary':'#fafafa','color.primaryForeground':'#18181b',
        'color.accent':'#27272a','color.accentForeground':'#fafafa','color.border':'#3f3f46','color.input':'#3f3f46'}:{}}
      res.setHeader('Cache-Control','no-store')
      if(u.pathname==='/view'){res.setHeader('Content-Type','text/html');return res.end((await provider.getRemoteComponentEntry(context,page)).html)}
      if(u.pathname==='/') {
        res.setHeader('Content-Type','text/html')
        return res.end(`<!doctype html><meta charset="utf-8"><title>Isolated directory verification</title><style>body{margin:0}iframe{width:100%;height:100dvh;border:0}</style><iframe title="Library" src="/view?page=${page}" sandbox="allow-scripts allow-forms"></iframe><script>
const frame=document.querySelector('iframe'), theme=${JSON.stringify(theme)}, common={channel:'xpertai.remote_component',protocolVersion:1,instanceId:'directory-browser',scopeRevision:1};let parameters=${JSON.stringify(page==='explore'?{section:'insights'}:{})};
const send=body=>frame.contentWindow.postMessage({...common,...body},'*');window.fixtureInit=(locale='zh-Hans')=>send({type:'init',locale,initialQuery:{parameters},theme});
addEventListener('message',async e=>{if(e.source!==frame.contentWindow||e.data.channel!==common.channel)return;const m=e.data;if(m.type==='ready'){window.fixtureInit();return}
if(!['requestData','executeAction','executeFileAction','invokeClientCommand'].includes(m.type))return;
try{if(m.type==='executeFileAction')m.file={...m.file,bytes:Array.from(new Uint8Array(m.file.buffer)),buffer:undefined};const r=await fetch('/rpc?'+location.search.slice(1),{method:'POST',body:JSON.stringify(m)}),data=await r.json();if(!r.ok)throw Error(data.message);
send({type:m.type==='requestData'?'data':m.type==='invokeClientCommand'?'clientCommandResult':'actionResult',requestId:m.requestId,data});
if(m.type==='invokeClientCommand'&&m.commandKey==='workbench.navigation.open'){parameters=m.payload.parameters||{};window.fixtureInit()}}
catch(error){send({type:'error',requestId:m.requestId,message:error.message})}})
</script>`)
      }
      if(u.pathname==='/rpc') {
        const chunks=[];for await(const chunk of req)chunks.push(chunk)
        const m=JSON.parse(Buffer.concat(chunks));requests.push({type:m.type,actionKey:m.actionKey,input:m.input})
        let data
        if(m.type==='invokeClientCommand'){commands.push(m);data={success:true}}
        else if(m.type==='requestData')data=await provider.getViewData(context,page,m.query)
        else if(m.type==='executeFileAction')data=await provider.executeViewFileAction(context,page,m.actionKey,{input:m.input},{...m.file,buffer:Buffer.from(m.file.bytes)})
        else data=await provider.executeViewAction(context,page,m.actionKey,{input:m.input})
        res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data))
      }
      res.statusCode=404;res.end()
    }catch(error){failures.push(error.message);res.statusCode=400;res.end(JSON.stringify({message:error.message}))}
  })
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    browser=await browserApi.launch({headless:true,...process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}})
    const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000})
    const address=`http://127.0.0.1:${server.address().port}`
    const imagesReady=async frame=>{
      const images=await frame.$$('[data-catalog-entry] img');assert.ok(images.length)
      // Offscreen previews load lazily; inspect them through the same scroll path as a user.
      for(const image of images){await image.scrollIntoView();await frame.waitForFunction(element=>element.complete&&element.naturalWidth>0,{},image)}
      await frame.evaluate(()=>document.querySelector('main > div.overflow-auto')?.scrollTo(0,0))
    }
    const open=async path=>{await page.goto(address+path);const handle=await page.waitForSelector('iframe');const frame=await handle.contentFrame();await frame.waitForSelector('[data-catalog-entry]');await imagesReady(frame);return frame}
    const button=async(frame,text)=>{await frame.waitForFunction(text=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===text&&!b.disabled),{},text);await frame.evaluate(text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text&&!b.disabled).click(),text)}
    const tab=async(frame,text)=>{await frame.evaluate(text=>[...document.querySelectorAll('[role="tab"]')].find(b=>b.textContent.trim()===text).dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})),text)}
    let frame=await open('/?page=templates')
    await page.screenshot({path:join(output,'01-templates.png')})
    await frame.click('[data-catalog-entry] button');await frame.waitForSelector('[role="dialog"] img')
    await frame.waitForFunction(()=>{const image=document.querySelector('[role="dialog"] img');return image?.complete&&image.naturalWidth>0})
    assert.ok(await frame.$eval('[role="dialog"]',element=>element.textContent.includes('当前仅提供目录')))
    await page.screenshot({path:join(output,'01-template-preview.png')})
    await button(frame,'关闭预览');await frame.waitForSelector('[role="dialog"]',{hidden:true})
    await tab(frame,'视觉主题');await frame.waitForSelector('[data-catalog-entry^="visual-theme-"]');assert.equal(await frame.$$eval('[data-catalog-entry]',x=>x.length),12)
    const before=await frame.$eval('[data-catalog-entry]',x=>x.dataset.catalogEntry);await button(frame,'下一页');await frame.waitForFunction(before=>document.querySelector('[data-catalog-entry]')?.dataset.catalogEntry!==before,{},before)
    assert.ok(requests.some(r=>r.input?.page===2&&r.input?.kind==='visual-theme'))
    await tab(frame,'组件');await frame.waitForSelector('[data-catalog-entry^="component-"]');await imagesReady(frame);await page.screenshot({path:join(output,'02-components.png')})
    frame=await open('/?page=explore');await page.screenshot({path:join(output,'03-examples-before-import.png')})
    await button(frame,'导入 / 上传');await frame.waitForSelector('input[type="file"]');await (await frame.$('input[type="file"]')).uploadFile(packagePath)
    await frame.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('确认导入'))
    await page.screenshot({path:join(output,'04-import-preview.png')});await button(frame,'确认导入为私有资源')
    await frame.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"] p[role="status"]')].some(p=>p.textContent.includes('已完成')))
    await frame.click('[data-slot="dialog-close"]');await frame.waitForSelector('[role="dialog"]',{hidden:true})
    await frame.waitForFunction(()=>[...document.querySelectorAll('[data-catalog-entry]')].every(x=>x.textContent.includes('已导入')))
    await imagesReady(frame);await page.screenshot({path:join(output,'05-examples-installed.png')})
    for(const entry of require('../dist/lib/explore-catalog').exploreCatalog) {
      const selector=`[data-catalog-entry="${entry.key}"]`
      await frame.$eval(selector,x=>[...x.querySelectorAll('button')].find(b=>b.textContent==='使用此任务').click())
      await frame.waitForFunction(selector=>[...document.querySelector(selector).querySelectorAll('button')].some(b=>b.textContent==='已填入对话'),{},selector)
    }
    const drafts=commands.filter(c=>c.commandKey==='assistant.composer.insert')
    assert.equal(drafts.length,10);assert.ok(drafts.every(c=>c.payload.skillNames.includes('live-dashboard')))
    assert.equal(f.jobs.size,0);assert.equal(f.host.artifacts.size,0)
    assert.ok(!requests.some(r=>r.actionKey?.startsWith('catalog-')||r.actionKey==='explore-use-task'))
    // Locale-only init must preserve the current section and filters.
    await page.evaluate(()=>window.fixtureInit('en'));await frame.waitForFunction(()=>document.querySelector('h1')?.textContent==='Analysis & insights')
    await frame.waitForFunction(()=>document.querySelectorAll('[data-catalog-entry]').length===10)
    frame=await open('/?page=templates');await tab(frame,'我的资源')
    await frame.waitForFunction(()=>document.querySelectorAll('[data-catalog-entry]').length===1)
    await frame.click('[data-catalog-entry] button');await frame.waitForSelector('[role="dialog"] [role="combobox"]')
    const choose=async(index,text)=>{const boxes=await frame.$$('[role="dialog"] [role="combobox"]');await boxes[index].click();await frame.waitForSelector('[role="option"]');const options=await frame.$$('[role="option"]');for(const item of options){if(await item.evaluate(x=>x.textContent.trim())===text){await item.click();return}}throw Error('Missing option: '+text)}
    await choose(0,dataset.name);await frame.waitForFunction(()=>document.querySelectorAll('[role="dialog"] [role="combobox"]').length===13)
    for(const [i,field] of resolved.template.content.inputSlots[0].fields.entries())await choose(i+1,field.label)
    await page.screenshot({path:join(output,'06-template-mapping.png')});await button(frame,'使用此任务')
    await frame.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('任务已准备到对话中'))
    const prepared=commands.filter(c=>c.commandKey==='assistant.composer.insert').at(-1)
    const recipe=JSON.parse(f.runtime.state.files.get(prepared.payload.workspaceFiles[0].path))
    assert.equal(recipe.action.arguments.inputs[0].source.artifactId,dataset.artifactId);assert.equal(f.jobs.size,0)
    frame=await open('/?page=explore&readonly=true&theme=dark');await page.setViewport({width:900,height:900});await page.screenshot({path:join(output,'07-readonly-dark.png')})
    assert.equal(await frame.$eval('main',element=>getComputedStyle(element).backgroundColor),'rgb(9, 9, 11)')
    assert.ok(await frame.$$eval('[data-catalog-entry]',cards=>cards.every(card=>[...card.querySelectorAll('button')].filter(b=>b.textContent==='使用此任务').every(b=>b.disabled))))
    await page.setViewport({width:390,height:844});await page.screenshot({path:join(output,'08-narrow.png')})
    assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal page overflow')
    assert.deepEqual(errors,[]);assert.deepEqual(failures,[])
    await writeFile(join(output,'report.json'),JSON.stringify({productionBundle:true,postgres:true,platformSdk:'fixture',composer:'fixture',tasks:drafts.length,templatePreview:true,directoryRequests:requests.filter(r=>r.actionKey==='resource-directory').length,errors,failures},null,2))
    console.log('Browser verification passed: pagination, import, 10 task drafts, locale, read-only, dark and narrow layout.')
  }finally{
    try { await browser?.close() }
    finally {
      if(server?.listening)await new Promise(resolve=>server.close(resolve))
      if(db.isInitialized){try{await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)}finally{await db.destroy()}}
    }
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})

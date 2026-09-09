import { readFile,mkdir } from 'node:fs/promises'
import { resolve,join,dirname } from 'node:path'
import { fileURLToPath,pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),runtime=resolve(process.argv[2]??'')
const {chromium}=await import(pathToFileURL(join(runtime,'index.mjs')).href)
const html=await readFile(join(root,'dist/mcp-apps/preview/index.html'),'utf8')
const png=(await readFile(join(root,'test-output/mcp/native-preview.png'))).toString('base64')
const browser=await chromium.launch({headless:true})
try{
 const page=await browser.newPage({viewport:{width:980,height:850},deviceScaleFactor:1})
 page.on('pageerror',error=>process.stderr.write(`App page error: ${error.message}\n`))
 page.on('console',message=>{if(message.type()==='error')process.stderr.write(`App console: ${message.text().slice(0,500)}\n`)})
 await page.addInitScript(()=>{for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new DOMException('Storage blocked','SecurityError')}})})
 const host=`<!doctype html><html><head><meta charset="utf-8"></head><body><iframe id="app" src="/app" sandbox="allow-scripts" style="width:900px;height:750px;border:0"></iframe><script>
 const iframe=document.querySelector('iframe');let revision=2;window.calls=[];window.messages=[];
 window.addEventListener('message',event=>{const message=event.data;window.messages.push(message.method);if(message.jsonrpc!=='2.0')return;
 const send=result=>iframe.contentWindow.postMessage({jsonrpc:'2.0',id:message.id,result},'*');
 if(message.method==='ui/initialize'){send({protocolVersion:message.params.protocolVersion,hostInfo:{name:'Preview smoke host',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{theme:'light',locale:'zh-CN'}});return}
 if(message.method==='ui/notifications/initialized'){iframe.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{content:[],structuredContent:{drawingId:'drawing'}}},'*');return}
 if(message.method==='tools/call'){
 const name=message.params.name;window.calls.push(name);let structuredContent;
 if(name==='excalidraw_get_drawing')structuredContent={drawingId:'drawing',sceneRevision:revision,title:'MCP 原生预览验收',versionNumber:3,kind:'diagram',status:'draft',elementTotal:1};
 if(name==='excalidraw_create_preview'||name==='excalidraw_get_job')structuredContent={success:true,drawingId:'drawing',sceneRevision:revision,jobId:'job',previewId:'preview',status:'succeeded',cursor:'cursor',terminal:true,nextAction:'read_result'};
 if(name==='excalidraw_read_preview'){send({content:[{type:'image',mimeType:'image/png',data:${JSON.stringify(png)}}],structuredContent:{drawingId:'drawing',previewId:'preview',sceneRevision:revision,stale:false,kind:'scene',mimeType:'image/png'}});return}
 if(name==='excalidraw_diagram_get_quality_report')structuredContent={drawingId:'drawing',irRevision:4,status:'validated',validationReport:{valid:true,errors:0,warnings:1,issueTotal:1,issues:[{code:'spacing',targetIds:[],severity:'warning',message:'Check arrow spacing.'}]},visualReviews:[],reviewTotal:0};
 send({content:[],structuredContent});return}
 if(message.id!==undefined)send({});
 });window.theme=theme=>iframe.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{theme,locale:theme==='dark'?'en-US':'zh-CN'}},'*');
 </script></body></html>`
 await page.route('https://preview.test/**',route=>route.fulfill({contentType:'text/html',body:new URL(route.request().url()).pathname==='/app'?html:host}))
 await page.goto('https://preview.test/')
 const frame=page.frameLocator('#app')
 await frame.locator('#status').filter({hasText:'预览已就绪'}).waitFor({timeout:10000}).catch(async error=>{process.stderr.write(JSON.stringify({messages:await page.evaluate(()=>window.messages),calls:await page.evaluate(()=>window.calls),status:await frame.locator('#status').textContent()})+'\n');throw error})
 assert.equal(await frame.locator('#image').evaluate(image=>image.naturalWidth>0),true)
 const before=await frame.locator('#image').evaluate(image=>image.style.transform)
 await frame.getByRole('button',{name:'放大',exact:true}).click()
 assert.notEqual(await frame.locator('#image').evaluate(image=>image.style.transform),before)
 await frame.getByRole('button',{name:'适应画布',exact:true}).click()
 assert.equal(await frame.locator('#image').evaluate(image=>image.style.transform),before)
 const box=await frame.locator('#viewport').boundingBox();await page.mouse.move(box.x+200,box.y+150);await page.mouse.down();await page.mouse.move(box.x+240,box.y+190);await page.mouse.up()
 assert.notEqual(await frame.locator('#image').evaluate(image=>image.style.transform),before)
 await frame.getByRole('button',{name:'质量结果'}).click();await frame.locator('#quality-panel').filter({hasText:'Check arrow spacing.'}).waitFor()
 const evidence=join(root,'test-output/mcp');await mkdir(evidence,{recursive:true});await page.screenshot({path:join(evidence,'app-light-zh.png')})
 await page.evaluate(()=>window.theme('dark'));await frame.getByRole('button',{name:'Refresh current scene'}).waitFor();await frame.getByRole('button',{name:'Fit canvas'}).click()
 assert.equal(await frame.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(23, 25, 31)');assert.equal(await frame.locator('#status').textContent(),'Preview ready');await page.screenshot({path:join(evidence,'app-dark-en.png')})
 assert.ok((await page.evaluate(()=>window.calls)).includes('excalidraw_read_preview'))
 const callsBefore = await page.evaluate(() => window.calls.length)
 await page.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{content:[],structuredContent:{resultStatus:'unavailable',drawingId:'drawing',jobId:'job'}}}, '*'))
 await frame.locator('#status').filter({hasText:'The tool returned an incomplete result.'}).waitFor()
 assert.equal(await page.evaluate(() => window.calls.length), callsBefore)
 await page.screenshot({path:join(evidence,'app-incomplete-result.png')})
 await frame.getByRole('button',{name:'Refresh current scene'}).click()
 await frame.locator('#status').filter({hasText:'Preview ready'}).waitFor()

 process.stdout.write('Built MCP App: bridge, image, zoom, pan, fit, quality, locale, theme and blocked Web Storage passed.\n')
}finally{await browser.close()}

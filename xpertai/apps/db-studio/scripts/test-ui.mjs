import {chromium} from '@playwright/test'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {createRequire} from 'node:module'
import {dirname,join} from 'node:path'
import {renderRemoteReactIframeHtml} from '@xpert-ai/plugin-sdk'
const require=createRequire(import.meta.url)
const pkg=async(name,path)=>readFile(join(dirname(require.resolve(`${name}/package.json`)),path),'utf8')
const html=renderRemoteReactIframeHtml({title:'DB Studio — simulated UI test',lang:'zh-Hans',appScript:await readFile('src/lib/remote/app.js','utf8'),appCss:await readFile('src/lib/remote/app.css','utf8'),reactUmd:await pkg('react','umd/react.production.min.js'),reactDomUmd:await pkg('react-dom','umd/react-dom.production.min.js')})
const fixture=`<!doctype html><html><head><style>html,body{margin:0;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%}</style></head><body><iframe id="studio" sandbox="allow-scripts allow-downloads"></iframe><script>
const frame=document.getElementById('studio');frame.srcdoc=${JSON.stringify(html).replaceAll('</script','<\\/script')};window.actions=[];window.saved=[];
const target={dataSourceId:'mock-doris',database:'analytics',engineCatalog:'internal'};
const object={database:'analytics',engineCatalog:'internal',name:'orders',kind:'table'};
const detail={object,model:'unique',editable:true,diagnostics:[],columns:[{id:'c0',name:'order_id',dataType:'BIGINT',nullable:false},{id:'c1',name:'amount',dataType:'DECIMAL(20,4)',nullable:true},{id:'c2',name:'region',dataType:'VARCHAR(20)',nullable:true}],keys:[{name:'PRIMARY',kind:'primary',columns:['order_id']}],definition:'CREATE TABLE orders (order_id BIGINT NOT NULL, amount DECIMAL(20,4), region VARCHAR(20)) UNIQUE KEY(order_id) DISTRIBUTED BY HASH(order_id) BUCKETS 3;'};
const result={columns:detail.columns,rows:Array.from({length:100},(_,i)=>[String(9007199254740993n+BigInt(i)),String((i+1)*17.5),['East','West','North'][i%3]]),durationMs:23,hasMore:true,truncated:false,outcome:'succeeded',diagnostics:[]};
const respond=(message,body)=>frame.contentWindow.postMessage({channel:'xpertai.remote_component',protocolVersion:1,instanceId:'test-frame',requestId:message.requestId,...body},'*');
window.addEventListener('message',async(event)=>{if(event.source!==frame.contentWindow)return;const message=event.data;if(message.channel!=='xpertai.remote_component')return;
if(message.type==='ready'){respond(message,{type:'init',locale:'zh-Hans',theme:{mode:'light'},manifest:{}});return}
if(message.type==='requestData'){const kind=message.query.parameters.kind,input=JSON.parse(message.query.parameters.input);let data={};
if(kind==='bootstrap')data={summary:{items:[{id:'mock-doris',name:'Mock Doris',engine:'doris'}],features:['db-studio-explore','db-studio-changes','db-studio-transfer'],testReadOnly:true,drafts:window.saved.filter((item)=>item.kind==='draft').map((item)=>({...item,summary:item.payload}))}};
else if(kind==='capabilities')data={item:{engine:'doris',version:'doris-3.0.8 (mock)',query:true,explain:true,transactions:false,cancel:true,import:true,writes:true,nativeReadOnly:false,diagnostics:[],objectKinds:['table','view']}};
else if(kind==='locations')data={item:[{database:'analytics',engineCatalog:'internal'}]};else if(kind==='objects')data={item:{items:[object],page:1,pageSize:100,hasMore:false}};else if(kind==='describe')data={item:detail};else if(kind==='policy')data={item:{revision:0,readOnly:true,objects:[],autoActions:[]}};else if(kind==='record')data={item:window.saved.find((item)=>item.id===input.id)};else data={items:window.saved.filter((item)=>item.kind===kind).map((item)=>({...item,summary:item.payload}))};respond(message,{type:'data',data});return}
if(message.type==='executeAction'){window.actions.push(message);let data={};const input=message.input;
if(message.actionKey==='run_query'||message.actionKey==='explain'){if(!/^(SELECT|WITH|SHOW|EXPLAIN)/i.test(input.sql.trim())){respond(message,{type:'actionResult',result:{success:false,message:{zh_Hans:'read_only_violation'}}});return}data={executionId:input.executionId,dataSourceId:'mock-doris',result:message.actionKey==='explain'?{...result,columns:[{id:'c0',name:'Explain String',dataType:'text'}],rows:[['0:VOlapScanNode\\nTABLE: orders\\nPREAGGREGATION: ON']]}:result}}
else if(message.actionKey==='save_artifact'){data={id:input.id||crypto.randomUUID(),kind:input.kind,title:input.title,revision:(input.revision||0)+1,status:'saved',updatedAt:'2026-09-14',payload:{target:input.target,content:input.content}};window.saved=window.saved.filter((item)=>item.id!==data.id).concat(data)}
else if(message.actionKey==='cancel')data={status:'cancellation_requested'};else if(['approve_plan','execute_plan','set_policy'].includes(message.actionKey)){respond(message,{type:'actionResult',result:{success:false,message:{zh_Hans:'read_only_test_mode'}}});return}
respond(message,{type:'actionResult',result:{success:true,data}});return}
if(message.type==='invokeClientCommand'){window.actions.push(message);respond(message,{type:'clientCommandResult',result:{success:true,status:'updated'}})}
});</script></body></html>`
const server=createServer((request,response)=>{response.writeHead(200,{'content-type':'text/html'});response.end(fixture)})
await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[]
page.on('pageerror',(error)=>errors.push(error.message));await page.route('**/*',(route)=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
try{
 await page.goto(`http://127.0.0.1:${port}`);const view=page.frameLocator('#studio')
 await view.getByRole('combobox',{name:'选择数据源',exact:true}).click();await view.getByRole('option',{name:/Mock Doris/}).click();await view.getByRole('treeitem',{name:'orders',exact:true}).waitFor()
 await view.getByRole('treeitem',{name:'orders',exact:true}).click();await view.getByText('DECIMAL(20,4)',{exact:true}).waitFor()
 await view.getByRole('button',{name:'浏览数据',exact:true}).click();await view.getByRole('button',{name:/^运行/}).click();await view.getByRole('grid').waitFor()
 await view.getByText('9007199254740993',{exact:true}).first().waitFor();await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/workbench-light.png'})
 await view.getByRole('tab',{name:'图表',exact:true}).click();await view.getByRole('button',{name:'保存图表',exact:true}).click();await view.getByRole('tab',{name:'透视',exact:true}).click();await view.getByRole('tab',{name:'ER',exact:true}).click();await view.getByRole('button',{name:'读取当前页真实关系',exact:true}).click();await view.locator('svg[aria-label="Entity relationships"] text').first().waitFor()
 await view.getByRole('tab',{name:'结果',exact:true}).click();await view.getByTitle('保存草稿',{exact:true}).click();await view.getByText('草稿已保存',{exact:true}).waitFor();await page.locator('#studio').evaluate((frame)=>frame.contentWindow.postMessage({channel:'xpertai.remote_component',protocolVersion:1,instanceId:'test-frame',type:'themeChanged',theme:{mode:'dark'}},'*'));await view.locator('html.dark').waitFor();await page.screenshot({path:'artifacts/workbench-dark.png'})
 const storage=await page.frames()[1].evaluate(()=>{try{localStorage.getItem('blocked');return false}catch{return true}});if(!storage)throw new Error('Fixture must forbid Web Storage')
 await view.getByRole('button',{name:'智能助手',exact:true}).click();const commands=await page.evaluate(()=>window.actions.filter((action)=>action.type==='invokeClientCommand'))
 if(!commands.some((item)=>item.commandKey==='assistant.context.set'&&item.payload.key==='db_studio'&&item.payload.context.draftId))throw new Error('Missing saved draft context')
 if(!commands.some((item)=>item.commandKey==='assistant.chat.send_message'&&item.payload.text))throw new Error('Missing native Agent message')
 await page.setViewportSize({width:780,height:800});await page.screenshot({path:'artifacts/workbench-narrow.png'})
 const violations=await page.evaluate(()=>window.actions.filter((action)=>['approve_plan','execute_plan','set_policy','row_update','import_file'].includes(action.actionKey)));if(violations.length)throw new Error('Readonly UI performed mutations')
 if(errors.length)throw new Error(errors.join('\n'))
 await writeFile('artifacts/ui-validation.json',JSON.stringify({passed:true,storageBlocked:storage,consoleErrors:errors,checks:['connection/object tree','Monaco editor','query/results','precision','chart','pivot','ER','save draft','native Agent context','dark theme','narrow viewport','no mutations']},null,2))
 process.stdout.write('Remote UI checks passed (mock host, opaque iframe, no database network).\n')
}finally{await browser.close();server.close()}

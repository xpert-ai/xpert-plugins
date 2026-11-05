// Test host: production Vue + actual native middleware/View + Python. Model is an explicit fixture.
import { createServer } from 'node:http'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { AIMessage } from '@langchain/core/messages'
import { PythonClient } from '../dist/lib/python-client.js'
import { FundsService } from '../dist/lib/service.js'
import { FundsView } from '../dist/lib/view.js'
import { FundsMiddleware } from '../dist/lib/middleware.js'
const root = fileURLToPath(new URL('../', import.meta.url))
const scope = {tenantId:'preview-tenant', organizationId:'preview-org', userId:'preview-user'}
const context = {...scope, hostType:'agent', hostId:'preview-assistant', slots:[]}
export async function createPreviewHost() {
  const directory = await mkdtemp(join(tmpdir(),'funds-browser-'))
  const client = new PythonClient({pythonExecutable:process.env.FUNDS_QUERY_PYTHON || join(root,'.venv/bin/python'), dataDirectory:directory, timeoutMs:30000, debug:false})
  const service = new FundsService(client), view = new FundsView(service)
  const requests = [], gates = [], threads = new Map()
  let lastPrepared = null, failNext = false, failedRead = null, nativeThread = null
  let failedImport = null
  let runtimeStatus = null
  let deferNext = false, deferredRun = null, cancelDeferred = null
  let deferredReady = null, notifyDeferred = null
  function holdNext(kind, match={}) {
    let release, enter
    const promise = new Promise(resolve => {release=resolve})
    release.blocked = new Promise(resolve => {enter=resolve})
    gates.push({kind,match,promise,release,enter,used:false})
    return release
  }
  function takeGate(kind, input={}) {
    const gate=gates.find(g=>!g.used&&g.kind===kind&&Object.entries(g.match).every(([k,v])=>input[k]===v))
    if(gate)gate.used=true
    return gate
  }
  async function waitGate(gate) {if(gate){gate.enter();await gate.promise}}
  const html=()=>`<!doctype html><html><head><meta charset="utf-8"><title>Funds conversation — fixture AI host</title><style>html,body{margin:0;width:100%;height:100%}iframe{border:0;width:100%;height:100vh;display:block}</style></head><body><iframe title="资金问数测试工作台" sandbox="allow-scripts allow-downloads" src="/remote"></iframe><script>
const iframe=document.querySelector('iframe'),instanceId='funds-preview-instance';
const envelope=(type,body={})=>({channel:'xpertai.remote_component',protocolVersion:1,instanceId,type,...body});
let mode='light';
let eventsEnabled=true;window.setPreviewEventsEnabled=value=>{eventsEnabled=value};
function theme(){return {mode,tokens:mode==='dark'?{colorBackground:'#181b1a',colorForeground:'#e7ece9',colorCard:'#181b1a',colorMuted:'#242925',colorMutedForeground:'#9aa69f',colorBorder:'#39433d',colorInput:'#4a5950',colorPrimary:'#a4c9b1',colorPrimaryForeground:'#112018',colorAccent:'#29352d',colorAccentForeground:'#e7ece9',colorRing:'#8ba793'}:{colorBackground:'#ffffff',colorForeground:'#1c2722',colorCard:'#ffffff',colorMuted:'#f4f6f3',colorMutedForeground:'#6e7a72',colorBorder:'#dce3dd',colorInput:'#c9d4cb',colorPrimary:'#254b37',colorPrimaryForeground:'#ffffff',colorAccent:'#eaf1eb',colorAccentForeground:'#203d2c',colorRing:'#73937c'}}}
window.setPreviewTheme=m=>{mode=m;iframe.contentWindow.postMessage(envelope('theme',{theme:theme()}),'*')};
window.emitPreviewEvent=()=>{if(eventsEnabled)iframe.contentWindow.postMessage(envelope('hostEvent',{event:{name:'assistant.tool.completed'}}),'*')};
window.addEventListener('message',async event=>{
 if(event.source!==iframe.contentWindow)return;const m=event.data;if(m.channel!=='xpertai.remote_component')return;
 if(m.type==='ready'){iframe.contentWindow.postMessage(envelope('init',{theme:theme(),locale:'zh-Hans',debug:{enabled:false}}),'*');return}
 if(!m.requestId)return;
 const payload={...m};if(m.file?.buffer){let chars='';for(const b of new Uint8Array(m.file.buffer))chars+=String.fromCharCode(b);payload.file={...m.file,base64:btoa(chars)};delete payload.file.buffer;}
 try{const r=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const body=await r.json();if(!r.ok)throw Error(body.message||'Request failed');iframe.contentWindow.postMessage(envelope('response',{requestId:m.requestId,data:body}),'*');if(m.type==='invokeClientCommand'&&m.commandKey==='assistant.chat.send_message')window.emitPreviewEvent();}
 catch(e){iframe.contentWindow.postMessage(envelope('error',{requestId:m.requestId,message:e.message}),'*');}
});</script></body></html>`
  async function fixtureReply(m) {
    if(m.commandKey==='assistant.chat.get_context')return {success:true,conversationId:nativeThread?.conversationId??null,threadId:nativeThread?.threadId??null,ready:true}
    if(m.commandKey==='workbench.navigation.open') {
      const thread=threads.get(m.payload.conversationId)
      if(!thread||thread.threadId!==m.payload.threadId)return {success:false,code:'not_found'}
      await waitGate(takeGate('navigation_effect'))
      nativeThread=thread
      await waitGate(takeGate('navigation_receipt'))
      return {success:true,status:'opened'}
    }
    if(m.commandKey!=='assistant.chat.send_message')throw Error('Unknown fixture command')
    if((m.payload.conversationId&&m.payload.conversationId!==nativeThread?.conversationId)||(m.payload.threadId&&m.payload.threadId!==nativeThread?.threadId))return {success:false,code:'stale_context'}
    if(failNext){failNext=false;return {success:false}}
    if(m.payload.newThread){nativeThread={conversationId:randomUUID(),threadId:randomUUID(),messages:[]};threads.set(nativeThread.conversationId,nativeThread)}
    if(!nativeThread)throw Error('No fixture conversation')
    const thread=nativeThread, p=lastPrepared
    if(!p)throw Error('No prepared question')
    thread.messages.push(p.question)
    // Match the host: executionId is supplied at invocation time, not in the factory context.
    const runtime={...scope,conversationId:thread.conversationId,threadId:thread.threadId,tools:new Map(),node:{},runtime:{}}
    const config={configurable:{thread_id:thread.threadId,executionId:randomUUID()}}
    const middleware=new FundsMiddleware(service).createMiddleware({},runtime)
    const invoke=async(name,input)=>JSON.parse(await middleware.tools.find(t=>t.name===name).invoke(input,config))
    const hook=async(name,state={messages:[]})=>{const h=middleware[name];if(typeof h==='function')await h(state,config)}
    await hook('beforeAgent')
    await hook('beforeModel')
    await invoke('funds_query_context',{queryId:p.queryId})
    await hook('beforeModel')
    await waitGate(takeGate('analysis'))
    let result
    const calculate=async()=>{
      const plan={}
      if(p.question.includes('选择账号'))plan.accountIds=[p.question.match(/账号 ([0-9]+)/)[1]]
      else if(!p.baseQueryId) {
        await invoke('funds_query_find_accounts',{datasetId:p.datasetId,search:'张三'})
        plan.accountName='张三'
      }
      if(!p.baseQueryId){plan.period='custom';plan.startDate='2026-10-01';plan.endDate='2026-10-31'}
      if(p.question.includes('最多'))plan.kind='counterparties'
      if(p.question.includes('趋势')){plan.kind='trend';plan.granularity='day'}
      if(p.question.includes('超过')){plan.minAmount='50000';plan.minExclusive=true}
      if(p.question.includes('付款'))plan.direction='out'
      const clearFilters=p.question.includes('全部')?['minAmount','minExclusive','maxAmount','maxExclusive','counterpartyName','counterpartyAccountId']:[]
      result=await invoke('funds_query_run',{datasetId:p.datasetId,queryId:p.queryId,question:p.question,plan,...(clearFilters.length?{clearFilters}:{})})
      await hook('beforeModel')
    }
    if(deferNext){
      deferNext=false
      await new Promise((resolve,reject)=>{
        cancelDeferred=resolve
        deferredRun=async()=>{try{await calculate();resolve()}catch(e){reject(e);throw e}}
        notifyDeferred?.()
      })
    }else await calculate()
    await waitGate(takeGate('reply'))
    let reply=result?.status==='needs_clarification'?'找到多个同名账户，请选择账号后继续。':
      `本次查询的${result?.direction==='out'?'付款':'收款'}合计为 **${result?.amount} 元**，共 **${result?.count} 笔**。\n\n统计范围和原始交易依据保留在下方，可逐笔核对。`
    await middleware.wrapModelCall({runtime:config},async()=>new AIMessage(reply))
    await hook('afterAgent',{Agent_FundsQuery:{messages:[new AIMessage(reply)]}})
    return {success:true,status:'sent'}
  }
  const server=createServer(async(req,res)=>{
    try{
      if(req.url==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.end(html());return}
      if(req.url==='/remote'){
        const entry=await view.getRemoteComponentEntry(context,'funds_query.workbench',{entry:'funds-query',isolation:'iframe'})
        const guard=`<script>for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new DOMException('Blocked','SecurityError')}});</script>`
        res.setHeader('content-type','text/html; charset=utf-8');res.end(entry.html.replace('<head>','<head>'+guard));return
      }
      if(req.url==='/fail-next'){failNext=true;res.end('{}');return}
      if(req.url==='/rpc'){
        let raw='';for await(const c of req){raw+=c;if(raw.length>15*1024*1024)throw Error('Request too large')}
        const m=JSON.parse(raw)
        requests.push({type:m.type,actionKey:m.actionKey,commandKey:m.commandKey,operation:m.query?.parameters?.operation,
          page:m.query?.page,queryId:m.query?.parameters?.queryId,sessionId:m.query?.parameters?.sessionId,
          newThread:m.payload?.newThread,conversationId:m.payload?.conversationId,threadId:m.payload?.threadId})
        let response
        if(m.type==='requestData'){
          if(failedRead===m.query?.parameters?.operation){failedRead=null;throw Error('Simulated read failure')}
          const gate=takeGate('data',{...m.query?.parameters,page:m.query?.page})
          response=m.query?.parameters?.operation==='runtime'&&runtimeStatus
            ? {meta:{runtime:runtimeStatus}} : await view.getViewData(context,'funds_query.workbench',m.query??{})
          await waitGate(gate)
        }else if(m.type==='executeAction'){
          response=await view.executeViewAction(context,'funds_query.workbench',m.actionKey,{input:m.input})
          if(m.actionKey==='prepare'&&response.success)lastPrepared=response.data
        }else if(m.type==='executeFileAction'){
          await waitGate(takeGate('import'))
          if(failedImport){const message=failedImport;failedImport=null;throw Error(message)}
          response=await view.executeViewFileAction(context,'funds_query.workbench',m.actionKey,{},
            {buffer:Buffer.from(m.file.base64,'base64'),originalname:m.file.name,mimetype:m.file.type})
        }else if(m.type==='invokeClientCommand')response=await fixtureReply(m)
        else throw Error('Unsupported fixture command')
        res.setHeader('content-type','application/json');res.end(JSON.stringify(response));return
      }
      res.writeHead(404);res.end('Not found')
    }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({message:error.message}))}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  return {url:`http://127.0.0.1:${server.address().port}`,service,scope,requests,threads,holdNext,
    setNativeThread: id=>{nativeThread=threads.get(id)??null},
    dropConversation: id=>{threads.delete(id);if(nativeThread?.conversationId===id)nativeThread=null},
    ageQuestion: id=>{
      const program="import sys,json\nfrom datetime import datetime,timezone,timedelta\nfrom funds_engine.storage import Store\ns=Store(sys.argv[1],json.loads(sys.argv[3]));s.question(sys.argv[2])\nwith s.db:s.db.execute('UPDATE questions SET updated_at=? WHERE id=?',((datetime.now(timezone.utc)-timedelta(seconds=181)).isoformat(),sys.argv[2]))\ns.close()"
      const aged=spawnSync(client.config.pythonExecutable,['-c',program,directory,id,JSON.stringify(scope)],{cwd:join(root,'python'),encoding:'utf8'})
      if(aged.status!==0)throw Error(aged.stderr)
    },
    failNextImport:message=>{failedImport=message},
    setRuntimeStatus:status=>{runtimeStatus=status},
    failNextRead:operation=>{failedRead=operation},deferNextQuery:()=>{deferNext=true;deferredReady=new Promise(resolve=>{notifyDeferred=resolve})},
    completeDeferredQuery:async()=>{if(deferredReady)await deferredReady;if(!deferredRun)throw Error('No deferred query');const run=deferredRun;deferredRun=null;deferredReady=null;await run()},
    close:async()=>{for(const gate of gates)gate.release();cancelDeferred?.();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true})}}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const host=await createPreviewHost();console.log('Fixture AI preview: '+host.url)
  process.on('SIGINT',async()=>{await host.close();process.exit()})
}

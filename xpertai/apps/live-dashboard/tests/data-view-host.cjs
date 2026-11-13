// Built remote view and real plugin services, synthetic runtime capabilities only.
const http = require('node:http')
const { dataViewFixture } = require('./data-view-fixture.cjs')
const example = require('../examples/postgres-sales.json')
const f = dataViewFixture()
const provider = f.provider
const shell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Add Data synthetic regression</title><style>body{margin:0}iframe{display:block;width:100%;height:100dvh;border:0}</style></head><body>
<iframe id="view" title="Add Data" src="/view" sandbox="allow-scripts allow-forms"></iframe><script>
const frame=document.querySelector('#view'),instanceId='data-view-test';
let revision=1,locale='zh-Hans',theme={mode:'light',density:'default',tokens:{'radius.md':'0.5rem'}};
const send=message=>frame.contentWindow.postMessage({channel:'xpertai.remote_component',protocolVersion:1,instanceId,scopeRevision:revision,...message},'*');
const init=()=>send({type:'init',locale,theme,initialQuery:{}});
window.qa={holdNext:false,held:false,init(next){locale=next.locale??locale;theme=next.theme??theme;init()},
reset(){revision++;send({type:'hostEvent',event:{type:'view.context.changed',data:{revision}}})}};
addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow||event.data.channel!=='xpertai.remote_component')return;
 const m=event.data;if(m.type==='ready'){init();return}
 if(!['requestData','executeAction'].includes(m.type))return;
 const scope=m.scopeRevision;
 if(window.qa.holdNext){window.qa.holdNext=false;window.qa.held=true;await new Promise(resolve=>window.qa.release=()=>{window.qa.held=false;resolve()})}
 try{const response=await fetch('/rpc',{method:'POST',body:JSON.stringify(m)}),result=await response.json();
 if(!response.ok)throw Error(result.message);
 send({type:m.type==='requestData'?'data':'actionResult',scopeRevision:scope,requestId:m.requestId,data:result})
 }catch(error){send({type:'error',scopeRevision:scope,requestId:m.requestId,message:error.message})}
});</script></body></html>`

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(shell) }
    if (req.url === '/view') { res.setHeader('Content-Type', 'text/html'); return res.end((await provider.getRemoteComponentEntry(f.context, 'data')).html) }
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/state') return res.end(JSON.stringify({ datasets: (await f.library.list(f.context)).items, queries: f.calls.queries.length, discoveries: f.discoveries.length }))
    if (req.url === '/rpc' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const m = JSON.parse(Buffer.concat(chunks).toString())
      const result = m.type === 'requestData' ? await provider.getViewData(f.context, 'data', m.query)
        : await provider.executeViewAction(f.context, 'data', m.actionKey, { input: m.input })
      return res.end(JSON.stringify(result))
    }
    res.statusCode = 404; res.end('{}')
  } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ message: error.message })) }
})

async function start() {
  await f.library.save(f.context, { definition: f.definition, expectedRevision: 0 })
  await f.service.save(f.context, example, null, 0)
  server.listen(Number(process.env.PORT || 0), '127.0.0.1', () => console.log(`Data View fixture: http://127.0.0.1:${server.address().port}`))
}
start().catch(error => { console.error(error); process.exitCode = 1 })

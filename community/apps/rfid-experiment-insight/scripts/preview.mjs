import { createServer } from 'node:http'
import { MockHost } from './mock-host.mjs'

// Explicitly local/mock. All records live in memory until this process stops.
const host = new MockHost()
await host.seed()
host.mode = 'success'
const frameHtml = await host.html()
const events = []
host.emit = (event) => events.push(event)
const page = `<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RFID Workbench · Local mock preview</title>
<style>body{margin:0;background:#f5f7f6;font:13px system-ui}header{padding:12px 20px;background:#153d36;color:white;display:flex;gap:16px;align-items:center;flex-wrap:wrap}header small{opacity:.75}select,button{padding:5px 10px}iframe{width:100%;min-height:900px;border:0;display:block}</style>
<header><strong>本地 / Mock 预览</strong><small>非真实 Xpert 宿主；AI 为测试数据；记录仅保存在本进程内存</small><label>下次模拟结果 <select id="mode"><option value="success">成功</option><option value="fail">模型失败</option><option value="dispatch">发送失败</option></select></label><button id="reopen">重开工作台</button></header>
<iframe title="RFID Workbench" id="view" src="/frame" sandbox="allow-scripts allow-same-origin"></iframe>
<script>
const frame=document.getElementById('view');let instanceId='mock-'+crypto.randomUUID();
const send=(value)=>frame.contentWindow.postMessage({channel:'xpertai.remote_component',protocolVersion:1,instanceId,...value},location.origin);
document.getElementById('reopen').onclick=()=>{instanceId='mock-'+crypto.randomUUID();frame.src='/frame'};
document.getElementById('mode').onchange=async(event)=>{await fetch('/mode',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:event.target.value})})};
window.addEventListener('message',async(event)=>{
 if(event.source!==frame.contentWindow||event.origin!==location.origin)return;
 const message=event.data;if(message.channel!=='xpertai.remote_component'||message.protocolVersion!==1)return;
 if(message.type==='ready'){send({type:'init',initialQuery:{},locale:'zh-Hans'});return}
 if(message.instanceId!==instanceId)return;
 if(message.type==='resize'){frame.style.height=Math.max(700,message.height)+'px';return}
 if(!message.requestId)return;
 const current=instanceId;
 try{
  if(message.type==='executeFileAction')message.file.buffer=Array.from(new Uint8Array(message.file.buffer));
  const response=await fetch('/bridge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message)});
  if(current===instanceId)send({...await response.json(),requestId:message.requestId});
 }catch(error){if(current===instanceId)send({type:'error',message:error.message,requestId:message.requestId})}
});
setInterval(async()=>{for(const event of await (await fetch('/events')).json())send(event)},300);
</script></html>`
const server = createServer(async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'GET' && (req.url === '/' || req.url === '/frame')) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url === '/' ? page : frameHtml); return }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (req.method === 'GET' && req.url === '/events') { res.end(JSON.stringify(events.splice(0))); return }
    if (req.method === 'POST' && ['/bridge', '/mode'].includes(req.url)) {
      // Loopback only, and reject cross-origin website requests to this development helper.
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { res.writeHead(403); res.end('{}'); return }
      let body = '', size = 0
      for await (const chunk of req) { size += chunk.length; if (size > 8 * 1024 * 1024) throw new Error('Request too large'); body += chunk }
      const input = JSON.parse(body)
      if (req.url === '/mode') { host.dispatchFails = input.mode === 'dispatch'; host.mode = input.mode === 'fail' ? 'fail' : 'success'; res.end('{}'); return }
      res.end(JSON.stringify(await host.handle(input))); return
    }
    res.writeHead(404); res.end('{}')
  } catch (error) { res.writeHead(400); res.end(JSON.stringify({ type: 'error', message: error.message })) }
})
server.listen(Number(process.env.RFID_PREVIEW_PORT || 4177), '127.0.0.1', () => console.log(`Local mock preview: http://127.0.0.1:${server.address().port}`))

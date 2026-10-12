import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DemoMapProvider } from '../dist/lib/mock-provider.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c')
/** Explicit local mock host. The production App has no test flag or alternate bridge. */
export async function startPreview({ port = 4381, initialQuery = '探索模拟街区', pageSize = 10, initialHostContext = {} } = {}) {
  const state = { provider: 'amap', calls: [], failures: new Map(), delays: new Map(), emptyQueries: new Set() }
  const html = await readFile(join(root, 'dist/mcp-apps/map/index.html'), 'utf8')
  const initialInput = { query: initialQuery, city: '杭州', page: 1, pageSize }
  const initial = await new DemoMapProvider(state.provider).search(initialInput)
  const host = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Xpert Maps · Mock acceptance host</title><style>*{box-sizing:border-box}body{margin:0;background:#eef1ef;font:14px system-ui;color:#254033}.host{max-width:1100px;margin:24px auto;padding:0 16px}h1{font-size:18px;margin:0 0 6px}p{font-size:12px;color:#52695c;margin:0 0 16px}iframe{width:100%;height:740px;border:0;display:block;background:#fff}.host.fullscreen{max-width:none;margin:0;padding:0}.host.fullscreen>header{display:none}@media(max-width:600px){.host{margin:12px auto;padding:0 8px}h1{font-size:15px}}</style></head><body><main class="host"><header><h1>Xpert Maps · 模拟宿主验收</h1><p>真实构建产物 + MCP App 消息桥。所有地图、地点与路线均为模拟数据。未连接 Xpert 平台或地图供应商。</p></header><iframe title="Maps App" id="app" src="/app" sandbox="allow-scripts"></iframe></main><script>
const iframe=document.querySelector('iframe'); const host=document.querySelector('.host');
const context={theme:'light',locale:'zh-CN',displayMode:'inline',availableDisplayModes:['inline','fullscreen'],...${json(initialHostContext)}};
const send=(method,params)=>iframe.contentWindow.postMessage({jsonrpc:'2.0',method,params},'*');
window.mapsHost={messages:[],calls:[],setContext(next){Object.assign(context,next);send('ui/notifications/host-context-changed',next)},sendResult(result){send('ui/notifications/tool-result',{content:[],structuredContent:result})},sendInput(input){send('ui/notifications/tool-input',{arguments:input})},request(method,params,id){iframe.contentWindow.postMessage({jsonrpc:'2.0',method,params,id},'*')}};
window.addEventListener('message',async event=>{
 if(event.source!==iframe.contentWindow||!event.data||event.data.jsonrpc!=='2.0')return;
 const message=event.data;window.mapsHost.messages.push(message.method??'response');
 const respond=result=>iframe.contentWindow.postMessage({jsonrpc:'2.0',id:message.id,result},'*');
 if(message.method==='ui/initialize'){respond({protocolVersion:message.params.protocolVersion,hostInfo:{name:'Maps acceptance mock host',version:'1.0.0'},hostCapabilities:{serverTools:{},updateModelContext:{}},hostContext:context});return}
 if(message.method==='ui/notifications/initialized'){window.mapsHost.sendInput(${json(initialInput)});window.mapsHost.sendResult(${json(initial)});return}
 if(message.method==='tools/call'){
  window.mapsHost.calls.push(message.params.name);
  try{const response=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message.params)});respond(await response.json())}catch{respond({content:[{type:'text',text:'Mock host request failed'}],isError:true})}return
 }
 if(message.method==='ui/request-display-mode'){
  context.displayMode=message.params.mode==='fullscreen'?'fullscreen':'inline';host.classList.toggle('fullscreen',context.displayMode==='fullscreen');
  iframe.style.height=context.displayMode==='fullscreen'?'100vh':'740px';respond({mode:context.displayMode});window.mapsHost.setContext({displayMode:context.displayMode});return
 }
 if(message.method==='ui/notifications/size-changed'&&context.displayMode==='inline'){
  iframe.style.height=Math.max(600,Math.min(1600,message.params.height??740))+'px';return
 }
 if(message.id!==undefined)respond({});
});
</script></body></html>`
  const server = createServer(async (request, response) => {
    const respond = (body, contentType = 'application/json', status = 200) => { response.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' }); response.end(body) }
    try {
      if (request.method === 'GET' && request.url === '/favicon.ico') return respond('', 'image/x-icon', 204)
      if (request.method === 'GET' && request.url === '/') return respond(host, 'text/html; charset=utf-8')
      if (request.method === 'GET' && request.url === '/app') {
        response.setHeader('content-security-policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none';")
        return respond(html, 'text/html; charset=utf-8')
      }
      if (request.method === 'POST' && request.url === '/rpc') {
        let body = ''
        for await (const chunk of request) { body += chunk; if (body.length > 16384) return respond('{}', 'application/json', 413) }
        const input = JSON.parse(body), name = input.name, args = input.arguments
        state.calls.push({ name, arguments: args })
        const delay = state.delays.get(args?.query ?? name) ?? 0
        if (delay) await new Promise(resolve => setTimeout(resolve, delay))
        if ((state.failures.get(name) ?? 0) > 0) { state.failures.set(name, state.failures.get(name) - 1); return respond(json({ isError: true, content: [{ type: 'text', text: 'Simulated provider failure' }] })) }
        const provider = new DemoMapProvider(state.provider)
        let result
        if (name === 'maps_search_view') { result = await provider.search(args); if (state.emptyQueries.has(args.query)) result = { ...result, places: [], hasMore: false } }
        else if (name === 'maps_detail_view') result = await provider.detail(args)
        else if (name === 'maps_route_view') result = await provider.route(args)
        else if (name === 'maps_render') result = await provider.render(args)
        else return respond(json({ isError: true, content: [{ type: 'text', text: 'Tool unavailable in mock host' }] }))
        return respond(json({ content: [{ type: 'text', text: result.kind }], structuredContent: result }))
      }
      respond('Not found', 'text/plain', 404)
    } catch { respond(json({ isError: true, content: [{ type: 'text', text: 'Mock tool request rejected' }] })) }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  const address = server.address()
  const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}`
  return { url, state, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const preview = await startPreview({ port: Number(process.env.MAPS_PREVIEW_PORT ?? 4381) })
  process.stdout.write(`Maps explicit mock host: ${preview.url}\n`)
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void preview.close().then(() => process.exit(0)) })
}

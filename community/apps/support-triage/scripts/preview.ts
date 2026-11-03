// Loopback development host. Uses the shipped iframe and real domain service, not Xpert authentication.
import 'reflect-metadata'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { DataSource } from 'typeorm'
import { z } from 'zod/v3'
import { TicketEntity } from '../dist/ticket.entity.js'
import { TriageService } from '../dist/service.js'
import { TriageView } from '../dist/view.js'
import { configSchema, VIEW } from '../dist/domain.js'

await mkdir('.preview-data', { recursive: true })
const db = await new DataSource({ type: 'sqljs', location: '.preview-data/tickets.sqlite', autoSave: true, entities: [TicketEntity], synchronize: true }).initialize()
const config = configSchema.parse({ model: process.env.TRIAGE_MODEL ?? 'deepseek-r1:14b', baseUrl: process.env.TRIAGE_BASE_URL ?? 'http://127.0.0.1:11434/v1', enableFailureDemo: true, timeoutMs: 120000 })
const service = new TriageService(db.getRepository(TicketEntity), { config })
const view = new TriageView(service)
const context = { tenantId: 'preview-tenant', organizationId: 'preview-org', userId: 'preview-user', hostId: 'preview-assistant', hostType: 'agent', slots: [] }
const requestSchema = z.object({ type: z.enum(['requestData', 'executeAction']), query: z.object({ parameters: z.record(z.string()).optional() }).optional(), actionKey: z.string().optional(), input: z.record(z.unknown()).optional() }).strict()
const host = `<!doctype html><html><head><meta charset="utf-8"><title>Support Triage · Development Host</title><style>html,body{margin:0;height:100%;font-family:system-ui}body{display:flex;flex-direction:column}header{padding:10px 20px;background:#18181b;color:white;font-size:13px}iframe{flex:1;width:100%;border:0;min-height:0}</style></head><body><header>DEVELOPMENT VIEW HOST · Same plugin assets + real database + real model · Not installed Xpert acceptance</header><iframe id="frame" title="Support triage" sandbox="allow-scripts" src="/frame"></iframe><script>
const frame=document.getElementById('frame'); const instanceId=crypto.randomUUID();
window.addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow||event.data?.channel!=='xpertai.remote_component')return;
 const m=event.data; const send=body=>frame.contentWindow.postMessage({channel:m.channel,protocolVersion:1,instanceId,requestId:m.requestId,...body},'*');
 if(m.type==='ready'){send({type:'init',locale:'zh-Hans',debug:{enabled:false},theme:{colorScheme:'light',density:'default'}});return}
 if(m.instanceId!==instanceId||!['requestData','executeAction'].includes(m.type))return;
 try{const response=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:m.type,...(m.type==='requestData'?{query:m.query}:{actionKey:m.actionKey,input:m.input})})});const result=await response.json();send(m.type==='requestData'?{type:'data',data:result}:{type:'actionResult',result})}catch{send({type:'error',message:'preview_unavailable'})}
});</script></body></html>`
createServer(async (request, response) => {
  try {
    if (request.url === '/') { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(host); return }
    if (request.url === '/frame') { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(await readFile(new URL('../dist/remote/inbox.html', import.meta.url))); return }
    if (request.url === '/rpc' && request.method === 'POST') {
      let raw = ''
      for await (const chunk of request) { raw += chunk; if (raw.length > 64000) throw new Error('too_large') }
      const input = requestSchema.parse(JSON.parse(raw))
      const result = input.type === 'requestData' ? await view.getViewData(context, VIEW, input.query ?? {}) :
        await view.executeViewAction(context, VIEW, input.actionKey ?? '', { input: input.input ?? {} })
      response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(result)); return
    }
    response.writeHead(404).end()
  } catch { response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ success: false, data: { code: 'invalid_input' } })) }
}).listen(4318, '127.0.0.1', () => console.log('Development View Host: http://127.0.0.1:4318 (not Xpert acceptance)'))

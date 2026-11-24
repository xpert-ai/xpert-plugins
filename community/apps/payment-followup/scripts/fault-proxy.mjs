// Local acceptance infrastructure only; never imported by the plugin runtime.
// Pass-through responses come from the actual DeepSeek API, never a fixture.
import { createServer } from 'node:http'
import { readFile, appendFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const control=process.env.PAYMENT_FAULT_CONTROL
const audit=process.env.PAYMENT_FAULT_LOG
const port=Number(process.env.PAYMENT_FAULT_PORT??39091)
if(!control||!audit||!Number.isInteger(port)||port<1024||port>65535)
  throw new Error('Provide PAYMENT_FAULT_CONTROL, PAYMENT_FAULT_LOG and a valid local port.')
let sequence=0
const server=createServer(async(req,res)=>{
  if(req.method!=='POST'||req.url!=='/v1/chat/completions'){
    res.writeHead(404);res.end();return
  }
  const id=++sequence, at=new Date().toISOString()
  let body=Buffer.alloc(0)
  try{
    for await(const chunk of req){body=Buffer.concat([body,chunk]);if(body.length>2_000_000)throw Error('body limit')}
    const payload=JSON.parse(body.toString('utf8'))
    const {mode}=JSON.parse(await readFile(control,'utf8'))
    if(!['fail','pass'].includes(mode))throw Error('invalid mode')
    const entry={id,at,mode,model:String(payload.model).slice(0,64),stream:payload.stream===true,
      tools:(payload.tools??[]).map(t=>t.function?.name).filter(n=>typeof n==='string')}
    if(mode==='fail'){
      await appendFile(audit,JSON.stringify({...entry,injected:true,status:503})+'\n',{mode:0o600})
      res.writeHead(503,{'content-type':'application/json','retry-after':'0'})
      res.end(JSON.stringify({error:{message:'Controlled acceptance test: model service unavailable (HTTP 503).',type:'server_error',code:'payment_fault_injected'}}))
      return
    }
    // Fixed destination and path: this is not a general-purpose forward proxy.
    const upstream=await fetch('https://api.deepseek.com/v1/chat/completions',{
      method:'POST',headers:{'content-type':'application/json',authorization:req.headers.authorization??''},
      body,signal:AbortSignal.timeout(90000)
    })
    await appendFile(audit,JSON.stringify({...entry,injected:false,status:upstream.status})+'\n',{mode:0o600})
    res.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')??'application/json','cache-control':'no-store'})
    if(upstream.body)await pipeline(Readable.fromWeb(upstream.body),res)
    else res.end()
  }catch{
    await appendFile(audit,JSON.stringify({id,at,status:502,proxyError:true})+'\n',{mode:0o600}).catch(()=>{})
    if(!res.headersSent){res.writeHead(502,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'Acceptance proxy transport failure'}}))}
    else res.destroy()
  }
})
server.listen(port,'127.0.0.1',()=>console.log('Acceptance proxy ready on loopback port '+port+'. Logs exclude credentials, prompts and response bodies.'))
process.on('SIGTERM',()=>server.close())
process.on('SIGINT',()=>server.close())

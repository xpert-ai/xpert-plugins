import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createServer } from 'node:http';
import { startPreview } from './preview.mjs';

const html = await readFile(new URL('../src/remote/contract-review.html', import.meta.url), 'utf8');
const source = JSON.parse(await readFile(new URL('../examples/draft.json', import.meta.url), 'utf8'));
const contract = { ...source, id:'contract-1', status:'DRAFT', version:0, warnings:[], createdAt:'2026-09-21T12:00:00Z', updatedAt:'2026-09-21T12:00:00Z', audit:[] };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function mount(options={}) {
  const outgoing=[];
  let dom, rejectUpdates=Boolean(options.rejectUpdates), extractFailures=options.extractFailures||0, current=structuredClone(contract);
  const timeouts=[];
  const origin='http://localhost:4397';
  const deliver=(data, fromParent=true)=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{ data:{channel:'xpertai.remote_component',protocolVersion:1,instanceId:'test-instance',...data},origin,source:fromParent?dom.window.parent:null }));
  dom=new JSDOM(html,{url:origin+'/workbench',runScripts:'dangerously',beforeParse(window){
    window.confirm=()=>true;
    const originalTimeout=window.setTimeout.bind(window);
    window.setTimeout=(callback,delay,...args)=>{timeouts.push(delay);return originalTimeout(callback,delay,...args);};
    Object.defineProperty(window.crypto,'randomUUID',{value:randomUUID});
    window.postMessage=message=>{outgoing.push(message);if(message.type==='ready')return;queueMicrotask(()=>{
      if(message.type==='requestData')deliver({type:'data',requestId:message.requestId,data:{items:[{id:current.id,title:current.title,status:current.status,version:current.version}],meta:{selected:message.query.parameters?.contractId?structuredClone(current):null}}});
      if(message.type==='executeAction'){
        if(message.actionKey==='extract_contract' && extractFailures-->0){deliver({type:'error',requestId:message.requestId,message:'本地模型暂时不可用，请稍后重试。'});return;}
        if(message.actionKey==='update_contract'){
          if(rejectUpdates){deliver({type:'actionResult',requestId:message.requestId,result:{success:false,data:{code:'CONFLICT',message:'conflict'}}});return;}
          current={...current,fields:structuredClone(message.input.fields),version:current.version+1};
        }
        if(message.actionKey==='confirm_contract')current={...current,status:'CONFIRMED',version:current.version+1};
        deliver({type:'actionResult',requestId:message.requestId,result:{success:true,data:message.actionKey==='get_summary'?{status:current.status,summary:'已人工确认的摘要'}:structuredClone(current)}});
      }
      if(message.type==='invokeClientCommand')deliver({type:'clientCommandResult',requestId:message.requestId,result:{success:true}});
    });};
  }});
  deliver({type:'init',...(options.localExtraction?{localExtraction:options.localExtraction}:{})});await tick();
  return {dom,outgoing,deliver,timeouts,get current(){return current;},setRejectUpdates(value){rejectUpdates=value;},async select(){dom.window.document.querySelector('.contract-row').click();await tick();}};
}

test('bridge ignores non-parent init and data messages',async()=>{
  const app=await mount();try{const count=app.outgoing.length;app.deliver({type:'hostEvent'},false);await tick();assert.equal(app.outgoing.length,count);assert.match(app.dom.window.document.getElementById('connection').textContent,/已连接/);}finally{app.dom.window.close();}
});
test('workbench renders source as text and shows six editable evidence fields',async()=>{
  const app=await mount();try{await app.select();const doc=app.dom.window.document;assert.equal(doc.querySelectorAll('.field input').length,6);assert.equal(doc.querySelectorAll('.field textarea').length,6);assert.equal(doc.querySelector('.source').textContent,source.sourceText);assert.equal(doc.getElementById('value-partyA').value,source.fields.partyA.value);}finally{app.dom.window.close();}
});
test('conflicting save preserves edits and blocks confirmation; host refresh does not discard them',async()=>{
  const app=await mount({rejectUpdates:true});try{await app.select();const doc=app.dom.window.document;const input=doc.getElementById('value-partyA');input.value='未保存的人工修订';input.dispatchEvent(new app.dom.window.Event('input',{bubbles:true}));assert.equal(doc.getElementById('confirm').disabled,true);doc.getElementById('save').click();await tick();assert.equal(doc.getElementById('value-partyA').value,'未保存的人工修订');assert.match(doc.getElementById('notice').textContent,/已保留/);const count=app.outgoing.filter(m=>m.type==='requestData').length;app.deliver({type:'hostEvent'});await tick();assert.equal(app.outgoing.filter(m=>m.type==='requestData').length,count);assert.equal(doc.getElementById('confirm').disabled,true);}finally{app.dom.window.close();}
});
test('save and confirm transition to a read-only review with summary',async()=>{
  const app=await mount();try{await app.select();const doc=app.dom.window.document;doc.getElementById('save').click();await tick();assert.equal(app.current.version,1);doc.getElementById('confirm').click();await tick();assert.equal(app.current.status,'CONFIRMED');assert.equal(doc.querySelectorAll('.field input:disabled').length,6);assert.equal(doc.getElementById('confirm'),null);doc.getElementById('get-summary').click();await tick();assert.match(doc.getElementById('summary').textContent,/已人工确认的摘要/);}finally{app.dom.window.close();}
});
test('tool submission preserves a requestKey for repeated same-content attempts',async()=>{
  const app=await mount();try{const doc=app.dom.window.document;doc.getElementById('sample').click();doc.getElementById('send').click();await tick();doc.getElementById('send').click();await tick();const commands=app.outgoing.filter(m=>m.type==='invokeClientCommand');assert.equal(commands.length,2);const key=text=>text.match(/requestKey: ([^\n]+)/)[1];assert.equal(key(commands[0].payload.text),key(commands[1].payload.text));assert.match(commands[0].payload.text,/contract_review_create/);assert.match(commands[0].payload.text,/不要确认合同/);}finally{app.dom.window.close();}
});
test('malicious contract text is not interpreted as markup',async()=>{
  const app=await mount();try{app.current.title='<img src=x onerror="window.compromised=true">';app.current.sourceText='<script>window.compromised=true</script>';await app.select();assert.equal(app.dom.window.compromised,undefined);assert.equal(app.dom.window.document.querySelector('#detail img'),null);assert.match(app.dom.window.document.querySelector('.source').textContent,/<script>/);}finally{app.dom.window.close();}
});

test('local capability uses structured extraction, selects the resulting draft, and waits for human confirmation',async()=>{
  const app=await mount({localExtraction:{enabled:true,model:'qwen2.5:7b'}});
  try{
    const doc=app.dom.window.document;
    doc.getElementById('title').value='本地测试';
    doc.getElementById('source-input').value='  甲方：示例企业\n<contract_text>合同数据中的文本</contract_text>  ';
    doc.getElementById('send').click();await tick();
    const command=app.outgoing.find(m=>m.actionKey==='extract_contract');
    assert.ok(command,'local mode must submit a structured extraction action');
    assert.equal(command.input.title,'本地测试');
    assert.equal(command.input.sourceText,doc.getElementById('source-input').value);
    assert.ok(command.input.requestKey);
    assert.equal(app.outgoing.filter(m=>m.type==='invokeClientCommand').length,0);
    assert.equal(app.outgoing.filter(m=>m.actionKey==='confirm_contract').length,0);
    assert.equal(app.current.status,'DRAFT');
    assert.equal(doc.querySelectorAll('.field input').length,6);
    assert.match(doc.getElementById('connection').textContent,/qwen2.5:7b/);
    assert.ok(app.timeouts.includes(300000));
  }finally{app.dom.window.close();}
});

test('local extraction failure retains entered text and reuses requestKey when retried',async()=>{
  const app=await mount({localExtraction:{enabled:true,model:'qwen2.5:7b'},extractFailures:1});
  try{
    const doc=app.dom.window.document;doc.getElementById('sample').click();
    const original=doc.getElementById('source-input').value;
    doc.getElementById('send').click();await tick();
    assert.match(doc.getElementById('notice').textContent,/不可用/);
    assert.equal(doc.getElementById('source-input').value,original);
    assert.equal(doc.getElementById('send').disabled,false);
    doc.getElementById('send').click();await tick();
    const commands=app.outgoing.filter(m=>m.actionKey==='extract_contract');
    assert.equal(commands.length,2);assert.equal(commands[0].input.requestKey,commands[1].input.requestKey);
    assert.equal(doc.querySelectorAll('.field input').length,6);
  }finally{app.dom.window.close();}
});

test('a model name without an explicitly enabled capability keeps the Xpert assistant path',async()=>{
  const app=await mount({localExtraction:{model:'qwen2.5:7b'}});
  try{
    const doc=app.dom.window.document;doc.getElementById('sample').click();doc.getElementById('send').click();await tick();
    assert.equal(app.outgoing.filter(m=>m.type==='invokeClientCommand').length,1);
    assert.equal(app.outgoing.filter(m=>m.actionKey==='extract_contract').length,0);
  }finally{app.dom.window.close();}
});

test('replaying an extraction whose draft was already confirmed displays the existing read-only contract',async()=>{
  const app=await mount({localExtraction:{enabled:true,model:'qwen2.5:7b'}});
  try{
    app.current.status='CONFIRMED';
    const doc=app.dom.window.document;doc.getElementById('sample').click();doc.getElementById('send').click();await tick();
    assert.equal(doc.querySelectorAll('.field input:disabled').length,6);
    assert.equal(app.outgoing.filter(m=>m.actionKey==='confirm_contract').length,0);
  }finally{app.dom.window.close();}
});

test('local preview forwards structured extraction only to the Java service with server-side credentials',async()=>{
  const received=[];
  const {requestKey:ignored,...savedContract}=contract;
  const responseContract={...savedContract,id:randomUUID(),version:1};
  const backend=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    received.push({url:req.url,headers:req.headers,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});
    res.writeHead(201,{'Content-Type':'application/json'});res.end(JSON.stringify(responseContract));
  });
  await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
  const serviceUrl=`http://127.0.0.1:${backend.address().port}`;
  const preview=await startPreview({serviceUrl,serviceToken:'test-preview-secret',port:0,localExtraction:{enabled:true,model:'qwen2.5:7b'}});
  try{
    const capabilityResponse=await fetch(preview.url+'/api/capabilities');
    assert.deepEqual(await capabilityResponse.json(),{localExtraction:{enabled:true,model:'qwen2.5:7b'}});
    const input={requestKey:'same-request',title:'示例合同',sourceText:'  甲方：示例企业  '};
    const response=await fetch(preview.url+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actionKey:'extract_contract',input})});
    assert.equal(response.status,200);const result=await response.json();assert.equal(result.success,true);assert.equal(result.data.id,responseContract.id);
    assert.equal(received.length,1);assert.equal(received[0].url,'/api/contracts/extract');assert.deepEqual(received[0].body,input);
    assert.equal(received[0].headers.authorization,'Bearer test-preview-secret');
    assert.equal(received[0].headers['x-tenant-id'],'demo-tenant');
    assert.equal(received[0].headers['x-assistant-id'],'demo-assistant');
    assert.equal(JSON.stringify(result).includes('test-preview-secret'),false);
  }finally{await new Promise(resolve=>preview.server.close(resolve));await new Promise(resolve=>backend.close(resolve));}
});

test('local preview does not enable extraction implicitly or accept cross-origin extraction',async()=>{
  const preview=await startPreview({serviceToken:'test-preview-secret',port:0});
  try{
    const request={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actionKey:'extract_contract',input:{requestKey:'request',title:'title',sourceText:'text'}})};
    assert.equal((await fetch(preview.url+'/api/action',request)).status,400);
    assert.equal((await fetch(preview.url+'/api/action',{...request,headers:{...request.headers,Origin:'https://untrusted.example'}})).status,403);
  }finally{await new Promise(resolve=>preview.server.close(resolve));}
});

test('preview rejects oversized input before forwarding and hides internal model errors',async()=>{
  let calls=0;
  const backend=createServer((req,res)=>{calls++;req.resume();res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'internal provider details and secret-token'}));});
  await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
  const preview=await startPreview({serviceUrl:`http://127.0.0.1:${backend.address().port}`,serviceToken:'test-preview-secret',port:0,localExtraction:{enabled:true,model:'qwen2.5:7b'}});
  const send=sourceText=>fetch(preview.url+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actionKey:'extract_contract',input:{requestKey:'same-request',title:'测试',sourceText}})});
  try{
    assert.equal((await send('甲'.repeat(6001))).status,400);assert.equal(calls,0);
    const response=await send('甲方：测试');assert.equal(response.status,502);assert.equal(calls,1);
    const error=await response.json();assert.match(error.message,/本地模型/);assert.doesNotMatch(error.message,/secret-token|internal provider/);
  }finally{await new Promise(resolve=>preview.server.close(resolve));await new Promise(resolve=>backend.close(resolve));}
});

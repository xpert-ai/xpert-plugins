import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';

const html = await readFile(new URL('../src/remote/contract-review.html', import.meta.url), 'utf8');
const source = JSON.parse(await readFile(new URL('../examples/draft.json', import.meta.url), 'utf8'));
const contract = { ...source, id:'contract-1', status:'DRAFT', version:0, warnings:[], createdAt:'2026-09-21T12:00:00Z', updatedAt:'2026-09-21T12:00:00Z', audit:[] };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function mount(options={}) {
  const outgoing=[];
  let dom, rejectUpdates=Boolean(options.rejectUpdates), current=structuredClone(contract);
  const origin='http://localhost:4397';
  const deliver=(data, fromParent=true)=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{ data:{channel:'xpertai.remote_component',protocolVersion:1,instanceId:'test-instance',...data},origin,source:fromParent?dom.window.parent:null }));
  dom=new JSDOM(html,{url:origin+'/workbench',runScripts:'dangerously',beforeParse(window){
    window.confirm=()=>true;
    Object.defineProperty(window.crypto,'randomUUID',{value:randomUUID});
    window.postMessage=message=>{outgoing.push(message);if(message.type==='ready')return;queueMicrotask(()=>{
      if(message.type==='requestData')deliver({type:'data',requestId:message.requestId,data:{items:[{id:current.id,title:current.title,status:current.status,version:current.version}],meta:{selected:message.query.parameters?.contractId?structuredClone(current):null}}});
      if(message.type==='executeAction'){
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
  deliver({type:'init'});await tick();
  return {dom,outgoing,deliver,get current(){return current;},setRejectUpdates(value){rejectUpdates=value;},async select(){dom.window.document.querySelector('.contract-row').click();await tick();}};
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

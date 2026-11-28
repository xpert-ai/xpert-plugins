import 'reflect-metadata'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM, VirtualConsole} from 'jsdom'
import {TicketView} from '../dist/ticket.view.js'
const tick=()=>new Promise(resolve=>setTimeout(resolve,30))
test('packaged React UI mounts, creates through the host bridge, preserves draft on locale update and ignores foreign frames',async()=>{
  const view=new TicketView({})
  const entry=await view.getRemoteComponentEntry({hostType:'agent'},'tickets',{entry:'aftersales_ticket__workbench',isolation:'iframe'})
  const failures=[]
  const vc=new VirtualConsole()
  vc.on('jsdomError',e=>{if(e.type!=='css parsing') failures.push(e.message)})
  const dom=new JSDOM(entry.html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://local.test/',virtualConsole:vc})
  const w=dom.window
  try {
    const outgoing=[]
    w.postMessage=message=>outgoing.push(message)
    const incoming=m=>w.dispatchEvent(new w.MessageEvent('message',{source:w,data:{channel:'xpertai.remote_component',protocolVersion:1,instanceId:'test',...m}}))
    await tick()
    incoming({type:'init',locale:'zh-Hans'})
    await tick()
    const query=outgoing.find(m=>m.type==='requestData')
    assert.ok(query,'initialization requests persisted data')
    incoming({type:'data',requestId:query.requestId,data:{items:[],total:0}})
    await tick()
    const button=label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===label)
    assert.ok(button('新建工单'))
    button('新建工单').click(); await tick()
    const field=w.document.querySelector('#ticket-title')
    assert.ok(field,'shared dialog contains the form')
    const set=(selector,value)=>{const el=w.document.querySelector(selector);const proto=el.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}))}
    set('#ticket-title','物流延迟');set('#ticket-description','订单三天未送达');await tick()
    incoming({type:'init',locale:'en'});await tick()
    assert.equal(w.document.querySelector('#ticket-title').value,'物流延迟')
    assert.ok(button('Save ticket'))
    button('Save ticket').click();await tick()
    const create=outgoing.find(m=>m.type==='executeAction')
    assert.equal(create.actionKey,'create');assert.equal(create.input.title,'物流延迟');assert.match(create.input.commandId,/^[a-f0-9-]{36}$/)
    // A different frame cannot complete this pending mutation.
    w.dispatchEvent(new w.MessageEvent('message',{source:null,data:{channel:'xpertai.remote_component',protocolVersion:1,instanceId:'test',type:'actionResult',requestId:create.requestId,result:{success:true}}}))
    await tick();assert.ok(w.document.querySelector('#ticket-title'))
    incoming({type:'actionResult',requestId:create.requestId,result:{success:true}});await tick()
    assert.equal(w.document.querySelector('#ticket-title'),null)
    const latest=outgoing.filter(m=>m.type==='requestData').at(-1)
    incoming({type:'data',requestId:latest.requestId,data:{items:[],total:0}});await tick()
    assert.deepEqual(failures,[])
  } finally {w.close()}
})
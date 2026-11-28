import 'reflect-metadata'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {TicketMiddleware} from '../dist/ticket.middleware.js'
import {TicketView} from '../dist/ticket.view.js'
import {TicketService} from '../dist/ticket.service.js'
import {FEATURE, MIDDLEWARE} from '../dist/constants.js'
import {templates} from '../dist/ticket.templates.js'
const scope={tenantId:'t',organizationId:'o',ownerId:'u'}
const context={hostType:'agent',tenantId:'t',organizationId:'o',userId:'u'}
function fixture(){
  const rows=new Map()
  const matches=(r,w)=>r&&Object.entries(w).every(([k,v])=>r[k]===v)
  const repo={
    async findOneBy(where){const row=rows.get(where.id);return matches(row,where)?{...row}:null},
    async insert(row){if(rows.has(row.id))throw Object.assign(new Error('duplicate'),{code:'23505'});rows.set(row.id,{...row,createdAt:new Date()})},
    async update(where,patch){const row=rows.get(where.id);if(!matches(row,where))return {affected:0};Object.assign(row,patch);return {affected:1}},
    async findAndCount({where}){const found=[...rows.values()].filter(r=>matches(r,where));return [found,found.length]}
  }
  return {rows,service:new TicketService(repo)}
}
test('idempotent create handles concurrent retry without overwriting or duplicating',async()=>{
  const {service,rows}=fixture(), id=randomUUID(), input={title:'退款',description:'申请退款'}
  const results=await Promise.all([service.create(scope,input,id),service.create(scope,input,id)])
  assert.equal(results[0].id,results[1].id);assert.equal(rows.size,1)
  await assert.rejects(service.create(scope,{...input,title:'改变内容'},id),/creation_conflict/)
  await assert.rejects(service.create({...scope,ownerId:'other'},input,id),/creation_conflict/)
  assert.equal(rows.get(id).title,'退款')
})
test('tool-to-human View path persists edited reply; model has no confirmation tool',async()=>{
  const {service}=fixture(), view=new TicketView(service), id=randomUUID()
  const created=await view.executeViewAction(context,'tickets','create',{input:{commandId:id,title:'退款',description:'申请退款'}})
  assert.equal(created.success,true)
  const middleware=new TicketMiddleware(service).createMiddleware({},context)
  assert.equal(middleware.tools.length,5)
  assert.equal(middleware.tools.some(t=>t.name.includes('confirm')),false)
  const invoke=async(name,input)=>JSON.parse(await middleware.tools.find(t=>t.name===name).invoke(input))
  const begun=await invoke('aftersales_begin_analysis',{id})
  assert.equal(begun.data.attempt,1)
  const saved=await invoke('aftersales_save_analysis',{id,attempt:1,analysis:{category:'refund',priority:'normal',questions:['订单编号？'],replyDraft:'请提供订单编号。'}})
  assert.equal(saved.success,true)
  assert.match(saved.instruction,/never sends customer messages/)
  const data=await view.getViewData(context,'tickets',{page:1})
  assert.equal(data.items[0].reply,'请提供订单编号。')
  assert.equal(data.items[0].deliveryStatus,'not_sent')
  const stale=await view.executeViewAction(context,'tickets','confirm',{targetId:id,input:{attempt:2,reply:'错误版本'}})
  assert.equal(stale.success,false)
  assert.equal((await view.executeViewAction(context,'tickets','confirm',{targetId:id,input:{attempt:1,reply:'您好，请提供订单编号，我们将核实。'}})).success,true)
  assert.equal((await service.get(scope,id)).finalReply,'您好，请提供订单编号，我们将核实。')
  assert.equal((await invoke('aftersales_begin_analysis',{id})).success,false)
})
test('middleware fails closed without acting organization or user',()=>{
  const middleware=new TicketMiddleware({})
  assert.throws(()=>middleware.createMiddleware({},{...context,organizationId:null}),/scope_required/)
  assert.throws(()=>middleware.createMiddleware({},{...context,userId:''}),/scope_required/)
})
test('view activation, template wiring and packaged React entry agree',async()=>{
  const view=new TicketView({})
  const manifest=view.getViewManifests(context,'agent.workbench.main')[0]
  assert.deepEqual(manifest.activation.requiredFeatures,[FEATURE])
  assert.equal(manifest.view.type,'remote_component')
  assert.equal(view.getViewManifests(context,'agent.workbench').length,1)
  assert.deepEqual(templates[0].targetApps,['xpert','data-xpert'])
  assert.ok(templates[0].targetAppMeta.xpert)
  assert.match(templates[0].dslContent,/confirmed 仅表示人工确认并保存/)
  assert.ok(templates[0].dslContent.includes('provider: '+MIDDLEWARE))
  const entry=await view.getRemoteComponentEntry(context,'tickets',manifest.view.component)
  assert.match(entry.html,/xpertai.remote_component/)
  assert.match(entry.html,/aftersales_ticket|售后工单|Aftersales tickets/)
  assert.ok(entry.html.length>10000)
  await assert.rejects(view.getRemoteComponentEntry(context,'wrong',manifest.view.component),/unsupported_view/)
})
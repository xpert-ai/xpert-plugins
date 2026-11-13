import 'reflect-metadata'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {DataSource} from 'typeorm'
import {ResearchTaskEntity} from '../src/task.entity.js'
import {PersistentTaskStore} from '../src/task.store.js'
import {Research} from '../src/domain/research.js'
import {createSchema,reviewSchema} from '../src/domain/contracts.js'
import {scope,fixture} from './fixture.js'
import {ResearchViewProvider} from '../src/view.provider.js'
import {ShadowResearchMiddleware,TOOL_NAMES} from '../src/middleware.js'
import {FEATURE,VIEW,NAMESPACE,ROLES} from '../src/constants.js'
import {getMetadataArgsStorage} from 'typeorm'
import type {XpertResolvedViewHostContext} from '@xpert-ai/contracts'

async function setup(){
  const dir=await mkdtemp(path.join(tmpdir(),'shadow-research-'))
  const file=path.join(dir,'tasks.sqlite')
  const open=()=>new DataSource({type:'sqljs',location:file,autoSave:true,synchronize:true,entities:[ResearchTaskEntity]}).initialize()
  let db=await open();let now=new Date('2026-10-23T06:31:00Z')
  const make=()=>new Research(new PersistentTaskStore(db.getRepository(ResearchTaskEntity)),()=>now)
  return {get research(){return make()},advance(){now=new Date(now.getTime()+301000)},async reopen(){await db.destroy();db=await open()},async close(){await db.destroy();await rm(dir,{recursive:true,force:true})}}
}
async function investigate(r:Research,id:string){
  await r.begin(scope,id)
  for(const sortBy of ['amount','change_pct','turnover_pct','pe_ratio'] as const)await r.search(scope,{taskId:id,sortBy,direction:sortBy==='pe_ratio'?'asc':'desc',offset:0,limit:5})
  await r.evidence(scope,{taskId:id,code:'600000'})
}
const review=(id:string,selectedCode:string|null=null,vetoes:string[]=[],role:typeof ROLES[number]='fundamental')=>reviewSchema.parse({taskId:id,role,summary:'离线测试模型判断，不代表真实模型执行。',risks:['模拟数据仅用于测试'],candidates:['600000'],vetoes,selectedCode,evidenceIds:['snapshot:600000','financial:600000']})

test('durable full business loop, idempotent creation, human confirmation, reopening and scope isolation',async()=>{
 const env=await setup();try{
  const input=fixture(),r=env.research,t=await r.create(scope,input)
  assert.equal((await r.create(scope,input)).taskId,t.taskId)
  await assert.rejects(r.get({...scope,userId:'other'},t.taskId),/not_found/)
  await assert.rejects(r.get({...scope,tenantId:'other'},t.taskId),/not_found/)
  await investigate(r,t.taskId)
  for(const role of ROLES.slice(0,3))await r.submit(scope,review(t.taskId,null,[],role))
  const ready=await r.submit(scope,review(t.taskId,'600000',[],'decision'));assert.equal(ready.status,'ready')
  await assert.rejects(r.confirm(scope,t.taskId,1),/conflict/)
  const saved=await r.confirm(scope,t.taskId,ready.revision);assert.equal(saved.status,'confirmed')
  await env.reopen();const restored=await env.research.get(scope,t.taskId)
  assert.equal(restored.reviews.length,4);assert.equal(restored.status,'confirmed');assert.ok(restored.confirmedAt)
  assert.equal(restored.snapshotHash,t.snapshotHash)
 }finally{await env.close()}
})
test('interrupted task requires expired lease; retry preserves frozen data and does not duplicate a task',async()=>{
 const env=await setup();try{
  const r=env.research,t=await r.create(scope,fixture());await r.begin(scope,t.taskId)
  await assert.rejects(r.fail(scope,t.taskId,'lease_expired'),/lease_active/)
  env.advance();const failed=await env.research.fail(scope,t.taskId,'lease_expired')
  const retried=await env.research.retry(scope,t.taskId,failed.revision)
  assert.equal(retried.status,'draft');assert.equal(retried.snapshotHash,t.snapshotHash)
  assert.equal((await env.research.list(scope)).total,1)
  assert.equal((await env.research.get(scope,t.taskId)).attempts.length,1)
 }finally{await env.close()}
})
test('veto, unknown evidence and premature selection are rejected; abstention can be confirmed',async()=>{
 const env=await setup();try{
  const r=env.research,t=await r.create(scope,fixture());await investigate(r,t.taskId)
  await assert.rejects(r.submit(scope,review(t.taskId,'600000')),/selection_only/)
  await assert.rejects(r.submit(scope,{...review(t.taskId),evidenceIds:['invented']}),/unknown_evidence/)
  await r.submit(scope,review(t.taskId));await r.submit(scope,review(t.taskId,null,[],'technical'));await r.submit(scope,review(t.taskId,null,['600000'],'risk'))
  await assert.rejects(r.submit(scope,review(t.taskId,'600000',[],'decision')),/risk_veto/)
  const abstain=await r.submit(scope,review(t.taskId,null,[],'decision'));assert.equal(abstain.status,'abstained')
  assert.equal((await r.confirm(scope,t.taskId,abstain.revision)).status,'confirmed')
 }finally{await env.close()}
})
test('CAS prevents concurrent writes and missing financial data cannot become a selected result',async()=>{
 const env=await setup();try{
  const r=env.research,t=await r.create(scope,fixture())
  const starts=await Promise.allSettled([r.begin(scope,t.taskId),r.begin(scope,t.taskId)])
  assert.equal(starts.filter(s=>s.status==='fulfilled').length,1)
  await r.search(scope,{taskId:t.taskId,sortBy:'amount',direction:'desc',offset:0,limit:20})
  const v=review(t.taskId);v.evidenceIds=['snapshot:600000']
  for(const role of ROLES.slice(0,3))await r.submit(scope,{...v,role})
  await assert.rejects(r.submit(scope,{...v,role:'decision',selectedCode:'600000'}),/explore_four_dimensions/)
  for(const sortBy of ['change_pct','turnover_pct','pe_ratio'] as const)await r.search(scope,{taskId:t.taskId,sortBy,direction:sortBy==='pe_ratio'?'asc':'desc',offset:0,limit:5})
  await assert.rejects(r.submit(scope,{...v,role:'decision',selectedCode:'600000'}),/requires_market_and_financial/)
 }finally{await env.close()}
})
test('invalid snapshots: future data, duplicate stocks and extra properties',()=>{
 const input=fixture();input.snapshot.stocks[0].quote_time='2026-10-24T00:00:00Z'
 assert.equal(createSchema.safeParse(input).success,false)
 const dup=fixture();dup.snapshot.stocks.push(dup.snapshot.stocks[0]);assert.equal(createSchema.safeParse(dup).success,false)
 assert.equal(createSchema.safeParse({...fixture(),tenantId:'spoofed'}).success,false)
})
test('view contract shares persistence, enforces scope and keeps confirmation out of Agent tools',async()=>{
 const env=await setup();try{
  const context:XpertResolvedViewHostContext={...scope,hostType:'agent',hostId:scope.xpertId,slots:[]}
  const provider=new ResearchViewProvider(env.research)
  const manifests=provider.getViewManifests(context,'agent.workbench.main')
  assert.deepEqual(manifests[0].activation?.requiredFeatures,[FEATURE])
  assert.deepEqual(provider.getViewManifests({...context,hostType:'integration'},'agent.workbench.main'),[])
  const result=await provider.executeViewAction(context,VIEW,'create',{input:fixture()});assert.equal(result.success,true)
  assert.equal((await env.research.list(scope)).total,1)
  const t=(await env.research.list(scope)).items[0]
  await assert.rejects(provider.getViewData({...context,userId:'other'},VIEW,{parameters:{taskId:t.taskId}}),/not_found/)
  const middleware=new ShadowResearchMiddleware(env.research)
  assert.deepEqual(middleware.getToolNames(),[...TOOL_NAMES]);assert.ok(!TOOL_NAMES.some(n=>n.includes('confirm')))
  const table=getMetadataArgsStorage().tables.find(t=>t.target===ResearchTaskEntity)
  assert.equal(table?.name,`plugin_${NAMESPACE}_tasks`)
 }finally{await env.close()}
})

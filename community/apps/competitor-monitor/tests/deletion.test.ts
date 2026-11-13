// 自动化验证：使用隔离测试数据验证业务结果，不连接真实店铺或操作平台记录。
import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { DataSource } from 'typeorm'
import { ENTITIES, MonitorItem, CollectionRound, Snapshot, MonitorChange, Advice } from '../dist/lib/entities.js'
import { MonitorService } from '../dist/lib/service.js'
const scope = { tenantId: 'delete-tenant', organizationId: 'org-a' }
async function setup() {
 const db = await new DataSource({ type: 'sqljs', entities: ENTITIES, synchronize: true }).initialize()
 const service = new MonitorService(db.getRepository(MonitorItem), db.getRepository(CollectionRound), db.getRepository(Snapshot), db.getRepository(MonitorChange), db.getRepository(Advice))
 return {db,service}
}
async function seed(service: MonitorService, s=scope) {
 await service.addItem(s,{itemId:'6543210',title:'耳机'})
 await service.addItem(s,{itemId:'6543212',title:'保温杯'})
 await service.collect(s,{idempotencyKey:'baseline'})
 const result=await service.collect(s,{idempotencyKey:'changes'})
 for(const c of result.changes)await service.createAdvice(s,{operationId:crypto.randomUUID(),changeId:c.id,category:'promotion_adjustment',content:'建议',reason:'证据'})
 return result
}
// 分别验证四类记录及全量清空的关联范围、组织隔离和重新建立基线。
for(const target of ['items','rounds','changes','advice','all'] as const) test(`delete ${target}: preview, cascade, scoped atomic deletion and fresh baseline`,async()=>{
 const {db,service}=await setup()
 try{
  const round=await seed(service)
  const other={...scope,organizationId:'org-b'};await seed(service,other)
  const foreign={tenantId:'other-tenant',organizationId:scope.organizationId};await seed(service,foreign)
  const entities={items:MonitorItem,rounds:CollectionRound,changes:MonitorChange,advice:Advice}
  const rows=target==='all'?[]:await db.manager.find(entities[target],{where:scope})
  const ids=target==='all'?[]:rows.slice(0,target==='items'?2:1).map(row=>row.id)
  const request={target,ids}
  const plan=await service.deleteRecords(scope,request)
  assert.equal(plan.deleted,false)
  assert.equal(await db.getRepository(MonitorItem).countBy(scope),2)
  if(target==='all') assert.deepEqual(plan.counts,{items:2,rounds:2,snapshots:4,changes:5,advice:5})
  assert.equal((await service.deleteRecords(scope,{...request,confirmation:plan.confirmation})).deleted,true)
  for(const s of [other,foreign]) {
   assert.equal(await db.getRepository(MonitorItem).countBy(s),2)
   assert.equal(await db.getRepository(CollectionRound).countBy(s),2)
   assert.equal(await db.getRepository(Snapshot).countBy(s),4)
   assert.equal(await db.getRepository(MonitorChange).countBy(s),5)
   assert.equal(await db.getRepository(Advice).countBy(s),5)
  }
  if(target==='all'||target==='items') {
   assert.equal(await db.getRepository(MonitorItem).countBy(scope),0)
   assert.equal(await db.getRepository(Snapshot).countBy(scope),0)
   assert.equal(await db.getRepository(MonitorChange).countBy(scope),0)
   assert.equal(await db.getRepository(Advice).countBy(scope),0)
   await service.addItem(scope,{itemId:'6543210',title:'重新测试'})
   assert.equal((await service.collect(scope,{idempotencyKey:'fresh'})).changes.length,0)
  } else if(target==='rounds') {
   assert.equal(await db.getRepository(Snapshot).countBy({...scope,roundId:ids[0]}),0)
   assert.equal(await db.getRepository(MonitorChange).countBy({...scope,roundId:ids[0]}),0)
  } else if(target==='changes') assert.equal(await db.getRepository(Advice).countBy({...scope,changeId:ids[0]}),0)
  else assert.equal(await db.getRepository(MonitorChange).countBy({...scope,roundId:round.round.id}),5)
 }finally{await db.destroy()}
})
// 验证目标：缺少组织、越界选择、陈旧确认和运行中操作均被拒绝。
test('reject missing organization, foreign IDs, invalid selection, stale confirmation and active analysis/collection',async()=>{
 const {db,service}=await setup()
 try{
  const round=await seed(service)
  const all={target:'all',ids:[]}
  await assert.rejects(service.deleteRecords({...scope,organizationId:null},all),/选择组织/)
  await assert.rejects(service.deleteRecords(scope,{target:'advice',ids:[]}),/请选择/)
  await assert.rejects(service.deleteRecords(scope,{target:'items',ids:['foreign']}),/不属于/)
  await assert.rejects(service.deleteRecords(scope,{target:'all',ids:['invalid']}),/请选择/)
  const plan=await service.deleteRecords(scope,all)
  await service.toggle(scope,'6543210')
  await assert.rejects(service.deleteRecords(scope,{...all,confirmation:plan.confirmation}),/数据已变化/)
  await service.prepareAnalysis(scope,round.round.id)
  await assert.rejects(service.deleteRecords(scope,all),/正在采集或分析/)
  // Activity is persisted, so another instance/restart cannot ignore it.
  assert.ok((await db.getRepository(CollectionRound).findOneByOrFail({id:round.round.id})).analysisStartedAt)
  await service.finishAnalysis(scope,round.round.id)
  const collecting=service.collect(scope,{idempotencyKey:'running'})
  await assert.rejects(service.deleteRecords(scope,all),/正在处理/)
  await collecting
  const fresh=await service.deleteRecords(scope,all)
  await service.deleteRecords(scope,{...all,confirmation:fresh.confirmation})
  assert.equal(await db.getRepository(MonitorItem).count(),0)
 }finally{await db.destroy()}
})
// 验证目标：中途删除失败时，所有关联删除整体回滚。
test('transaction rolls back earlier deletes if a later delete fails',async()=>{
 const {db,service}=await setup()
 try{
  await seed(service)
  const all={target:'all',ids:[]};const plan=await service.deleteRecords(scope,all)
  const table=db.getMetadata(MonitorItem).tableName
  await db.query(`CREATE TRIGGER reject_item_delete BEFORE DELETE ON "${table}" BEGIN SELECT RAISE(ABORT, 'test rollback'); END`)
  await assert.rejects(service.deleteRecords(scope,{...all,confirmation:plan.confirmation}),/test rollback/)
  assert.equal(await db.getRepository(Advice).countBy(scope),5)
  assert.equal(await db.getRepository(MonitorChange).countBy(scope),5)
  assert.equal(await db.getRepository(Snapshot).countBy(scope),4)
  assert.equal(await db.getRepository(CollectionRound).countBy(scope),2)
  assert.equal(await db.getRepository(MonitorItem).countBy(scope),2)
 }finally{await db.destroy()}
})

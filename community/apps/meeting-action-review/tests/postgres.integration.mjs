import 'reflect-metadata'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { MeetingRecord, AnalysisAttempt } from '../dist/lib/entities.js'
import { MeetingRecordService } from '../dist/lib/meeting-record.service.js'
import { AnalysisService } from '../dist/lib/analysis.service.js'
import { AnalysisBackgroundService } from '../dist/lib/analysis-background.service.js'

// Dedicated disposable database only; never infer a connection from production configuration.
const url = process.env.MAR_TEST_DATABASE_URL
if (!url || new URL(url).pathname !== '/meeting_review_test') throw new Error('MAR_TEST_DATABASE_URL must name the disposable meeting_review_test database')
const db = new DataSource({ type: 'postgres', url, entities: [MeetingRecord,AnalysisAttempt], synchronize: false })
const scope = { tenantId: randomUUID(), organizationId: randomUUID(), ownerUserId: randomUUID(), assistantId: randomUUID() }
const records = new MeetingRecordService(db, { timeoutSeconds: 120, debug: false }, { tenantId: scope.tenantId, scopeKey: `tenant:${scope.tenantId}` })
const analysis = new AnalysisService(db)
const create = () => ({ title: '接口会议', sourceText: '小李周五前整理接口清单。\n可以考虑改版，但尚未决定。', operationId: randomUUID() })
const output = { items: [{ task: '整理接口清单', owner: '小李', deadlineText: '周五前', sourceSegmentIds: ['S001'], reviewNote: null }] }
async function running(record) {
  await db.manager.update(AnalysisAttempt,{ id: record.activeAttemptId },{ agentKey: 'Agent_MeetingActionReview', status: 'running' })
  const a = await db.manager.findOneByOrFail(AnalysisAttempt,{ id: record.activeAttemptId })
  return { ...scope, conversationId: a.conversationId, agentKey: a.agentKey }
}
before(async () => { await db.initialize(); await db.synchronize(true) })
after(async () => { if (db.isInitialized) await db.destroy() })

test('concurrent create with lost response returns one record and one attempt', async () => {
  const input = create()
  const [a,b] = await Promise.all([records.create(scope,input),records.create(scope,input)])
  assert.equal(a.id,b.id)
  assert.equal(await db.manager.countBy(AnalysisAttempt,{recordId:a.id}),1)
  await assert.rejects(records.create(scope,{...input,title:'不同内容'}),/OPERATION_CONFLICT/)
})
test('valid extraction, latest edits and confirmation persist atomically and remain immutable', async () => {
  const row = await records.create(scope,create()), tool = await running(row)
  await analysis.submit(tool,output)
  let detail = await records.detail(scope,row.id)
  const input = { meetingId:row.id, expectedRevision:detail.revision, operationId:randomUUID(), items:detail.items.map(({id,task,owner,deadlineText})=>({id,task,owner,deadlineText:'下周一'})) }
  await records.save(scope,input,true)
  await records.save(scope,input,true) // response loss, same request
  detail=await records.detail(scope,row.id)
  assert.equal(detail.status,'confirmed'); assert.equal(detail.items[0].deadlineText,'下周一'); assert.equal(detail.items[0].humanAdjusted,true)
  assert.equal(detail.initialItems[0].deadlineText,'周五前'); assert.ok(detail.confirmedAt)
  await assert.rejects(records.save(scope,{...input,operationId:randomUUID(),expectedRevision:detail.revision}),/ALREADY_CONFIRMED/)
  assert.equal((await analysis.submit(tool,output)).accepted,true) // receipt replay cannot change human result
  assert.equal((await records.detail(scope,row.id)).items[0].deadlineText,'下周一')
})
test('failed attempt retries on same meeting; duplicate retry and late old result are isolated', async () => {
  const row=await records.create(scope,create()), oldTool=await running(row)
  await analysis.finishFailure(row.activeAttemptId,'TEST_INJECTED_FAILURE')
  const before=await records.detail(scope,row.id)
  const retry={meetingId:row.id,expectedRevision:before.revision,operationId:randomUUID()}
  const [a,b]=await Promise.all([records.retry(scope,retry),records.retry(scope,retry)])
  assert.equal(a.activeAttemptId,b.activeAttemptId); assert.notEqual(a.activeAttemptId,row.activeAttemptId)
  assert.equal(await db.manager.countBy(AnalysisAttempt,{recordId:row.id}),2)
  await assert.rejects(analysis.submit(oldTool,output),/ATTEMPT_EXPIRED/)
  await analysis.submit(await running(a),output)
  assert.equal((await records.detail(scope,row.id)).status,'review_ready')
})
test('empty result can be confirmed; malformed references do not partially save', async () => {
  const row=await records.create(scope,create()), tool=await running(row)
  await assert.rejects(analysis.submit(tool,{items:[...output.items,{...output.items[0],sourceSegmentIds:['S999']}]}),/SOURCE_REFERENCE_INVALID/)
  assert.equal((await records.detail(scope,row.id)).items,null)
  await analysis.submit(tool,{items:[]})
  const d=await records.detail(scope,row.id)
  await records.save(scope,{meetingId:row.id,expectedRevision:d.revision,operationId:randomUUID(),items:[]},true)
  assert.deepEqual((await records.detail(scope,row.id)).items,[])
})
test('stale saves, foreign owners and foreign conversations cannot overwrite', async () => {
  const row=await records.create(scope,create()), tool=await running(row)
  await analysis.submit(tool,output)
  const d=await records.detail(scope,row.id)
  const input={meetingId:row.id,expectedRevision:d.revision,operationId:randomUUID(),items:d.items.map(({id,task,owner,deadlineText})=>({id,task,owner,deadlineText}))}
  await records.save(scope,input)
  await records.save(scope,input)
  await assert.rejects(records.save(scope,{...input,operationId:randomUUID()}),/VERSION_CONFLICT/)
  await assert.rejects(records.detail({...scope,ownerUserId:randomUUID()},row.id),/NOT_FOUND/)
  await assert.rejects(analysis.submit({...tool,conversationId:randomUUID()},output),/NO_ACTIVE_CONTEXT/)
})
test('late success cannot reopen timeout, and concurrent success/failure has one coherent terminal state',async()=>{
  const late=await records.create(scope,create()), lateTool=await running(late)
  await db.manager.update(AnalysisAttempt,{id:late.activeAttemptId},{deadlineAt:new Date(Date.now()-1000)})
  await analysis.finishFailure(late.activeAttemptId,'ANALYSIS_TIMEOUT',true)
  await assert.rejects(analysis.submit(lateTool,output),/ATTEMPT_EXPIRED/)
  const row=await records.create(scope,create()), tool=await running(row)
  await Promise.allSettled([analysis.submit(tool,output),analysis.finishFailure(row.activeAttemptId,'ANALYSIS_FAILED')])
  const d=await records.detail(scope,row.id)
  assert.ok((d.status==='review_ready' && d.attempt.status==='succeeded' && d.items.length===1) || (d.status==='failed' && d.attempt.status==='failed' && d.items===null))
})
test('PostgreSQL enforces one active attempt and matching ownership/current record',async()=>{
  const row=await records.create(scope,create())
  const existing=await db.manager.findOneByOrFail(AnalysisAttempt,{id:row.activeAttemptId})
  await assert.rejects(db.manager.insert(AnalysisAttempt,{...existing,id:randomUUID(),attemptNo:2,requestOperationId:randomUUID(),clientMessageId:randomUUID(),conversationId:randomUUID(),rootExecutionId:randomUUID()}),/duplicate key/)
  const other=await records.create(scope,create())
  await assert.rejects(db.manager.update(MeetingRecord,{id:row.id},{activeAttemptId:other.activeAttemptId}),/foreign key/)
  const indexes=await db.query("SELECT indexname FROM pg_indexes WHERE tablename LIKE 'plugin_meeting_action_review_%'")
  assert.ok(indexes.some(i=>i.indexname==='meeting_action_review_attempt_active'))
})
test('background dispatch preserves identity, does not treat queue success as extraction, and fences wrong actors',async()=>{
  const row=await records.create(scope,create())
  let dispatched=0, observed='running'
  const calls=[]
  const api={
    getPublishedContext:async()=>({primaryAgentKey:'Agent_MeetingActionReview',publishedVersion:'1',features:['meeting-action-review']}),
    startTask:async input=>{dispatched++;calls.push(structuredClone(input));return {status:'running',conversationId:input.conversationId,executionId:input.executionId}},
    getTaskStatus:async()=>({status:observed})
  }
  const queue={getExecutionPoolHealth:async()=>({available:true,workerCount:1}),enqueue:async()=>({jobId:'test'})}
  const background=new AnalysisBackgroundService(analysis,{get:()=>api},{tenantId:scope.tenantId,scopeKey:`tenant:${scope.tenantId}`},{timeoutSeconds:120,debug:false},queue)
  const job={name:'dispatch',data:{meetingId:row.id,attemptId:row.activeAttemptId},attemptsMade:0,updateData:async()=>{}}
  const context={tenantId:scope.tenantId,organizationId:scope.organizationId,userId:scope.ownerUserId,scopeKey:`tenant:${scope.tenantId}`}
  await assert.rejects(background.handle(job,{...context,userId:randomUUID()}),/NOT_FOUND/)
  await background.handle(job,context);await background.handle(job,context)
  assert.equal(dispatched,1);assert.equal(calls[0].taskId,undefined)
  const a=await db.manager.findOneByOrFail(AnalysisAttempt,{id:row.activeAttemptId})
  assert.equal(calls[0].conversationId,a.conversationId)
  assert.equal((await records.detail(scope,row.id)).status,'processing')
  observed='succeeded'
  await background.handle(job,context)
  assert.equal((await records.detail(scope,row.id)).attempt.errorCode,'NO_VALID_RESULT')
})
test('startup recovery expires persisted attempts even when the queue capability is unavailable',async()=>{
  const row=await records.create(scope,create())
  await db.manager.update(AnalysisAttempt,{id:row.activeAttemptId},{deadlineAt:new Date(Date.now()-1000)})
  const background=new AnalysisBackgroundService(analysis,{get:()=>undefined},{tenantId:scope.tenantId,scopeKey:`tenant:${scope.tenantId}`},{timeoutSeconds:120,debug:false},undefined)
  try{
    background.start()
    for(let i=0;i<40;i++){
      if((await records.detail(scope,row.id)).status==='failed')break
      await new Promise(r=>setTimeout(r,25))
    }
    const detail=await records.detail(scope,row.id)
    assert.equal(detail.status,'failed');assert.equal(detail.attempt.errorCode,'ANALYSIS_TIMEOUT')
  }finally{background.stop()}
})

test('navigation handles require an actual receipt or accepted result, and retry never exposes the old session',async()=>{
  const row=await records.create(scope,create())
  assert.deepEqual((await records.detail(scope,row.id)).analysisSession,{state:'pending'})
  const tool=await running(row)
  assert.equal((await records.detail(scope,row.id)).analysisSession.state,'pending')
  await analysis.submit(tool,output)
  const ready=(await records.detail(scope,row.id)).analysisSession
  assert.equal(ready.state,'ready');assert.equal(ready.conversationId,tool.conversationId)
  await assert.rejects(records.detail({...scope,ownerUserId:randomUUID()},row.id),/NOT_FOUND/)
  const failed=await records.create(scope,create())
  await analysis.finishFailure(failed.activeAttemptId,'ANALYSIS_FAILED')
  assert.deepEqual((await records.detail(scope,failed.id)).analysisSession,{state:'unavailable'})
  const prior=await records.detail(scope,failed.id)
  await records.retry(scope,{meetingId:failed.id,expectedRevision:prior.revision,operationId:randomUUID()})
  assert.deepEqual((await records.detail(scope,failed.id)).analysisSession,{state:'pending'})
})

test('a late dispatch receipt enriches the finished attempt without reopening business state',async()=>{
  const row=await records.create(scope,create()), threadId=randomUUID()
  const api={getPublishedContext:async()=>({primaryAgentKey:'Agent_MeetingActionReview',publishedVersion:'1',features:['meeting-action-review']}),
    getTaskStatus:async()=>null,startTask:async input=>{
      await analysis.submit({...scope,conversationId:input.conversationId,agentKey:input.agentKey},output)
      return {status:'running',conversationId:input.conversationId,executionId:input.executionId,threadId}
    }}
  const installation={tenantId:scope.tenantId,scopeKey:`tenant:${scope.tenantId}`}
  const queue={getExecutionPoolHealth:async()=>({available:true,workerCount:1})}
  const bg=new AnalysisBackgroundService(analysis,{get:()=>api},installation,{timeoutSeconds:120,debug:false},queue)
  await bg.handle({data:{meetingId:row.id,attemptId:row.activeAttemptId}},
    {tenantId:scope.tenantId,organizationId:scope.organizationId,userId:scope.ownerUserId,scopeKey:installation.scopeKey})
  const d=await records.detail(scope,row.id)
  assert.equal(d.status,'review_ready');assert.equal(d.attempt.status,'succeeded');assert.equal(d.revision,2)
  assert.equal(d.analysisSession.threadId,threadId)
  assert.ok((await db.manager.findOneByOrFail(AnalysisAttempt,{id:row.activeAttemptId})).startedAt)
})

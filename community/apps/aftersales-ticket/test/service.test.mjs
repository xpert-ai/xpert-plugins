import 'reflect-metadata'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {TicketService} from '../dist/ticket.service.js'
const scope = {tenantId:'t', organizationId:'o', ownerId:'u'}
const analysis = {category:'refund',priority:'normal',questions:[],replyDraft:'Please provide the order number.'}
function fixture() {
  const row = {...scope,id:'one',title:'Refund',description:'Please refund',status:'draft',attempt:0}
  const matches = where => Object.entries(where).every(([k,v]) => row[k] === v)
  const repo = {
    async findOneBy(where) {return matches(where) ? {...row} : null},
    async update(where, patch) {if (!matches(where)) return {affected:0}; Object.assign(row,patch); return {affected:1}}
  }
  return {row, service:new TicketService(repo)}
}
test('concurrent starts claim only one attempt',async()=>{
  const {service,row}=fixture()
  const results=await Promise.allSettled([service.beginAnalysis(scope,'one'),service.beginAnalysis(scope,'one')])
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
  assert.equal(row.attempt,1)
})
test('failure retry rejects stale completion and saves the current result',async()=>{
  const {service,row}=fixture()
  await service.beginAnalysis(scope,'one')
  await service.failAnalysis(scope,'one',1)
  await service.beginAnalysis(scope,'one')
  await assert.rejects(service.saveAnalysis(scope,'one',1,analysis),/stale_analysis/)
  await service.saveAnalysis(scope,'one',2,analysis)
  assert.equal(row.status,'awaiting_review')
  assert.deepEqual(row.analysis,analysis)
})
test('cross-user and cross-organization writes cannot mutate the ticket',async()=>{
  const {service,row}=fixture()
  for(const denied of [{...scope,ownerId:'other'},{...scope,organizationId:'other'},{...scope,tenantId:'other'}]){
    await assert.rejects(service.beginAnalysis(denied,'one'),/ticket_not_found/)
    await assert.rejects(service.saveAnalysis(denied,'one',0,analysis),/stale_analysis/)
  }
  assert.equal(row.status,'draft')
})
test('invalid model output cannot change state',async()=>{
  const {service,row}=fixture()
  await service.beginAnalysis(scope,'one')
  await assert.rejects(service.saveAnalysis(scope,'one',1,{...analysis,priority:'urgent'}))
  assert.equal(row.status,'analyzing')
})
test('human confirmation is conditional and records actor and edited reply',async()=>{
  const {service,row}=fixture()
  await service.beginAnalysis(scope,'one')
  await service.saveAnalysis(scope,'one',1,analysis)
  await assert.rejects(service.confirm(scope,'one',0,'Edited'),/review_outdated/)
  await service.confirm(scope,'one',1,' Edited ')
  assert.equal(row.status,'confirmed')
  assert.equal(row.finalReply,'Edited')
  assert.equal(row.confirmedBy,'u')
  await assert.rejects(service.confirm(scope,'one',1,'Overwrite'),/review_outdated/)
  assert.equal(row.finalReply,'Edited')
})
test('concurrent timeout takeovers admit one new attempt and reject late writes',async()=>{
  const {service,row}=fixture()
  row.status='analyzing';row.attempt=1;row.updatedAt=new Date(Date.now()-600000)
  const results=await Promise.allSettled([service.beginAnalysis(scope,'one'),service.beginAnalysis(scope,'one')])
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
  assert.equal(row.attempt,2)
  await assert.rejects(service.saveAnalysis(scope,'one',1,analysis),/stale_analysis/)
  await assert.rejects(service.failAnalysis(scope,'one',1),/stale_analysis/)
  await service.saveAnalysis(scope,'one',2,analysis)
  assert.equal(row.status,'awaiting_review')
})
test('a refreshed timestamp invalidates a stale timeout claim',async()=>{
  const row={...scope,id:'one',title:'Refund',description:'Request',status:'analyzing',attempt:1,updatedAt:new Date(Date.now()-600000)}
  const service=new TicketService({
    async findOneBy(){const snapshot={...row};row.updatedAt=new Date();return snapshot},
    async update(where,patch){if(!Object.entries(where).every(([k,v])=>row[k]===v))return {affected:0};Object.assign(row,patch);return {affected:1}}
  })
  await assert.rejects(service.beginAnalysis(scope,'one'),/analysis_conflict/)
  assert.equal(row.attempt,1)
})
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
const require = createRequire(import.meta.url)
require('reflect-metadata')
const { PaymentMiddleware } = require('../dist/lib/payment.middleware.js')
const d = require('../dist/lib/domain.js')

function setup() {
  const recordId = randomUUID(), attemptId = randomUUID()
  const input = { customerName:'Failure sample', invoiceNumber:'AR-FAULT', outstandingCents:400000,
    dueDate:'2026-10-25', communicationDate:'2026-11-01', source:'客户：11月5日全额支付四千元。' }
  const state = d.newState(input)
  d.begin(state, 0, attemptId, new Date())
  const identity = { tenantId:'tenant', organizationId:'org', userId:'user', xpertId:'assistant' }
  const calls = []
  const service = { async fail(scope, id, attempt, code) {
    calls.push({scope,id,attempt,code})
    d.fail(state, attempt, code, new Date())
    return state
  } }
  const middleware = new PaymentMiddleware(service).createMiddleware({}, identity)
  const request = { runtime:{configurable:{context:{paymentFollowup:{recordId,attemptId}}}} }
  return {state,input,recordId,attemptId,calls,service,middleware,request}
}
const failure = () => Object.assign(new Error('controlled provider failure'), {status:503})

test('model failure records a safe business reason using trusted scope, retaining input', async () => {
  const f = setup(), error = failure()
  await assert.rejects(f.middleware.wrapModelCall(f.request, async () => {throw error}), e=>e===error)
  assert.equal(f.state.status,'failed')
  assert.equal(f.state.error,'model_failed')
  assert.deepEqual(f.state.input,f.input)
  assert.equal(f.state.aiResult,null)
  assert.equal(f.state.attempts[0].status,'failed')
  assert.deepEqual(f.calls[0].scope,{tenantId:'tenant',organizationId:'org',userId:'user',assistantId:'assistant'})
})
test('successful model response passes through without failing the current attempt', async () => {
  const f = setup(), reply = {content:'response'}
  assert.equal(await f.middleware.wrapModelCall(f.request,async()=>reply),reply)
  assert.equal(f.state.status,'processing')
  assert.equal(f.calls.length,0)
})
test('late model error cannot fail a new retry attempt', async () => {
  const f = setup(), error = failure()
  await assert.rejects(f.middleware.wrapModelCall(f.request,async()=>{
    d.fail(f.state,f.attemptId,'user_cancelled',new Date())
    d.begin(f.state,f.state.revision,randomUUID(),new Date())
    throw error
  }),e=>e===error)
  assert.equal(f.state.status,'processing')
  assert.notEqual(f.state.attemptId,f.attemptId)
  assert.equal(f.state.error,null)
})
test('model error after a tool saved the draft cannot discard that draft', async () => {
  const f=setup(), error=failure()
  const analysis={summary:'11月5日全额付款',promises:[{amountCents:400000,paymentDate:'2026-11-05',condition:'',evidenceLineIds:[1]}],blockers:[],questions:[],suggestedAction:'核对后跟进'}
  await assert.rejects(f.middleware.wrapModelCall(f.request,async()=>{
    d.submit(f.state,f.attemptId,analysis,new Date());throw error
  }),e=>e===error)
  assert.equal(f.state.status,'review')
  assert.deepEqual(f.state.aiResult,analysis)
})
test('ordinary chat without active payment context preserves model errors without changing records',async()=>{
  const f=setup(), error=failure()
  await assert.rejects(f.middleware.wrapModelCall({runtime:{context:{}}},async()=>{throw error}),e=>e===error)
  assert.equal(f.calls.length,0)
})
test('failure persistence outage does not replace the original provider exception',async()=>{
  const f=setup(), error=failure()
  f.service.fail=async()=>{throw new Error('database unavailable')}
  await assert.rejects(f.middleware.wrapModelCall(f.request,async()=>{throw error}),e=>e===error)
  assert.equal(f.state.status,'processing')
})

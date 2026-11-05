import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { DemandService } from '../dist/service.js'
import { DemandEntity } from '../dist/entity.js'
import { BusinessError, type Assessment, type Scope } from '../dist/domain.js'
import type { Evaluator } from '../dist/jev.js'

const scope: Scope = { tenantId: 'test-tenant', organizationId: 'test-org', userId: 'test-user' }
const assessment: Assessment = {
  model: 'fixture-only', evaluatedAt: '2026-09-22T00:00:00Z', category: 'miniapp', categoryConfidence: 0.9,
  categoryProbabilities: { miniapp: 0.9, unclear: 0.1 }, nextStep: 'discovery', nextStepConfidence: 0.8,
  nextStepProbabilities: { discovery: 0.8, clarify: 0.2 }, urgency: 2.1, urgencyConfidence: 0.8,
  completeness: { goal: 0.9, budget: 0.1, timeline: 0.8, decisionMaker: 0.1 }, priority: 'high', reviewRequired: false,
  inputTokens: 0, outputTokens: 0
}
const input = () => ({ requestId: randomUUID(), title: '门店询价小程序', customer: '合成测试客户', source: '三家汽配门店需要小程序给维修厂查库存和询价，希望六周上线。' })
async function setup(evaluator: Evaluator = { evaluate: async () => assessment }) {
  const db = new DataSource({ type: 'sqljs', entities: [DemandEntity], synchronize: true, logging: false })
  await db.initialize()
  return { db, service: new DemandService(db.getRepository(DemandEntity), evaluator) }
}

test('complete loop is stored and restored through a new database connection', async () => {
  const { db, service } = await setup()
  const created = await service.create(scope, input())
  const analyzed = await service.evaluate(scope, created.id)
  assert.equal(analyzed.status, 'review')
  const confirmed = await service.confirm(scope, created.id, { revision: analyzed.revision,
    category: 'miniapp', priority: 'normal', nextStep: 'discovery', note: '先确认实际库存同步方式与预算。' })
  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.assessment?.priority, 'high')
  assert.equal(confirmed.decision?.priority, 'normal')
  const database = db.driver.databaseConnection.export()
  await db.destroy()
  const reopened = new DataSource({ type: 'sqljs', database, entities: [DemandEntity], synchronize: false })
  await reopened.initialize()
  const restored = await new DemandService(reopened.getRepository(DemandEntity), { evaluate: async () => assessment }).get(scope, created.id)
  assert.deepEqual(restored, confirmed)
  await reopened.destroy()
})

test('one failed model call can retry without creating a second demand', async () => {
  let calls = 0
  const { db, service } = await setup({ evaluate: async () => { if (++calls === 1) throw new BusinessError('model_busy'); return assessment } })
  try {
    const created = await service.create(scope, input())
    const failed = await service.evaluate(scope, created.id)
    assert.equal(failed.status, 'failed'); assert.equal(failed.errorCode, 'model_busy')
    const retry = await service.evaluate(scope, created.id)
    assert.equal(retry.status, 'review'); assert.equal(retry.attempts.length, 2)
    assert.equal(retry.attempts[0].status, 'failed'); assert.equal(retry.attempts[1].status, 'succeeded')
    await service.evaluate(scope, created.id)
    assert.equal(calls, 2); assert.equal((await service.list(scope)).total, 1)
  } finally { await db.destroy() }
})

test('records cannot cross user, organization or tenant scope', async () => {
  const { db, service } = await setup()
  try {
    const created = await service.create(scope, input())
    for (const other of [{ ...scope, userId: 'other' }, { ...scope, organizationId: 'other' }, { ...scope, tenantId: 'other' }]) {
      assert.equal((await service.list(other)).total, 0)
      await assert.rejects(service.get(other, created.id), /not_found/)
      await assert.rejects(service.evaluate(other, created.id), /not_found/)
      await assert.rejects(service.confirm(other, created.id, { revision: 1, category: 'miniapp', priority: 'normal', nextStep: 'discovery', note: 'test' }), /not_found/)
    }
    await assert.rejects(service.list({ ...scope, userId: '' }), /scope_required/)
  } finally { await db.destroy() }
})

test('stale edits cannot overwrite a newer version and source edits invalidate old decisions', async () => {
  const { db, service } = await setup()
  try {
    const data = input(); const created = await service.create(scope, data)
    const analyzed = await service.evaluate(scope, created.id)
    const confirmed = await service.confirm(scope, created.id, { revision: analyzed.revision, category: 'miniapp', priority: 'normal', nextStep: 'discovery', note: '确认' })
    await assert.rejects(service.edit(scope, created.id, { title: data.title, customer: data.customer, source: data.source, revision: 1 }), /revision_conflict/)
    const edited = await service.edit(scope, created.id, { title: data.title, customer: data.customer, source: data.source + '预算待定。', revision: confirmed.revision })
    assert.equal(edited.status, 'draft'); assert.equal(edited.assessment, null); assert.equal(edited.decision, null)
  } finally { await db.destroy() }
})

test('idempotency key does not create duplicates or silently accept different input', async () => {
  const { db, service } = await setup()
  try {
    const data = input()
    const first = await service.create(scope, data)
    const again = await service.create(scope, data)
    assert.equal(first.id, again.id)
    await assert.rejects(service.create(scope, { ...data, source: '这是另一条客户提出的完全不同的业务需求。' }), /request_conflict/)
    await assert.rejects(service.create(scope, { ...data, requestId: randomUUID(), source: '太短' }))
  } finally { await db.destroy() }
})

test('concurrent evaluation reserves one attempt and prevents edits until completion', async () => {
  let release!: (value: Assessment) => void
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  const { db, service } = await setup({ evaluate: () => { started(); return new Promise(resolve => { release = resolve }) } })
  try {
    const data = input(); const created = await service.create(scope, data)
    const pending = service.evaluate(scope, created.id)
    await ready
    await assert.rejects(service.evaluate(scope, created.id), /evaluation_running/)
    const { requestId: _requestId, ...editable } = data
    await assert.rejects(
      service.edit(scope, created.id, { ...editable, revision: created.revision }),
      /evaluation_running/
    )
    release(assessment)
    assert.equal((await pending).status, 'review')
  } finally { await db.destroy() }
})

test('interrupted attempts expire and can be recovered without stale completion overwrites', async () => {
  const { db, service } = await setup()
  try {
    const created = await service.create(scope, input())
    await db.getRepository(DemandEntity).update(created.id, { status: 'evaluating', leaseUntil: '2000-01-01T00:00:00Z', attempts: [{ id: 'interrupted', startedAt: '2000-01-01T00:00:00Z', status: 'running' }] })
    const recovered = await service.evaluate(scope, created.id)
    assert.equal(recovered.status, 'review'); assert.equal(recovered.attempts[0].errorCode, 'interrupted')
  } finally { await db.destroy() }
})

test('search and status filters preserve pagination and tenant scoping', async () => {
  const { db, service } = await setup()
  try {
    await service.create(scope, input()); await service.create(scope, { ...input(), title: '100% 专属网页' })
    assert.equal((await service.list(scope, { search: '%' })).total, 1)
    assert.equal((await service.list(scope, { pageSize: 1 })).records.length, 1)
    assert.equal((await service.list(scope, { status: 'confirmed' })).total, 0)
  } finally { await db.destroy() }
})

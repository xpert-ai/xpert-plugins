import 'reflect-metadata'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { TicketRecord } from '../src/ticket.entity.js'
import { TicketService } from '../src/ticket.service.js'
import { analysisSchema, createTicketSchema, TriageError, type Analysis, type Scope } from '../src/domain/contracts.js'

const scope: Scope = { tenantId: 'tenant-a', organizationId: 'org-a', workspaceId: 'workspace-a', userId: 'user-a', xpertId: 'assistant-a' }
const message = '付款后被重复扣款两次，订单还显示未支付，请帮我核对。'
const analysis: Analysis = { summary: '客户反馈重复扣款及支付状态异常', category: 'billing', priority: 'normal',
  evidence: ['重复扣款两次', '订单还显示未支付'], missingInfo: ['订单号', '支付时间'],
  replyDraft: '您好，我们已收到您关于重复扣款的反馈。请提供订单号和支付时间以便核对。', rationale: '涉及扣款与支付状态，归入账单支付；原文未说明更大业务影响。' }
let database: DataSource
let service: TicketService
beforeEach(async () => {
  database = new DataSource({ type: 'sqljs', entities: [TicketRecord], synchronize: true, logging: false })
  await database.initialize()
  service = new TicketService(database.getRepository(TicketRecord))
})
afterEach(async () => { if (database?.isInitialized) await database.destroy() })
const create = () => service.create(scope, { requestId: randomUUID(), title: '付款异常', customerAlias: '客户 A', message })
const rejects = (promise: Promise<object>, code: TriageError['code']) => assert.rejects(promise, (error: Error) => error instanceof TriageError && error.code === code)
async function pending() {
  const created = await create()
  const attempt = await service.analyze(scope, { ticketId: created.ticketId, expectedRevision: created.revision })
  const saved = await service.saveAnalysis(scope, { ticketId: created.ticketId, attemptId: attempt.attemptId, analysis })
  return { ...saved, attemptId: attempt.attemptId }
}

test('full persisted flow: create, read source, analysis, modified human confirmation and reload', async () => {
  const created = await create()
  assert.equal(created.status, 'new')
  const attempt = await service.analyze(scope, { ticketId: created.ticketId, expectedRevision: 1 })
  assert.equal(attempt.commandKey, 'assistant.chat.send_message')
  assert.ok(attempt.payload.text.includes(attempt.attemptId))
  const source = await service.readForAgent(scope, { ticketId: created.ticketId, attemptId: attempt.attemptId })
  assert.equal(source.message, message)
  const saved = await service.saveAnalysis(scope, { ticketId: created.ticketId, attemptId: attempt.attemptId, analysis })
  assert.equal(saved.status, 'pending_review')
  const confirmed = await service.confirm(scope, { ticketId: created.ticketId, expectedRevision: saved.revision,
    confirmationId: randomUUID(), category: 'technical', priority: 'high', reply: '人工修改后的正式处理建议。' })
  assert.equal(confirmed.status, 'confirmed')
  const reloadedService = new TicketService(database.getRepository(TicketRecord))
  const ticket = await reloadedService.get(scope, created.ticketId)
  assert.equal(ticket.confirmedReply, '人工修改后的正式处理建议。')
  assert.equal(ticket.category, 'technical')
  assert.equal(ticket.priority, 'high')
  assert.equal(ticket.analysis?.category, 'billing')
  assert.equal(ticket.confirmedBy, scope.userId)
  assert.ok(ticket.confirmedAt)
  assert.deepEqual(ticket.history.map(event => event.event), ['created', 'analysis_started', 'analysis_saved', 'confirmed'])
  assert.deepEqual(ticket.history.map(event => event.revision), [1, 2, 3, 4])
})

test('same request is idempotent; changed body under same request ID is rejected', async () => {
  const input = { requestId: randomUUID(), title: '付款异常', customerAlias: '客户 A', message }
  const first = await service.create(scope, input)
  const second = await service.create(scope, input)
  assert.equal(first.ticketId, second.ticketId)
  assert.equal(second.duplicate, true)
  await rejects(service.create(scope, { ...input, title: '不同内容' }), 'idempotency_conflict')
  assert.equal(await database.getRepository(TicketRecord).count(), 1)
})

test('concurrent duplicate creation has exactly one database row', async () => {
  const input = { requestId: randomUUID(), title: '付款异常', customerAlias: '客户 A', message }
  const results = await Promise.all([service.create(scope, input), service.create(scope, input)])
  assert.equal(results[0].ticketId, results[1].ticketId)
  assert.equal(await database.getRepository(TicketRecord).count(), 1)
})

test('each context dimension blocks reads, actions and lists across ownership boundaries', async () => {
  const record = await create()
  for (const key of Object.keys(scope) as (keyof Scope)[]) {
    const other = { ...scope, [key]: 'other' }
    await rejects(service.get(other, record.ticketId), 'not_found')
    await rejects(service.analyze(other, { ticketId: record.ticketId, expectedRevision: 1 }), 'not_found')
    assert.equal((await service.list(other, { page: 1, pageSize: 20 })).total, 0)
  }
})

test('missing identity fails closed instead of querying unscoped data', async () => {
  await assert.rejects(service.list({ ...scope, organizationId: '' }, { page: 1, pageSize: 20 }))
  await assert.rejects(service.create({ ...scope, userId: '' }, { requestId: randomUUID(), title: 'A', customerAlias: 'A', message: 'A' }))
})

test('simultaneous start actions result in one attempt and one conflict', async () => {
  const record = await create()
  const results = await Promise.allSettled([service.analyze(scope, { ticketId: record.ticketId, expectedRevision: 1 }), service.analyze(scope, { ticketId: record.ticketId, expectedRevision: 1 })])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal((await service.get(scope, record.ticketId)).history.length, 2)
})

test('unquoted evidence cannot be saved and does not corrupt processing state', async () => {
  const record = await create()
  const attempt = await service.analyze(scope, { ticketId: record.ticketId, expectedRevision: 1 })
  await rejects(service.saveAnalysis(scope, { ticketId: record.ticketId, attemptId: attempt.attemptId,
    analysis: { ...analysis, evidence: ['客户已经同意退款'] } }), 'invalid_evidence')
  assert.equal((await service.get(scope, record.ticketId)).status, 'processing')
})

test('strict schemas reject unknown identity/approval fields, enum errors and empty arrays', () => {
  assert.equal(createTicketSchema.safeParse({ requestId: randomUUID(), title: 'A', customerAlias: 'A', message: 'A', userId: 'admin' }).success, false)
  assert.equal(analysisSchema.safeParse({ ...analysis, status: 'confirmed' }).success, false)
  assert.equal(analysisSchema.safeParse({ ...analysis, category: 'invented' }).success, false)
  assert.equal(analysisSchema.safeParse({ ...analysis, evidence: [] }).success, false)
})

test('analysis retry returns one idempotent receipt and rejects conflicting duplicate output', async () => {
  const ticket = await pending()
  const duplicate = await service.saveAnalysis(scope, { ticketId: ticket.ticketId, attemptId: ticket.attemptId, analysis })
  assert.equal(duplicate.duplicate, true)
  await rejects(service.saveAnalysis(scope, { ticketId: ticket.ticketId, attemptId: ticket.attemptId, analysis: { ...analysis, priority: 'high' } }), 'idempotency_conflict')
  assert.equal((await service.get(scope, ticket.ticketId)).revision, 3)
})

test('failed attempts persist reason and a new attempt rejects late old callbacks', async () => {
  const record = await create()
  const first = await service.analyze(scope, { ticketId: record.ticketId, expectedRevision: 1 })
  const failed = await service.reportFailure(scope, { ticketId: record.ticketId, attemptId: first.attemptId, reason: '暂时无法完成分析' })
  assert.equal((await service.get(scope, record.ticketId)).failureReason, '暂时无法完成分析')
  const second = await service.analyze(scope, { ticketId: record.ticketId, expectedRevision: failed.revision })
  assert.notEqual(first.attemptId, second.attemptId)
  await rejects(service.saveAnalysis(scope, { ticketId: record.ticketId, attemptId: first.attemptId, analysis }), 'stale_attempt')
  await rejects(service.reportFailure(scope, { ticketId: record.ticketId, attemptId: first.attemptId, reason: '旧批次' }), 'stale_attempt')
  assert.equal((await service.get(scope, record.ticketId)).status, 'processing')
})

test('service reinstantiation and list refresh recover an abandoned expired attempt', async () => {
  const record = await create()
  await service.analyze(scope, { ticketId: record.ticketId, expectedRevision: 1 })
  await database.getRepository(TicketRecord).update({ id: record.ticketId }, { attemptDeadline: '2000-01-01T00:00:00.000Z' })
  const recoveredService = new TicketService(database.getRepository(TicketRecord))
  const list = await recoveredService.list(scope, { page: 1, pageSize: 20, status: 'failed' })
  assert.equal(list.total, 1)
  assert.equal(list.items[0].failureReason, 'analysis_timeout')
  const retry = await recoveredService.analyze(scope, { ticketId: record.ticketId, expectedRevision: list.items[0].revision })
  assert.equal(retry.status, 'processing')
})

test('a new database connection reloads the durable ticket and its AI analysis from disk', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'support-triage-test-'))
  const location = join(directory, 'tickets.sqlite')
  const disk = new DataSource({ type: 'sqljs', entities: [TicketRecord], synchronize: true, autoSave: true, location })
  const reopened = new DataSource({ type: 'sqljs', entities: [TicketRecord], synchronize: false, autoSave: true, location })
  try {
    await disk.initialize()
    const durable = new TicketService(disk.getRepository(TicketRecord))
    const created = await durable.create(scope, { requestId: randomUUID(), title: '持久化测试', customerAlias: '客户', message })
    const attempt = await durable.analyze(scope, { ticketId: created.ticketId, expectedRevision: created.revision })
    await durable.saveAnalysis(scope, { ticketId: created.ticketId, attemptId: attempt.attemptId, analysis })
    await disk.destroy()
    await reopened.initialize()
    const restored = await new TicketService(reopened.getRepository(TicketRecord)).get(scope, created.ticketId)
    assert.equal(restored.status, 'pending_review')
    assert.deepEqual(restored.analysis, analysis)
    assert.equal(restored.revision, 3)
    assert.equal(restored.history.length, 3)
  } finally {
    if (disk.isInitialized) await disk.destroy()
    if (reopened.isInitialized) await reopened.destroy()
    await rm(directory, { recursive: true, force: true })
  }
})

test('expired callback is rejected and expiry itself is persisted', async () => {
  const record = await create()
  const attempt = await service.analyze(scope, { ticketId: record.ticketId, expectedRevision: 1 })
  await database.getRepository(TicketRecord).update({ id: record.ticketId }, { attemptDeadline: '2000-01-01T00:00:00.000Z' })
  await rejects(service.saveAnalysis(scope, { ticketId: record.ticketId, attemptId: attempt.attemptId, analysis }), 'attempt_expired')
  assert.equal((await service.get(scope, record.ticketId)).status, 'failed')
})

test('losing an expiry CAS to a simultaneous retry never accepts the old attempt callback', async () => {
  const created = await create()
  const first = await service.analyze(scope, { ticketId: created.ticketId, expectedRevision: created.revision })
  const repository = database.getRepository(TicketRecord)
  await repository.update({ id: created.ticketId }, { attemptDeadline: '2000-01-01T00:00:00.000Z' })
  const update = repository.update.bind(repository)
  let interleaved = false
  let newAttemptId = ''
  repository.update = async (criteria, partial) => {
    if (!interleaved) {
      interleaved = true
      // Another request wins expiry and immediately starts the next attempt.
      const expired = await service.get(scope, created.ticketId)
      const retry = await service.analyze(scope, { ticketId: created.ticketId, expectedRevision: expired.revision })
      newAttemptId = retry.attemptId
    }
    return update(criteria, partial)
  }
  await rejects(service.saveAnalysis(scope, { ticketId: created.ticketId, attemptId: first.attemptId, analysis }), 'stale_attempt')
  const current = await service.get(scope, created.ticketId)
  assert.equal(current.attemptId, newAttemptId)
  assert.equal(current.status, 'processing')
  assert.equal(current.analysis, null)
})

test('human confirmation is revision checked, idempotent and cannot be overwritten by AI', async () => {
  const ticket = await pending()
  const input = { ticketId: ticket.ticketId, expectedRevision: ticket.revision, confirmationId: randomUUID(), category: analysis.category, priority: analysis.priority, reply: '审核后的回复' }
  await rejects(service.confirm(scope, { ...input, expectedRevision: 1 }), 'conflict')
  await service.confirm(scope, input)
  assert.equal((await service.confirm(scope, input)).duplicate, true)
  await rejects(service.confirm(scope, { ...input, reply: '不同内容' }), 'idempotency_conflict')
  await rejects(service.saveAnalysis(scope, { ticketId: ticket.ticketId, attemptId: ticket.attemptId, analysis }), 'invalid_state')
  const detail = await service.get(scope, ticket.ticketId)
  assert.equal(detail.confirmedReply, input.reply)
  await rejects(service.analyze(scope, { ticketId: ticket.ticketId, expectedRevision: detail.revision }), 'invalid_state')
})

test('simultaneous confirmations cannot replace the winning reviewer decision', async () => {
  const ticket = await pending()
  const input = { ticketId: ticket.ticketId, expectedRevision: ticket.revision, category: analysis.category, priority: analysis.priority }
  const results = await Promise.allSettled([
    service.confirm(scope, { ...input, confirmationId: randomUUID(), reply: '决策 A' }),
    service.confirm(scope, { ...input, confirmationId: randomUUID(), reply: '决策 B' })
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal((await service.get(scope, ticket.ticketId)).history.filter(event => event.event === 'confirmed').length, 1)
})

test('database applies scoped pagination and literal wildcard search', async () => {
  await create()
  await service.create(scope, { requestId: randomUUID(), title: '折扣 100% 异常', customerAlias: '客户 B', message: '折扣错误' })
  const page = await service.list(scope, { page: 1, pageSize: 1 })
  assert.equal(page.items.length, 1)
  assert.equal(page.total, 2)
  assert.equal((await service.list(scope, { page: 1, pageSize: 20, search: '100%' })).total, 1)
  assert.equal((await service.list(scope, { page: 1, pageSize: 20, status: 'confirmed' })).total, 0)
})

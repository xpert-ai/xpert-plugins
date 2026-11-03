import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { TicketEntity } from '../src/ticket.entity.js'
import { TriageService } from '../src/service.js'
import { configSchema, intakeSchema, type Analysis } from '../src/domain.js'

const scope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a', xpertId: 'assistant-a' }
const fixture: Analysis = { category: 'billing', priority: 'urgent', summary: '重复扣费且影响演示', evidence: '被扣了两次款', reply: '您好，请提供订单号，我们会协助核查扣费及订阅状态。' }
test('intake validation and localized catalog parity', async () => {
  assert.equal(intakeSchema.safeParse({ requestId: randomUUID(), subject: ' ', body: 'short' }).success, false)
  const en = (await import('../src/remote/locales/en.json', { with: { type: 'json' } })).default
  const zh = (await import('../src/remote/locales/zh-Hans.json', { with: { type: 'json' } })).default
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
})
test('persisted workflow, failures, isolation, concurrency and exact evidence', async () => {
  let calls = 0
  let responseMode: 'ok' | 'http' | 'bad' | 'quote' = 'ok'
  const provider = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    assert.equal(request.url, '/v1/chat/completions')
    assert.equal(JSON.parse(body).messages[0].role, 'system')
    calls++
    if (responseMode === 'http') { response.writeHead(503).end('private upstream data'); return }
    const content = responseMode === 'bad' ? 'not JSON' : JSON.stringify({ ...fixture, ...(responseMode === 'quote' ? { evidence: 'not in source' } : {}) })
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ choices: [{ message: { content } }] }))
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  const address = provider.address()
  assert(address && typeof address === 'object')
  const db = await new DataSource({ type: 'sqljs', entities: [TicketEntity], synchronize: true }).initialize()
  const config = configSchema.parse({ baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'fixture-model', enableFailureDemo: true })
  const service = new TriageService(db.getRepository(TicketEntity), { config })
  const input = { requestId: randomUUID(), subject: '订阅被重复扣款', body: '今天续费订阅，同一笔订单被扣了两次款，下午要演示却无法使用。' }
  try {
    const ticket = await service.create(scope, input)
    assert.equal((await service.create(scope, input)).id, ticket.id)
    assert.equal((await service.list(scope)).total, 1)
    await assert.rejects(service.get({ ...scope, organizationId: 'org-b' }, ticket.id), /not_found/)
    await assert.rejects(service.get({ ...scope, userId: 'user-b' }, ticket.id), /not_found/)
    await assert.rejects(service.get({ ...scope, tenantId: 'tenant-b' }, ticket.id), /not_found/)
    await assert.rejects(service.get({ ...scope, xpertId: 'assistant-b' }, ticket.id), /not_found/)
    await assert.rejects(service.confirm(scope, { id: ticket.id, revision: ticket.revision, result: fixture }), /invalid_state/)
    const failed = await service.analyze(scope, { id: ticket.id, revision: ticket.revision }, true)
    assert.equal(failed.status, 'failed'); assert.equal(failed.failureCode, 'demo_failure'); assert.equal(calls, 0)
    await assert.rejects(service.analyze(scope, { id: ticket.id, revision: ticket.revision }), /conflict/)
    const retry = await service.analyze(scope, { id: failed.id, revision: failed.revision })
    assert.equal(retry.status, 'review'); assert.deepEqual(retry.analysis, fixture); assert.equal(calls, 1)
    const confirmed = await service.confirm(scope, { id: retry.id, revision: retry.revision, result: { ...fixture, reply: '人工修改后的回复。' } })
    assert.equal(confirmed.status, 'confirmed'); assert.equal(confirmed.confirmed?.reply, '人工修改后的回复。')
    assert.equal(confirmed.analysis?.reply, fixture.reply)
    await assert.rejects(service.analyze(scope, { id: confirmed.id, revision: confirmed.revision }), /invalid_state/)
    const reopened = new TriageService(db.getRepository(TicketEntity), { config })
    assert.equal((await reopened.get(scope, ticket.id)).confirmed?.reply, '人工修改后的回复。')
    for (const mode of ['http', 'bad', 'quote'] as const) {
      responseMode = mode
      const another = await service.create(scope, { ...input, requestId: randomUUID() })
      const result = await service.analyze(scope, { id: another.id, revision: another.revision })
      assert.equal(result.status, 'failed'); assert.equal(result.body, input.body); assert.equal(result.analysis, null)
      assert.equal(result.failureCode, mode === 'http' ? 'model_unavailable' : 'invalid_model_output')
    }
    responseMode = 'ok'
    const raced = await service.create(scope, { ...input, requestId: randomUUID() })
    const outcomes = await Promise.allSettled([service.analyze(scope, { id: raced.id, revision: raced.revision }), service.analyze(scope, { id: raced.id, revision: raced.revision })])
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal((await service.get(scope, raced.id)).attempts, 1)
    const interrupted = await service.create(scope, { ...input, requestId: randomUUID() })
    await db.getRepository(TicketEntity).update(interrupted.id, { status: 'processing', updatedAt: new Date(Date.now() - 160000).toISOString() })
    const recovered = await service.get(scope, interrupted.id)
    assert.equal(recovered.status, 'failed'); assert.equal(recovered.failureCode, 'model_timeout')
  } finally { await db.destroy(); await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve())) }
})

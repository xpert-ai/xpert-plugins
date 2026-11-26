import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { createTicketSchema, ModelError, requireScope, validateAnalysis } from '../dist/domain.js'
import { TicketService } from '../dist/service.js'
import { FeedbackTicket } from '../dist/ticket.entity.js'
import { FeedbackView } from '../dist/view.js'
import { TriageMiddleware } from '../dist/middleware.js'
import { VIEW_KEY } from '../dist/constants.js'

const scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
const source = 'On the orders page the Export button stays disabled after I select two rows.'
const result = {
  summary: 'Export is disabled',
  category: 'bug',
  quote: 'Export button stays disabled',
  nextStep: 'Check the selection state in the orders page.',
}
const input = () => ({ requestId: randomUUID(), source })
async function database(t, model = { extract: async () => result }, data) {
  const db = await new DataSource({
    type: 'sqljs',
    entities: [FeedbackTicket],
    synchronize: true,
    ...(data ? { database: data } : {}),
  }).initialize()
  t.after(() => db.destroy())
  const repo = db.getRepository(FeedbackTicket)
  return { db, repo, service: new TicketService(repo, model) }
}

test('requires trusted tenant, organization and user, and allows only bounded feedback', () => {
  assert.deepEqual(requireScope({ ...scope, extraField: 'ignored' }), scope)
  for (const key of Object.keys(scope))
    assert.throws(() => requireScope({ ...scope, [key]: undefined }), { message: 'scope_required' })
  assert.equal(createTicketSchema.safeParse({ ...input(), source: '  ' }).success, false)
  assert.equal(createTicketSchema.safeParse({ ...input(), source: 'x'.repeat(2401) }).success, false)
  assert.equal(createTicketSchema.safeParse({ ...input(), userId: scope.userId }).success, false)
  assert.throws(() => validateAnalysis(source, { ...result, quote: 'The card was charged twice.' }), {
    message: 'invalid_model_output',
  })
})

test('holds a saved proposal for human confirmation, then restores it from a reopened database', async (t) => {
  let calls = 0
  const { db, service } = await database(t, {
    extract: async () => {
      calls++
      return result
    },
  })
  const row = await service.create(scope, input())
  assert.equal(row.status, 'draft')
  await assert.rejects(service.confirm(scope, row.id), { message: 'conflict' })
  const review = await service.analyze(scope, row.id)
  assert.equal(review.status, 'review')
  assert.deepEqual(review.analysis, result)
  assert.equal((await service.confirm(scope, row.id)).status, 'confirmed')
  assert.equal((await service.confirm(scope, row.id)).status, 'confirmed')
  assert.equal((await service.analyze(scope, row.id)).attempts, 1)
  assert.equal(calls, 1)
  const reopened = await database(t, undefined, db.driver.databaseConnection.export())
  const history = await reopened.service.list(scope)
  assert.equal(history.tickets.length, 1)
  assert.deepEqual(history.tickets[0].analysis, result)
  assert.equal(history.tickets[0].status, 'confirmed')
})

test('records a corrected category separately and refuses conflicting confirmations', async (t) => {
  const { service } = await database(t)
  const { id } = await service.create(scope, input())
  await service.analyze(scope, id)
  const saved = await service.confirm(scope, id, 'usability')
  assert.equal(saved.confirmedCategory, 'usability')
  assert.equal(saved.analysis.category, 'bug')
  assert.deepEqual(await service.confirm(scope, id, 'usability'), saved)
  await assert.rejects(service.confirm(scope, id, 'request'), { message: 'conflict' })
  assert.equal((await service.list(scope)).tickets[0].confirmedCategory, 'usability')
  const [inbox, analyze] = new TriageMiddleware(service).createMiddleware({}, scope).tools
  const listed = JSON.parse(await inbox.invoke({}))
  assert.equal(listed.tickets[0].confirmedCategory, 'usability')
  const handled = JSON.parse(await analyze.invoke({ id }))
  assert.equal(handled.analysis.category, 'bug')
  assert.equal(handled.confirmedCategory, 'usability')
})

test('deduplicates submissions by the reviewer request ID, even when submitted concurrently', async (t) => {
  const { service } = await database(t)
  const request = input()
  const [a, b] = await Promise.all([service.create(scope, request), service.create(scope, request)])
  assert.equal(a.id, b.id)
  assert.equal((await service.list(scope)).tickets.length, 1)
  await assert.rejects(service.create(scope, { ...request, source: source + ' Second report.' }), {
    message: 'request_id_reused',
  })
  const other = await service.create({ ...scope, userId: randomUUID() }, request)
  assert.notEqual(a.id, other.id)
})

test('cannot read or act on a ticket outside any one of the three identity scopes', async (t) => {
  const { service } = await database(t)
  const ticket = await service.create(scope, input())
  for (const field of Object.keys(scope)) {
    const stranger = { ...scope, [field]: randomUUID() }
    assert.deepEqual((await service.list(stranger)).tickets, [])
    await assert.rejects(service.analyze(stranger, ticket.id), { message: 'not_found' })
    await assert.rejects(service.confirm(stranger, ticket.id), { message: 'not_found' })
  }
  assert.equal((await service.list(scope)).tickets[0].attempts, 0)
})

test('persists model failure, then retries the same ticket exactly once', async (t) => {
  let calls = 0
  const { service } = await database(t, {
    extract: async () => {
      if (++calls === 1) throw new ModelError('model_unavailable')
      return result
    },
  })
  const ticket = await service.create(scope, input())
  const failure = await service.analyze(scope, ticket.id)
  assert.equal(failure.status, 'failed')
  assert.equal(failure.errorCode, 'model_unavailable')
  assert.deepEqual((await service.list(scope)).tickets[0], failure)
  const retry = await service.analyze(scope, ticket.id)
  assert.equal(retry.id, ticket.id)
  assert.equal(retry.attempts, 2)
  assert.equal(retry.errorCode, null)
  assert.equal(retry.status, 'review')
  assert.equal((await service.list(scope)).tickets.length, 1)
})

test('fences an abandoned model call when a second worker retries its expired lease', async (t) => {
  let calls = 0
  const entered = Promise.withResolvers()
  const slowModel = Promise.withResolvers()
  const { repo, service } = await database(t, {
    extract: async () => {
      if (++calls === 1) {
        entered.resolve()
        return slowModel.promise
      }
      return result
    },
  })
  const { id } = await service.create(scope, input())
  const one = service.analyze(scope, id)
  await entered.promise
  assert.equal((await service.analyze(scope, id)).status, 'processing')
  assert.equal(calls, 1)
  await repo.update({ id }, { updatedAt: new Date(Date.now() - 181_000).toISOString() })
  assert.equal((await service.list(scope)).tickets[0].status, 'failed')
  assert.equal((await service.analyze(scope, id)).status, 'review')
  slowModel.resolve({ ...result, summary: 'Stale result' })
  const after = await one
  assert.equal(after.analysis.summary, result.summary)
  assert.equal(after.attempts, 2)
})

test('Workbench rejects identity smuggling and Agent exposes only inbox and analysis', async (t) => {
  const { service } = await database(t)
  const view = new FeedbackView(service)
  const context = { ...scope, hostType: 'agent' }
  const invalid = await view.executeViewAction(context, VIEW_KEY, 'create_ticket', {
    input: { ...input(), userId: randomUUID() },
  })
  assert.deepEqual(invalid, {
    success: false,
    failure: { kind: 'business', code: 'invalid_input' },
    data: { code: 'invalid_input' },
  })
  const middleware = new TriageMiddleware(service)
  assert.deepEqual(middleware.getToolNames(), ['feedback_inbox', 'feedback_analyze'])
  assert.deepEqual(
    middleware.createMiddleware({}, context).tools.map((tool) => tool.name),
    middleware.getToolNames(),
  )
})

test('Workbench returns the same safe business error for another user’s ticket and a missing ticket', async (t) => {
  const { service } = await database(t)
  const { id } = await service.create(scope, input())
  const view = new FeedbackView(service)
  const context = { ...scope, userId: randomUUID(), hostType: 'agent' }
  const expected = {
    success: false,
    failure: { kind: 'business', code: 'not_found' },
    data: { code: 'not_found' },
  }
  for (const target of [id, randomUUID()]) {
    const response = await view.executeViewAction(context, VIEW_KEY, 'analyze_ticket', { input: { id: target } })
    assert.deepEqual(response, expected)
  }
  assert.equal((await service.list(scope)).tickets[0].status, 'draft')
})

test('a simple inbox turn executes its registered scoped tool and returns a final answer without model inference', async (t) => {
  const { service } = await database(t)
  await service.create(scope, input())
  const privateText = 'A different reviewer reported a missing invoice button.'
  await service.create({ ...scope, userId: randomUUID() }, { requestId: randomUUID(), source: privateText })
  const middleware = new TriageMiddleware(service).createMiddleware({}, scope)
  const [inbox] = middleware.tools
  const human = new HumanMessage('Show me my recent feedback tickets.')
  const run = (messages) => middleware.wrapModelCall({ messages, tools: middleware.tools }, () => assert.fail('unexpected inference'))
  const selected = await run([human])
  assert.equal(selected.tool_calls.length, 1)
  assert.equal(selected.tool_calls[0].name, inbox.name)
  assert.deepEqual(selected.tool_calls[0].args, { purpose: 'list' })
  const receipt = await inbox.invoke(selected.tool_calls[0])
  assert.equal(receipt.status, 'success')
  assert.equal(receipt.tool_call_id, selected.tool_calls[0].id)
  const displayed = await run([human, selected, receipt])
  assert.equal(displayed.getType(), 'ai')
  assert.ok(displayed.content.includes(source))
  assert.ok(!displayed.content.includes(privateText))
  assert.deepEqual(displayed.tool_calls, [])
  const later = new HumanMessage('How many confirmed issues are in the list?')
  const nextModel = () => new AIMessage('model handles follow-up')
  const followUp = await middleware.wrapModelCall({ messages: [human, selected, receipt, displayed, later], tools: middleware.tools }, nextModel)
  assert.equal(followUp.content, 'model handles follow-up')
})

test('paginates older saved feedback and does not mark a read as a new change', async (t) => {
  const { service } = await database(t)
  for (let i = 0; i < 31; i++) await service.create(scope, input())
  const a = await service.list(scope, 1)
  const b = await service.list(scope, 2)
  assert.equal(a.hasMore, true)
  assert.equal(a.tickets.length, 30)
  assert.equal(b.hasMore, false)
  assert.equal(b.tickets.length, 1)
  assert.equal(new Set([...a.tickets, ...b.tickets].map((t) => t.id)).size, 31)
})

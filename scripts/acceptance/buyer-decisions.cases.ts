import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test, type TestContext } from 'node:test'
import { DataSource } from '../../xpertai/apps/code-review/tests/automation-db.fixture.js'
import { setup, domainDatabase, lark, procurement } from './event-inbox.fixture.js'

async function buyerFixture(t: TestContext) {
  const f = await setup(t, 'procurement.quote')
  const { PROCUREMENT_QUOTE_COMPARISON_ENTITIES } = await import(procurement + 'procurement-quote-comparison.plugin.js')
  const { QuoteEvents } = await import(procurement + 'quote-events.js')
  const { ProcurementQuoteComparisonService } = await import(procurement + 'procurement-quote-comparison.service.js')
  const e = await import(procurement + 'entities/index.js')
  const { DelayDecision, DelayDecisionInput } = await import(procurement + 'entities/delay-decision.entity.js')
  const db = await domainDatabase(f, PROCUREMENT_QUOTE_COMPARISON_ENTITIES)
  t.after(() => db.destroy())
  const other = await new DataSource(db.options).initialize()
  t.after(() => other.destroy())
  const source = new QuoteEvents(db.getRepository(e.ProcurementComparisonCase))
  const remote = new QuoteEvents(other.getRepository(e.ProcurementComparisonCase)).outputs
  const service = new ProcurementQuoteComparisonService(
    ...[
      e.ProcurementComparisonCase,
      e.ProcurementSourceDocument,
      e.ProcurementParseJob,
      e.ProcurementRequirementItem,
      e.ProcurementSupplierQuote,
      e.ProcurementQuoteItem,
      e.ProcurementItemMatch,
      e.ProcurementRiskItem,
      e.ProcurementRecommendation
    ].map((c) => db.getRepository(c)),
    source
  )
  const scope = {
    ...f.ctx,
    assistantId: f.ctx.xpertId,
    conversationId: randomUUID(),
    threadId: 'original-buyer-thread'
  }
  const caseId = f.ctx.sourceBindingRef
  await db.manager.save(e.ProcurementComparisonCase, {
    ...scope,
    id: caseId,
    createdById: scope.userId,
    title: 'Buyer decision',
    purchaseNo: 'D'
  })
  await source.configure(f.ctx, true)
  const requests = db.getRepository(DelayDecision)
  assert.equal(await requests.count(), 0)
  await service.setDelayDecisions(scope, caseId, true)
  const doc = await service.registerSourceDocument(scope, {
    caseId,
    role: 'supplier_quote',
    name: 'Quote',
    extractedContent: 'Test'
  })
  const quote = (deliveryTime?: string, remarks?: string) =>
    service.saveSupplierQuoteExtraction(scope, {
      caseId,
      documentId: doc.id,
      supplierName: 'Supplier',
      items: [],
      ...(deliveryTime !== undefined ? { deliveryTime } : {}),
      ...(remarks !== undefined ? { remarks } : {})
    })
  const consume = async () => {
    let wakes = 0
    await source.drain(f.ctx, f.publish(source), 32)
    while (true) {
      const claim = await f.store.claim(f.binding)
      if (!claim) break
      const decision = await source.handle(f.ctx, claim, {
        wake: async (input: any) => {
          assert.equal(input.conversationId, scope.conversationId)
          assert.equal(input.threadId, scope.threadId)
          wakes++
        }
      })
      assert.equal(await f.store.complete(claim, decision), true)
    }
    return wakes
  }
  const pending = () => requests.findOneByOrFail({ caseId, state: 'pending' })
  const command = (r: any, choice = 'accept_delay') => ({
    requestId: r.id,
    requestVersion: r.version,
    schemaVersion: 1 as const,
    sourceRevision: String(r.revision),
    choice,
    commandId: randomUUID()
  })
  return { f, db, scope, caseId, doc, service, source, remote, requests, DelayDecisionInput, quote, consume, pending, command }
}

test('buyer decisions serialize the workbench and channel, and fence new quotes before risk projection', async (t) => {
  const { f, db, scope, caseId, service, source, remote, requests, DelayDecisionInput, quote, consume, pending, command } =
    await buyerFixture(t)
  await quote('2026-12-01')
  await quote('2026-12-08')
  await consume()
  const first = await pending(),
    input = command(first)
  const attempt = (payload: any) => source.outputs.submitDecision(f.ctx, payload, 'workbench')
  const foreign = await source.outputs.submitDecision({ ...f.ctx, userId: randomUUID() }, input, 'workbench')
  assert.equal(foreign.status, 'forbidden')
  assert.equal(await db.getRepository(DelayDecisionInput).count(), 0)
  const { item } = await service.getWorkbenchData(scope, { caseId })
  const [reference] = await source.outputs.listPending(f.ctx, 1)
  const card = await source.outputs.resolveForRecipient(f.ctx, reference)
  assert.equal(reference.key, first.id)
  assert.equal(reference.revision, String(first.revision))
  assert.equal(card.decision.schemaVersion, 1)
  assert.equal('quoteRevision' in card.decision, false)
  assert.deepEqual(item.decisionManagement.choices, card.decision.choices.map(({ key }) => key))
  assert.deepEqual(item.decisionManagement.choices, ['accept_delay', 'reject_delay'])
  for (const { label, replyCommand } of card.decision.choices) {
    assert.ok(label.en_US && label.zh_Hans && replyCommand)
  }
  assert.equal((await attempt({ ...input, commandId: randomUUID(), sourceRevision: '0' + input.sourceRevision })).status, 'stale')
  assert.equal((await attempt({ ...input, requestId: 'another-source-key' })).status, 'forbidden')
  const outcomes = await Promise.all([
    attempt(input),
    remote.submitDecision(f.ctx, { ...input, commandId: randomUUID() }, 'lark')
  ])
  assert.deepEqual(outcomes.map((r) => r.status).sort(), ['already_recorded', 'recorded'])
  assert.equal(outcomes[0].decisionId, outcomes[1].decisionId)
  assert.equal((await attempt(input)).decisionId, outcomes[0].decisionId)
  assert.equal((await attempt({ ...input, choice: 'reject_delay' })).status, 'conflicting_choice')
  const read = () =>
    db.query(
      "SELECT source FROM plugin_procurement_event_fact WHERE event->>'type'='procurement.delivery_delay.decided'"
    )
  assert.equal((await read()).length, 1)
  await consume()
  await quote('2026-12-09')
  await consume()
  const replaced = await pending()
  await quote('2026-12-10')
  assert.equal((await attempt(command(replaced))).status, 'stale')
  await consume()
  const latest = await pending()
  assert.equal(latest.replaces, replaced.id)
  const race = await Promise.all([
    remote.submitDecision(f.ctx, command(latest, 'reject_delay'), 'lark'),
    attempt(command(latest))
  ])
  assert.deepEqual(race.map((r) => r.status).sort(), ['conflicting_choice', 'recorded'])
  assert.equal((await read()).length, 2)
  await consume()
  await quote('2026-12-11')
  await consume()
  const last = await pending()
  assert.equal((await attempt(command(last, 'reject_delay'))).status, 'recorded')
  assert.equal((await requests.findOneByOrFail({ id: last.id })).state, 'renegotiate')
  await service.setDelayDecisions(scope, caseId, false)
  assert.equal((await attempt(command(last))).status, 'closed')
  await consume()
})

test('retrying a failed original-card update preserves the buyer decision, its fact and the original thread wake', async (t) => {
  const { f, db, source, remote, requests, DelayDecisionInput, quote, consume, pending, command } = await buyerFixture(t)
  await quote('2026-12-01')
  await quote('2026-12-08')
  await consume()
  const request = await pending()
  const input = command(request)
  const { LarkChannelStrategy } = await import(lark + 'lark-channel.strategy.js')
  const channel = Object.create(LarkChannelStrategy.prototype)
  const integration = { id: randomUUID() }
  const patches: string[] = []
  channel.assertCardPayloadSupportedByIntegrationId = async () => {}
  channel.logger = { debug() {} }
  channel.getOrCreateLarkClientById = async (id) => {
    assert.equal(id, integration.id)
    return { im: { message: { async patch({ path, data }) {
      patches.push(path.message_id)
      assert.equal(JSON.parse(data.content).elements[0].text.content, '已记录 · 接受延期')
      return { code: patches.length === 1 ? 230001 : 0 }
    } } } }
  }
  const patch = (result) => channel.updatePrivateDecision(integration, 'buyer-original-card', result.status, '接受延期')
  const facts = () => db.query(
    "SELECT source FROM plugin_procurement_event_fact WHERE event->>'type'='procurement.delivery_delay.decided'"
  )
  const first = await source.outputs.submitDecision(f.ctx, input, 'lark')
  assert.equal(first.status, 'recorded')
  assert.ok(first.decisionId)
  await assert.rejects(patch(first), /decision_card_update_failed/)
  assert.equal((await requests.findOneByOrFail({ id: request.id })).decisionId, first.decisionId)
  assert.deepEqual(await facts(), [{ source: 'decision/' + first.decisionId }])
  assert.equal(await consume(), 1)

  // Replay the same receipt through a second source instance and database connection.
  const retried = await remote.submitDecision(f.ctx, input, 'lark')
  assert.deepEqual(retried, first)
  await patch(retried)
  assert.deepEqual(patches, ['buyer-original-card', 'buyer-original-card'])
  assert.equal(await db.getRepository(DelayDecisionInput).countBy({ origin: 'lark', commandId: input.commandId }), 1)
  assert.deepEqual(await facts(), [{ source: 'decision/' + first.decisionId }])
  assert.equal(await consume(), 0)
})

test('a missing delivery date invalidates the card; restoring a delayed date requests one fresh decision', async (t) => {
  const { f, caseId, quote, consume, pending, requests, source, command } = await buyerFixture(t)
  await quote('2026-12-01')
  await quote('2026-12-08')
  await consume()
  const old = await pending()
  await quote()
  assert.equal((await source.outputs.submitDecision(f.ctx, command(old), 'workbench')).status, 'stale')
  await consume()
  assert.equal(await requests.countBy({ caseId, state: 'pending' }), 0)
  await quote('2026-12-10')
  await consume()
  const fresh = await pending()
  assert.deepEqual([fresh.originalDate, fresh.revisedDate, fresh.revision, fresh.replaces],
    ['2026-12-01', '2026-12-10', 4, old.id])
  await quote('2026-12-10')
  await consume()
  assert.equal(await requests.countBy({ caseId }), 2)
  assert.equal((await source.outputs.submitDecision(f.ctx, command(fresh), 'workbench')).status, 'recorded')
  await quote('pending')
  await quote('2026-02-30')
  await quote('2026-12-04')
  await consume()
  const another = await pending()
  assert.equal(another.originalDate, '2026-12-01')
  assert.equal(another.replaces, fresh.id)
  await quote(undefined, 'awaiting update')
  await quote('2026-11-30')
  await consume()
  assert.equal(await requests.countBy({ caseId, state: 'pending' }), 0)
  await quote('2026-12-02')
  await consume()
  assert.equal((await pending()).originalDate, '2026-11-30')
})

test('the first known date after unparseable quotes establishes a commitment without asking the buyer', async (t) => {
  const { caseId, requests, quote, consume, pending } = await buyerFixture(t)
  await quote()
  await quote('2026-02-30')
  await quote('2026-12-08')
  await consume()
  assert.equal(await requests.countBy({ caseId }), 0)
  await quote('2026-12-10')
  await consume()
  assert.equal((await pending()).originalDate, '2026-12-08')
})

test('enabling decisions after an undated quote uses the last commitment and the current quote thread', async (t) => {
  const { f, db, caseId, scope, source, service, quote, pending, consume } = await buyerFixture(t)
  const migration = await readFile(new URL('../../community/apps/procurement-quote-comparison/migrations/20261117-quote-revision-context.sql',
    import.meta.url), 'utf8')
  await db.query('DROP TABLE plugin_procurement_quote_context')
  await db.query(migration)
  await db.query(migration)
  const { digestSnapshot } = await import(procurement + 'event-journal.js')
  const { quoteFact } = await import(procurement + 'delivery-check.js')
  const facts = () => db.query(`SELECT event, snapshot FROM plugin_procurement_event_fact
    WHERE binding=$1 AND event->>'type'='procurement.quote.revised' ORDER BY seq`, [f.binding.id])

  await service.setDelayDecisions(scope, caseId, false)
  await quote('2026-12-01')
  await quote()
  await quote('undetermined')
  await consume()
  const history = await facts()
  await service.setDelayDecisions(scope, caseId, true)
  await quote('2026-12-05')
  await consume()
  const request = await pending()
  assert.deepEqual([request.revision, request.originalDate, request.threadId], [4, '2026-12-01', scope.threadId])
  const rows = await facts()
  assert.deepEqual(rows.slice(0, -1), history)
  const latest = rows.at(-1)
  assert.deepEqual(quoteFact.parse(latest.snapshot), latest.snapshot)
  assert.equal(quoteFact.safeParse({ ...latest.snapshot, decisionBaseline: '2026-12-01' }).success, false)
  assert.equal(latest.event.fact.sha256, digestSnapshot(latest.snapshot))
  assert.deepEqual((await source.describe(f.ctx, latest.event, null, { includeConversation: true })).conversation,
    { conversationId: scope.conversationId, threadId: scope.threadId })
})

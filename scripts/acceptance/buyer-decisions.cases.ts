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

test('case C reports the recorded v5 decision in its own thread after a closed v4 follow-up', async (t) => {
  const { f, db, scope, caseId, service, source, remote, requests, quote, consume, pending, command } = await buyerFixture(t)
  const { ProcurementQuoteComparisonMiddleware } = await import(procurement + 'procurement-quote-comparison.middleware.js')
  const middleware = new ProcurementQuoteComparisonMiddleware(service)
  for (const day of ['01', '08', '10', '15']) {
    await quote('2026-12-' + day)
    await consume()
  }
  const old = await pending()
  assert.equal(old.revision, 4)
  await service.setDelayDecisions(scope, caseId, false)
  const oldRisk = { caseId, riskId: old.riskId }
  const timer = await service.followUp(scope, { ...oldRisk, action: 'set', expectedVersion: 0,
    dueAt: new Date(Date.now() + 180_000).toISOString() })
  await service.followUp(scope, { ...oldRisk, action: 'reply', expectedVersion: timer.version, replyNote: 'Supplier answered' })
  await service.setDelayDecisions(scope, caseId, true)
  await quote('2026-12-18')
  await consume()
  const current = await pending()
  assert.equal(current.revision, 5)
  assert.notEqual(current.riskId, old.riskId)
  const submitted = await remote.submitDecision(f.ctx, command(current), 'lark')
  assert.equal(submitted.status, 'recorded')
  assert.equal(await consume(), 1)
  const [fact] = await db.query('SELECT receipt FROM plugin_procurement_event_fact WHERE source=$1',
    ['decision/' + submitted.decisionId])
  await assert.rejects(service.followUp({ ...scope, eventReceiptId: fact.receipt }, { ...oldRisk, action: 'inspect' }),
    /follow_up_event_mismatch/)
  const history = { messages: [{ role: 'assistant', tool_calls: [{ name: 'procurement_follow_up',
    args: { action: 'inspect', caseId, riskId: old.riskId } }] }] }
  const report = async (
    context: Partial<typeof scope> & { eventReceiptId?: string },
    next: (request: typeof history) => unknown = () => assert.fail('a recorded decision must finish without calling a model or tools')
  ) => {
    const agent = await middleware.createMiddleware({}, { ...scope, ...context })
    return agent.wrapModelCall(history, next)
  }
  const response = await report({ eventReceiptId: fact.receipt })
  assert.equal(response._getType(), 'ai')
  assert.match(response.content, /accepted.*quote revision 5.*Supplier.*2026-12-18/)
  assert.deepEqual(response.tool_calls, [])
  assert.equal((await report({ eventReceiptId: fact.receipt })).content, response.content)
  for (const override of [{ userId: randomUUID() }, { threadId: 'other-thread' }, { conversationId: randomUUID() }]) {
    await assert.rejects(report({ eventReceiptId: fact.receipt, ...override }), /decision_wake_access_changed/)
  }
  const [quoteFact] = await db.query("SELECT receipt FROM plugin_procurement_event_fact WHERE event->>'type'='procurement.quote.revised' LIMIT 1")
  for (const context of [{}, { eventReceiptId: quoteFact.receipt }]) {
    assert.equal(await report(context, (request) => request), history)
  }
  assert.equal((await requests.findOneByOrFail({ id: old.id })).state, 'closed')
  assert.equal(await requests.countBy({ id: current.id, state: 'accepted', decisionId: submitted.decisionId }), 1)
  // Case C had already captured v5 with its thread and baseline embedded in the historical snapshot.
  const { digestSnapshot } = await import(procurement + 'event-journal.js')
  const [v5] = await db.query(`SELECT id,snapshot FROM plugin_procurement_event_fact WHERE binding=$1
    AND event->>'type'='procurement.quote.revised' AND event->'fact'->>'revision'='5'`, [f.ctx.bindingId])
  const snapshot = { ...v5.snapshot, threadId: scope.threadId, decisionBaseline: current.originalDate }
  await db.query(`UPDATE plugin_procurement_event_fact SET snapshot=$2,event=jsonb_set(event,'{fact,sha256}',to_jsonb($3::text))
    WHERE id=$1`, [v5.id, snapshot, digestSnapshot(snapshot)])
  await quote('2026-12-22')
  await consume()
  assert.deepEqual((await db.query('SELECT snapshot FROM plugin_procurement_event_fact WHERE id=$1', [v5.id]))[0].snapshot, snapshot)
  const declined = await remote.submitDecision(f.ctx, command(await pending(), 'reject_delay'), 'lark')
  assert.equal(await consume(), 1)
  const [rejection] = await db.query('SELECT receipt FROM plugin_procurement_event_fact WHERE source=$1',
    ['decision/' + declined.decisionId])
  assert.match((await report({ eventReceiptId: rejection.receipt })).content, /declined.*2026-12-22.*quote revision 6.*renegotiation/)
  assert.equal((await report({ eventReceiptId: fact.receipt })).content, response.content)
  await source.configure({ ...f.ctx, bindingRevision: f.ctx.bindingRevision + 1 }, false)
  await assert.rejects(report({ eventReceiptId: fact.receipt }), /decision_wake_access_changed/)
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

for (const history of ['original conversation', 'new conversation']) {
  test(`a quote series conflict in the ${history} waits for the buyer and publishes v3 once`, async t => {
    const { f, db, caseId, scope, service, quote, consume } = await buyerFixture(t)
    const { ProcurementQuoteComparisonMiddleware } = await import(procurement + 'procurement-quote-comparison.middleware.js')
    const { ProcurementQuoteComparisonViewProvider } = await import(procurement + 'procurement-quote-comparison-view.provider.js')
    const first = await quote('2026-12-20')
    const seriesId = first.supplierQuote.id
    await quote('2026-12-24')
    await consume()
    const doc = await service.registerSourceDocument(scope, { caseId, role: 'supplier_quote', name: 'December 27', extractedContent: 'Box: Dec 27' })
    const actor = { ...scope, inputMessageId: randomUUID(), ...(history === 'new conversation' ? { conversationId: randomUUID(), threadId: randomUUID() } : {}) }
    const middleware = await new ProcurementQuoteComparisonMiddleware(service).createMiddleware({}, actor)
    const save = middleware.tools.find(tool => tool.name === 'procurement_save_supplier_quote')
    const input = { caseId, documentId: doc.id, quoteSeriesId: randomUUID(), supplierName: 'Supplier',
      items: [{ productName: 'Box' }], deliveryTime: '2026-12-27' }
    const invoke = async args => JSON.parse(await save.invoke(args))
    const counts = async () => (await db.query(`SELECT
      (SELECT count(*)::int FROM plugin_procurement_supplier_quote WHERE "caseId"=$1) quotes,
      (SELECT count(*)::int FROM plugin_procurement_event_fact WHERE binding=$2) facts`, [caseId, f.binding.id]))[0]
    const before = await counts()
    const conflict = await invoke(input)
    assert.equal(conflict.status, 'quote_series_confirmation_required')
    assert.ok(conflict.message.includes(seriesId))
    const output = await middleware.wrapModelCall({ messages: [
      { _getType: () => 'human', content: history === 'original conversation' ? seriesId : 'Save the revision' },
      { _getType: () => 'tool', name: save.name, content: JSON.stringify(conflict) }
    ] }, () => assert.fail('the model must not reinterpret a conflict'))
    assert.equal(output.content, conflict.message)
    for (const retry of [{ ...input, quoteSeriesId: seriesId }, { ...input, quoteSeriesId: undefined },
      { caseId, supplierName: 'Supplier', items: [] }]) {
      assert.deepEqual(await invoke(retry), conflict)
    }
    const view = new ProcurementQuoteComparisonViewProvider(service)
    const context = { ...actor, hostType: 'project', hostId: actor.projectId }
    const detail = async () => (await service.getWorkbenchData(scope, { caseId })).item
    const workbench = await detail()
    const [review] = workbench.seriesReviews
    assert.equal(review.candidates.length, 1)
    assert.equal(review.file, 'December 27')
    assert.equal(workbench.documents.find(d => d.id === doc.id).status, 'uploaded')
    const selection = { caseId, documentId: doc.id, requestId: review.requestId, seriesId }
    const confirm = (actor = context, input = selection) =>
      view.executeViewAction(actor, 'workbench', 'confirm_quote_series', { input })
    assert.equal((await confirm({ ...context, userId: randomUUID() })).success, false)
    assert.equal((await confirm(context, { ...selection, seriesId: randomUUID() })).success, false)
    assert.deepEqual(await counts(), before)
    const [a, b] = await Promise.all([confirm(), confirm()])
    assert.equal(a.success, true, JSON.stringify(a.message))
    assert.equal(b.success, true, JSON.stringify(b.message))
    assert.equal((await invoke(input)).supplierQuote.documentId, doc.id)
    await assert.rejects(invoke({ caseId, supplierName: 'Supplier', items: [] }), /quote_series_review_input_changed/)
    await consume()
    assert.deepEqual(await counts(), { quotes: before.quotes + 1, facts: before.facts + 1 })
    const [receipt] = await f.hostDb.query(`SELECT id,event FROM agent_event_inbox WHERE binding=$1
      AND event->>'type'='procurement.quote.revised' AND event->'fact'->>'revision'='3'`, [f.binding.id])
    assert.ok(receipt.id)
    const [fact] = await db.query('SELECT snapshot FROM plugin_procurement_event_fact WHERE receipt=$1', [receipt.id])
    assert.deepEqual([fact.snapshot.documentId, fact.snapshot.conversationId, fact.snapshot.date, fact.snapshot.series],
      [doc.id, actor.conversationId, '2026-12-27', seriesId])
    assert.deepEqual((await detail()).seriesReviews, [])
    assert.equal((await confirm()).success, true)
    assert.deepEqual(await counts(), { quotes: before.quotes + 1, facts: before.facts + 1 })
  })
}

import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { DataSource } from '../../xpertai/apps/code-review/tests/automation-db.fixture.js'
import { setup, domainDatabase, host, procurement } from './event-inbox.fixture.js'

test('two procurement wakes on one quote publish one visible check across independent workers', async (t) => {
  const f = await setup(t, 'procurement.quote')
  const { PROCUREMENT_QUOTE_COMPARISON_ENTITIES } = await import(procurement + 'procurement-quote-comparison.plugin.js')
  const e = await import(procurement + 'entities/index.js')
  const { QuoteEvents } = await import(procurement + 'quote-events.js')
  const { editFollowUp } = await import(procurement + 'quote-follow-up.js')
  const { DeliveryCheck, DeliveryCheckReceipt } = await import(procurement + 'delivery-check.js')
  const { ProcurementQuoteComparisonService } = await import(procurement + 'procurement-quote-comparison.service.js')
  const { ProcurementQuoteComparisonMiddleware } = await import(
    procurement + 'procurement-quote-comparison.middleware.js'
  )
  const hostModule = (name: string) =>
    import(pathToFileURL(path.join(host!, 'packages/server-ai/src/agent-event', name + '.ts')).href)
  const { AgentEventWakeService } = await hostModule('agent-event-wake.service')
  const { eventOriginForRun } = await hostModule('agent-event-run-context')
  const db = await domainDatabase(f, PROCUREMENT_QUOTE_COMPARISON_ENTITIES)
  t.after(() => db.destroy())
  // Upgrade a populated pre-publication schema. Never opt a historical risk into automatic publication.
  const legacy = randomUUID(),
    caseId = f.ctx.sourceBindingRef
  await db.query('DROP TABLE plugin_procurement_delivery_check_receipt')
  await db.query('DROP TABLE plugin_procurement_delivery_check')
  await db.query('ALTER TABLE plugin_procurement_risk_item DROP COLUMN "deliveryCheckVersion"')
  await db.query(
    `INSERT INTO plugin_procurement_risk_item(id,"tenantId","caseId",type,severity,title,description)
    VALUES ($1,$2,$3,'delivery_delay','high','Legacy','Older risk')`,
    [legacy, f.ctx.tenantId, caseId]
  )
  await db.synchronize()
  assert.equal(
    (await db.getRepository(e.ProcurementRiskItem).findOneByOrFail({ id: legacy })).deliveryCheckVersion,
    null
  )
  assert.equal(await db.getRepository(DeliveryCheck).count(), 0)
  const replica = await new DataSource(db.options).initialize()
  t.after(() => replica.destroy())
  const scope = { ...f.ctx, assistantId: f.ctx.xpertId, conversationId: randomUUID(), threadId: randomUUID() }
  const hostRequire = createRequire(path.join(host!, 'packages/server-ai/package.json'))
  const { Annotation, StateGraph, START, END, MemorySaver } = hostRequire('@langchain/langgraph')
  const checkpointer = new MemorySaver()
  const channels = Annotation.Root({ task: Annotation(), lastReceipt: Annotation() })
  const config = { configurable: { thread_id: scope.threadId } }
  const repositories = [
    e.ProcurementComparisonCase,
    e.ProcurementSourceDocument,
    e.ProcurementParseJob,
    e.ProcurementRequirementItem,
    e.ProcurementSupplierQuote,
    e.ProcurementQuoteItem,
    e.ProcurementItemMatch,
    e.ProcurementRiskItem,
    e.ProcurementRecommendation
  ]
  const workers = [db, replica].map((connection) => {
    const source = new QuoteEvents(connection.getRepository(e.ProcurementComparisonCase))
    const service = new ProcurementQuoteComparisonService(
      ...repositories.map((entity) => connection.getRepository(entity)),
      source
    )
    return { source, service }
  })
  const { source, service } = workers[0]
  await db
    .getRepository(e.ProcurementComparisonCase)
    .save({ ...scope, id: caseId, createdById: scope.userId, title: 'Delivery changes', purchaseNo: 'P1' })
  await source.configure(f.ctx, true)
  const document = await service.registerSourceDocument(scope, {
    caseId,
    role: 'supplier_quote',
    name: 'Quote',
    extractedContent: 'Delivery commitment'
  })
  const quote = { caseId, documentId: document.id, supplierName: 'Supplier', items: [] }
  const submitQuote = (date: string) => service.saveSupplierQuoteExtraction(scope, { ...quote, deliveryTime: date })
  await submitQuote('2026-12-01')
  await submitQuote('2026-12-18')
  await source.drain(f.ctx, f.publish(source), 32)
  await f.consume(source, 'ignored')
  const initial = await f.consume(source, 'handled')
  let riskId = initial.resultRef.key
  const receipts: string[] = []
  type ToolInput = { action: string; expectedQuoteRevision?: number; riskId?: string }
  const contextTool = async (worker: number, context: typeof scope & { eventReceiptId?: string }) => {
    const middleware = await new ProcurementQuoteComparisonMiddleware(workers[worker].service).createMiddleware(
      {},
      context
    )
    const tool = middleware.tools.find((entry: { name: string }) => entry.name === 'procurement_follow_up')
    return async (input: ToolInput) => JSON.parse(await tool.invoke({ caseId, riskId, ...input }))
  }
  type CalledTool = Awaited<ReturnType<typeof contextTool>>
  let priorCall: CalledTool
  async function wake(
    worker: number,
    expectedVersion: number,
    run: (call: CalledTool, receipt: string) => Promise<void>
  ) {
    const { service, source } = workers[worker]
    await service.followUp(scope, {
      caseId,
      riskId,
      action: 'set',
      expectedVersion,
      dueAt: new Date(Date.now() + 60000).toISOString()
    })
    await db.query('UPDATE plugin_procurement_follow_up SET "dueAt"=now() WHERE "riskId"=$1', [riskId])
    await source.drain(f.ctx, f.publish(source), 32)
    const claim = await f.store.claim(f.binding)
    assert(claim)
    let effect: Promise<void> | undefined
    const wakeService = new AgentEventWakeService(
      {
        // The graph and writer admission are tested by the host suites. Here we exercise its real wake-to-command boundary.
        execute: async (command: { options: { execution: { id: string } } }) => {
          const receipt = eventOriginForRun(command.options, scope)?.receiptId
          assert.equal(receipt, claim.receiptId)
          assert.equal(command.options.execution.id, receipt)
          const call = await contextTool(worker, { ...scope, eventReceiptId: receipt })
          const graph = new StateGraph(channels)
            .addNode('inspect_risk', async () => {
              await run(call, receipt)
              return { lastReceipt: receipt }
            })
            .addEdge(START, 'inspect_risk')
            .addEdge('inspect_risk', END)
            .compile({ checkpointer })
          effect = graph.invoke({ task: 'inspect' }, config)
          priorCall = call
          return { subscribe: () => {} }
        }
      },
      { execute: async () => ({ id: scope.conversationId, threadId: scope.threadId }) },
      { getAccessiblePublishedXpertFamilyIds: async () => [f.ctx.xpertId] },
      { findEnabled: async () => f.binding }
    )
    const outcome = await source.handle(f.ctx, claim, {
      wake: (target) => wakeService.start(f.binding, claim, target, f.ctx.signal)
    })
    await effect
    assert.equal(await f.store.complete(claim, outcome), true)
    receipts.push(claim.receiptId)
    return { claim, outcome }
  }
  const publish = { action: 'publish_check', expectedQuoteRevision: 2 }
  let reminderId: string
  const first = await wake(0, 0, async (call, receipt) => {
    assert.equal((await call({ action: 'inspect' })).workbenchPublication, 'unpublished')
    const ordinary = await contextTool(0, scope)
    await assert.rejects(ordinary(publish), /event_required/)
    await assert.rejects(call({ ...publish, expectedQuoteRevision: 3 }), /no_longer_applicable/)
    const wrongThread = await contextTool(0, { ...scope, threadId: randomUUID(), eventReceiptId: receipt })
    await assert.rejects(wrongThread(publish), /event_mismatch/)
    await assert.rejects(
      db.transaction(async (tx) => {
        await editFollowUp(tx, { ...scope, eventReceiptId: receipt }, { caseId, riskId, ...publish })
        throw new Error('before_commit')
      }),
      /before_commit/
    )
    assert.equal(await db.getRepository(DeliveryCheck).count(), 0)
    const competing = await contextTool(1, { ...scope, eventReceiptId: receipt })
    const results = await Promise.all([call(publish), competing(publish)])
    assert.deepEqual(results.map((r) => r.status).sort(), ['already_published', 'published'])
    reminderId = results[0].reminderId
    assert.equal(results[1].reminderId, reminderId)
  })
  assert.equal((await checkpointer.getTuple(config))?.checkpoint.channel_values.lastReceipt, first.claim.receiptId)
  await checkpointer.deleteThread(scope.threadId)
  assert.equal(await checkpointer.getTuple(config), undefined)
  const retry = priorCall!
  const second = await wake(1, 1, async (call, receipt) => {
    assert.equal(await replica.getRepository(DeliveryCheckReceipt).existsBy({ receiptId: receipt }), false)
    const [state, replay] = await Promise.all([call({ action: 'inspect' }), retry(publish)])
    assert.equal(replay.reminderId, reminderId)
    const link = await replica.getRepository(DeliveryCheckReceipt).findOneByOrFail({ receiptId: receipt })
    assert.equal(link.checkId, reminderId)
    assert.equal(state.quoteRevision, 2)
    assert.equal(state.latestQuoteRevision, 2)
    assert.equal(state.waitingFor, 'supplier_reply')
    assert.equal(state.reminder.id, reminderId)
    assert.deepEqual(await call(publish), { status: 'already_published', reminderId, quoteRevision: 2 })
  })
  assert.notEqual(first.claim.event.sourceEventId, second.claim.event.sourceEventId)
  assert.equal(receipts.length, 2)
  assert.notEqual(receipts[0], receipts[1])
  const reminders = await db.getRepository(DeliveryCheck).findBy({ caseId, riskId, revision: 2 })
  assert.deepEqual(reminders.map((check) => check.id), [reminderId])
  const links = await db.getRepository(DeliveryCheckReceipt).findBy({ checkId: reminderId! })
  assert.deepEqual(links.map((l) => l.receiptId).sort(), [...receipts].sort())
  for (const { claim, outcome } of [first, second]) {
    const view = await source.describe(f.ctx, claim.event, outcome)
    assert(view.result.fields.some((field) => field.value === reminderId))
  }
  const detail = await service.getWorkbenchData(scope, { caseId })
  assert.deepEqual(
    detail.item.risks.flatMap((r) => (r.followUp?.reminderId ? [r.followUp.reminderId] : [])),
    [reminderId!]
  )
  for (const change of [{ userId: randomUUID() }, { organizationId: randomUUID() }, { projectId: randomUUID() }]) {
    await assert.rejects(
      service.followUp({ ...scope, ...change, eventReceiptId: receipts[0] }, { caseId, riskId, action: 'inspect' }),
      /access_changed/
    )
  }
  const restricted = await service.getWorkbenchData({ ...scope, userId: randomUUID() }, { caseId })
  assert(!restricted.item.risks.some((r) => r.id === riskId))
  await assert.rejects(service.getWorkbenchData({ ...scope, projectId: null }, { caseId }))
  await service.followUp(scope, {
    caseId,
    riskId,
    action: 'reply',
    expectedVersion: 2,
    replyNote: 'Supplier confirmed'
  })
  const afterReply = await retry({ action: 'inspect' })
  assert.equal(afterReply.waitingFor, null)
  assert.equal(afterReply.replyNote, 'Supplier confirmed')
  t.diagnostic(
    JSON.stringify({ riskId, series: afterReply.quoteSeriesId, revision: 2, receipts, reminderId, visible: 1 })
  )
  const evidenceDir = process.env.XPERT_EVENT_VIEW_EVIDENCE_DIR
  if (evidenceDir) {
    await mkdir(evidenceDir, { recursive: true, mode: 0o700 })
    const finalDetail = await service.getWorkbenchData(scope, { caseId })
    const item = finalDetail.item.risks.find((r) => r.id === riskId)
    await writeFile(path.join(evidenceDir, 'procurement-check.json'), JSON.stringify(item.followUp), { mode: 0o600 })
  }
  await submitQuote('2026-12-22')
  assert.equal((await retry({ action: 'inspect' })).currentQuote, false)
  await assert.rejects(retry({ ...publish, expectedQuoteRevision: 3 }), /no_longer_applicable/)
  await source.drain(f.ctx, f.publish(source), 32)
  riskId = (await f.consume(source, 'handled')).resultRef.key
  await wake(0, 0, async (call) => {
    const state = await call({ action: 'inspect' })
    assert.equal(state.latestQuoteRevision, 3)
    assert.equal(state.workbenchPublication, 'unpublished')
    await db.getRepository(e.ProcurementRiskItem).update(riskId, { deliveryCheckVersion: null })
    assert.equal((await call({ action: 'inspect' })).workbenchPublication, 'unknown')
    await assert.rejects(call({ ...publish, expectedQuoteRevision: 3 }), /no_longer_applicable/)
    await db.getRepository(e.ProcurementRiskItem).update(riskId, { deliveryCheckVersion: 1 })
    const outcome = await call({ ...publish, expectedQuoteRevision: 3 })
    assert.equal(outcome.status, 'published')
    assert.notEqual(outcome.reminderId, reminderId)
  })
  assert.equal(await db.getRepository(DeliveryCheck).count(), 2)
  await t.test('a newer quote without a series leaves the version unverified in the tool and workbench', async () => {
    await submitQuote('2026-12-28')
    await source.drain(f.ctx, f.publish(source), 32)
    riskId = (await f.consume(source, 'handled')).resultRef.key
    const otherDocument = await service.registerSourceDocument(scope, {
      caseId,
      role: 'supplier_quote',
      name: 'Second supplier quote',
      extractedContent: 'Separate series'
    })
    for (const deliveryTime of ['2026-12-02', '2026-12-15'])
      await service.saveSupplierQuoteExtraction(scope, {
        caseId,
        documentId: otherDocument.id,
        supplierName: 'Second supplier',
        items: [],
        deliveryTime
      })
    await source.drain(f.ctx, f.publish(source), 32)
    await f.consume(source, 'ignored')
    const unscheduledRisk = (await f.consume(source, 'handled')).resultRef.key
    await wake(1, 0, async (call, receiptId) => {
      const before = await call({ action: 'inspect' })
      assert.equal(before.latestQuoteRevision, 4)
      assert.equal(before.currentQuote, true)
      const { journal } = await import(procurement + 'event-journal.js')
      const newer = before.quoteSeriesId + '/5'
      await db.transaction(async (tx) => {
        const route = await journal.route(tx, {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          ref: caseId
        })
        // The new schema does not expose the v1 series field. Its nested fields are opaque to this reader.
        await journal.capture(
          tx,
          route,
          {
            sourceEventId: newer,
            type: 'procurement.quote.revised',
            schemaVersion: 2,
            occurredAt: new Date().toISOString(),
            subject: { kind: 'comparison-case', key: caseId }
          },
          { caseId, quotation: { seriesId: before.quoteSeriesId, revision: 5 } },
          newer,
          '5'
        )
      })
      const inspection = await call({ action: 'inspect' })
      const row = (await service.listFollowUpRisks(scope, caseId)).find((r) => r.riskId === riskId)
      const detail = await service.getWorkbenchData(scope, { caseId })
      const followUp = detail.item.risks.find((r) => r.id === riskId)?.followUp
      assert.equal(inspection.latestQuoteRevision, null)
      for (const perspective of [inspection, row]) {
        assert.equal(perspective.currentQuote, false)
        assert.equal(perspective.workbenchPublication, 'unknown')
      }
      for (const perspective of [inspection, row, followUp]) {
        assert.equal(perspective.quoteVersionStatus, 'unverified')
        assert.equal(perspective.quoteRevision, 4)
      }
      assert.equal(followUp.workbenchPublication, 'unknown')
      assert.equal(followUp.reminderId, null)
      const unscheduled = detail.item.risks.find((r) => r.id === unscheduledRisk)?.followUp
      assert.equal(unscheduled.state, 'unscheduled')
      assert.equal(unscheduled.quoteVersionStatus, 'unverified')
      const published = detail.item.risks.find((r) => r.followUp?.reminderId === reminderId)?.followUp
      assert.equal(published.workbenchPublication, 'published')
      assert.equal(published.quoteVersionStatus, 'unverified')
      await assert.rejects(call({ action: 'publish_check', expectedQuoteRevision: 4 }), /no_longer_applicable/)
      assert.equal(await replica.getRepository(DeliveryCheck).countBy({ caseId, riskId, revision: 4 }), 0)
      assert.equal(await replica.getRepository(DeliveryCheckReceipt).countBy({ receiptId }), 0)
      if (evidenceDir)
        await writeFile(path.join(evidenceDir, 'procurement-unknown-check.json'), JSON.stringify(followUp), {
          mode: 0o600
        })
      t.diagnostic(
        JSON.stringify({
          riskId,
          revision: 4,
          tool: inspection.quoteVersionStatus,
          workbench: followUp.quoteVersionStatus,
          reminders: 0
        })
      )
    })
  })
})

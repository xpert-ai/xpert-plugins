import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import { DataSource } from '../../xpertai/apps/code-review/tests/automation-db.fixture.js'
import { setup, domainDatabase, procurement } from './event-inbox.fixture.js'
import './procurement-cross-run.cases.js'
import { ReviewEventSource } from '../../xpertai/apps/code-review/src/review-event-source.js'
import { Review } from '../../xpertai/apps/code-review/src/entity.js'
import { WorkflowDiagnosis } from '../../xpertai/apps/code-review/src/workflow-entity.js'
import { parsePullUrl } from '../../xpertai/apps/code-review/src/domain.js'
import { ReviewDelivery } from '../../xpertai/apps/code-review/src/automation-entities.js'

const lark = '../../xpertai/integrations/lark/dist/lib/'

// Optional hand-off to the platform browser suite. Only these disposable database scenarios call it.
async function captureViewReceipt(f: Awaited<ReturnType<typeof setup>>, source: any, state: string, category: string) {
  const directory = process.env.XPERT_EVENT_VIEW_EVIDENCE_DIR
  if (!directory) return
  const [row] = await f.hostDb.query(
    'SELECT * FROM agent_event_inbox WHERE binding=$1 AND state=$2 ORDER BY seq DESC LIMIT 1',
    [f.binding.id, state]
  )
  const display = source.eventTypes.find(
    (d: any) => d.type === row.event.type && d.schemaVersion === row.event.schemaVersion
  )?.display
  assert.equal(display.category.key, category)
  const projection = await source.describe?.(f.ctx, row.event, row.decision)
  const data = {
    id: row.id,
    type: row.event.type,
    schemaVersion: row.event.schemaVersion,
    display,
    state: row.state,
    subject: row.event.subject.key,
    title: projection?.title ?? row.event.subject.key,
    assistantId: f.ctx.xpertId,
    assistant: source.key,
    occurredAt: row.event.occurredAt,
    receivedAt: row.receivedAt,
    sourceEventId: row.sourceEventId,
    attempt: row.attempt,
    decision: row.decision,
    fields: projection?.fields,
    result: projection?.result,
    canRetry: false
  }
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(path.join(directory, category + '.json'), JSON.stringify(data), { mode: 0o600 })
}

test('Code Review: signed delivery, shared receipt, recovered review run, per-binding rollback', async (t) => {
  const f = await setup(t, 'code_review.github')
  const source = new ReviewEventSource(f.repositories, f.inbox(), f.viewReviews)
  f.p.executionUserId = f.ctx.userId
  f.p.settings.eventInboxShadow = true
  await f.records.save(f.p)
  await source.configure(f.ctx, true)
  const data = {
    action: 'opened',
    installation: { id: 1 },
    repository: { id: 2, name: 'repo', owner: { login: 'fixture' } },
    pull_request: {
      number: 1,
      title: 'Inbox acceptance',
      state: 'open',
      draft: false,
      head: { sha: 'a'.repeat(40) },
      base: { ref: 'main' },
      user: { login: 'fixture', type: 'User' }
    }
  }
  const body = Buffer.from(JSON.stringify(data))
  const signature = 'sha256=' + createHmac('sha256', f.application.webhookSecret!).update(body).digest('hex')
  const id = randomUUID()
  await Promise.all([1, 2].map(() => f.inbox().accept(body, signature, id, 'pull_request')))
  await f.drainInbox(f.p)
  assert.equal(await f.runs.count(), 0)
  await source.configure(f.ctx, false)
  // An old queued job and rolled-back capture cannot take an in-flight host delivery.
  const legacyAtCut = randomUUID()
  await f.inbox().accept(body, signature, legacyAtCut, 'pull_request')
  assert.equal(
    (await f.db.getRepository(ReviewDelivery).findOneByOrFail({ deliveryId: legacyAtCut })).status,
    'received'
  )
  await source.drain(f.ctx, f.publish(source), 32)
  const [row] = await f.hostDb.query('SELECT event,id FROM agent_event_inbox WHERE binding=$1', [f.binding.id])
  assert.equal((await f.store.publish(f.binding, source, row.event)).receiptId, row.id)
  assert.equal(
    (
      await f.store.publish(f.binding, source, {
        ...row.event,
        fact: { ...row.event.fact, revision: 'bad' }
      })
    ).code,
    'identity_conflict'
  )
  const decision = await f.consume(source, 'handled')
  const projection = await source.describe(f.ctx, row.event, decision, { includeConversation: true })
  assert.match(projection!.title, /Inbox acceptance/)
  assert.equal(projection!.result.action.zh_Hans, '查看评审运行')
  assert.equal((await source.searchTitles(f.ctx, 'Inbox acceptance'))[0].result.key, decision.resultRef.key)
  assert.equal(projection?.conversation, undefined)
  const reviewConversation = randomUUID()
  const pullUrl = 'https://github.com/fixture/repo/pull/1'
  const review = await f.db
    .getRepository(Review)
    .save({
      tenantId: f.ctx.tenantId,
      organizationId: f.ctx.organizationId,
      userId: f.ctx.userId,
      assistantId: f.ctx.xpertId,
      automationRunId: decision.resultRef.key,
      conversationId: reviewConversation,
      ref: parsePullUrl(pullUrl),
      snapshot: {
        title: 'Inbox acceptance',
        body: null,
        url: pullUrl,
        state: 'open',
        author: 'fixture',
        baseSha: 'b'.repeat(40),
        headSha: 'a'.repeat(40),
        files: [],
        comments: [],
        warnings: [],
        fetchedAt: new Date().toISOString()
      },
      summary: 'Verified review result',
      status: 'reviewed'
    })
  await f.runs.update(decision.resultRef.key, { reviewId: review.id })
  assert.equal((await source.describe(f.ctx, row.event, decision))?.conversation, undefined)
  const completed = await source.describe(f.ctx, row.event, decision, { includeConversation: true })
  assert.deepEqual(completed?.conversation, { conversationId: reviewConversation })
  assert.equal(completed?.result.action.zh_Hans, '打开评审')
  assert(completed?.result.fields.some((field) => field.value === review.summary))
  await captureViewReceipt(f, source, 'handled', 'github')
  const alternate = randomUUID()
  await f.records.update(f.p.id, { responsibleUserId: alternate })
  assert.equal(await source.describe({ ...f.ctx, userId: alternate }, row.event, decision, { includeConversation: true }), null)
  assert.deepEqual(await source.searchTitles({ ...f.ctx, userId: alternate }, 'Inbox acceptance'), [])

  assert.equal(source.eventTypes.find((d) => d.type === row.event.type)?.display.category.key, 'github')
  assert.equal(await f.runs.count(), 1)
  assert.equal(
    decision.resultRef.key,
    (await f.db.getRepository(ReviewDelivery).findOneByOrFail({ deliveryId: id })).runId
  )
  await f.drainInbox(f.p)
  const legacyDecision = (await f.db.getRepository(ReviewDelivery).findOneByOrFail({ deliveryId: legacyAtCut })).shadow
  assert.equal(legacyDecision?.comparison, 'matched')
  assert.equal(legacyDecision?.operationKey, decision.operationKey)
  assert.deepEqual(legacyDecision?.subject, row.event.subject)
  assert.equal(await f.runs.count(), 1)
  await source.configure({ ...f.ctx, bindingRevision: 2 }, false)
  await f.inbox().accept(body, signature, id, 'pull_request')
  const legacy = randomUUID()
  await f.inbox().accept(body, signature, legacy, 'pull_request')
  assert.equal((await f.db.getRepository(ReviewDelivery).findOneByOrFail({ deliveryId: legacy })).status, 'received')
  assert.equal((await f.hostDb.query('SELECT id FROM agent_event_inbox WHERE binding=$1', [f.binding.id])).length, 1)
})

test('Code Review: failed workflow and skipped workflow match legacy shadows; changed policy is recorded', async (t) => {
  const f = await setup(t, 'code_review.github')
  const source = new ReviewEventSource(f.repositories, f.inbox(), f.viewReviews)
  f.p.settings = {
    ...f.p.settings,
    eventInboxShadow: true,
    onWorkflowFailure: true
  }
  await f.records.save(f.p)
  const inbox = f.inbox()
  const send = async (runId: number, conclusion: string) => {
    const body = Buffer.from(
      JSON.stringify({
        action: 'completed',
        installation: { id: 1 },
        repository: { id: 2 },
        workflow_run: {
          id: runId,
          run_attempt: 1,
          head_sha: 'b'.repeat(40),
          head_branch: 'main',
          name: 'CI',
          conclusion,
          status: 'completed',
          html_url: 'https://github.com/fixture/repo/actions/runs/' + runId
        }
      })
    )
    const signature = 'sha256=' + createHmac('sha256', f.application.webhookSecret!).update(body).digest('hex')
    const id = randomUUID()
    await inbox.accept(body, signature, id, 'workflow_run')
    await inbox.accept(body, signature, id, 'workflow_run')
    return id
  }
  const deliveries = f.db.getRepository(ReviewDelivery)
  const failure = await send(101, 'failure'),
    skipped = await send(102, 'success')
  await f.drainInbox(f.p)
  const original = await deliveries.findOneByOrFail({ deliveryId: failure })
  const skippedRow = await deliveries.findOneByOrFail({ deliveryId: skipped })
  assert.equal(original.shadow?.comparison, 'matched')
  assert.equal(skippedRow.shadow?.comparison, 'matched')
  assert.equal(skippedRow.shadow?.reason, 'trigger_disabled')
  assert.equal((await f.hostDb.query('SELECT id FROM agent_event_inbox WHERE binding=$1', [f.binding.id])).length, 0)
  await source.configure(f.ctx, true)
  await send(101, 'failure')
  await source.drain(f.ctx, f.publish(source), 8)
  const result = await f.consume(source, 'handled')
  assert.equal(result.resultRef.kind, 'workflow-diagnosis')
  assert.equal(result.operationKey, original.shadow?.operationKey)
  assert.equal(result.resultRef.key, original.runId)
  const diagnosisConversation = randomUUID()
  await f.db.getRepository(WorkflowDiagnosis).update(result.resultRef.key, { conversationId: diagnosisConversation })
  const [receipt] = await f.hostDb.query('SELECT event FROM agent_event_inbox WHERE binding=$1', [f.binding.id])
  const projection = await source.describe(f.ctx, receipt.event, result, { includeConversation: true })
  assert.deepEqual(projection?.conversation, { conversationId: diagnosisConversation })
  await source.configure(f.ctx, false)
  const pending = await send(103, 'failure')
  f.p.executionRevision++
  await f.records.save(f.p)
  await f.drainInbox(f.p)
  assert.equal((await deliveries.findOneByOrFail({ deliveryId: pending })).shadow?.comparison, 'binding_changed')
})

test('Procurement: actual extraction service, baseline then a delayed revision and exactly one risk', async (t) => {
  const f = await setup(t, 'procurement.quote')
  const e = await import(procurement + 'entities/index.js')
  const { QuoteEventRoute, QuoteEventFact, QuoteEventParse } = await import(procurement + 'event-journal.js')
  const { QuoteEvents } = await import(procurement + 'quote-events.js')
  const { ProcurementQuoteComparisonService } = await import(procurement + 'procurement-quote-comparison.service.js')
  const entities = [
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
  const { QuoteFollowUp } = await import(procurement + 'quote-follow-up.js')
  const { DeliveryCheck, DeliveryCheckReceipt } = await import(procurement + 'delivery-check.js')
  const db = await domainDatabase(f, [...entities, QuoteEventRoute, QuoteEventFact, QuoteEventParse, QuoteFollowUp, DeliveryCheck, DeliveryCheckReceipt])
  try {
    const source = new QuoteEvents(db.getRepository(entities[0]))
    const service = new ProcurementQuoteComparisonService(...entities.map((cls) => db.getRepository(cls)), source)
    const scope = { ...f.ctx, assistantId: f.ctx.xpertId }
    await db.getRepository(entities[0]).save({
      id: f.ctx.sourceBindingRef,
      ...scope,
      createdById: scope.userId,
      title: 'Comparison',
      purchaseNo: 'P0'
    })
    await source.configure(f.ctx, true)
    const document = await service.registerSourceDocument(scope, {
      caseId: f.ctx.sourceBindingRef,
      name: 'Quote A',
      extractedContent: 'Supplier A delivery confirmation',
      role: 'supplier_quote'
    })
    const input = {
      caseId: f.ctx.sourceBindingRef,
      documentId: document.id,
      supplierName: 'Acceptance supplier',
      items: [],
      deliveryTime: '2026-12-01'
    }
    await service.saveSupplierQuoteExtraction(scope, input)
    const revisedIn = randomUUID()
    await service.saveSupplierQuoteExtraction({ ...scope, conversationId: revisedIn }, {
      ...input,
      deliveryTime: '2026-12-03'
    })
    await service.saveSupplierQuoteExtraction(scope, {
      ...input,
      deliveryTime: '2026-12-03'
    })
    await source.drain(f.ctx, f.publish(source), 32)
    const late = await service.saveSupplierQuoteExtraction(scope, input)
    assert.equal(late.supplierQuote.deliveryTime, '2026-12-03')
    assert.equal((await f.consume(source, 'ignored')).reasonCode, 'baseline')
    const decision = await f.consume(source, 'handled')
    const [receipt] = await f.hostDb.query('SELECT event FROM agent_event_inbox WHERE binding=$1 AND state=$2', [
      f.binding.id,
      'handled'
    ])
    const projection = await source.describe(f.ctx, receipt.event, decision, { includeConversation: true })
    assert.deepEqual(projection.conversation, { conversationId: revisedIn })
    const [baseline] = await f.hostDb.query("SELECT event,decision FROM agent_event_inbox WHERE binding=$1 AND state='ignored'", [f.binding.id])
    assert.equal((await source.describe(f.ctx, baseline.event, baseline.decision, { includeConversation: true })).conversation, undefined)
    await captureViewReceipt(f, source, 'handled', 'procurement')
    assert.equal(projection.result.action.zh_Hans, '查看风险')
    assert(
      (await source.searchTitles(f.ctx, projection.title)).some((m: any) => m.result?.key === decision.resultRef.key)
    )
    assert.equal(source.eventTypes.find((d: any) => d.type === receipt.event.type).display.category.key, 'procurement')

    assert.equal(await db.getRepository(e.ProcurementRiskItem).count(), 1)
    assert.equal(
      (await db.getRepository(e.ProcurementRiskItem).findOneByOrFail({ id: decision.resultRef.key })).type,
      'delivery_delay'
    )
    await t.test(
      'agent deadlines survive the originating turn, resume its branch, rearm and suppress obsolete wakes',
      async () => {
        const { ProcurementQuoteComparisonMiddleware } = await import(
          procurement + 'procurement-quote-comparison.middleware.js'
        )
        const threadId = randomUUID()
        const context = { ...scope, conversationId: revisedIn, threadId, agentKey: 'buyer' }
        const middleware = new ProcurementQuoteComparisonMiddleware(service).createMiddleware({}, context)
        const tool = (await middleware).tools.find((entry: { name: string }) => entry.name === 'procurement_follow_up')
        const riskId = decision.resultRef.key
        const caseId = input.caseId
        assert((await service.listFollowUpRisks(context, caseId)).some((r: { riskId: string }) => r.riskId === riskId))
        const call = async (action: string, options = {}) =>
          JSON.parse(await tool.invoke({ riskId, caseId, action, ...options }))
        const deadline = () => new Date(Date.now() + 3_600_000).toISOString()
        const expire = () =>
          db.query('UPDATE plugin_procurement_follow_up SET "dueAt"=now() WHERE "riskId"=$1', [riskId])
        const scan = () => source.drain(f.ctx, f.publish(source), 32)
        assert.equal((await call('inspect')).version, 0)
        await call('set', { expectedVersion: 0, dueAt: deadline() })
        await scan()
        assert.equal(await f.store.claim(f.binding), undefined)
        await assert.rejects(call('cancel', { expectedVersion: 0 }), /follow_up_version_changed/)
        await assert.rejects(
          service.followUp({ ...context, userId: randomUUID() }, { caseId, riskId, action: 'inspect' }),
          /case_access_changed/
        )
        await expire()
        await Promise.all([scan(), new QuoteEvents(db.getRepository(entities[0])).drain(f.ctx, f.publish(source), 32)])
        let due = await f.store.claim(f.binding)
        assert(due)
        await call('set', { expectedVersion: 1, dueAt: deadline() })
        const skipped = await source.handle(f.ctx, due, { wake: () => assert.fail('superseded wake') })
        assert.equal(skipped.status, 'ignored')
        await f.store.complete(due, skipped)
        await expire()
        await scan()
        due = await f.store.claim(f.binding)
        assert(due)
        // The decision commits before chat admission. A busy retry and buyer cancellation do not retract the wake.
        await assert.rejects(
          source.handle(f.ctx, due, {
            wake: async () => {
              throw new Error('thread_busy')
            }
          }),
          /thread_busy/
        )
        assert.equal((await call('inspect')).wakeStatus, 'queued')
        const cancelled = await call('cancel', { expectedVersion: 2 })
        assert.equal(cancelled.state, 'cancelled')
        assert.equal(cancelled.wakeStatus, 'queued')
        const wake = {
          wake: async (target: { threadId: string; conversationId: string; agentKey: string; prompt: string }) => {
            assert.equal(target.agentKey, 'buyer')
            assert.equal(target.conversationId, revisedIn)
            assert.equal(target.threadId, threadId)
            assert(target.prompt.includes(riskId))
            const fresh = await call('inspect')
            assert.equal(fresh.state, 'cancelled')
            assert.equal(fresh.wakeStatus, 'queued')
            assert.equal(fresh.deliveryDate, '2026-12-03')
          }
        }
        const handled = await source.handle(f.ctx, due, wake)
        assert.equal(handled.status, 'handled')
        assert.equal((await call('inspect')).wakeStatus, 'started')
        assert.equal((await call('inspect')).state, 'cancelled')
        await call('set', { expectedVersion: 3, dueAt: deadline() })
        // Simulate loss of the host ACK after the agent already rearmed. Admission has its own dedupe regression.
        assert.deepEqual(
          await source.handle(f.ctx, due, {
            wake: async (target: { threadId: string }) => assert.equal(target.threadId, threadId)
          }),
          handled
        )
        await f.store.complete(due, handled)
        assert.deepEqual(
          (await source.describe(f.ctx, due.event, handled, { includeConversation: true })).conversation,
          { conversationId: revisedIn, threadId }
        )
        await captureViewReceipt(f, source, 'handled', 'procurement')
        await expire()
        await scan()
        const rearmed = await f.store.claim(f.binding)
        assert(rearmed && rearmed.receiptId !== due.receiptId)
        await assert.rejects(
          source.handle(f.ctx, rearmed, {
            wake: async () => {
              throw new Error('thread_busy')
            }
          }),
          /thread_busy/
        )
        await source.handle(f.ctx, due, { wake: async () => {} })
        assert.equal((await call('inspect')).wakeStatus, 'queued')
        const reply = await call('reply', { expectedVersion: 4, replyNote: 'Supplier confirmed delivery' })
        assert.equal(reply.state, 'answered')
        const retried = await source.handle(f.ctx, rearmed, {
          wake: async () => {
            assert.equal((await call('inspect')).state, 'answered')
          }
        })
        await f.store.complete(rearmed, retried)
        assert.equal((await call('inspect')).wakeStatus, 'started')
        assert.equal((await call('inspect')).replyNote, 'Supplier confirmed delivery')
        await expire()
        await scan()
        assert.equal(await f.store.claim(f.binding), undefined)
      }
    )
    const secondDocument = await service.registerSourceDocument(scope, {
      caseId: input.caseId,
      name: 'Quote amendment',
      extractedContent: 'Amended delivery',
      role: 'supplier_quote'
    })
    const amendment = {
      ...input,
      documentId: secondDocument.id,
      deliveryTime: '2026-12-04'
    }
    await service.saveSupplierQuoteExtraction(scope, {
      ...amendment,
      quoteSeriesId: late.supplierQuote.id
    })
    await service.saveSupplierQuoteExtraction(scope, {
      ...amendment,
      deliveryTime: '2026-12-08'
    })
    const revisions = await db.query(
      'SELECT event FROM plugin_procurement_event_fact WHERE receipt IS NULL ORDER BY seq DESC'
    )
    assert.equal(revisions.length, 2)
    // Reverse T2 arrival. Each immutable fact carries the prior committed business revision.
    for (const { event } of revisions) await f.publish(source).publish(event)
    await source.drain(f.ctx, f.publish(source), 32)
    const newer = await f.consume(source, 'handled'),
      older = await f.consume(source, 'handled')
    assert.equal(
      (await db.getRepository(e.ProcurementRiskItem).findOneByOrFail({ id: newer.resultRef.key })).description,
      '2026-12-04 → 2026-12-08'
    )
    assert.equal(
      (await db.getRepository(e.ProcurementRiskItem).findOneByOrFail({ id: older.resultRef.key })).description,
      '2026-12-03 → 2026-12-04'
    )
    await t.test('cancelling before scan, closing a case, or rolling back capture suppresses the waiting deadline', async () => {
      const task = {caseId:input.caseId,riskId:newer.resultRef.key}
      const owner = {...scope,conversationId:revisedIn}
      const edit = (action:string,expectedVersion:number) => service.followUp(owner,{...task,action,expectedVersion,
        ...(action==='set'? {dueAt:new Date(Date.now()+3600000).toISOString()}: {})})
      const expire = () => db.query('UPDATE plugin_procurement_follow_up SET "dueAt"=now() WHERE "riskId"=$1',[task.riskId])
      const scan = async () => {await source.drain(f.ctx,f.publish(source),32);assert.equal(await f.store.claim(f.binding),undefined)}
      await edit('set',0)
      await edit('cancel',1)
      await expire()
      await scan()
      await edit('set',2)
      await expire()
      await db.getRepository(entities[0]).update(task.caseId,{status:'completed'})
      await scan()
      assert.equal((await edit('inspect',3)).state,'superseded')
      await db.getRepository(entities[0]).update(task.caseId,{status:'reviewing'})
      await edit('set',4)
      await source.configure(f.ctx,false)
      await expire()
      await scan()
      await source.configure(f.ctx,true)
      await scan()
    })
    await service.saveRiskItems(scope, {
      caseId: input.caseId,
      risks: [
        {
          type: 'manual',
          severity: 'low',
          title: 'Manual review',
          description: 'Keep alongside event risks'
        }
      ]
    })
    assert.equal(await db.getRepository(e.ProcurementRiskItem).count(), 4)
    await assert.rejects(
      service.saveSupplierQuoteExtraction(scope, {
        ...amendment,
        quoteSeriesId: randomUUID()
      }),
      /quote_series_mismatch/
    )
    await assert.rejects(
      service.saveSupplierQuoteExtraction(scope, {
        ...input,
        documentId: randomUUID()
      }),
      /quote_document_mismatch/
    )
    await t.test('replaying a distinct document that confirmed an older quote preserves the latest revision', async () => {
      async function parseDocument(name: string, deliveryTime: string, quoteSeriesId?: string) {
        const doc = await service.registerSourceDocument(scope, {
          caseId: input.caseId, name, extractedContent: name, role: 'supplier_quote'
        })
        const extraction = { ...input, documentId: doc.id, deliveryTime, quoteSeriesId, items: [{ productName: 'Pump', quantity: 2 }] }
        const result = await service.saveSupplierQuoteExtraction(scope, extraction)
        return { extraction, quote: result.supplierQuote }
      }

      const original = await parseDocument('Original', '2026-12-01')
      const series = original.quote.id
      const duplicate = await parseDocument('Second confirmation', '2026-12-01', series)
      const legacy = await parseDocument('Confirmation before upgrade', '2026-12-01', series)
      // A distinct confirmation in the previous schema wrote a quote and no parse receipt or fact.
      await db.getRepository(QuoteEventParse).delete({ binding: f.ctx.bindingId, documentId: legacy.extraction.documentId })
      const revised = await parseDocument('Revised delivery', '2026-12-06', series)
      const history = () => db.query(
        `SELECT snapshot->>'documentId' AS document, snapshot->>'date' AS date FROM plugin_procurement_event_fact
         WHERE binding=$1 AND snapshot->>'series'=$2 ORDER BY seq`,
        [f.ctx.bindingId, series]
      )
      const expected = [
        { document: original.extraction.documentId, date: '2026-12-01' },
        { document: revised.extraction.documentId, date: '2026-12-06' }
      ]
      assert.deepEqual(await history(), expected)
      await service.saveSupplierQuoteExtraction(scope, legacy.extraction)
      await Promise.all([1, 2].map(() => service.saveSupplierQuoteExtraction(scope, duplicate.extraction)))
      assert.deepEqual(await history(), expected)
      await source.drain(f.ctx, f.publish(source), 32)
      assert.equal((await f.consume(source, 'ignored')).reasonCode, 'baseline')
      const delay = await f.consume(source, 'handled')
      const risk = await db.getRepository(e.ProcurementRiskItem).findOneByOrFail({ id: delay.resultRef.key })
      assert.equal(risk.description, '2026-12-01 → 2026-12-06')

      // A historical digest alone cannot suppress a genuine change to a legacy document.
      const newer = await parseDocument('Second revised confirmation', '2026-12-06', series)
      await db.getRepository(QuoteEventParse).delete({ binding: f.ctx.bindingId, documentId: newer.extraction.documentId })
      await service.saveSupplierQuoteExtraction(scope, { ...newer.extraction, deliveryTime: '2026-12-01' })
      assert.deepEqual(await history(), [...expected, { document: newer.extraction.documentId, date: '2026-12-01' }])
      await source.drain(f.ctx, f.publish(source), 32)
      assert.equal((await f.consume(source, 'ignored')).reasonCode, 'no_delay')
    })
    await assert.rejects(source.drain({ ...f.ctx, userId: randomUUID() }, f.publish(source), 1))
    assert.equal(await f.store.claim(f.binding), undefined)
  } finally {
    await db.destroy()
  }
})

async function larkFixture(t: TestContext) {
  const f = await setup(t, 'lark.inbound')
  const { LarkEventIngress, LarkEventDispatch } = await import(lark + 'lark-event-ingress.js')
  const { LarkEventSource } = await import(lark + 'lark-event-source.js')
  const { LarkTriggerBindingEntity } = await import(lark + 'entities/lark-trigger-binding.entity.js')
  const { LarkEventFact, LarkEventRoute } = await import(lark + 'event-journal.js')
  const { LarkMessageLogEntity } = await import(lark + 'entities/lark-message-log.entity.js')
  const db = await domainDatabase(f, [LarkTriggerBindingEntity, LarkEventDispatch, LarkEventFact, LarkEventRoute, LarkMessageLogEntity])
  t.after(() => db.destroy())
  const bindings = db.getRepository(LarkTriggerBindingEntity)
  const integration = {
    id: f.ctx.sourceBindingRef,
    tenantId: f.ctx.tenantId,
    organizationId: f.ctx.organizationId
  }
  await bindings.save({
    ...integration,
    integrationId: integration.id,
    xpertId: f.ctx.xpertId,
    createdById: f.ctx.userId
  })
  const ingress = new LarkEventIngress(bindings)
  const submitted: string[] = []
  const dispatchedTo = randomUUID()
  const { larkEventDispatch } = await import(lark + 'handoff/lark-event-dispatch-context.js')
  const channel = {
    parseInboundMessage: () => ({ chatType: 'p2p' }),
    parseCardAction: () => ({})
  }
  const conversation = {
    getLatestConversationBindingByChatId: async () => ({
      ...f.ctx,
      scopeKey: 'chat'
    }),
    getActiveMessage: async () => ({
      thirdPartyMessage: { messageId: 'original' }
    }),
    handleMessage: async () => {
      const intent = larkEventDispatch.getStore()!
      await intent.record(intent.runId, dispatchedTo)
      submitted.push('message')
    },
    handleCardAction: async () => {
      submitted.push('card')
    }
  }
  const identity = {
    resolveInboundIdentityForEvent: async (_i: any, d: any) => ({
      mappedUser: {
        id: d.event.operator?.open_id === 'other' ? 'other' : f.ctx.userId
      },
      requestUser: { id: f.ctx.userId, tenantId: f.ctx.tenantId }
    })
  }
  const source = new LarkEventSource(ingress, channel, conversation, identity, {
    resolve: () => ({ read: async () => integration })
  })
  const msg = {
    message: {
      message_id: 'msg-1',
      chat_id: 'chat',
      message_type: 'text',
      content: '{"text":"验收"}',
      chat_type: 'p2p'
    },
    sender: { sender_id: { open_id: 'owner' } }
  }
  const click = {
    operator: { open_id: 'owner' },
    context: { open_chat_id: 'chat', open_message_id: 'original' },
    action: { tag: 'button', value: { action: 'confirm' } }
  }
  await source.configure(f.ctx, true)
  return { f, db, source, ingress, integration, msg, click, conversation, submitted, dispatchedTo, identity, channel, LarkEventIngress, LarkEventDispatch, LarkEventSource, LarkTriggerBindingEntity, LarkEventFact, LarkMessageLogEntity }
}

test('Lark: duplicate callback, message intent, authorized and competing card actions', async (t) => {
  const { f, db, source, ingress, integration, msg, click, conversation, submitted, dispatchedTo, LarkEventDispatch, LarkEventFact, LarkMessageLogEntity } = await larkFixture(t)
  const { LarkChannelStrategy } = await import(lark + 'lark-channel.strategy.js')
  const { LarkHooksController } = await import(lark + 'lark.controller.js')
  const { LarkCapabilityService } = await import(lark + 'lark-capability.service.js')
  const webhookIntegration = {
    ...integration,
    options: { verificationToken: 'fixture-only' }
  }
  const plugin = {
    resolve: () => ({ read: async () => webhookIntegration })
  }
  const webhook = new LarkHooksController(
    conversation,
    undefined,
    undefined,
    plugin,
    new LarkChannelStrategy(plugin, new LarkCapabilityService(), ingress)
  )
  const receive = async (body: unknown) => {
    let ack: unknown
    const res = {
      status: () => res,
      json: (v: unknown) => {
        ack = v
      }
    }
    await webhook.webhook(
      integration.id,
      {
        headers: {},
        body,
        user: { id: f.ctx.userId, tenantId: f.ctx.tenantId }
      },
      res
    )
    return ack
  }
  assert.deepEqual(
    await receive({
      type: 'url_verification',
      token: 'fixture-only',
      challenge: 'p0'
    }),
    {
      challenge: 'p0'
    }
  )
  assert.equal(await db.getRepository(LarkEventFact).count(), 0)
  const envelope = {
    schema: '2.0',
    header: {
      event_id: 'delivery-1',
      event_type: 'im.message.receive_v1',
      token: 'fixture-only'
    },
    event: msg
  }
  await db.query(
    "CREATE FUNCTION reject_test_fact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'capture unavailable'; END $$"
  )
  await db.query(
    'CREATE TRIGGER test_failure BEFORE INSERT ON plugin_lark_event_fact FOR EACH ROW EXECUTE FUNCTION reject_test_fact()'
  )
  await assert.rejects(receive(envelope))
  assert.equal(await db.getRepository(LarkEventFact).count(), 0)
  await db.query('DROP TRIGGER test_failure ON plugin_lark_event_fact')
  // The HTTPS callback and the WebSocket dispatcher see the same immutable source message.
  await receive(envelope)
  await ingress.capture(integration, 'message', msg)
  await ingress.capture(integration, 'card', click, 'click-1')
  await ingress.capture(integration, 'card', { ...click, operator: { open_id: 'other' } }, 'click-2')
  await source.drain(f.ctx, f.publish(source), 32)
  await f.consume(source, 'handled')
  await f.consume(source, 'handled')
  assert.equal((await f.consume(source, 'blocked')).reasonCode, 'card_access_changed')
  await captureViewReceipt(f, source, 'blocked', 'lark')
  const kinds = await f.hostDb.query(
    "SELECT DISTINCT event->>'type' AS type FROM agent_event_inbox WHERE binding=$1",
    [f.binding.id]
  )
  const displays = kinds.map((k: any) => source.eventTypes.find((d: any) => d.type === k.type)?.display)
  assert.equal(displays.length, 2)
  assert.equal(new Set(displays.map((d: any) => d.category.key)).size, 1)
  assert.equal(new Set(displays.map((d: any) => d.label.zh_Hans)).size, 2)
  assert(displays.every((d: any) => d.icon.value && d.category.key === 'lark'))

  await source.drain(f.ctx, f.publish(source), 32)
  assert.deepEqual(submitted.sort(), ['card', 'message'])
  const intents = db.getRepository(LarkEventDispatch)
  assert.equal(await intents.countBy({ state: 'submitted' }), 2)
  const rows = await f.hostDb.query('SELECT event,decision FROM agent_event_inbox WHERE binding=$1', [f.binding.id])
  for (const row of rows) {
    const result = await source.describe(f.ctx, row.event, row.decision, { includeConversation: true })
    if (row.event.type === 'lark.message.received') assert.deepEqual(result?.conversation, { conversationId: dispatchedTo })
    else assert.equal(result, null)
  }
  const inbound = rows.find((r: any) => r.event.type === 'lark.message.received')
  const intent = await intents.findOneByOrFail({ kind: 'message' })
  await intents.update(intent.id, { conversationId: null })
  const describeInbound = () => source.describe(f.ctx, inbound.event, inbound.decision, { includeConversation: true })
  assert.equal(await describeInbound(), null)
  const log = await db.getRepository(LarkMessageLogEntity).save({
    tenantId: f.ctx.tenantId, organizationId: f.ctx.organizationId, integrationId: integration.id,
    xpertId: f.ctx.xpertId, scopeKey: 'chat', direction: 'outbound', status: 'sent',
    runId: intent.handoffRunId, conversationId: dispatchedTo
  })
  assert.deepEqual((await describeInbound())?.conversation, { conversationId: dispatchedTo })
  await db.getRepository(LarkMessageLogEntity).update(log.id, { status: 'failed' })
  assert.equal(await describeInbound(), null)
  const cardIntent = await intents.findOneByOrFail({ kind: 'card' })
  await db.query(
    `UPDATE plugin_lark_event_dispatch SET state='started',"updatedAt"=now()-interval '6 minutes' WHERE id=$1`,
    [cardIntent.id]
  )
  await source.drain(f.ctx, f.publish(source), 32)
  assert.equal((await intents.findOneByOrFail({ id: cardIntent.id })).state, 'outcome_unknown')
  assert.deepEqual(submitted.sort(), ['card', 'message'])
})

for (const change of ['rollback', 'pause'] as const) {
  test(`Lark: a second instance can ${change} while message and card dispatches are pending`, async (t) => {
    const { f, db, source, ingress, integration, msg, click, identity, channel, conversation, submitted,
      LarkEventDispatch, LarkEventSource, LarkEventIngress, LarkTriggerBindingEntity } = await larkFixture(t)
    await ingress.capture(integration, 'message', msg)
    await ingress.capture(integration, 'card', click, 'click-1')
    await source.drain(f.ctx, f.publish(source), 32)
    await f.consume(source, 'handled')
    await f.consume(source, 'handled')
    const intents = db.getRepository(LarkEventDispatch)
    assert.equal(await intents.countBy({ state: 'pending' }), 2)

    const replicaDb = new DataSource(db.options)
    await replicaDb.initialize()
    t.after(() => replicaDb.destroy())
    const plugin = { resolve: () => ({ read: async () => integration }) }
    let releaseWorker!: () => void, signalReady!: () => void
    const gate = new Promise<void>((resolve) => { releaseWorker = resolve })
    const ready = new Promise<void>((resolve) => { signalReady = resolve })
    const worker = new LarkEventSource(ingress, channel, conversation, {
      resolveInboundIdentityForEvent: async (...args: Parameters<typeof identity.resolveInboundIdentityForEvent>) => {
        signalReady()
        await gate
        return identity.resolveInboundIdentityForEvent(...args)
      }
    }, plugin)
    const replica = new LarkEventSource(new LarkEventIngress(replicaDb.getRepository(LarkTriggerBindingEntity)),
      channel, conversation, identity, plugin)
    const next = change === 'rollback' ? f.ctx : { ...f.ctx, bindingRevision: f.ctx.bindingRevision + 1 }
    const work = worker.drain(f.ctx, f.publish(worker), 32)
    try {
      await Promise.race([ready, work.then(() => { throw new Error('Worker returned before reaching dispatch') })])
      await replica.configure(next, false)
    } finally {
      releaseWorker()
      await work
    }
    assert.deepEqual(submitted, [])
    assert.equal(await intents.countBy({ state: 'pending' }), 2)
    if (change === 'rollback') {
      // Only new capture returns to legacy. Existing authorized intents can finish exactly once.
      await replica.drain(next, f.publish(replica), 32)
      await replica.drain(next, f.publish(replica), 32)
      assert.deepEqual(submitted.sort(), ['card', 'message'])
      assert.equal(await intents.countBy({ state: 'submitted' }), 2)
    } else {
      // Re-enabling a newer revision cannot restore the old delegation.
      const enabled = { ...next, bindingRevision: next.bindingRevision + 1 }
      await replica.configure(enabled, true)
      await source.drain(f.ctx, f.publish(source), 32)
      await replica.drain(enabled, f.publish(replica), 32)
      assert.deepEqual(submitted, [])
      assert.equal(await intents.countBy({ state: 'pending' }), 2)
    }
  })
}

const liveGitHub = process.env.XPERT_EVENT_GITHUB_POLICY
test(
  'GitHub App: two genuine signed deliveries produce one receipt and review run',
  { skip: !liveGitHub, timeout: 600000 },
  async (t) => {
    const { createServer } = await import('node:http')
    const f = await setup(t, 'code_review.github')
    const config = JSON.parse(await readFile(liveGitHub!, 'utf8'))
    const { appId, slug, webhookSecret, installationId, repositoryId, owner, repository } = config
    Object.assign(f.application, { appId, slug, webhookSecret })
    Object.assign(f.p, { installationId, repositoryId, owner, repository })
    await f.records.save(f.p)
    const source = new ReviewEventSource(f.repositories, f.inbox(), f.viewReviews)
    await source.configure(f.ctx, true)
    let first: string | undefined
    let resolve!: () => void, reject!: (err: Error) => void
    const done = new Promise<void>((ok, fail) => {
      resolve = ok
      reject = fail
    })
    const server = createServer(async (req, res) => {
      try {
        if (req.method !== 'POST' || req.url !== '/events') {
          res.writeHead(404).end()
          return
        }
        const body: Buffer[] = []
        for await (const piece of req) body.push(piece)
        const delivery = String(req.headers['x-github-delivery'])
        const receipt = await f
          .inbox()
          .accept(Buffer.concat(body), String(req.headers['x-hub-signature-256']), delivery, 'pull_request')
        assert.equal(receipt?.id, f.p.id)
        res.writeHead(202).end()
        await source.drain(f.ctx, f.publish(source), 32)
        if (!first) {
          first = delivery
          const decision = await f.consume(source, 'handled')
          assert.equal(await f.runs.countBy({ id: decision.resultRef.key }), 1)
          console.log('GitHub delivery committed. Ready for GitHub redelivery.')
        } else if (first === delivery) {
          assert.equal(
            (await f.hostDb.query('SELECT id FROM agent_event_inbox WHERE binding=$1', [f.binding.id])).length,
            1
          )
          assert.equal(await f.runs.count(), 1)
          resolve()
        }
      } catch (err) {
        if (!res.headersSent) res.writeHead(422).end()
        reject(err as Error)
      }
    })
    await new Promise<void>((ok) =>
      server.listen(Number(process.env.XPERT_EVENT_GITHUB_PORT ?? 53384), '127.0.0.1', ok)
    )
    t.after(() => new Promise<void>((ok) => server.close(() => ok())))
    console.log('GitHub acceptance receiver ready')
    await done
  }
)

const liveLark = process.env.XPERT_EVENT_LARK_CREDENTIALS
test(
  'Feishu WebSocket: self-chat message, bot card and update to the original message',
  { skip: !liveLark, timeout: 1800000 },
  async (t) => {
    const f = await setup(t, 'lark.inbound')
    const { LarkEventIngress, LarkEventDispatch } = await import(lark + 'lark-event-ingress.js')
    const { LarkEventSource } = await import(lark + 'lark-event-source.js')
    const { LarkChannelStrategy } = await import(lark + 'lark-channel.strategy.js')
    const { LarkTriggerBindingEntity } = await import(lark + 'entities/lark-trigger-binding.entity.js')
    const { LarkEventFact, LarkEventRoute } = await import(lark + 'event-journal.js')
    const db = await domainDatabase(f, [LarkTriggerBindingEntity, LarkEventDispatch, LarkEventFact, LarkEventRoute])
    const bindings = db.getRepository(LarkTriggerBindingEntity)
    const options = JSON.parse(await readFile(liveLark!, 'utf8'))
    const integration = {
      id: f.ctx.sourceBindingRef,
      organizationId: f.ctx.organizationId,
      tenantId: f.ctx.tenantId,
      options
    }
    await bindings.save({
      integrationId: integration.id,
      xpertId: f.ctx.xpertId,
      tenantId: f.ctx.tenantId,
      organizationId: f.ctx.organizationId,
      createdById: f.ctx.userId
    })
    const plugin = { resolve: () => ({ read: async () => integration }) }
    const ingress = new LarkEventIngress(bindings)
    const { LarkCapabilityService } = await import(lark + 'lark-capability.service.js')
    const channel = new LarkChannelStrategy(plugin, new LarkCapabilityService(), ingress)
    const phrase = 'Event Inbox P0 ' + randomUUID().slice(0, 8)
    const submitted: string[] = []
    let sender = '',
      original = '',
      chat = '',
      updated = false
    const conversation = {
      getLatestConversationBindingByChatId: async (_: string, id: string) =>
        id === chat ? { ...f.ctx, scopeKey: 'self-chat' } : null,
      getActiveMessage: async () => ({
        thirdPartyMessage: { messageId: original }
      }),
      handleMessage: async (message: any) => {
        if (message.chatType !== 'private' || message.content.trim() !== phrase || original)
          throw Error('unexpected_test_message')
        sender = message.senderId
        chat = message.chatId
        const sent = await channel.sendCard(
          { integration, chatId: chat },
          {
            elements: [
              { tag: 'markdown', content: '事件收件箱已记录测试消息。' },
              {
                tag: 'action',
                actions: [
                  {
                    tag: 'button',
                    text: { tag: 'plain_text', content: '确认验收' },
                    value: { action: 'confirm' }
                  }
                ]
              }
            ]
          }
        )
        assert(sent.success && sent.messageId)
        submitted.push('message')
        original = sent.messageId
        console.log('Feishu returned a message ID for the original card.')
      },
      handleCardAction: async (action: any) => {
        assert.equal(action.messageId, original)
        const out = await channel.updateMessage({ integration, chatId: chat }, original, {
          elements: [{ tag: 'markdown', content: '验收完成：原卡片已更新。' }]
        })
        assert(out.success)
        submitted.push('card')
        updated = true
      }
    }
    // This transport test binds only the sender of its random challenge. Organization membership is tested separately.
    const identity = {
      resolveInboundIdentityForEvent: async (_: any, d: any) => ({
        mappedUser: d.event.operator?.open_id === sender && sender ? { id: f.ctx.userId } : null,
        requestUser: { id: f.ctx.userId, tenantId: f.ctx.tenantId }
      })
    }
    const source = new LarkEventSource(ingress, channel, conversation, identity, plugin)
    await source.configure(f.ctx, true)
    const ws = channel.createWSClientFromConfig(options)
    try {
      await ws.start({
        eventDispatcher: channel.createEventDispatcher({ integration }, {})
      })
      console.log('Feishu self-chat challenge: ' + phrase)
      while (!updated && !t.signal.aborted) {
        await source.drain(f.ctx, f.publish(source), 32)
        const claim = await f.store.claim(f.binding)
        if (claim) {
          const decision = await source.handle(f.ctx, claim)
          await f.store.complete(claim, decision)
        }
        await new Promise((ok) => setTimeout(ok, 350))
      }
      assert(updated)
      const intents = db.getRepository(LarkEventDispatch)
      assert.equal(await intents.countBy({ state: 'submitted' }), 2)
      const cardIntent = await intents.findOneByOrFail({ kind: 'card' })
      await db.query(
        `UPDATE plugin_lark_event_dispatch SET state='started',"updatedAt"=now()-interval '6 minutes' WHERE id=$1`,
        [cardIntent.id]
      )
      await source.drain(f.ctx, f.publish(source), 32)
      assert.equal((await intents.findOneByOrFail({ id: cardIntent.id })).state, 'outcome_unknown')
      assert.deepEqual(submitted.sort(), ['card', 'message'])
    } finally {
      ws.close({ force: true })
      await db.destroy()
    }
  }
)

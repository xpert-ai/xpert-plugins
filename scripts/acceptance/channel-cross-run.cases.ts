import { verifyOutputHandoff } from './agent-output.fixture.js'
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { DataSource } from '../../xpertai/apps/code-review/tests/automation-db.fixture.js'
import { ReviewEventSource } from '../../xpertai/apps/code-review/src/review-event-source.js'
import { setup, lark, larkFixture } from './event-inbox.fixture.js'

test('Feishu private delivery distinguishes a provider refusal from an interrupted attempt', async () => {
  const { LarkChannelStrategy } = await import(lark + 'lark-channel.strategy.js')
  const channel = Object.create(LarkChannelStrategy.prototype)
  let error: unknown = { response: { status: 403, data: { code: 99991672, msg: 'permission denied' } } }
  channel.getOrCreateLarkClient = () => ({ client: { im: { message: { create: async () => { throw error } } } } })
  const send = () => channel.sendPrivateNotification({}, 'private-user', 'notification', randomUUID())
  assert.deepEqual(await send(), { status: 'failed' })
  error = new Error('connection lost after request')
  assert.deepEqual(await send(), { status: 'unknown' })
  error = { response: { status: 502, data: { code: 10001, msg: 'upstream unavailable' } } }
  assert.deepEqual(await send(), { status: 'unknown' })
})

test('Feishu directory scope denial hides an unverified private target and temporary lookup errors remain retryable', async () => {
  const { LarkChannelStrategy } = await import(lark + 'lark-channel.strategy.js')
  const channel = Object.create(LarkChannelStrategy.prototype)
  let response: unknown = { code: 99991672, msg: 'missing directory scope' }
  channel.getOrCreateLarkClient = () => ({ client: { contact: { user: { get: async () => { throw response } } } } })
  const integration = { options: { appId: 'test-app' } }
  assert.equal(await channel.resolvePrivateDestination(integration, 'verified-subject'), null)
  response = new Error('connection lost')
  await assert.rejects(channel.resolvePrivateDestination(integration, 'verified-subject'), /lark_directory_unavailable/)
})

test('two distinct signed PR deliveries reuse the current ReviewRun and a new head creates a new one', async (t) => {
  const f = await setup(t, 'code_review.github')
  const source = new ReviewEventSource(f.repositories, f.inbox(), f.viewReviews)
  f.p.executionUserId = f.ctx.userId
  await f.records.save(f.p)
  await source.configure(f.ctx, true)
  async function deliver(sha: string) {
    const id = randomUUID()
    const body = Buffer.from(
      JSON.stringify({
        action: 'opened',
        installation: { id: 1 },
        repository: { id: 2, name: 'repo', owner: { login: 'fixture' } },
        pull_request: {
          number: 1,
          title: 'Cross-run',
          state: 'open',
          draft: false,
          head: { sha },
          base: { ref: 'main' },
          user: { login: 'fixture', type: 'User' }
        }
      })
    )
    await f
      .inbox()
      .accept(
        body,
        'sha256=' + createHmac('sha256', f.application.webhookSecret!).update(body).digest('hex'),
        id,
        'pull_request'
      )
    await source.drain(f.ctx, f.publish(source), 32)
    const decision = await f.consume(source, 'handled')
    const [row] = await f.hostDb.query(
      'SELECT id,event FROM agent_event_inbox WHERE binding=$1 AND "sourceEventId"=$2',
      [f.binding.id, id]
    )
    return { row, decision }
  }
  const first = await deliver('a'.repeat(40))
  await f.runs.update(first.decision.resultRef.key, { status: 'running' })
  const second = await deliver('a'.repeat(40))
  assert.notEqual(first.row.id, second.row.id)
  assert.deepEqual(second.decision.resultRef, first.decision.resultRef)
  const progress = await source.describe(f.ctx, second.row.event, second.decision)
  assert(progress?.result?.fields.some((field) => field.value === 'running'))
  assert.equal(await f.runs.count(), 1)
  const runId = first.decision.resultRef.key
  const run = await f.runs.findOneByOrFail({ id: runId })
  // Model output is supplied by the fixture. The production automation completes the result in store mode.
  await f.runs.update(runId, { settings: { ...run.settings, executionMode: 'assistant', publication: 'store' },
    evidenceUserId: f.ctx.userId, reviewId: randomUUID(), startedAt: new Date() })
  const reviewed = Object.create(f.viewReviews)
  reviewed.reconcile = async () => ({ status: 'reviewed' })
  await f.automation(reviewed).processStep(await f.stepFor(runId), { ...f.context, userId: f.ctx.userId, jobName: 'step' })
  assert.equal((await f.runs.findOneByOrFail({ id: runId })).status, 'completed')
  t.diagnostic(JSON.stringify(await verifyOutputHandoff(f, source.outputs)))
  const fresh = await deliver('b'.repeat(40))
  assert.notEqual(fresh.decision.resultRef.key, first.decision.resultRef.key)
  assert.equal(await f.runs.count(), 2)
  t.diagnostic(
    JSON.stringify({
      receipts: [first.row.id, second.row.id],
      reviewRun: first.decision.resultRef.key,
      newHeadRun: fresh.decision.resultRef.key
    })
  )
})

test('Feishu rechecks the card actor and current chat before exposing linked conversation or delivery evidence', async (t) => {
  const {
    f,
    db,
    source,
    ingress,
    integration,
    click,
    identity,
    mappings,
    msg,
    userCache,
    sdk,
    conversation,
    LarkEventDispatch,
    LarkMessageLogEntity
  } = await larkFixture(t)
  await ingress.capture(integration, 'card', click, 'card-1')
  await source.drain(f.ctx, f.publish(source), 32)
  const result = await f.consume(source, 'handled')
  await source.drain(f.ctx, f.publish(source), 32)
  const conversationId = randomUUID(),
    runId = randomUUID()
  const [row] = await f.hostDb.query('SELECT event FROM agent_event_inbox WHERE binding=$1', [f.binding.id])
  const describe = () => source.describe(f.ctx, row.event, result, { includeConversation: true })
  assert.equal(await db.getRepository(LarkMessageLogEntity).count(), 0)
  assert.equal((await describe())?.fields[0].value, 'unknown')
  assert.equal((await describe())?.conversation, undefined)
  const { initI18n } = await import(lark + 'i18n.js')
  await initI18n(fileURLToPath(new URL('../../xpertai/integrations/lark/src/', import.meta.url)))
  const chinese = await new Promise<any>((resolve, reject) =>
    sdk.runWithRequestContext({ user: { id: f.ctx.userId }, headers: { language: 'zh-Hans' } }, {}, () =>
      describe().then(resolve, reject)
    )
  )
  assert.equal(chinese.fields[0].value, '未知')
  assert.equal(chinese.conversation, undefined)

  await db.getRepository(LarkEventDispatch).update(result.resultRef.key, { conversationId, handoffRunId: runId })
  const log = await db.getRepository(LarkMessageLogEntity).save({
    tenantId: f.ctx.tenantId,
    organizationId: f.ctx.organizationId,
    xpertId: f.ctx.xpertId,
    integrationId: integration.id,
    scopeKey: 'chat',
    chatId: 'chat',
    direction: 'outbound',
    status: 'sent',
    conversationId,
    messageId: 'out-1',
    runId
  })
  assert.equal((await describe())?.fields[0].value, 'sent')
  assert.deepEqual((await describe())?.conversation, { conversationId })
  await db.getRepository(LarkMessageLogEntity).update(log.id, { scopeKey: 'other' })
  assert.equal(await describe(), null)
  await db.getRepository(LarkMessageLogEntity).update(log.id, { scopeKey: 'chat', chatId: 'other' })
  assert.equal(await describe(), null)
  await db.getRepository(LarkMessageLogEntity).update(log.id, { chatId: 'chat', status: 'failed' })
  assert.equal((await describe())?.fields[0].value, 'failed')
  assert.equal((await describe())?.conversation, undefined)
  // Warm the ordinary ingress cache through the production identity service before removing the authoritative mapping.
  const warmed = await identity.resolveInboundIdentityForEvent(integration, {
    event_type: 'im.message.receive_v1',
    event: msg
  })
  assert.equal(warmed.mappedUser.id, f.ctx.userId)
  const cacheKey = 'lark:user:union:' + f.ctx.tenantId + ':union-owner'
  assert.equal(userCache.get(cacheKey).id, f.ctx.userId)
  for (const owner of [null, randomUUID()]) {
    if (owner) mappings.set('union-owner', owner)
    else mappings.delete('union-owner')
    assert.equal(await describe(), null)
    await ingress.capture(integration, 'card', click, randomUUID())
    await source.drain(f.ctx, f.publish(source), 32)
    assert.equal((await f.consume(source, 'blocked')).reasonCode, 'card_access_changed')
    assert.equal(userCache.get(cacheKey).id, f.ctx.userId)
  }
  mappings.set('union-owner', f.ctx.userId)
  // The stale platform ID must never be accepted as a Feishu card ID.
  conversation.getActiveMessage = async () => ({ thirdPartyMessage: { id: 'replacement', messageId: 'original' } })
  assert.equal(await describe(), null)
  await assert.rejects(
    source.describe({ ...f.ctx, organizationId: randomUUID() }, row.event, result, { includeConversation: true }),
    /binding_changed/
  )
  assert.equal(await db.getRepository(LarkEventDispatch).count(), 1)
})

for (const change of [
  'unchanged',
  'unlinked',
  'replaced',
  'replaced during preparation',
  'unlinked before Handoff',
  'replaced before Handoff'
] as const) {
  test('Feishu queued card rechecks the current grant and active card: ' + change, async (t) => {
    const { f, db, ingress, integration, click, source, conversation, mappings, cards, LarkEventDispatch } =
      await larkFixture(t)
    const { LarkConversationService } = await import(lark + 'conversation.service.js')
    const { LarkChatDispatchService } = await import(lark + 'handoff/lark-chat-dispatch.service.js')
    const { ChatLarkMessage } = await import(lark + 'message.js')
    const replica = await new DataSource(db.options).initialize()
    t.after(() => replica.destroy())
    const conversationId = randomUUID()
    let serialized = ''
    // Serialize the real custom-card queue payload so the second connection has no request-local state.
    conversation.handleCardAction = async (_action, ctx) => {
      await LarkConversationService.prototype.onAction.call(
        {
          getConversation: async () => conversationId,
          getScopeQueue: async () => ({
            add: async (job) => {
              serialized = JSON.stringify(job)
            }
          })
        },
        'supplier_reply',
        { ...ctx, integrationId: integration.id, chatId: 'chat', scopeKey: 'chat' },
        'chat',
        f.ctx.xpertId,
        click.context.open_message_id
      )
    }
    await ingress.capture(
      integration,
      'card',
      { ...click, action: { tag: 'button', value: 'supplier_reply' } },
      randomUUID()
    )
    await source.drain(f.ctx, f.publish(source), 32)
    const result = await f.consume(source, 'handled')
    await source.drain(f.ctx, f.publish(source), 32)
    const job = JSON.parse(serialized)
    const store = replica.getRepository(LarkEventDispatch)
    const intent = () => store.findOneByOrFail({ id: result.resultRef.key })
    assert.equal((await intent()).state, 'submitted')
    assert.equal(job.eventDispatchRefs[0].id, result.resultRef.key)
    const replace = () => {
      conversation.getActiveMessage = async () => ({
        thirdPartyMessage: { id: 'next-card', messageId: 'platform-message' }
      })
    }
    if (change === 'unlinked') mappings.delete('union-owner')
    if (change === 'replaced') replace()

    let updates = 0,
      sends = 0
    const message = new ChatLarkMessage(job, {})
    message.update = async () => {
      updates++
      message.id = 'response-posted-by-this-worker'
    }
    const redis = { set: async () => 'OK', eval: async () => 1 }
    const worker = new LarkChatDispatchService(
      {
        ...conversation,
        getConversation: async () => conversationId,
        resolveDispatchExecutionContext: async () => {
          if (change === 'replaced during preparation') replace()
          return { ...f.ctx, createdById: f.ctx.userId }
        },
        setActiveMessage: async (_key, _assistant, active) => {
          conversation.getActiveMessage = async () => active
        }
      },
      {
        initialize: async () => {
          if (change === 'unlinked before Handoff') mappings.delete('union-owner')
          if (change === 'replaced before Handoff') replace()
        }
      },
      { resolve: () => ({ getRedis: async () => redis }) },
      store,
      cards
    )
    const run = () =>
      worker.submitDispatch(
        {
          xpertId: f.ctx.xpertId,
          input: job.input,
          executionContext: f.ctx,
          larkMessage: message
        },
        async () => {
          sends++
        }
      )
    if (change === 'unchanged') {
      await run()
      await run()
      assert.equal(updates, 1)
      assert.equal(sends, 1)
      assert.equal((await intent()).conversationId, conversationId)
    } else {
      await assert.rejects(run(), /card_access_changed/)
      assert.equal((await intent()).state, 'blocked')
      const posted = change === 'unlinked before Handoff' || change === 'replaced before Handoff'
      assert.equal((await intent()).handoffRunId, posted ? 'lark-chat-event-' + result.resultRef.key : null)
      await assert.rejects(run())
      assert.equal(updates, posted ? 1 : 0)
      assert.equal(sends, 0)
    }
    t.diagnostic(JSON.stringify({ change, state: (await intent()).state, cardUpdates: updates, handoffs: sends }))
  })
}

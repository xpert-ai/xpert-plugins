import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { TestContext } from 'node:test'
import { DataSource, Table, fixture, url } from '../../xpertai/apps/code-review/tests/automation-db.fixture.js'

// Run with the integration packages built and a dedicated PostgreSQL URL. Never select an existing tenant.
export const host = process.env.XPERT_EVENT_HOST_ROOT
if (!url || !host) throw new Error('Set XPERT_EVENT_HOST_ROOT and XPERT_PIPELINE_TEST_DATABASE_URL')
const storeModule = pathToFileURL(path.join(host, 'packages/server-ai/src/agent-event/agent-event.store.ts')).href
export const procurement = '../../community/apps/procurement-quote-comparison/dist/lib/'
export const lark = '../../xpertai/integrations/lark/dist/lib/'

// Optional hand-off to the platform browser suite. Only these disposable database scenarios call it.
export async function captureViewReceipt(f: Awaited<ReturnType<typeof setup>>, source: any, state: string, category: string) {
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

export async function setup(t: TestContext, adapter: string) {
  const f = await fixture(t)
  const { AgentEventStore } = await import(storeModule)
  // Use the host tables installed by schema-sync. Each scenario owns a fresh tenant in the dedicated test database.
  const hostDb = await new DataSource({
    type: 'postgres',
    url,
    extra: { options: '-c search_path=public' }
  }).initialize()
  const { tenantId, organizationId } = f.p
  try {
    await hostDb.transaction(async (tx) => {
      await tx.query('INSERT INTO tenant(id,name) VALUES ($1,$2)', [tenantId, 'Event Inbox acceptance'])
      await tx.query(
        `INSERT INTO organization(id,"tenantId",name,currency,"defaultValueDateType")
         VALUES ($1,$2,$3,'USD','TODAY')`,
        [organizationId, tenantId, 'Event Inbox acceptance']
      )
    })
  } catch (error) {
    await hostDb.destroy()
    throw error
  }
  t.after(async () => {
    try {
      await hostDb.query('DELETE FROM tenant WHERE id=$1', [tenantId])
    } finally {
      await hostDb.destroy()
    }
  })
  const ctx = {
    bindingId: randomUUID(),
    bindingRevision: 1,
    sourceBindingRef: f.p.id,
    xpertId: f.p.assistantId,
    tenantId: f.p.tenantId,
    organizationId: f.p.organizationId,
    workspaceId: f.p.workspaceId,
    projectId: f.p.settings.pipeline!.projectId,
    userId: f.p.userId,
    signal: new AbortController().signal
  }
  const [binding] = await hostDb.query(
    `INSERT INTO agent_event_binding(id,"tenantId","organizationId","workspaceId","xpertId",
    "userId","projectId",plugin,adapter,"sourceBindingRef","publishedAt",revision,state)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'acceptance',$8,$9,now(),1,'enabled') RETURNING *`,
    [
      ctx.bindingId,
      ctx.tenantId,
      ctx.organizationId,
      ctx.workspaceId,
      ctx.xpertId,
      ctx.userId,
      ctx.projectId,
      adapter,
      ctx.sourceBindingRef
    ]
  )
  const store = new AgentEventStore(hostDb)
  const publish = (source: any) => ({
    publish: (event: any) => store.publish(binding, source, event)
  })
  const consume = async (source: any, status: string) => {
    const claim = await store.claim(binding)
    assert(claim)
    const decision = await source.handle(ctx, claim)
    assert.equal(decision.status, status)
    // Simulate a lost T4 commit. The next worker must recover the original business result.
    await hostDb.query("UPDATE agent_event_partition SET expires=now()-interval '1 second' WHERE id=$1", [
      claim.partition
    ])
    const retry = await store.claim(binding)
    assert(retry)
    assert.equal(retry.receiptId, claim.receiptId)
    assert(BigInt(retry.fence) > BigInt(claim.fence))
    assert.equal(await store.complete(claim, decision), false)
    assert.deepEqual(await source.handle(ctx, retry), decision)
    assert.equal(await store.complete(retry, decision), true)
    return decision
  }
  return { ...f, ctx, binding, hostDb, store, publish, consume }
}

export async function domainDatabase(f: Awaited<ReturnType<typeof setup>>, entities: any[]) {
  // Use the same schema as the host receipts and TypeORM metadata for this built plugin.
  const db = new DataSource({ ...f.db.options, entities })
  await db.initialize()
  try {
    const runner = db.createQueryRunner()
    try {
      for (const entity of entities) await runner.createTable(Table.create(db.getMetadata(entity), db.driver))
    } finally {
      await runner.release()
    }
  } catch (error) {
    await db.destroy()
    throw error
  }
  return db
}

export async function larkFixture(t: TestContext) {
  const f = await setup(t, 'lark.inbound')
  const { LarkEventIngress, LarkEventDispatch } = await import(lark + 'lark-event-ingress.js')
  const { LarkEventSource } = await import(lark + 'lark-event-source.js')
  const { LarkTriggerBindingEntity } = await import(lark + 'entities/lark-trigger-binding.entity.js')
  const { LarkEventFact, LarkEventRoute } = await import(lark + 'event-journal.js')
  const { LarkMessageLogEntity } = await import(lark + 'entities/lark-message-log.entity.js')
  const db = await domainDatabase(f, [
    LarkTriggerBindingEntity,
    LarkEventDispatch,
    LarkEventFact,
    LarkEventRoute,
    LarkMessageLogEntity
  ])
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
  const { submitLarkEventHandoff } = await import(lark + 'handoff/lark-event-dispatch-context.js')
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
      thirdPartyMessage: { id: 'original', messageId: 'platform-message' }
    }),
    handleMessage: async (
      _message: unknown,
      ctx: { eventDispatchRefs: import('../../xpertai/integrations/lark/src/lib/types.js').LarkEventDispatchRef[] }
    ) => {
      await submitLarkEventHandoff(
        db.manager,
        ctx.eventDispatchRefs,
        { ...f.ctx, integrationId: integration.id, chatId: 'chat', scopeKey: 'chat' },
        cards,
        async (_runId, beforeSend) => {
          await beforeSend()
          submitted.push('message')
          return dispatchedTo
        }
      )
    },
    handleCardAction: async () => {
      submitted.push('card')
    }
  }
  const { LarkEventCardAccess } = await import(lark + 'lark-event-card-access.service.js')
  const { LarkInboundIdentityService } = await import(lark + 'lark-inbound-identity.service.js')
  const { LarkChannelStrategy } = await import(lark + 'lark-channel.strategy.js')
  const sdk = createRequire(new URL('../../xpertai/integrations/lark/package.json', import.meta.url))(
    '@xpert-ai/plugin-sdk'
  )
  const mappings = new Map([
    ['union-owner', f.ctx.userId],
    ['union-other', randomUUID()]
  ])
  const lookup = async ({ tenantId, thirdPartyId }) => {
    const id = mappings.get(thirdPartyId)
    return id && tenantId === f.ctx.tenantId ? { id, tenantId, thirdPartyId } : null
  }
  const plugin = {
    resolve: (token: string) => {
      if (token === sdk.USER_PERMISSION_SERVICE_TOKEN) return { read: lookup }
      if (token === sdk.INTEGRATION_PERMISSION_SERVICE_TOKEN) return { read: async () => integration }
      throw new Error('Unexpected permission service: ' + token)
    }
  }
  const users = new LarkChannelStrategy(plugin, {})
  const userCache = new Map()
  users.cacheManager = userCache
  users.getOrCreateLarkClient = () => ({ client: {} })
  const identity = new LarkInboundIdentityService(users, plugin)
  const cards = new LarkEventCardAccess(identity, conversation)
  const source = new LarkEventSource(ingress, channel, conversation, identity, cards)
  const msg = {
    message: {
      message_id: 'msg-1',
      chat_id: 'chat',
      message_type: 'text',
      content: '{"text":"验收"}',
      chat_type: 'p2p'
    },
    sender: { sender_id: { open_id: 'owner', union_id: 'union-owner' } }
  }
  const click = {
    operator: { open_id: 'owner', union_id: 'union-owner' },
    context: { open_chat_id: 'chat', open_message_id: 'original' },
    action: { tag: 'button', value: { action: 'confirm' } }
  }
  await source.configure(f.ctx, true)
  return {
    f,
    db,
    source,
    ingress,
    integration,
    msg,
    click,
    conversation,
    submitted,
    dispatchedTo,
    identity,
    cards,
    mappings,
    userCache,
    sdk,
    channel,
    LarkEventCardAccess,
    LarkEventIngress,
    LarkEventDispatch,
    LarkEventSource,
    LarkTriggerBindingEntity,
    LarkEventFact,
    LarkMessageLogEntity
  }
}

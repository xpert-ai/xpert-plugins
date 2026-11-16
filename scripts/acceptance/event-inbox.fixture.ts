import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { TestContext } from 'node:test'
import { DataSource, Table, fixture, url } from '../../xpertai/apps/code-review/tests/automation-db.fixture.js'

// Run with the integration packages built and a dedicated PostgreSQL URL. Never select an existing tenant.
export const host = process.env.XPERT_EVENT_HOST_ROOT
if (!url || !host) throw new Error('Set XPERT_EVENT_HOST_ROOT and XPERT_PIPELINE_TEST_DATABASE_URL')
const storeModule = pathToFileURL(path.join(host, 'packages/server-ai/src/agent-event/agent-event.store.ts')).href
export const procurement = '../../community/apps/procurement-quote-comparison/dist/lib/'

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

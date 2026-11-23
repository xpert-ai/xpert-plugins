import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { host, type setup } from './event-inbox.fixture.js'
import type { ReviewEventSource } from '../../xpertai/apps/code-review/src/review-event-source.js'

// Load the compiled host graph with its workspace aliases, leaving plugin imports on their locked SDK.
function hostRuntime() {
  const root = host!
  const require = createRequire(path.join(root, 'package.json'))
  const ts = require('typescript')
  const config = ts.readConfigFile(path.join(root, 'tsconfig.base.json'), ts.sys.readFile).config
  const aliases: Record<string, string[]> = {}
  for (const [key, [source]] of Object.entries<string[]>(config.compilerOptions.paths)) {
    const compiled = path.join('dist', source.replace(/\.ts$/, '.js'))
    if (existsSync(path.join(root, compiled))) aliases[key] = [compiled]
  }
  for (const name of ['contracts', 'plugin-sdk'])
    aliases['@xpert-ai/' + name] = ['packages/' + name + '/dist/index.cjs.js']
  const restore = require('tsconfig-paths').register({ baseUrl: root, paths: aliases })
  const load = (name: string) => require(path.join(root, 'dist/packages/server-ai/src', name))
  try {
    return {
      orm: require('typeorm'),
      binding: load('agent-event/agent-event.entity').AgentEventBinding,
      entities: load('user-notification/notification.entities'),
      Store: load('user-notification/output/output-store').OutputStore,
      Dispatch: load('user-notification/output/output-dispatch').OutputDispatch,
      Worker: load('user-notification/notification.worker').NotificationWorker
    }
  } finally {
    restore()
  }
}

export async function verifyOutputHandoff(f: Awaited<ReturnType<typeof setup>>, source: ReviewEventSource['outputs']) {
  const pending = await source.listPending(f.ctx, 32)
  assert.equal(pending.length, 1)
  const [ref] = pending
  assert.deepEqual(await source.listPending(f.ctx, 32), pending)
  assert.equal((await source.resolveForRecipient(f.ctx, ref)).status, 'visible')
  assert.equal((await source.resolveForRecipient({ ...f.ctx, userId: randomUUID() }, ref)).status, 'forbidden')

  // A source must skip a postponed row across scans, without acknowledging it or touching another actor's row.
  await source.defer({ ...f.ctx, userId: randomUUID() }, ref, null).catch(() => undefined)
  assert.deepEqual(await source.listPending(f.ctx, 32), pending)
  const retryAt = Date.now() + 1000
  await source.defer(f.ctx, ref, new Date(retryAt).toISOString())
  assert.deepEqual(await source.listPending(f.ctx, 32), [])
  await new Promise(resolve => setTimeout(resolve, Math.max(0, retryAt - Date.now() + 1)))
  assert.deepEqual(await source.listPending(f.ctx, 32), pending)

  const runtime = hostRuntime()
  const {
    AgentOutputMessage,
    AgentOutputDelivery,
    NotificationOutbox,
    UserNotificationEntity,
    USER_NOTIFICATION_ENTITIES
  } = runtime.entities
  const bindingSchema = new runtime.orm.EntitySchema({
    name: 'AgentEventBinding',
    target: runtime.binding,
    tableName: 'agent_event_binding',
    columns: {
      id: { type: 'uuid', primary: true },
      tenantId: { type: 'uuid' },
      organizationId: { type: 'uuid' },
      userId: { type: 'uuid' },
      workspaceId: { type: 'uuid' },
      xpertId: { type: 'uuid' },
      projectId: { type: 'uuid', nullable: true },
      plugin: { type: 'varchar' },
      adapter: { type: 'varchar' },
      sourceBindingRef: { type: 'varchar' },
      revision: { type: 'int' },
      state: { type: 'varchar' }
    }
  })
  const db = await new runtime.orm.DataSource({
    ...f.hostDb.options,
    entities: [bindingSchema, ...USER_NOTIFICATION_ENTITIES]
  }).initialize()
  try {
    const scope = { tenantId: f.ctx.tenantId, userId: f.ctx.userId }
    await f.hostDb.query('INSERT INTO "user" (id,"tenantId") VALUES ($1,$2)', [scope.userId, scope.tenantId])
    const store = new runtime.Store(db)
    // One collector loses its acknowledgement. Both must recover the same committed message.
    const replay = { ...source, listPending: async () => [ref], acknowledge: async () => {} }
    await Promise.all([store.collect(f.binding, f.ctx, replay), store.collect(f.binding, f.ctx, source)])
    const message = await db.manager.findOneByOrFail(AgentOutputMessage, scope)
    assert.equal(await db.manager.countBy(AgentOutputMessage, scope), 1)
    await source.acknowledge(f.ctx, ref, message.id)
    assert.equal(await source.acknowledge(f.ctx, ref, randomUUID()), 'conflict')
    assert.deepEqual(await source.listPending(f.ctx, 32), [])
    const actors = { withControlActor: (_scope: unknown, work: () => Promise<unknown>) => work() }
    const dispatch = new runtime.Dispatch(
      db,
      { resolve: () => ({ outputs: source }) },
      { assertAccessible: async () => {}, conversationAction: async () => undefined },
      actors,
      {}
    )
    const worker = new runtime.Worker(db, { publish: async () => {} }, dispatch)
    const task = await db.manager.findOneByOrFail(NotificationOutbox, scope)
    task.leaseId = randomUUID()
    await db.manager.save(task)
    await Promise.all([worker.deliver(task), worker.deliver(task)])
    const notice = await db.manager.findOneByOrFail(UserNotificationEntity, scope)
    assert.equal(notice.kind, 'agent.output')
    assert.equal(await db.manager.countBy(UserNotificationEntity, scope), 1)
    assert.equal(await db.manager.countBy(AgentOutputDelivery, { ...scope, state: 'delivered' }), 1)
    const [visible] = await dispatch.view(notice.source.deliveryId, scope.tenantId, scope.userId, true)
    assert.ok(visible)
    if (ref.kind === 'code_review.result') {
      assert.ok(visible.fields?.some((field: { value: string }) => field.value === ref.revision))
      const [preview] = await dispatch.view(notice.source.deliveryId, scope.tenantId, scope.userId)
      assert.equal(preview.fields, undefined)
    }
    assert.deepEqual(await dispatch.view(notice.source.deliveryId, scope.tenantId, randomUUID()), [])
    return { output: ref.key, revision: ref.revision, notification: notice.id }
  } finally {
    await db.destroy()
  }
}

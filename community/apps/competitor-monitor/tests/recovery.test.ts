// 自动化验证：使用隔离测试数据验证业务结果，不连接真实店铺或操作平台记录。
import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { DataSource } from 'typeorm'
import { ENTITIES, MonitorItem, CollectionRound, Snapshot, MonitorChange, Advice } from '../dist/lib/entities.js'
import { MonitorService } from '../dist/lib/service.js'

// 验证目标：分析失败持久化与范围约束。
test('analysis issues persist as partial and reanalysis requires the same scope', async () => {
  const db = await new DataSource({ type: 'sqljs', entities: ENTITIES, synchronize: true }).initialize()
  try {
    const service = new MonitorService(db.getRepository(MonitorItem), db.getRepository(CollectionRound), db.getRepository(Snapshot), db.getRepository(MonitorChange), db.getRepository(Advice))
    const scope = { tenantId: 'analysis', organizationId: 'org' }
    await service.addItem(scope, { itemId: '6543210', title: '耳机' })
    const result = await service.collect(scope, { idempotencyKey: 'analysis' })
    const input = { roundId: result.round.id, reason: '证据不足，不能生成建议', missingFields: [] }
    await assert.rejects(service.reportAnalysisIssue({ ...scope, organizationId: 'other' }, input))
    await service.reportAnalysisIssue(scope, input)
    const row = await db.getRepository(CollectionRound).findOneByOrFail({ id: input.roundId })
    assert.equal(row.status, 'partial')
    assert.equal(row.errorReason, input.reason)
    assert.equal((await service.reportAnalysisIssue(scope, input)).reused, true)
    await service.reportAnalysisIssue(scope, { ...input, reason: '新的失败原因' })
    assert.equal((await db.getRepository(CollectionRound).findOneByOrFail({ id: input.roundId })).errorReason, '新的失败原因')
    const request = await service.prepareAnalysis(scope, input.roundId)
    assert.ok(request.analysisMessage.includes(input.roundId))
    await assert.rejects(service.prepareAnalysis({ ...scope, tenantId: 'other' }, input.roundId))
    assert.equal(await db.getRepository(CollectionRound).count(), 1)
    await service.finishAnalysis(scope, input.roundId)
    const completed = await db.getRepository(CollectionRound).findOneByOrFail({ id: input.roundId })
    assert.equal(completed.status, 'success')
    assert.equal(completed.errorReason, null)
  } finally { await db.destroy() }
})

// 验证目标：部分采集失败复用证据、分页和并发拦截。
test('mid-round failure preserves evidence on retry and overlapping calls are rejected', async () => {
  const db = await new DataSource({ type: 'sqljs', entities: ENTITIES, synchronize: true }).initialize()
  try {
    const service = new MonitorService(db.getRepository(MonitorItem), db.getRepository(CollectionRound), db.getRepository(Snapshot), db.getRepository(MonitorChange), db.getRepository(Advice))
    const scope = { tenantId: 'mid', organizationId: null }
    await service.addItem(scope, { itemId: '6543210', title: '耳机' })
    await service.addItem(scope, { itemId: '6543211', title: '袖套' })
    await service.collect(scope, { idempotencyKey: 'baseline' })
    const running = service.collect(scope, { idempotencyKey: 'next', failOnItemId: '6543211' })
    await assert.rejects(service.collect(scope, { idempotencyKey: 'next' }), /collection_busy/)
    const failed = await running
    assert.equal(failed.round.status, 'failed')
    assert.equal(await db.getRepository(Snapshot).count(), 3)
    assert.equal(await db.getRepository(MonitorChange).count(), 3)
    const row = await db.getRepository(CollectionRound).findOneByOrFail({ id: failed.round.id })
    assert.equal(row.failedItemId, '6543211')
    const recovered = await service.retryCollection(scope, row.id)
    assert.equal(recovered.round.status, 'success')
    assert.equal(await db.getRepository(Snapshot).count(), 4)
    assert.equal(await db.getRepository(MonitorChange).count(), 4)
    const price = await db.getRepository(MonitorChange).findOneByOrFail({ roundId: row.id, dimension: 'price' })
    assert.equal(price.beforeValue, '199')
    assert.equal(price.afterValue, '179')
    const page1 = await service.getRoundChanges(scope, { roundId: row.id, limit: 2, page: 1 })
    const page2 = await service.getRoundChanges(scope, { roundId: row.id, limit: 2, page: 2 })
    assert.equal(page1.nextPage, 2)
    assert.equal(page2.hasMore, false)
    assert.equal(new Set([...page1.changes, ...page2.changes].map(x => x.changeId)).size, 4)
    await assert.rejects(service.finishAnalysis(scope, row.id), /analysis_incomplete/)
  } finally { await db.destroy() }
})

// 验证目标：跨轮次连续失败触发暂停，恢复保留人工暂停商品。
test('failures across separate rounds pause the third round and preserve manually paused items on recovery', async () => {
  const db = await new DataSource({ type: 'sqljs', entities: ENTITIES, synchronize: true }).initialize()
  try {
    const service = new MonitorService(db.getRepository(MonitorItem), db.getRepository(CollectionRound), db.getRepository(Snapshot), db.getRepository(MonitorChange), db.getRepository(Advice))
    const scope = { tenantId: 'tenant-a', organizationId: 'org-a' }
    await service.addItem(scope, { itemId: '6543210', title: '耳机' })
    await service.addItem(scope, { itemId: '6543211', title: '人工暂停商品' })
    await service.toggle(scope, '6543211')
    const first = await service.collect(scope, { idempotencyKey: 'a', failOnItemId: '6543210' })
    const second = await service.collect(scope, { idempotencyKey: 'b', failOnItemId: '6543210' })
    const third = await service.collect(scope, { idempotencyKey: 'c', failOnItemId: '6543210' })
    assert.notEqual(first.round.id, second.round.id)
    assert.notEqual(second.round.id, third.round.id)
    assert.equal(first.round.status, 'failed')
    assert.equal(second.round.status, 'failed')
    assert.equal(third.round.status, 'paused')
    assert.equal(third.round.retryCount, 1)
    await assert.rejects(service.retryCollection(scope, third.round.id), /resume_required/)
    await assert.rejects(service.resumeCollection({ ...scope, organizationId: 'other' }, third.round.id))
    await service.resumeCollection(scope, third.round.id)
    const items = await db.getRepository(MonitorItem).find()
    assert.equal(items.find(x => x.itemId === '6543210')!.status, 'active')
    assert.equal(items.find(x => x.itemId === '6543210')!.consecutiveFailures, 0)
    assert.equal(items.find(x => x.itemId === '6543211')!.status, 'paused')
    const recovered = await service.retryCollection(scope, third.round.id)
    assert.equal(recovered.round.id, third.round.id)
    assert.equal(recovered.round.status, 'success')
  } finally { await db.destroy() }
})

// 验证目标：同轮三次失败后的恢复与记录数量幂等。
test('three failures pause only the affected item; resume and retry preserve round and row counts', async () => {
  const db = await new DataSource({ type: 'sqljs', entities: ENTITIES, synchronize: true }).initialize()
  try {
    const service = new MonitorService(db.getRepository(MonitorItem), db.getRepository(CollectionRound), db.getRepository(Snapshot), db.getRepository(MonitorChange), db.getRepository(Advice))
    const scope = { tenantId: 'tenant-a', organizationId: null }
    await service.addItem(scope, { itemId: '6543210', title: '耳机' })
    await service.addItem(scope, { itemId: '6543211', title: '袖套' })
    await service.collect(scope, { idempotencyKey: 'baseline' })
    const failed = await service.collect(scope, { idempotencyKey: 'next', failOnItemId: '6543210' })
    assert.equal(failed.round.status, 'failed')
    assert.match(failed.round.errorReason!, /6543210/)
    await service.retryCollection(scope, failed.round.id, '6543210')
    const paused = await service.retryCollection(scope, failed.round.id, '6543210')
    assert.equal(paused.round.id, failed.round.id)
    assert.equal(paused.round.status, 'paused')
    const items = await db.getRepository(MonitorItem).find()
    assert.equal(items.find(x => x.itemId === '6543210')!.status, 'paused')
    assert.equal(items.find(x => x.itemId === '6543211')!.status, 'active')
    await assert.rejects(service.resumeCollection({ ...scope, tenantId: 'other' }, failed.round.id))
    await service.resumeCollection(scope, failed.round.id)
    const recovered = await service.retryCollection(scope, failed.round.id)
    assert.equal(recovered.round.status, 'success')
    assert.equal(recovered.round.id, failed.round.id)
    const snapshots = await db.getRepository(Snapshot).count()
    const changes = await db.getRepository(MonitorChange).count()
    await service.retryCollection(scope, failed.round.id)
    assert.equal(await db.getRepository(Snapshot).count(), snapshots)
    assert.equal(await db.getRepository(MonitorChange).count(), changes)
    assert.equal(changes, 4)
  } finally { await db.destroy() }
})


// 验证目标：每个商品独立建立基线并交替生成固定差异。
test('mock phases are per item, repeatable, and support catalog IDs in existing scopes', async () => {
  const db = await new DataSource({ type: 'sqljs', entities: ENTITIES, synchronize: true }).initialize()
  try {
    const service = new MonitorService(db.getRepository(MonitorItem), db.getRepository(CollectionRound), db.getRepository(Snapshot), db.getRepository(MonitorChange), db.getRepository(Advice))
    const scope = { tenantId: 'mock', organizationId: 'org' }
    await service.addItem(scope, { itemId: '6543212', title: '测试商品' })
    const first = await service.collect(scope, { idempotencyKey: 'first' })
    assert.equal(first.changes.length, 0)
    await service.addItem(scope, { itemId: '6543210', title: '耳机' })
    const second = await service.collect(scope, { idempotencyKey: 'second' })
    const snapshots = db.getRepository(Snapshot)
    assert.equal((await snapshots.findOneByOrFail({ roundId: second.round.id, itemId: '6543210' })).price, 199)
    assert.equal((await snapshots.findOneByOrFail({ roundId: second.round.id, itemId: '6543212' })).price, 89)
    assert.equal(second.changes.filter(x => x.itemId === '6543210').length, 0)
    assert.equal(second.changes.filter(x => x.itemId === '6543212').length, 2)
    const third = await service.collect(scope, { idempotencyKey: 'third' })
    assert.equal((await snapshots.findOneByOrFail({ roundId: third.round.id, itemId: '6543210' })).price, 179)
    assert.equal((await snapshots.findOneByOrFail({ roundId: third.round.id, itemId: '6543212' })).price, 99)
    assert.equal(third.changes.length, 5)
    const count = await snapshots.count()
    await service.retryCollection(scope, third.round.id)
    assert.equal(await snapshots.count(), count)
    const other = { ...scope, organizationId: 'other' }
    await service.addItem(other, { itemId: '6543212', title: '测试商品' })
    const baseline = await service.collect(other, { idempotencyKey: 'first' })
    assert.equal(baseline.changes.length, 0)
    assert.equal((await snapshots.findOneByOrFail({ roundId: baseline.round.id })).price, 99)
  } finally { await db.destroy() }
})


// 验证目标：各模拟商品场景与非法编号拒绝。
test('catalog scenarios persist exact changes, stable items stay unchanged, and unknown IDs are rejected', async () => {
  const db = await new DataSource({ type: 'sqljs', entities: ENTITIES, synchronize: true }).initialize()
  try {
    const service = new MonitorService(db.getRepository(MonitorItem), db.getRepository(CollectionRound), db.getRepository(Snapshot), db.getRepository(MonitorChange), db.getRepository(Advice))
    const scope = { tenantId: 'catalog', organizationId: 'org' }
    for (const itemId of ['demo-002', 'unknown', '6543220']) await assert.rejects(service.addItem(scope, { itemId, title: '无效商品' }), /不支持的模拟商品/)
    assert.equal(await db.getRepository(MonitorItem).count(), 0)
    const expected: Record<string, string[][]> = {"6543212": [["price", "99", "89"], ["promo", "无", "模拟限时优惠10元"]], "6543213": [["price", "199", "229"]], "6543214": [["title", "纯棉短袖 白色", "纯棉短袖 白色【升级款】"]], "6543215": [["promo", "无", "第二件半价"]], "6543216": [["promo", "满99减20", "无"]], "6543217": [], "6543218": [["price", "299", "259"], ["title", "运动鞋 轻量款", "运动鞋 轻量透气升级款"], ["promo", "满300减20", "限时直降40元"]], "6543219": [["price", "9.9", "9.8"]]}
    for (const itemId of Object.keys(expected)) await service.addItem(scope, { itemId, title: '商品' })
    const baseline = await service.collect(scope, { idempotencyKey: 'baseline' })
    assert.equal(baseline.changes.length, 0)
    const result = await service.collect(scope, { idempotencyKey: 'changed' })
    const changes = await db.getRepository(MonitorChange).findBy({ roundId: result.round.id })
    for (const [itemId, expectedChanges] of Object.entries(expected)) {
      const actual = changes.filter(x => x.itemId === itemId).map(x => [x.dimension, x.beforeValue, x.afterValue])
      assert.deepEqual(actual.sort(), expectedChanges.sort())
    }
    await service.retryCollection(scope, result.round.id)
    assert.equal(await db.getRepository(Snapshot).count(), 16)
    assert.equal(await db.getRepository(MonitorChange).count(), changes.length)
    // Existing legacy records remain stored but cannot silently receive fallback prices.
    await db.getRepository(MonitorItem).save({ id: 'legacy', ...scope, itemId: 'demo-legacy', title: '旧记录', shopName: '', url: '', status: 'active', consecutiveFailures: 0, revision: 1 })
    const failed = await service.collect(scope, { idempotencyKey: 'legacy' })
    assert.equal(failed.round.status, 'failed')
    assert.match(failed.round.errorReason!, /不在模拟清单/)
    assert.equal(await db.getRepository(Snapshot).countBy({ itemId: 'demo-legacy' }), 0)
  } finally { await db.destroy() }
})

// 真实服务 DTO 必须通过前端边界，避免精简动作回执被误当完整列表拒绝。
test('real service list and collection receipts satisfy the remote schemas', async () => {
  const { datasetSchema, actionDataSchema } = await import('../src/remote/types.js')
  const db = await new DataSource({ type: 'sqljs', entities: ENTITIES, synchronize: true }).initialize()
  try {
    const service = new MonitorService(db.getRepository(MonitorItem), db.getRepository(CollectionRound), db.getRepository(Snapshot), db.getRepository(MonitorChange), db.getRepository(Advice))
    const scope = { tenantId: 'remote-contract', organizationId: 'org' }
    await service.addItem(scope, { itemId: '6543210', title: '耳机' })
    const baseline = actionDataSchema.parse(await service.collect(scope, { idempotencyKey: 'baseline' }))
    assert.equal(baseline.round?.status, 'success')
    const changed = actionDataSchema.parse(await service.collect(scope, { idempotencyKey: 'changed' }))
    assert.equal(changed.changes?.length, 3)
    const failed = actionDataSchema.parse(await service.collect(scope, { idempotencyKey: 'failed', failOnItemId: '6543210' }))
    assert.equal(failed.round?.status, 'failed')
    assert.ok(failed.round?.errorReason?.includes('6543210'))
    const retried = actionDataSchema.parse(await service.retryCollection(scope, failed.round!.id))
    assert.equal(retried.round?.id, failed.round?.id)
    const dataset = datasetSchema.parse(await service.data(scope))
    assert.equal(dataset.items.length, 1)
    assert.equal(dataset.rounds.length, 3)
    assert.ok(dataset.changes.length >= 3)
  } finally { await db.destroy() }
})

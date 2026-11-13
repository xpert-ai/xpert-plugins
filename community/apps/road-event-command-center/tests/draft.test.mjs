import test from 'node:test'
import assert from 'node:assert/strict'
import { RoadEventCommandCenterDraftService } from '../dist/lib/road-event-command-center-draft.service.js'
import { draftSchema } from '../dist/lib/domain/draft.js'

const scope = {
  tenantId: 'tenant-a',
  organizationId: 'organization-a',
  workspaceId: 'workspace-a',
  userId: 'user-a',
  xpertId: 'assistant-a'
}

const draft = {
  title: 'G312 道路追尾事故',
  eventType: 'accident',
  severity: 'medium',
  locationDescription: 'G312 国道 126 公里处',
  description: '两辆小型车辆发生追尾，占用右侧车道，尚无人员伤亡报告。',
  occurredAt: '2026-11-10T01:30:00.000Z'
}

class MemoryRepository {
  rows = new Map()
  where(criteria) {
    return [...this.rows.values()].find(row => Object.entries(criteria).every(([key, value]) => row[key] === value))
  }
  async findOneBy(criteria) { return this.where(criteria) ?? null }
  async insert(row) {
    if (this.where({ id: row.id })) {
      const error = new Error('duplicate key')
      error.code = '23505'
      throw error
    }
    this.rows.set(row.id, { ...row })
  }
  async update(criteria, values) {
    const current = this.where(criteria)
    if (!current) return { affected: 0 }
    Object.assign(current, values)
    return { affected: 1 }
  }
}

test('draft schema rejects incomplete and out-of-range input', () => {
  assert.equal(draftSchema.safeParse(draft).success, true)
  assert.equal(draftSchema.safeParse({ ...draft, title: 'abc' }).success, false)
  assert.equal(draftSchema.safeParse({ ...draft, extra: 'untrusted' }).success, false)
  assert.equal(draftSchema.safeParse({ ...draft, severity: 'urgent' }).success, false)
  assert.equal(draftSchema.safeParse({ ...draft, coordinates: { longitude: 181, latitude: 0 } }).success, false)
  assert.equal(draftSchema.safeParse({ ...draft, coordinates: { longitude: 120, latitude: 31 } }).success, true)
  assert.equal(draftSchema.safeParse({ ...draft, coordinates: null }).success, true)
  assert.equal(draftSchema.safeParse({ ...draft, coordinates: undefined }).success, true)
})

test('draft saves with optimistic revisions and restores after reload', async () => {
  const repository = new MemoryRepository()
  const service = new RoadEventCommandCenterDraftService(repository)
  assert.deepEqual(await service.get(scope), { revision: 0, draft: null, updatedAt: null })
  const firstReceipt = await service.save(scope, { expectedRevision: 0, draft })
  assert.equal(firstReceipt.revision, 1)
  assert.equal(typeof firstReceipt.updatedAt, 'string')
  const restored = await service.get(scope)
  assert.equal(restored.revision, 1)
  assert.deepEqual(restored.draft, draft)
  assert.equal(restored.updatedAt, firstReceipt.updatedAt)
  await assert.rejects(service.save(scope, { expectedRevision: 0, draft }), /conflict/)
  assert.equal((await service.get({ ...scope, userId: 'user-b' })).draft, null)
  assert.equal((await service.save(scope, { expectedRevision: 1, draft: { ...draft, severity: 'high' } })).revision, 2)
})

test('simultaneous first saves cannot overwrite each other', async () => {
  const service = new RoadEventCommandCenterDraftService(new MemoryRepository())
  const results = await Promise.allSettled([
    service.save(scope, { expectedRevision: 0, draft }),
    service.save(scope, { expectedRevision: 0, draft: { ...draft, severity: 'high' } })
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected').length, 1)
  assert.match(results.find(result => result.status === 'rejected').reason.message, /conflict/)
})

test('sql.js unique constraint errors are treated as revision conflicts', async () => {
  const repository = new MemoryRepository()
  repository.insert = async () => { throw new Error('UNIQUE constraint failed: plugin_road_event_command_center_road_event_draft.id') }
  const service = new RoadEventCommandCenterDraftService(repository)
  await assert.rejects(service.save(scope, { expectedRevision: 0, draft }), /conflict/)
})

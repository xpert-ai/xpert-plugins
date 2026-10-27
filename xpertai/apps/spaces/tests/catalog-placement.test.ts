import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SpaceCatalog } from '../src/catalog.js'
import { Space, SpaceResourcePlacement } from '../src/entities.js'
import { ContentResourcesRuntimeCapability } from '@xpert-ai/plugin-sdk'

function fixture() {
  const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'member', projectId: 'project' }
  let current: SpaceResourcePlacement | null = null, locked = false, canWrite = true
  const calls: object[] = []
  const catalog = {
    get: async () => ({ canWrite }),
    list: async (input: object) => { calls.push(input); return { items: [{ contentId: 'resource', canWrite }], hasMore: false } }
  }
  const repo = {
    findOneBy: async () => current,
    findBy: async () => current ? [current] : [],
    save: async (value: SpaceResourcePlacement) => { assert(locked); current = value; return value },
    manager: { transaction: async (work: (manager: object) => Promise<unknown>) => {
      try { return await work({ getRepository: (entity: object) => entity === Space ? {
        findOneOrFail: async () => { locked = true; return { id: 'space' } }
      } : repo }) } finally { locked = false }
    } }
  }
  const access = { resource: async (_actor: object, id: string, op: string) => {
    if (id === 'foreign') return { space: { id: 'other-space' }, item: { kind: 'folder' } }
    if (op === 'write') assert(locked)
    return { space: { id: 'space' }, item: id === 'space' ? null : { kind: 'folder' } }
  } }
  const service = new SpaceCatalog({ require: (key: unknown) => key === ContentResourcesRuntimeCapability ? { catalog } : { list: async () => [] } } as never,
    repo as never, { workspace: async () => ({ id: 'space' }) } as never, access as never)
  return { actor, service, calls, reader: () => { canWrite = false } }
}

test('placement moves use independent CAS without changing native content; folder filtering precedes paging', async () => {
  const f = fixture()
  const moved = await f.service.move(f.actor, { contentId: 'resource', parentId: 'folder', expectedVersion: 0 })
  assert.equal(moved.version, 1)
  await assert.rejects(f.service.move(f.actor, { contentId: 'resource', parentId: null, expectedVersion: 0 }), /version_conflict/)
  await f.service.list(f.actor, { parentId: 'folder', offset: 50 })
  assert.deepEqual(f.calls[0], { actor: f.actor, projectId: 'project', assistantId: undefined, parentId: 'folder', offset: 50, limit: 50, excludedProviderKeys: ['spaces'], contentIds: ['resource'] })
  const restored = await f.service.move(f.actor, { contentId: 'resource', parentId: null, expectedVersion: 1 })
  assert.equal(restored.version, 2)
})

test('placement rejects read-only resources and destinations belonging to another space', async () => {
  const f = fixture()
  await assert.rejects(f.service.move(f.actor, { contentId: 'resource', parentId: 'foreign', expectedVersion: 0 }), /access_denied/)
  f.reader()
  await assert.rejects(f.service.move(f.actor, { contentId: 'resource', parentId: null, expectedVersion: 0 }), /access_denied/)
})

import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import { DataSource } from 'typeorm'
import { SpaceItem } from '../src/entities.js'
import { listItems, listQuery } from '../src/list-page.js'

// Explicit opt-in only. A connection-local shadow table and rollback leave the real library untouched.
test('Postgres paging preserves search, hierarchy isolation, suppression and cursor boundaries', { skip: !process.env.SPACES_TEST_POSTGRES }, async () => {
  const config = z.object({ host: z.string(), port: z.number().int(), username: z.string(), password: z.string(), database: z.string() }).parse(JSON.parse(process.env.SPACES_TEST_POSTGRES!))
  const db = await new DataSource({ ...config, type: 'postgres', entities: [SpaceItem], synchronize: false, logging: false }).initialize()
  const runner = db.createQueryRunner()
  await runner.startTransaction()
  try {
    await runner.query('CREATE TEMP TABLE plugin_spaces_item (LIKE public.plugin_spaces_item INCLUDING DEFAULTS) ON COMMIT DROP')
    const repo = runner.manager.getRepository(SpaceItem)
    const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), projectId: randomUUID() }
    const spaceId = randomUUID()
    const row = (title: string, patch: Partial<SpaceItem> = {}) => ({ ...actor, id: randomUUID(), spaceId, parentId: null,
      createdById: actor.userId, title, kind: 'file' as const, version: 1, deleted: false, filePath: title, ...patch })
    const hidden = row('deleted-parent', { kind: 'folder', deleted: true })
    const foreign = row('foreign-parent', { kind: 'folder', spaceId: randomUUID() })
    const cycleA = row('cycle-a', { kind: 'folder' }), cycleB = row('cycle-b', { kind: 'folder', parentId: cycleA.id })
    cycleA.parentId = cycleB.id
    const entries = Array.from({ length: 125 }, (_, i) => row(i === 124 ? 'later needle' : `row-${i}`, { updatedAt: new Date(Date.UTC(2026, 10, 16, 0, 0, 125 - i)) }))
    const sameTime = Array.from({ length: 121 }, (_, i) => row(`same-time-${i}`))
    await repo.insert([...entries, ...sameTime, hidden, foreign, cycleA, cycleB, row('hidden-child', { parentId: hidden.id }),
      row('cross-space-child', { parentId: foreign.id }), row('orphan', { parentId: randomUUID() }),
      row('private/source.json'), row('private-other/visible'), row('.space-history/snapshot.pptx')])
    const coverage = [{ path: 'private', recursive: true }]
    const query = listQuery.parse({ pageSize: 20 })
    const found: SpaceItem[] = []
    let cursor: string | undefined
    do {
      const page = await listItems(repo, actor, spaceId, { ...query, cursor }, coverage)
      assert(page.items.length <= 20); found.push(...page.items); cursor = page.nextCursor
      assert.equal(page.hasMore, !!cursor)
    } while (cursor)
    assert.equal(found.length, 247)
    assert.equal(new Set(found.map(item => item.id)).size, 247)
    assert(!found.some(item => ['hidden-child', 'cross-space-child', 'orphan', 'cycle-a', 'cycle-b', 'private/source.json'].includes(item.title)))
    const search = await listItems(repo, actor, spaceId, listQuery.parse({ search: 'later needle' }), coverage)
    assert.equal(search.items[0]?.title, 'later needle')
    const first = await listItems(repo, actor, spaceId, query, coverage)
    await assert.rejects(listItems(repo, { ...actor, userId: randomUUID() }, spaceId, { ...query, cursor: first.nextCursor }, coverage), /invalid_cursor/)
    const trash = await listItems(repo, actor, spaceId, listQuery.parse({ trash: true }), [])
    assert.deepEqual(trash.items.map(item => item.id), [hidden.id])
  } finally {
    await runner.rollbackTransaction(); await runner.release(); await db.destroy()
  }
})

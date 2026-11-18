import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import { DataSource } from 'typeorm'
import type { FileContentEditorRegistration } from '@xpert-ai/contracts'
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

    const codec = (key: string, extension: string, typeId: string): FileContentEditorRegistration => ({
      kind: 'file', protocolVersion: 2, key, formatId: extension, extension, mimeType: 'application/octet-stream',
      title: key, concurrency: 'versioned', view: { providerKey: 'test', viewKey: 'file', entry: 'file' },
      resourceType: { typeId, modelId: key, schemaVersion: '1', editProtocol: { id: 'platform.file.cas', version: '1' },
        title: { en_US: typeId }, implementationKey: key, implementationTitle: { en_US: key }, defaultEditorKey: key }
    })
    const formats = [codec('native.word', '.docx', 'document'), codec('native.slides', 'pptx', 'xpert.presentation')]
    const folder = row('documents', { kind: 'folder' })
    const words = Array.from({ length: 125 }, (_, i) => row(`AI Word ${i}`, { parentId: folder.id, filePath: `documents/${i}.docx` }))
    const bound = row('explicit binding', { filePath: 'bound.binary', editorKey: 'native.word' })
    const capital = row('uppercase', { filePath: 'uppercase.DOCX' })
    const artifact = row('artifact file', { kind: 'artifact', filePath: 'artifact.docx' })
    await repo.insert([folder, ...words, bound, capital, artifact,
      row('slides', { filePath: 'slides.pptx' }), row('wrong suffix', { filePath: 'backup.docx.zip' }),
      row('unavailable editor', { filePath: 'unavailable.docx', editorKey: 'removed.word' }),
      row('other binding', { filePath: 'other.docx', editorKey: 'native.slides' }),
      row('hidden word', { filePath: 'hidden.docx', parentId: hidden.id }),
      row('private word', { filePath: 'private/secret.docx' }),
      row('foreign word', { filePath: 'foreign.docx', organizationId: randomUUID() })])
    const typed = listQuery.parse({ typeId: 'document', pageSize: 20 })
    const documents: SpaceItem[] = []
    cursor = undefined
    do {
      const page = await listItems(repo, actor, spaceId, { ...typed, cursor }, coverage, formats)
      assert(page.items.length <= 20); documents.push(...page.items); cursor = page.nextCursor
      assert.equal(page.hasMore, !!cursor)
    } while (cursor)
    assert.deepEqual(new Set(documents.map(item => item.id)), new Set([...words, bound, capital, artifact].map(item => item.id)))
    assert.equal(documents.length, 128)
    const typedSearch = await listItems(repo, actor, spaceId, listQuery.parse({ typeId: 'document', search: 'AI Word 124', parentId: folder.id }), coverage, formats)
    assert.deepEqual(typedSearch.items.map(item => item.id), [words[124].id])
    const typedFirst = await listItems(repo, actor, spaceId, typed, coverage, formats)
    await assert.rejects(listItems(repo, actor, spaceId, { ...typed, typeId: 'xpert.presentation', cursor: typedFirst.nextCursor }, coverage, formats), /invalid_cursor/)
    const ambiguous = [...formats, codec('alternative.word', 'docx', 'document')]
    await assert.rejects(listItems(repo, actor, spaceId, { ...typed, cursor: typedFirst.nextCursor }, coverage, ambiguous), /invalid_cursor/)
    assert.deepEqual((await listItems(repo, actor, spaceId, typed, coverage, ambiguous)).items.map(item => item.id), [bound.id])
    assert.deepEqual((await listItems(repo, actor, spaceId, typed, coverage, [])).items, [])
  } finally {
    await runner.rollbackTransaction(); await runner.release(); await db.destroy()
  }
})

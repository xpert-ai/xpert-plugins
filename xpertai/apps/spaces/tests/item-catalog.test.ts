import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { FileContentEditorRegistration } from '@xpert-ai/contracts'
import { SpaceItemCatalog } from '../src/item-catalog.js'
import { SpaceItem } from '../src/entities.js'

function fixture(path: string, editorKey: string | null = null) {
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
  const space = { id: randomUUID(), projectId: randomUUID() }
  const item = Object.assign(new SpaceItem(), { id: randomUUID(), kind: 'file', title: path,
    filePath: path, editorKey, version: 1, projectedSequence: -1, updatedAt: new Date(), deleted: false })
  let allowed = true
  const check = async () => { if (!allowed) throw new Error('denied') }
  const formats: FileContentEditorRegistration[] = [{ key: 'custom.binary', protocolVersion: 2,
    kind: 'file', concurrency: 'versioned', extension: 'custom', mimeType: 'application/custom',
    title: 'Custom', formatId: 'custom', view: { providerKey: 'custom', viewKey: 'editor', entry: 'editor' } }]
  const catalog = new SpaceItemCatalog({ spaces: { findOneBy: async () => space },
    items: { findOneBy: async () => item }, project: check,
    resource: async () => { await check(); return { item, space } }
  } as never, {} as never, { require: () => ({ list: async () => formats }) } as never).catalog
  const scope = { actor, projectId: space.projectId }
  return { catalog, scope, item, removeCodec: () => formats.splice(0), revoke: () => { allowed = false } }
}

test('ordinary TXT/JSON files retain Workspace writes and are not claimed by the editor resolver', async () => {
  for (const path of ['notes.txt', 'config.json']) {
    const f = fixture(path)
    const snapshot = await f.catalog.describe({ ...f.scope, sourceResourceId: f.item.id })
    assert.equal(snapshot.writeOwnership, undefined)
    assert.equal(snapshot.modelId, 'platform.file')
    assert.equal(await f.catalog.resolveFile!({ ...f.scope, path }), null)
  }
})
test('registered file codecs claim the same resource without changing metadata on read', async () => {
  const f = fixture('Agent-output.CUSTOM')
  assert.equal((await f.catalog.describe({ ...f.scope, sourceResourceId: f.item.id })).writeOwnership, 'provider')
  assert.equal(await f.catalog.resolveFile!({ ...f.scope, path: f.item.filePath! }), f.item.id)
  assert.equal(f.item.editorKey, null)
})
test('an explicit editor binding remains protected after plugin removal and denied access never falls back', async () => {
  const f = fixture('report.custom', 'custom.binary')
  f.removeCodec()
  assert.equal((await f.catalog.describe({ ...f.scope, sourceResourceId: f.item.id })).writeOwnership, 'provider')
  assert.equal(await f.catalog.resolveFile!({ ...f.scope, path: f.item.filePath! }), f.item.id)
  f.revoke()
  await assert.rejects(f.catalog.resolveFile!({ ...f.scope, path: f.item.filePath! }), /denied/)
  await assert.rejects(f.catalog.describe({ ...f.scope, sourceResourceId: f.item.id }), /denied/)
})

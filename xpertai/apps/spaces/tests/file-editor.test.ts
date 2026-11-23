import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { SpaceFiles } from '../src/files.js'
import { SpaceEditors } from '../src/editors.js'
import { SpaceItem, Space } from '../src/entities.js'
import { contentHash } from '../src/documents.js'
import { ContentEditorsRuntimeCapability, ContentResourcesRuntimeCapability } from '@xpert-ai/plugin-sdk'

test('create/import delegates arbitrary file formats to the registry and stores generic file resources', async () => {
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), projectId: randomUUID() }
  const root = randomUUID(), registered: unknown[] = [], writes: unknown[] = [], prepared: Array<{ buffer?: Buffer }> = []
  const item = { id: randomUUID(), kind: 'file' }
  const editor = { key: 'custom.binary', kind: 'file', extension: 'custom', mimeType: 'application/custom', title: 'Custom',
    resourceType: { typeId: 'custom.document', icon: { type: 'emoji', value: 'D' } } }
  const service = new SpaceEditors({ project: async () => undefined, resource: async () => ({ space: { id: root } }), items: {
    update: async (_: unknown, value: object) => Object.assign(item, value), findOneByOrFail: async () => item
  } } as never, { put: async (...args: unknown[]) => writes.push(args) } as never,
  { createItem: async (_: object, input: { kind: string; title: string }) => { assert.equal(input.kind, 'file'); assert.equal(input.title, 'Test.custom'); return item } } as never,
  { require: (capability: unknown) => {
    if (capability === ContentResourcesRuntimeCapability) return { catalog: { register: async (input: object) => registered.push(input) } }
    assert.equal(capability, ContentEditorsRuntimeCapability)
    return { list: async () => [editor, { kind: 'text-document' }], prepare: async (input: { buffer?: Buffer }) => {
      prepared.push(input); return { registration: editor, buffer: input.buffer ?? Buffer.from('created') }
    } }
  } } as never)
  assert.deepEqual(await service.list(actor), [editor])
  const discovered = Object.assign(new SpaceItem(), { id: randomUUID(), kind: 'file', filePath: 'AI-result.custom', editorKey: null })
  const presented = (await service.presentItems(actor, [discovered]))[0]
  assert.equal(presented.editorKey, 'custom.binary')
  assert.equal(presented.resourceTypeId, 'custom.document')
  assert.deepEqual(presented.icon, editor.resourceType.icon)
  assert.equal(discovered.editorKey, null)
  await service.create(actor, root, null, 'Test', editor.key)
  const imported = Buffer.from('imported')
  await service.create(actor, root, null, 'Test', editor.key, imported)
  assert.equal(prepared[1].buffer, imported)
  assert.equal(writes.length, 2)
  assert.equal(registered.length, 2)
  assert.deepEqual(registered[0], { actor, projectId: actor.projectId, assistantId: undefined, source: { providerKey: 'spaces', resourceId: item.id } })
})

function fixture() {
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), projectId: randomUUID() }
  let bytes = Buffer.from('original'), revoked = false, race = false
  const item = Object.assign(new SpaceItem(), { id: randomUUID(), kind: 'file', version: 1, editorKey: 'custom.binary', deleted: false,
    filePath: 'custom.bin', fileHash: contentHash(bytes), currentFileVersionId: randomUUID(), file: { mimeType: 'application/custom' } })
  const space = Object.assign(new Space(), { id: randomUUID(), projectId: actor.projectId })
  const snapshots: Buffer[] = []
  const items = { findOneOrFail: async () => item, findOneByOrFail: async () => item,
    update: async (_: unknown, change: object) => Object.assign(item, change) }
  const manager = { getRepository: (entity: unknown) => entity === Space ? { findOneOrFail: async () => space } : items }
  const access = { resource: async () => { if (revoked) throw new Error('denied'); return { item, space } },
    items: { ...items, manager: { transaction: (fn: (value: typeof manager) => Promise<unknown>) => fn(manager) } } }
  const documents = { read: async () => ({ buffer: bytes, sha256: contentHash(bytes) }), scope: () => ({ actor, projectId: actor.projectId }),
    api: () => ({ write: async (input: { buffer: Buffer; expectedHash: string }) => {
      if (race) bytes = Buffer.from('external')
      if (contentHash(bytes) !== input.expectedHash) throw new Error('hash conflict')
      bytes = input.buffer
    } }) }
  const service = new SpaceFiles(access as never, {} as never, {} as never, documents as never,
    { sync: async () => undefined } as never,
    { create: (value: object) => value, save: async (value: object) => value } as never,
    { createScopedApi: () => ({ capabilities: { get: () => ({ uploadBuffer: async (input: { buffer: Buffer }) => {
      snapshots.push(input.buffer); return { filePath: '.space-history/version' }
    } }) } }) } as never, { notify: async () => undefined } as never)
  return { actor, item, service, snapshots, bytes: () => bytes, revoke: () => { revoked = true },
    external: () => { bytes = Buffer.from('external') }, race: () => { race = true } }
}
test('opaque file updates preserve snapshots, advance revisions and reject a stale editor', async () => {
  const f = fixture(), first = await f.service.editorRead(f.actor, f.item.id), second = await f.service.editorRead(f.actor, f.item.id)
  const saved = await f.service.editorWrite(f.actor, f.item.id, first.revision, Buffer.from('next'))
  assert.notEqual(saved.revision, first.revision)
  assert.equal((await f.service.editorRead(f.actor, f.item.id)).buffer.toString(), 'next')
  await assert.rejects(f.service.editorWrite(f.actor, f.item.id, second.revision, Buffer.from('lost update')), /version_conflict/)
  assert.equal(f.snapshots.length, 1)
})
test('Agent-created files open without mutation and retain original bytes on first CAS save', async () => {
  const f = fixture()
  Object.assign(f.item, { editorKey: null, currentFileVersionId: null, fileHash: null })
  const first = await f.service.editorRead(f.actor, f.item.id)
  assert.equal(f.item.currentFileVersionId, null)
  assert.equal(f.snapshots.length, 0)
  await f.service.editorWrite(f.actor, f.item.id, first.revision, Buffer.from('edited'), 'custom.binary')
  assert.equal(f.item.editorKey, 'custom.binary')
  assert.deepEqual(f.snapshots.map(buffer => buffer.toString()), ['original', 'edited'])
  assert.equal((await f.service.editorRead(f.actor, f.item.id)).buffer.toString(), 'edited')
  await assert.rejects(f.service.editorWrite(f.actor, f.item.id, first.revision, Buffer.from('stale')), /version_conflict/)
})
test('unversioned external edits and page documents cannot be overwritten through the opaque file protocol', async () => {
  const f = fixture()
  Object.assign(f.item, { editorKey: null, currentFileVersionId: null, fileHash: null })
  const first = await f.service.editorRead(f.actor, f.item.id)
  f.external()
  await assert.rejects(f.service.editorWrite(f.actor, f.item.id, first.revision, Buffer.from('stale')), /version_conflict/)
  assert.equal(f.snapshots.length, 0)
  f.item.kind = 'page'
  await assert.rejects(f.service.editorRead(f.actor, f.item.id))
  await assert.rejects(f.service.editorWrite(f.actor, f.item.id, first.revision, Buffer.from('bad')))
})
test('revoked/trash/metadata changes and out-of-band file changes cannot be overwritten', async () => {
  for (const change of [(f: ReturnType<typeof fixture>) => f.revoke(),
    (f: ReturnType<typeof fixture>) => { f.item.deleted = true },
    (f: ReturnType<typeof fixture>) => { f.item.syncError = 'spaces.location_pending' },
    (f: ReturnType<typeof fixture>) => { f.item.version++ },
    (f: ReturnType<typeof fixture>) => f.external(), (f: ReturnType<typeof fixture>) => f.race()]) {
    const f = fixture(), source = await f.service.editorRead(f.actor, f.item.id)
    change(f)
    await assert.rejects(f.service.editorWrite(f.actor, f.item.id, source.revision, Buffer.from('lost update')))
    assert.notEqual(f.bytes().toString(), 'lost update')
    assert.equal(f.item.currentFileVersionId, source.revision.split(':')[1])
  }
})

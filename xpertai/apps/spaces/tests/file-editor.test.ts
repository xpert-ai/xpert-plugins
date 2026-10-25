import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { SpaceFiles } from '../src/files.js'
import { SpaceEditors } from '../src/editors.js'
import { SpaceItem, Space } from '../src/entities.js'
import { contentHash } from '../src/documents.js'
import { ContentEditorsRuntimeCapability } from '@xpert-ai/plugin-sdk'

test('create/import delegates arbitrary file formats to the registry and stores generic file resources', async () => {
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), projectId: randomUUID() }
  const root = randomUUID(), writes: unknown[] = [], prepared: Array<{ buffer?: Buffer }> = []
  const item = { id: randomUUID(), kind: 'file' }
  const editor = { key: 'custom.binary', kind: 'file', extension: 'custom', mimeType: 'application/custom', title: 'Custom' }
  const service = new SpaceEditors({ project: async () => undefined, resource: async () => ({ space: { id: root } }), items: {
    update: async (_: unknown, value: object) => Object.assign(item, value), findOneByOrFail: async () => item
  } } as never, { put: async (...args: unknown[]) => writes.push(args) } as never,
  { createItem: async (_: object, input: { kind: string; title: string }) => { assert.equal(input.kind, 'file'); assert.equal(input.title, 'Test.custom'); return item } } as never,
  { require: (capability: unknown) => {
    assert.equal(capability, ContentEditorsRuntimeCapability)
    return { list: async () => [editor, { kind: 'text-document' }], prepare: async (input: { buffer?: Buffer }) => {
      prepared.push(input); return { registration: editor, buffer: input.buffer ?? Buffer.from('created') }
    } }
  } } as never)
  assert.deepEqual(await service.list(actor), [editor])
  await service.create(actor, root, null, 'Test', editor.key)
  const imported = Buffer.from('imported')
  await service.create(actor, root, null, 'Test', editor.key, imported)
  assert.equal(prepared[1].buffer, imported)
  assert.equal(writes.length, 2)
})

function fixture() {
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), projectId: randomUUID() }
  let bytes = Buffer.from('original'), revoked = false, race = false
  const item = Object.assign(new SpaceItem(), { id: randomUUID(), version: 1, editorKey: 'custom.binary', deleted: false,
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
    } }) } }) } as never)
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
test('revoked/trash/metadata changes and out-of-band file changes cannot be overwritten', async () => {
  for (const change of [(f: ReturnType<typeof fixture>) => f.revoke(),
    (f: ReturnType<typeof fixture>) => { f.item.deleted = true },
    (f: ReturnType<typeof fixture>) => { f.item.version++ },
    (f: ReturnType<typeof fixture>) => f.external(), (f: ReturnType<typeof fixture>) => f.race()]) {
    const f = fixture(), source = await f.service.editorRead(f.actor, f.item.id)
    change(f)
    await assert.rejects(f.service.editorWrite(f.actor, f.item.id, source.revision, Buffer.from('lost update')))
    assert.notEqual(f.bytes().toString(), 'lost update')
    assert.equal(f.item.currentFileVersionId, source.revision.split(':')[1])
  }
})

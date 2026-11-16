import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { CollaborationProviderContext } from '@xpert-ai/plugin-sdk'
import { SpaceFileCollaboration, SPACE_FILE_COLLABORATION } from '../src/file-collaboration.js'
import { SpaceItem } from '../src/entities.js'

function fixture() {
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
  const projectId = randomUUID(), assistantId = randomUUID(), documentId = randomUUID()
  const item = Object.assign(new SpaceItem(), { id: randomUUID(), kind: 'file', filePath: 'deck.pptx', version: 7, deleted: false })
  const calls: Array<{ actor: unknown; resourceId: string; operation: string }> = []
  let revoked = false
  const service = new SpaceFileCollaboration({ resource: async (scope: unknown, resourceId: string, operation: string) => {
    calls.push({ actor: scope, resourceId, operation })
    if (revoked || operation !== 'read') throw new Error('denied')
    return { item, space: { projectId } }
  } } as never, { require: () => ({
    ensureDocument: async (input: unknown) => {
      assert.deepEqual(input, { providerKey: SPACE_FILE_COLLABORATION, resourceId: item.id })
      return { id: documentId }
    },
    createSession: async (input: unknown) => {
      assert.deepEqual(input, { documentId, access: 'read' })
      return { documentId, access: 'read' }
    }
  }) } as never)
  const context: CollaborationProviderContext = { ...actor, projectId, xpertId: assistantId,
    providerKey: SPACE_FILE_COLLABORATION, resourceId: item.id, operation: 'read' }
  return { service, item, actor, projectId, assistantId, documentId, calls, context, revoke: () => { revoked = true } }
}

test('file presence uses the same resource, read access and current revision without writing bytes', async () => {
  const f = fixture()
  const session = await f.service.session({ actor: f.actor, projectId: f.projectId, assistantId: f.assistantId, sourceResourceId: f.item.id })
  assert.deepEqual(session, { documentId: f.documentId, access: 'read' })
  assert.equal(await f.service.authorize({ ...f.context, operation: 'initialize' }), true)
  assert.equal(await f.service.getRevision(f.context), 7)
  f.item.version = 8
  assert.equal(await f.service.getRevision(f.context), 8)
  for (const call of f.calls) assert.deepEqual(call, { actor: { ...f.actor, projectId: f.projectId, assistantId: f.assistantId }, resourceId: f.item.id, operation: 'read' })
})

test('file collaboration rejects revoked, mismatched, missing and non-file access on every request', async () => {
  const f = fixture()
  for (const operation of ['write', 'manage', 'materialize', 'delete'] as const)
    assert.equal(await f.service.authorize({ ...f.context, operation }), false)
  assert.equal(await f.service.authorize({ ...f.context, projectId: randomUUID() }), false)
  assert.equal(await f.service.authorize({ ...f.context, userId: null }), false)
  for (const change of [(v: ReturnType<typeof fixture>) => v.revoke(),
    (v: ReturnType<typeof fixture>) => { v.item.deleted = true },
    (v: ReturnType<typeof fixture>) => { v.item.kind = 'page' },
    (v: ReturnType<typeof fixture>) => { v.item.filePath = null }]) {
    const denied = fixture()
    change(denied)
    assert.equal(await denied.service.authorize(denied.context), false)
    await assert.rejects(denied.service.getRevision(denied.context))
    await assert.rejects(denied.service.session({ actor: denied.actor, projectId: denied.projectId,
      assistantId: denied.assistantId, sourceResourceId: denied.item.id }))
  }
})

import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { DataSource } from 'typeorm'
import { WorkspaceRecord } from '../src/lib/workspace.entity.js'
import { DockyardWorkspaceService } from '../src/lib/workspace.service.js'
import { DockyardLayoutMiddleware } from '../src/lib/layout.middleware.js'
import { editFileSchema } from '../src/lib/domain/edit-file.js'
import { adapter } from '../src/lib/remote/adapter.js'
import { mock } from 'node:test'
import { scope } from './fixtures.js'

async function fixture() {
  const db = await new DataSource({ type: 'sqljs', entities: [WorkspaceRecord], synchronize: true }).initialize()
  const service = new DockyardWorkspaceService(db.getRepository(WorkspaceRecord))
  await service.saveBuffers(scope, { expectedRevision: 0, buffers: [
    { contentId: 'example.js', text: 'const tax = amount * 0.2;\n' },
    { contentId: 'private.txt', text: 'unreferenced secret' }
  ] })
  return { db, service }
}
const edit = { contentId: 'example.js', expectedRevision: 1, oldText: 'amount * 0.2', newText: 'amount * 0.3' }

test('edit persists only the target passage, supports deletion, and rejects replay and stale UI saves', async () => {
  const { db, service } = await fixture()
  try {
    const receipt = await service.editFile(scope, edit)
    assert.deepEqual(receipt, { success: true, contentId: 'example.js', revision: 2 })
    assert.equal(JSON.stringify(receipt).includes('secret'), false)
    const saved = (await service.getWorkspace(scope)).buffers
    assert.deepEqual(saved.items, [{ contentId: 'example.js', text: 'const tax = amount * 0.3;\n' }, { contentId: 'private.txt', text: 'unreferenced secret' }])
    await assert.rejects(service.editFile(scope, edit), /conflict/)
    await assert.rejects(service.saveBuffers(scope, { expectedRevision: 1, buffers: [] }), /conflict/)
    await service.editFile(scope, { ...edit, expectedRevision: 2, oldText: saved.items[0].text, newText: '' })
    assert.equal((await service.getWorkspace(scope)).buffers.items[0].text, '')
  } finally { await db.destroy() }
})

test('scope changes, missing files, mismatches and ambiguous passages cannot write', async () => {
  const { db, service } = await fixture()
  try {
    for (const key of ['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId'] as const) {
      await assert.rejects(service.editFile({ ...scope, [key]: 'other' }, edit), /not_found/)
    }
    await assert.rejects(service.editFile(scope, { ...edit, contentId: 'missing' }), /not_found/)
    await assert.rejects(service.editFile(scope, { ...edit, oldText: 'unsaved version' }), /invalid_target/)
    await service.saveBuffers(scope, { expectedRevision: 1, buffers: [{ contentId: 'example.js', text: 'aaa' }] })
    await assert.rejects(service.editFile(scope, { ...edit, expectedRevision: 2, oldText: 'aa' }), /invalid_target/)
    assert.equal((await service.getWorkspace(scope)).buffers.items[0].text, 'aaa')
    assert.equal(editFileSchema.safeParse({ ...edit, tenantId: 'other' }).success, false)
    assert.equal(editFileSchema.safeParse({ ...edit, oldText: '' }).success, false)
  } finally { await db.destroy() }
})

test('competing edits use one compare-and-swap winner', async () => {
  const { db, service } = await fixture()
  try {
    const results = await Promise.allSettled([service.editFile(scope, edit), service.editFile(scope, { ...edit, newText: 'amount * 0.4' })])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal((await service.getWorkspace(scope)).buffers.revision, 2)
  } finally { await db.destroy() }
})

test('middleware exposes the write tool and rejects incomplete trusted scope', async () => {
  const { db, service } = await fixture()
  try {
    const middleware = new DockyardLayoutMiddleware(service)
    assert.deepEqual(middleware.getToolNames(), ['dockyard_edit_file'])
    const runtime = middleware.createMiddleware({}, { ...scope } as Parameters<typeof middleware.createMiddleware>[1])
    const tools = runtime.tools!
    const editTool = tools[0]
    assert.ok('invoke' in editTool)
    const result = JSON.parse(await editTool.invoke(edit))
    assert.equal(result.success, true)
    const failure = JSON.parse(await editTool.invoke(edit))
    assert.equal(failure.success, false)
    assert.equal(failure.code, 'conflict')
    assert.equal(JSON.stringify(failure).includes('unreferenced secret'), false)
    // A malformed host context cannot create an unscoped tool.
    assert.throws(() => middleware.createMiddleware({}, {} as Parameters<typeof middleware.createMiddleware>[1]))
  } finally { await db.destroy() }
})

test('edit references require saved content and use the authoritative revision', async () => {
  const query = mock.method(adapter.bridge, 'query', async () => ({
    workspace: { revision: 0, state: null }, buffers: { revision: 9, items: [{contentId: 'a.txt', text: 'saved'}] },
    scratchpad: { revision: 0, text: null }, proposal: null
  }))
  try {
    assert.equal(await adapter.editReferenceRevision('a.txt', 'saved'), 9)
    await assert.rejects(adapter.editReferenceRevision('a.txt', 'local edits'), /save_before_edit/)
    await assert.rejects(adapter.editReferenceRevision('missing', 'saved'), /save_before_edit/)
  } finally { query.mock.restore() }
})

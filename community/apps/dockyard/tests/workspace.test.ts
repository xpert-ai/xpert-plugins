import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { WorkspaceRecord, LayoutProposal } from '../src/lib/workspace.entity.js'
import { DockyardWorkspaceService } from '../src/lib/workspace.service.js'
import { fixture, scope } from './fixtures.js'

async function database() {
  const db = new DataSource({ type: 'sqljs', entities: [WorkspaceRecord, LayoutProposal], synchronize: true })
  await db.initialize()
  return { db, service: new DockyardWorkspaceService(db.getRepository(WorkspaceRecord)) }
}

test('layout, buffers and scratchpad have separate revisions; stale writes preserve saved data', async () => {
  const { db, service } = await database()
  const { state, manager } = fixture()
  try {
    assert.equal((await service.getWorkspace(scope)).workspace.state, null)
    await service.saveWorkspace(scope, { expectedRevision: 0, state })
    await service.saveBuffers(scope, { expectedRevision: 0, buffers: [{ contentId: 'workspace.js', text: 'unsent-to-AI' }] })
    await service.saveScratchpad(scope, { expectedRevision: 0, text: 'notes' })
    await service.saveWorkspace(scope, { expectedRevision: 1, state: { ...state, theme: 'light' } })
    await assert.rejects(service.saveWorkspace(scope, { expectedRevision: 1, state }), /conflict/)
    await assert.rejects(service.saveWorkspace(scope, { expectedRevision: 0, state }), /conflict/)
    const saved = await service.getWorkspace(scope)
    assert.equal(saved.workspace.revision, 2)
    assert.equal(saved.workspace.state!.theme, 'light')
    assert.equal(saved.buffers.revision, 1)
    assert.equal(saved.buffers.items[0].text, 'unsent-to-AI')
    assert.equal(saved.scratchpad.text, 'notes')
  } finally { manager.Dispose(); await db.destroy() }
})

test('each scope dimension isolates saved files and stale writes preserve buffers', async () => {
  const { db, service } = await database()
  try {
    await service.saveBuffers(scope, {expectedRevision: 0, buffers: [{contentId:'private.txt',text:'private'}]})
    for (const key of ['tenantId','organizationId','workspaceId','userId','xpertId'] as const) {
      assert.deepEqual((await service.getWorkspace({...scope,[key]:'different'})).buffers.items, [])
    }
    await assert.rejects(service.saveBuffers(scope, {expectedRevision: 0, buffers: []}), /conflict/)
    assert.equal((await service.getWorkspace(scope)).buffers.items[0].text, 'private')
  } finally { await db.destroy() }
})

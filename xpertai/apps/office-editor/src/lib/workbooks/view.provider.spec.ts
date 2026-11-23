jest.mock('@xpert-ai/plugin-sdk', () => ({ ViewExtensionProvider: () => (target: object) => target,
  pluginArtifactTableName: (namespace: string, key: string) => `plugin_${namespace}_${key}` }))
import { randomUUID } from 'node:crypto'
import { OfficeWorkbookView } from './view.provider.js'
import { WORKBOOK_VIEW } from './model.js'

it('binds trusted actor/project/Assistant scope and rejects caller-supplied authorization fields', async () => {
  const service = { read: jest.fn().mockResolvedValue({}), save: jest.fn().mockResolvedValue({}) }
  const view = new OfficeWorkbookView(service as never)
  const context = { hostType: 'agent' as const, hostId: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), runtimeScope: { projectId: randomUUID() } }
  expect(view.getViewManifests(context, 'agent.workbench')[0]).toMatchObject({ activation: { projectResource: true }, workbench: { openMode: 'on-demand' } })
  const documentId = randomUUID()
  await view.executeViewAction(context, WORKBOOK_VIEW, 'workbook.read', { input: { documentId } })
  expect(service.read).toHaveBeenCalledWith({ actor: { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }, projectId: context.runtimeScope.projectId, assistantId: context.hostId }, documentId)
  await expect(view.executeViewAction(context, WORKBOOK_VIEW, 'workbook.read', { input: { documentId, projectId: randomUUID() } })).rejects.toThrow()
  await expect(view.executeViewAction({ ...context, runtimeScope: {} }, WORKBOOK_VIEW, 'workbook.read', { input: { documentId } })).rejects.toThrow()
  await expect(view.executeViewAction(context, WORKBOOK_VIEW, 'workbook.save', { input: { documentId, snapshot: {}, requestId: randomUUID() } })).rejects.toThrow()
  expect(service.save).not.toHaveBeenCalled()
})

it('validates operation envelopes and never accepts an actor from the caller', async () => {
  const service = { submit: jest.fn().mockResolvedValue({ revision: '2' }), history: jest.fn().mockResolvedValue({ items: [] }) }
  const view = new OfficeWorkbookView(service as never)
  const context = { hostType: 'agent' as const, hostId: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), runtimeScope: { projectId: randomUUID() } }
  const documentId = randomUUID(), submission = { protocol: 'xpert.workbook.operations@1', requestId: randomUUID(), baseRevision: 1,
    operations: [{ kind: 'set_cell', sheetId: 's', row: 0, column: 0, cell: { value: 10, extensions: {} } }] }
  await view.executeViewAction(context, WORKBOOK_VIEW, 'workbook.submit', { input: { documentId, submission } })
  expect(service.submit).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ userId: context.userId }) }), documentId, submission)
  await expect(view.executeViewAction(context, WORKBOOK_VIEW, 'workbook.submit', {
    input: { documentId, submission, actor: { userId: randomUUID() } }
  })).rejects.toThrow()
  await expect(view.executeViewAction(context, WORKBOOK_VIEW, 'workbook.history', {
    input: { documentId, before: Number.MAX_SAFE_INTEGER }
  })).rejects.toThrow()
  expect(service.submit).toHaveBeenCalledTimes(1)
})

it('reuses workbook authorization before returning the canonical local draft resource ID', async () => {
  const documentId = randomUUID(), require = jest.fn().mockResolvedValue({ id: documentId })
  const view = new OfficeWorkbookView({ require } as never)
  const context = { hostType: 'agent' as const, hostId: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), runtimeScope: { projectId: randomUUID() } }
  await expect(view.authorizeLocalDraftResource(context, WORKBOOK_VIEW, documentId)).resolves.toBe(documentId)
  require.mockRejectedValue(new Error('office.access_denied'))
  await expect(view.authorizeLocalDraftResource(context, WORKBOOK_VIEW, documentId)).rejects.toThrow('office.access_denied')
  await expect(view.authorizeLocalDraftResource(context, WORKBOOK_VIEW, '../other')).rejects.toThrow()
  expect(require).toHaveBeenCalledTimes(2)
})

it('exposes selective undo through edit access and validates its immutable target', async () => {
  const service = { undo: jest.fn().mockResolvedValue({}) }, view = new OfficeWorkbookView(service as never)
  const context = { hostType: 'agent' as const, hostId: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), runtimeScope: { projectId: randomUUID() } }
  const input = { documentId: randomUUID(), revision: 2, requestId: randomUUID() }
  expect(view.getViewManifests(context, 'agent.workbench')[0].actions).toContainEqual(expect.objectContaining({ key: 'workbook.undo', requiredHostAccess: 'edit' }))
  await view.executeViewAction(context, WORKBOOK_VIEW, 'workbook.undo', { input })
  expect(service.undo).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ userId: context.userId }) }), input.documentId, 2, input.requestId)
  await expect(view.executeViewAction(context, WORKBOOK_VIEW, 'workbook.undo', { input: { ...input, revision: 1 } })).rejects.toThrow()
  await expect(view.executeViewAction(context, WORKBOOK_VIEW, 'workbook.undo', { input: { ...input, actorId: randomUUID() } })).rejects.toThrow()
  expect(service.undo).toHaveBeenCalledTimes(1)
})

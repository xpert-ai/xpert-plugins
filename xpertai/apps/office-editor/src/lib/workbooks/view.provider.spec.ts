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

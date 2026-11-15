jest.mock('@xpert-ai/plugin-sdk', () => ({ CollaborationDocumentProvider: () => () => undefined,
  pluginArtifactTableName: (namespace: string, key: string) => `plugin_${namespace}_${key}`,
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'runtime' }))
import { randomUUID } from 'node:crypto'
import { OfficeWorkbookCollaboration } from './collaboration.provider.js'

it('reloads the persisted Project and checks the current actor for every session operation', async () => {
  const context = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), providerKey: 'workbooks', resourceId: randomUUID(), operation: 'read' as const }
  const document = { projectId: randomUUID(), assistantId: randomUUID(), status: 'active' }
  const service = { documents: { findOne: jest.fn(async () => document) }, access: jest.fn(async () => undefined), head: jest.fn(async () => ({ revision: '7' })) }
  const provider = new OfficeWorkbookCollaboration(service as never)
  expect(await provider.authorize(context)).toBe(true)
  expect(service.access).toHaveBeenCalledWith({ actor: { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }, projectId: document.projectId, assistantId: document.assistantId }, 'read')
  expect(await provider.getRevision(context)).toBe(7)
  service.access.mockRejectedValueOnce(new Error('revoked'))
  expect(await provider.authorize(context)).toBe(false)
  expect(await provider.authorize({ ...context, projectId: randomUUID() })).toBe(false)
  document.status = 'archived'; expect(await provider.authorize(context)).toBe(false)
})

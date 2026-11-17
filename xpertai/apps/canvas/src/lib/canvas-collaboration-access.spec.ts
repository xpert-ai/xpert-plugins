jest.mock('@xpert-ai/plugin-sdk', () => ({ ProjectAccessRuntimeCapability: 'project', ContentResourcesRuntimeCapability: 'content' }))
import { authorizeCanvasCollaboration } from './canvas-collaboration-access.js'
import type { CanvasDocument } from './entities/canvas-document.entity.js'
import type { CollaborationProviderContext, RuntimeCapabilityResolver } from '@xpert-ai/plugin-sdk'
const context: CollaborationProviderContext = { providerKey: 'canvas.document', resourceId: 'canvas', tenantId: 'tenant', organizationId: 'org', userId: 'actor', operation: 'read' }
const doc: CanvasDocument = { title: 'Canvas', projectId: 'project', createdById: 'actor', status: 'draft' }
function fixture() {
  const project = { listReadable: jest.fn(async () => [{ role: 'member' }]), assertEdit: jest.fn(), assertManage: jest.fn(), assertAssistant: jest.fn() }
  const principal = jest.fn()
  const runtime = { get: (key: unknown) => key === 'project' ? project : { identities: { principal } } } as RuntimeCapabilityResolver
  return { runtime, project, principal }
}
it('resolves the resource Project even when a socket scope omits it and observes revocation', async () => {
  const f = fixture()
  expect(await authorizeCanvasCollaboration(doc, context, f.runtime)).toBe(true)
  expect(f.project.listReadable).toHaveBeenCalledWith({ actor: { tenantId: 'tenant', organizationId: 'org', userId: 'actor' }, projectIds: ['project'] })
  f.project.listReadable.mockResolvedValue([])
  expect(await authorizeCanvasCollaboration(doc, context, f.runtime)).toBe(false)
})
it('requires edit or manage authority instead of treating readable membership as write access', async () => {
  const f = fixture();f.project.assertEdit.mockRejectedValue(new Error('revoked'));f.project.assertManage.mockRejectedValue(new Error('not manager'))
  expect(await authorizeCanvasCollaboration(doc, { ...context, operation: 'write' }, f.runtime)).toBe(false)
  expect(await authorizeCanvasCollaboration(doc, { ...context, operation: 'manage' }, f.runtime)).toBe(false)
  expect(await authorizeCanvasCollaboration({ ...doc, status: 'archived' }, { ...context, operation: 'write' }, f.runtime)).toBe(false)
})
it('fails closed without a live actor/capability and keeps legacy resources creator-private', async () => {
  const f = fixture()
  expect(await authorizeCanvasCollaboration(doc, context)).toBe(false)
  expect(await authorizeCanvasCollaboration(doc, { ...context, userId: undefined }, f.runtime)).toBe(false)
  expect(await authorizeCanvasCollaboration({ ...doc, projectId: undefined, createdById: 'other' }, context, f.runtime)).toBe(false)
  expect(await authorizeCanvasCollaboration({ ...doc, projectId: undefined }, context, f.runtime)).toBe(true)
  f.principal.mockRejectedValue(new Error('inactive member'))
  expect(await authorizeCanvasCollaboration({ ...doc, projectId: undefined }, context, f.runtime)).toBe(false)
})

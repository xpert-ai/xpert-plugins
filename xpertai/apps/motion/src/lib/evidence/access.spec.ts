import { ForbiddenException } from '@nestjs/common'
import { authorizeEvidenceProject, authorizeEvidenceSource, visibleEvidenceProjects } from './access.js'
import type { RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { ContentResourcesRuntimeCapability } from '@xpert-ai/plugin-sdk'
const project = { id: 'video', title: 'Revenue', contentModel: 'motion.evidence-video', tenantId: 'tenant', organizationId: 'org', projectId: 'project' }
const scope = { tenantId: 'tenant', organizationId: 'org', projectId: 'project', userId: 'viewer' }
const api = { listReadable: jest.fn(), assertEdit: jest.fn(), assertAssistant: jest.fn() }
const runtime = { require: () => api } as unknown as RuntimeCapabilityRegistry
beforeEach(() => { jest.resetAllMocks(); api.listReadable.mockResolvedValue([{ role: 'member', archived: false }]); api.assertEdit.mockRejectedValue(new ForbiddenException()) })
it('allows current readers but requires edit access for mutations', async () => {
  await expect(authorizeEvidenceProject(runtime, scope, project, false)).resolves.toBeUndefined()
  await expect(authorizeEvidenceProject(runtime, scope, project, true)).rejects.toThrow()
  expect(api.listReadable).toHaveBeenCalledWith({ actor: { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }, projectIds: ['project'] })
})
it('blocks cross-project, cross-organization, missing identity and revoked membership on every retry', async () => {
  for (const invalid of [{ ...scope, projectId: 'other' }, { ...scope, organizationId: 'other' }, { ...scope, userId: undefined }])
    await expect(authorizeEvidenceProject(runtime, invalid, project, false)).rejects.toThrow()
  api.listReadable.mockResolvedValue([])
  await expect(authorizeEvidenceProject(runtime, scope, project, false)).rejects.toThrow()
  await expect(visibleEvidenceProjects(runtime, scope, [project])).resolves.toEqual([])
})
it('requires the currently bound Assistant and filters unauthorized evidence before pagination', async () => {
  api.assertAssistant.mockRejectedValue(new ForbiddenException())
  await expect(visibleEvidenceProjects(runtime, { ...scope, assistantId: 'assistant' }, [project])).resolves.toEqual([])
  expect(api.assertAssistant).toHaveBeenCalledWith(expect.objectContaining({ assistantId: 'assistant', projectId: 'project' }))
})

it('rechecks original evidence before new renders and fails closed when its source is revoked', async () => {
  const authorize = jest.fn().mockRejectedValue(new ForbiddenException('source revoked'))
  const runtime = { require: () => ({ authorize }) } as unknown as RuntimeCapabilityRegistry
  const evidenceProject = { ...project, sourceEvidence: { id: 'evidence', sha256: 'digest', initialChecksum: 'checksum', source: {} } }
  await expect(authorizeEvidenceSource(runtime, scope, evidenceProject as never)).rejects.toThrow('source revoked')
  expect(authorize).toHaveBeenCalledWith({ actor: { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' },
    providerKey: 'live-dashboard.analysis-evidence', resourceId: 'evidence', operation: 'read' })
  await expect(authorizeEvidenceSource(runtime, scope, project)).rejects.toThrow('SOURCE_UNAVAILABLE')
})
it('withholds native search entries when source access changes even though Project access remains', async () => {
  const authorize = jest.fn().mockRejectedValue(new ForbiddenException('revoked source'))
  const runtime = { require: (capability: unknown) => capability === ContentResourcesRuntimeCapability ? { authorize } : api } as unknown as RuntimeCapabilityRegistry
  const row = { ...project, sourceEvidence: { id: 'evidence', sha256: 'digest', initialChecksum: 'checksum', source: {} } }
  await expect(visibleEvidenceProjects(runtime, scope, [row as never])).resolves.toEqual([])
  authorize.mockResolvedValue(undefined)
  await expect(visibleEvidenceProjects(runtime, scope, [row as never])).resolves.toEqual([row])
})

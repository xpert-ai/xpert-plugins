import { ForbiddenException } from '@nestjs/common'
import { ContentResourcesRuntimeCapability, DefaultRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { OfficeDocument, OfficeSnapshot } from '../entities/index.js'
import { authorizeDocumentEvidence } from './evidence-access.js'

const scope = { actor: { tenantId: 'tenant', organizationId: 'org', userId: 'reader' }, projectId: 'project' }
const evidenceId = '29e832cb-cdc0-4fb2-b504-43cc18d5dfdc'
const fixture = () => {
  const authorize = jest.fn().mockResolvedValue({ canWrite: false })
  const runtime = new DefaultRuntimeCapabilityRegistry([[ContentResourcesRuntimeCapability, { authorize }]])
  const document = Object.assign(new OfficeDocument(), { id: 'document', contentModel: 'office-editor.document', currentVersionNumber: 3 })
  const first = Object.assign(new OfficeSnapshot(), { snapshot: { xpertEvidence: { id: evidenceId, sha256: 'a'.repeat(64) } } })
  const snapshots = { findOneBy: jest.fn().mockResolvedValue(first) }
  return { runtime, authorize, document, snapshots, first }
}

it('rechecks the original evidence under the current actor despite later editable snapshots', async () => {
  const f = fixture()
  await authorizeDocumentEvidence(f.runtime, f.snapshots, scope, f.document)
  expect(f.snapshots.findOneBy).toHaveBeenCalledWith({ tenantId: 'tenant', organizationId: 'org', projectId: 'project', documentId: 'document', versionNumber: 1 })
  expect(f.authorize).toHaveBeenCalledWith({ actor: scope.actor, providerKey: 'live-dashboard.analysis-evidence', resourceId: evidenceId, operation: 'read' })
  f.authorize.mockRejectedValue(new ForbiddenException('source revoked'))
  await expect(authorizeDocumentEvidence(f.runtime, f.snapshots, scope, f.document)).rejects.toThrow('source revoked')
})

it('applies the same source guard to presentations', async () => {
  const f = fixture(); f.document.contentModel = 'office-editor.presentation'
  f.authorize.mockRejectedValue(new ForbiddenException('definition changed'))
  await expect(authorizeDocumentEvidence(f.runtime, f.snapshots, scope, f.document)).rejects.toThrow('definition changed')
})

it('fails closed when the immutable origin is missing or malformed', async () => {
  const f = fixture(); f.snapshots.findOneBy.mockResolvedValue(null)
  await expect(authorizeDocumentEvidence(f.runtime, f.snapshots, scope, f.document)).rejects.toThrow('office.evidence_source_unavailable')
  f.first.snapshot = { xpertEvidence: { id: evidenceId, sha256: 'altered' } }
  f.snapshots.findOneBy.mockResolvedValue(f.first)
  await expect(authorizeDocumentEvidence(f.runtime, f.snapshots, scope, f.document)).rejects.toThrow('office.evidence_source_unavailable')
  expect(f.authorize).not.toHaveBeenCalled()
})

it('keeps ordinary documents and legacy Office resources independent of evidence', async () => {
  const f = fixture(); f.first.snapshot = { body: { dataStream: 'plain document' } }
  await authorizeDocumentEvidence(f.runtime, f.snapshots, scope, f.document)
  f.document.contentModel = undefined; f.snapshots.findOneBy.mockClear()
  await authorizeDocumentEvidence(f.runtime, f.snapshots, scope, f.document)
  expect(f.snapshots.findOneBy).not.toHaveBeenCalled(); expect(f.authorize).not.toHaveBeenCalled()
})

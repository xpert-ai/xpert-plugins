import { validateQuotaQueueEnvelope } from './quota-ingestion-queue.js'
import type { XpertQuotaQueuePayload } from './xpert-quota-knowledge.service.js'

describe('quota ingestion queue envelope', () => {
  it('accepts the persisted tenant and organization scope', () => {
    expect(() => validateQuotaQueueEnvelope(payload(), { tenantId: 'tenant-1', organizationId: 'org-1' })).not.toThrow()
  })

  it('rejects a cross-tenant queue envelope', () => {
    expect(() => validateQuotaQueueEnvelope(payload(), { tenantId: 'tenant-2', organizationId: 'org-1' })).toThrow(/tenant/)
  })

  it('rejects a cross-organization queue envelope', () => {
    expect(() => validateQuotaQueueEnvelope(payload(), { tenantId: 'tenant-1', organizationId: 'org-2' })).toThrow(/organization/)
  })
})

function payload(): XpertQuotaQueuePayload {
  return {
    ingestionJobId: 'job-1',
    sourceVersionId: 'version-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    projectId: null,
    userId: 'user-1',
    assistantId: 'xpert-1'
  }
}

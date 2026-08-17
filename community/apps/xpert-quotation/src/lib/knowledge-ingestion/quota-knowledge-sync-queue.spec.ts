import { validateQuotaKnowledgeSyncEnvelope } from './quota-knowledge-sync-queue.js'
import type { XpertQuotaKnowledgeSyncQueuePayload } from './xpert-quota-knowledge-sync.service.js'

describe('quota knowledge synchronization queue envelope', () => {
  it('accepts the persisted tenant and organization scope', () => {
    expect(() => validateQuotaKnowledgeSyncEnvelope(payload(), { tenantId: 'tenant-1', organizationId: 'org-1' })).not.toThrow()
  })

  it('rejects a cross-tenant queue envelope', () => {
    expect(() => validateQuotaKnowledgeSyncEnvelope(payload(), { tenantId: 'tenant-2', organizationId: 'org-1' })).toThrow(/tenant/)
  })

  it('rejects an incomplete runtime target', () => {
    expect(() => validateQuotaKnowledgeSyncEnvelope({ ...payload(), agentKey: '' }, { tenantId: 'tenant-1', organizationId: 'org-1' })).toThrow(/incomplete/)
  })
})

function payload(): XpertQuotaKnowledgeSyncQueuePayload {
  return {
    syncJobId: 'sync-job-1',
    sourceVersionId: 'version-1',
    knowledgebaseId: 'knowledgebase-1',
    xpertId: 'xpert-1',
    agentKey: 'agent-key',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    projectId: null,
    userId: 'user-1',
    assistantId: 'xpert-1'
  }
}

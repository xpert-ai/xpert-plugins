import type { XpertQuotaKnowledgeSyncQueuePayload } from './xpert-quota-knowledge-sync.service.js'

export function validateQuotaKnowledgeSyncEnvelope(payload: XpertQuotaKnowledgeSyncQueuePayload, context: object) {
  if (!payload.tenantId || !payload.syncJobId || !payload.sourceVersionId || !payload.knowledgebaseId || !payload.xpertId || !payload.agentKey) {
    throw new Error('Managed quota knowledge synchronization scope is incomplete.')
  }
  const tenantId = queueContextValue(context, 'tenantId')
  const organizationId = queueContextValue(context, 'organizationId')
  if (tenantId && tenantId !== payload.tenantId) throw new Error('Quota knowledge synchronization tenant does not match the queue envelope.')
  if (organizationId && organizationId !== payload.organizationId) throw new Error('Quota knowledge synchronization organization does not match the queue envelope.')
}

function queueContextValue(context: object, key: 'tenantId' | 'organizationId') {
  const value = Reflect.get(context, key)
  return typeof value === 'string' && value.trim() ? value : null
}

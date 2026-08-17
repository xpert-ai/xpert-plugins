import type { XpertQuotaQueuePayload } from './xpert-quota-knowledge.service.js'

export function validateQuotaQueueEnvelope(payload: XpertQuotaQueuePayload, context: object) {
  if (!payload.tenantId || !payload.ingestionJobId || !payload.sourceVersionId) throw new Error('Managed quota ingestion scope is incomplete.')
  const tenantId = queueContextValue(context, 'tenantId')
  const organizationId = queueContextValue(context, 'organizationId')
  if (tenantId && tenantId !== payload.tenantId) throw new Error('Quota ingestion tenant does not match the queue envelope.')
  if (organizationId && organizationId !== payload.organizationId) throw new Error('Quota ingestion organization does not match the queue envelope.')
}

function queueContextValue(context: object, key: 'tenantId' | 'organizationId') {
  const value = Reflect.get(context, key)
  return typeof value === 'string' && value.trim() ? value : null
}

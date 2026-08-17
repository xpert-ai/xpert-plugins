import { Injectable } from '@nestjs/common'
import {
  PluginJobProcessor,
  type ManagedQueueJob,
  type ManagedQueueJobContext,
  type ManagedQueueJobProcessor
} from '@xpert-ai/plugin-sdk'
import { XPERT_QUOTATION_PLUGIN_NAME } from '../constants.js'
import type { XpertScope } from '../types.js'
import { validateQuotaKnowledgeSyncEnvelope } from './quota-knowledge-sync-queue.js'
import {
  XPERT_QUOTA_SYNC_QUEUE_JOB_NAME,
  XPERT_QUOTA_SYNC_QUEUE_NAME,
  XpertQuotaKnowledgeSyncService,
  type XpertQuotaKnowledgeSyncQueuePayload
} from './xpert-quota-knowledge-sync.service.js'

@Injectable()
@PluginJobProcessor({
  pluginName: XPERT_QUOTATION_PLUGIN_NAME,
  queueName: XPERT_QUOTA_SYNC_QUEUE_NAME,
  jobName: XPERT_QUOTA_SYNC_QUEUE_JOB_NAME,
  concurrency: 1
})
export class XpertQuotaKnowledgeSyncProcessor implements ManagedQueueJobProcessor<XpertQuotaKnowledgeSyncQueuePayload> {
  constructor(private readonly synchronization: XpertQuotaKnowledgeSyncService) {}

  async handle(job: ManagedQueueJob<XpertQuotaKnowledgeSyncQueuePayload>, context: ManagedQueueJobContext) {
    validateQuotaKnowledgeSyncEnvelope(job.data, context)
    await this.synchronization.processQueueTask(scopeFromPayload(job.data), job.data.syncJobId, {
      xpertId: job.data.xpertId,
      agentKey: job.data.agentKey
    })
  }
}

function scopeFromPayload(payload: XpertQuotaKnowledgeSyncQueuePayload): XpertScope {
  return {
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    workspaceId: payload.workspaceId,
    projectId: payload.projectId,
    userId: payload.userId,
    assistantId: payload.assistantId
  }
}

import { Injectable } from '@nestjs/common'
import {
  PluginJobProcessor,
  type ManagedQueueJob,
  type ManagedQueueJobContext,
  type ManagedQueueJobProcessor
} from '@xpert-ai/plugin-sdk'
import { XPERT_QUOTATION_PLUGIN_NAME } from '../constants.js'
import type { XpertScope } from '../types.js'
import {
  XPERT_QUOTA_QUEUE_JOB_NAME,
  XPERT_QUOTA_QUEUE_NAME,
  XpertQuotaKnowledgeService,
  type XpertQuotaQueuePayload
} from './xpert-quota-knowledge.service.js'
import { validateQuotaQueueEnvelope } from './quota-ingestion-queue.js'

@Injectable()
@PluginJobProcessor({
  pluginName: XPERT_QUOTATION_PLUGIN_NAME,
  queueName: XPERT_QUOTA_QUEUE_NAME,
  jobName: XPERT_QUOTA_QUEUE_JOB_NAME,
  concurrency: 1
})
export class XpertQuotaIngestionProcessor implements ManagedQueueJobProcessor<XpertQuotaQueuePayload> {
  constructor(private readonly knowledge: XpertQuotaKnowledgeService) {}

  async handle(job: ManagedQueueJob<XpertQuotaQueuePayload>, context: ManagedQueueJobContext) {
    validateQuotaQueueEnvelope(job.data, context as object)
    await this.knowledge.processQueueTask(scopeFromPayload(job.data), job.data.ingestionJobId)
  }
}

function scopeFromPayload(payload: XpertQuotaQueuePayload): XpertScope {
  return {
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    workspaceId: payload.workspaceId,
    projectId: payload.projectId,
    userId: payload.userId,
    assistantId: payload.assistantId
  }
}

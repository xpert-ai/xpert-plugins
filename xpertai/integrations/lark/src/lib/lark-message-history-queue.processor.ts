import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { PluginJobProcessor, type ManagedQueueJob, type ManagedQueueJobProcessor } from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import { LARK_PLUGIN_NAME } from './constants.js'
import { LarkTriggerBindingEntity } from './entities/lark-trigger-binding.entity.js'
import { LarkMessageHistoryService } from './lark-message-history.service.js'
import {
  LARK_HISTORY_CLEANUP_JOB,
  LARK_HISTORY_MATERIALIZE_JOB,
  LARK_HISTORY_QUEUE_NAME,
  LarkMessageHistoryJobData,
  LarkMessageHistoryQueueService
} from './lark-message-history-queue.service.js'

@Injectable()
@PluginJobProcessor({
  pluginName: LARK_PLUGIN_NAME,
  queueName: LARK_HISTORY_QUEUE_NAME,
  jobName: LARK_HISTORY_MATERIALIZE_JOB,
  concurrency: 2
})
@PluginJobProcessor({
  pluginName: LARK_PLUGIN_NAME,
  queueName: LARK_HISTORY_QUEUE_NAME,
  jobName: LARK_HISTORY_CLEANUP_JOB,
  concurrency: 1
})
export class LarkMessageHistoryQueueProcessor implements ManagedQueueJobProcessor<LarkMessageHistoryJobData> {
  private readonly logger = new Logger(LarkMessageHistoryQueueProcessor.name)

  constructor(
    private readonly historyService: LarkMessageHistoryService,
    private readonly queueService: LarkMessageHistoryQueueService,
    @InjectRepository(LarkTriggerBindingEntity)
    private readonly triggerBindingRepository: Repository<LarkTriggerBindingEntity>
  ) {}

  async handle(job: ManagedQueueJob<LarkMessageHistoryJobData>): Promise<void> {
    switch (job.name) {
      case LARK_HISTORY_MATERIALIZE_JOB: {
        const payload = job.data
        if (payload.kind !== 'materialize-files') {
          throw new Error('Invalid Lark history materialize payload')
        }
        const result = await this.historyService.materializeFiles(payload)
        const retryableFailures = result.failed.filter((failure) => failure.retryable)
        if (retryableFailures.length) {
          throw new Error(
            `Lark attachment materialization failed for ${retryableFailures.length} file(s): ${retryableFailures
              .map((failure) => failure.resourceKey)
              .join(', ')}`
          )
        }
        if (result.nextLeaseAt) {
          await this.queueService.enqueueMaterialize(
            {
              ...payload,
              continuation: (payload.continuation ?? 0) + 1
            },
            Math.max(1000, result.nextLeaseAt.getTime() - Date.now())
          )
        }
        return
      }
      case LARK_HISTORY_CLEANUP_JOB: {
        const payload = job.data
        if (payload.kind !== 'cleanup-expired') {
          throw new Error('Invalid Lark history cleanup payload')
        }
        const current = await this.resolveCurrentCleanupConfig(payload.integrationId)
        if (!current || current.retentionDays === 0) {
          return
        }
        const cleanupPayload = {
          ...payload,
          tenantId: current.tenantId ?? payload.tenantId,
          organizationId: current.organizationId ?? payload.organizationId,
          retentionDays: current.retentionDays
        }
        const result = await this.historyService.cleanupExpired(cleanupPayload)
        const shouldContinue = result.hasMore && Boolean(result.nextCursor)
        await this.queueService.scheduleCleanup(
          {
            ...cleanupPayload,
            continuation: shouldContinue ? (payload.continuation ?? 0) + 1 : 0,
            ...(shouldContinue && result.nextCursor
              ? {
                  afterCreatedAt: result.nextCursor.createdAt.toISOString(),
                  afterId: result.nextCursor.id
                }
              : { afterCreatedAt: undefined, afterId: undefined })
          },
          shouldContinue ? 1000 : undefined
        )
        return
      }
      default:
        this.logger.warn(`Unknown Lark history job "${job.name}" (${job.id})`)
    }
  }

  private async resolveCurrentCleanupConfig(integrationId: string): Promise<{
    retentionDays: number
    tenantId?: string
    organizationId?: string
  } | null> {
    const binding = await this.triggerBindingRepository.findOne({ where: { integrationId } })
    if (!binding?.config?.enabled || binding.config.historyRetentionDays === undefined) {
      return null
    }
    const numeric = Number(binding.config.historyRetentionDays)
    const retentionDays = Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 30
    return {
      retentionDays,
      tenantId: binding.tenantId,
      organizationId: binding.organizationId
    }
  }
}

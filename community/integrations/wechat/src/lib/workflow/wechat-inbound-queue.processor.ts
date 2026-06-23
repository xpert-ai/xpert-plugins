import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import {
  WECHAT_INBOUND_AGGREGATE_JOB,
  WECHAT_INBOUND_FLUSH_JOB,
  WECHAT_INBOUND_QUEUE_NAME
} from '../constants.js'
import {
  WechatTriggerAggregatePayload,
  WechatTriggerFlushPayload
} from './wechat-trigger-aggregation.types.js'
import { WechatTriggerStrategy } from './wechat-trigger.strategy.js'

export type WechatInboundQueueJobData =
  | WechatTriggerAggregatePayload
  | WechatTriggerFlushPayload

@Processor(WECHAT_INBOUND_QUEUE_NAME, {
  concurrency: 8,
  autorun: process.env.WECHAT_INBOUND_QUEUE_AUTORUN !== 'false'
})
export class WechatInboundQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(WechatInboundQueueProcessor.name)

  constructor(private readonly triggerStrategy: WechatTriggerStrategy) {
    super()
  }

  async process(job: Job<WechatInboundQueueJobData>): Promise<void> {
    switch (job.name) {
      case WECHAT_INBOUND_AGGREGATE_JOB:
        await this.triggerStrategy.processInboundAggregateJob(job.data as WechatTriggerAggregatePayload)
        return
      case WECHAT_INBOUND_FLUSH_JOB:
        await this.triggerStrategy.flushBufferedConversation(job.data as WechatTriggerFlushPayload)
        return
      default:
        this.logger.warn(`[wechat-inbound] unknown job=${job.name} id=${job.id}`)
    }
  }
}

import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import {
  WECHAT_PERSONAL_INBOUND_AGGREGATE_JOB,
  WECHAT_PERSONAL_INBOUND_FLUSH_JOB,
  WECHAT_PERSONAL_INBOUND_QUEUE_NAME
} from '../constants.js'
import {
  WechatPersonalTriggerAggregatePayload,
  WechatPersonalTriggerFlushPayload
} from './wechat-personal-trigger-aggregation.types.js'
import { WechatPersonalTriggerStrategy } from './wechat-personal-trigger.strategy.js'

export type WechatPersonalInboundQueueJobData =
  | WechatPersonalTriggerAggregatePayload
  | WechatPersonalTriggerFlushPayload

@Processor(WECHAT_PERSONAL_INBOUND_QUEUE_NAME, {
  concurrency: 8,
  autorun: process.env.WECHAT_PERSONAL_INBOUND_QUEUE_AUTORUN !== 'false'
})
export class WechatPersonalInboundQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(WechatPersonalInboundQueueProcessor.name)

  constructor(private readonly triggerStrategy: WechatPersonalTriggerStrategy) {
    super()
  }

  async process(job: Job<WechatPersonalInboundQueueJobData>): Promise<void> {
    switch (job.name) {
      case WECHAT_PERSONAL_INBOUND_AGGREGATE_JOB:
        await this.triggerStrategy.processInboundAggregateJob(job.data as WechatPersonalTriggerAggregatePayload)
        return
      case WECHAT_PERSONAL_INBOUND_FLUSH_JOB:
        await this.triggerStrategy.flushBufferedConversation(job.data as WechatPersonalTriggerFlushPayload)
        return
      default:
        this.logger.warn(`[wechat-personal-inbound] unknown job=${job.name} id=${job.id}`)
    }
  }
}

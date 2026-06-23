import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { WECHAT_OUTBOUND_QUEUE_NAME } from './constants.js'
import {
  WechatOutboundQueueJobData,
  WechatOutboundQueueService
} from './wechat-outbound-queue.service.js'

@Processor(WECHAT_OUTBOUND_QUEUE_NAME, {
  concurrency: 1,
  autorun: process.env.WECHAT_OUTBOUND_QUEUE_AUTORUN !== 'false'
})
export class WechatOutboundQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(WechatOutboundQueueProcessor.name)

  constructor(private readonly queueService: WechatOutboundQueueService) {
    super()
  }

  async process(job: Job<WechatOutboundQueueJobData>): Promise<void> {
    try {
      await this.queueService.processSendTextJob(job)
    } catch (error) {
      await this.queueService.handleJobFailure(job, error)
      this.logger.warn(
        `[wechat-outbound] job=${job.id} failed attempt=${job.attemptsMade + 1}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      throw error
    }
  }
}

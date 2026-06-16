import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { WECHAT_PERSONAL_OUTBOUND_QUEUE_NAME } from './constants.js'
import {
  WechatPersonalOutboundQueueJobData,
  WechatPersonalOutboundQueueService
} from './wechat-personal-outbound-queue.service.js'

@Processor(WECHAT_PERSONAL_OUTBOUND_QUEUE_NAME, {
  concurrency: 1,
  autorun: process.env.WECHAT_PERSONAL_OUTBOUND_QUEUE_AUTORUN !== 'false'
})
export class WechatPersonalOutboundQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(WechatPersonalOutboundQueueProcessor.name)

  constructor(private readonly queueService: WechatPersonalOutboundQueueService) {
    super()
  }

  async process(job: Job<WechatPersonalOutboundQueueJobData>): Promise<void> {
    try {
      await this.queueService.processSendTextJob(job)
    } catch (error) {
      await this.queueService.handleJobFailure(job, error)
      this.logger.warn(
        `[wechat-personal-outbound] job=${job.id} failed attempt=${job.attemptsMade + 1}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      throw error
    }
  }
}

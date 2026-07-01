import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  PluginJobProcessor,
  type ManagedQueueJob,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import {
  WECHAT_OUTBOUND_QUEUE_NAME,
  WECHAT_OUTBOUND_SEND_TEXT_JOB,
  WECHAT_PLUGIN_NAME
} from './constants.js'
import { WECHAT_PLUGIN_CONTEXT } from './tokens.js'
import {
  WechatOutboundQueueJobData,
  WechatOutboundQueueService
} from './wechat-outbound-queue.service.js'

/** Platform managed queue handler. */
@PluginJobProcessor({
  pluginName: WECHAT_PLUGIN_NAME,
  queueName: WECHAT_OUTBOUND_QUEUE_NAME,
  jobName: WECHAT_OUTBOUND_SEND_TEXT_JOB,
  concurrency: 1
})
@Injectable()
export class WechatOutboundQueueProcessor {
  private readonly logger = new Logger(WechatOutboundQueueProcessor.name)

  constructor(
    private readonly queueService: WechatOutboundQueueService,
    @Inject(WECHAT_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  async handle(job: ManagedQueueJob<WechatOutboundQueueJobData>): Promise<void> {
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

  /** Backward-compatible alias for callers that still invoke process directly. */
  async process(job: ManagedQueueJob<WechatOutboundQueueJobData>): Promise<void> {
    return this.handle(job)
  }

  get scopeKey(): string | null {
    return (this.pluginContext as { scopeKey?: string | null }).scopeKey ?? null
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  PluginJobProcessor,
  type ManagedQueueJob,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import {
  WECHAT_INBOUND_AGGREGATE_JOB,
  WECHAT_INBOUND_FLUSH_JOB,
  WECHAT_INBOUND_QUEUE_NAME,
  WECHAT_PLUGIN_NAME
} from '../constants.js'
import { WECHAT_PLUGIN_CONTEXT } from '../tokens.js'
import {
  WechatTriggerAggregatePayload,
  WechatTriggerFlushPayload
} from './wechat-trigger-aggregation.types.js'
import { WechatTriggerStrategy } from './wechat-trigger.strategy.js'

export type WechatInboundQueueJobData =
  | WechatTriggerAggregatePayload
  | WechatTriggerFlushPayload

/** Platform managed queue handler; no longer a BullMQ WorkerHost processor. */
@PluginJobProcessor({
  pluginName: WECHAT_PLUGIN_NAME,
  queueName: WECHAT_INBOUND_QUEUE_NAME,
  jobName: WECHAT_INBOUND_AGGREGATE_JOB
})
@PluginJobProcessor({
  pluginName: WECHAT_PLUGIN_NAME,
  queueName: WECHAT_INBOUND_QUEUE_NAME,
  jobName: WECHAT_INBOUND_FLUSH_JOB
})
@Injectable()
export class WechatInboundQueueProcessor {
  private readonly logger = new Logger(WechatInboundQueueProcessor.name)

  constructor(
    private readonly triggerStrategy: WechatTriggerStrategy,
    @Inject(WECHAT_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  async handle(job: ManagedQueueJob<WechatInboundQueueJobData>): Promise<void> {
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

  /** Backward-compatible alias for callers that still invoke process directly. */
  async process(job: ManagedQueueJob<WechatInboundQueueJobData>): Promise<void> {
    return this.handle(job)
  }

  get scopeKey(): string | null {
    return (this.pluginContext as { scopeKey?: string | null }).scopeKey ?? null
  }
}

import { Injectable } from '@nestjs/common'
import {
  HandoffMessage,
  HandoffProcessorStrategy,
  IHandoffProcessor,
  ProcessContext,
  ProcessResult
} from '@xpert-ai/plugin-sdk'
import {
  WECHAT_PERSONAL_TRIGGER_FLUSH_MESSAGE_TYPE,
  WechatPersonalTriggerFlushPayload
} from './wechat-personal-trigger-aggregation.types.js'
import { WechatPersonalTriggerStrategy } from './wechat-personal-trigger.strategy.js'

@Injectable()
@HandoffProcessorStrategy(WECHAT_PERSONAL_TRIGGER_FLUSH_MESSAGE_TYPE, {
  types: [WECHAT_PERSONAL_TRIGGER_FLUSH_MESSAGE_TYPE],
  policy: {
    lane: 'main'
  }
})
export class WechatPersonalTriggerFlushProcessor implements IHandoffProcessor<WechatPersonalTriggerFlushPayload> {
  constructor(private readonly triggerStrategy: WechatPersonalTriggerStrategy) {}

  async process(
    message: HandoffMessage<WechatPersonalTriggerFlushPayload>,
    _ctx: ProcessContext
  ): Promise<ProcessResult> {
    if (!message.payload?.aggregateKey || !message.payload?.version) {
      return {
        status: 'dead',
        reason: 'Missing aggregateKey or version in WeChat personal trigger flush payload'
      }
    }

    await this.triggerStrategy.flushBufferedConversation(message.payload)
    return { status: 'ok' }
  }
}

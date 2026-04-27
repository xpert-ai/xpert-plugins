import { Injectable } from '@nestjs/common'
import {
  HandoffMessage,
  HandoffProcessorStrategy,
  IHandoffProcessor,
  ProcessContext,
  ProcessResult
} from '@xpert-ai/plugin-sdk'
import { WeComTriggerFlushPayload, WECOM_TRIGGER_FLUSH_MESSAGE_TYPE } from './wecom-trigger-aggregation.types.js'
import { WeComTriggerStrategy } from './wecom-trigger.strategy.js'

@Injectable()
@HandoffProcessorStrategy(WECOM_TRIGGER_FLUSH_MESSAGE_TYPE, {
  types: [WECOM_TRIGGER_FLUSH_MESSAGE_TYPE],
  policy: {
    lane: 'main'
  }
})
export class WeComTriggerFlushProcessor implements IHandoffProcessor<WeComTriggerFlushPayload> {
  constructor(private readonly triggerStrategy: WeComTriggerStrategy) {}

  async process(
    message: HandoffMessage<WeComTriggerFlushPayload>,
    _ctx: ProcessContext
  ): Promise<ProcessResult> {
    if (!message.payload?.aggregateKey || !message.payload?.version) {
      return {
        status: 'dead',
        reason: 'Missing aggregateKey or version in WeCom trigger flush payload'
      }
    }

    await this.triggerStrategy.flushBufferedConversation(message.payload)
    return {
      status: 'ok'
    }
  }
}

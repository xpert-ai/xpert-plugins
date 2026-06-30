import { Injectable } from '@nestjs/common'
import {
	HandoffMessage,
	HandoffProcessorStrategy,
	IHandoffProcessor,
	ProcessContext,
	ProcessResult
} from '@xpert-ai/plugin-sdk'
import {
	DINGTALK_TRIGGER_FLUSH_MESSAGE_TYPE,
	DingTalkTriggerFlushPayload
} from './dingtalk-trigger-aggregation.types.js'
import { DingTalkTriggerStrategy } from './dingtalk-trigger.strategy.js'

@Injectable()
@HandoffProcessorStrategy(DINGTALK_TRIGGER_FLUSH_MESSAGE_TYPE, {
	types: [DINGTALK_TRIGGER_FLUSH_MESSAGE_TYPE],
	policy: {
		lane: 'main'
	}
})
export class DingTalkTriggerFlushProcessor implements IHandoffProcessor<DingTalkTriggerFlushPayload> {
	constructor(private readonly triggerStrategy: DingTalkTriggerStrategy) {}

	async process(
		message: HandoffMessage<DingTalkTriggerFlushPayload>,
		_ctx: ProcessContext
	): Promise<ProcessResult> {
		if (!message.payload?.aggregateKey || !message.payload?.version) {
			return {
				status: 'dead',
				reason: 'Missing aggregateKey or version in DingTalk trigger flush payload'
			}
		}

		await this.triggerStrategy.flushBufferedConversation(message.payload)
		return {
			status: 'ok'
		}
	}
}

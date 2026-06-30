import { Injectable } from '@nestjs/common'
import {
	HandoffMessage,
	HandoffProcessorStrategy,
	IHandoffProcessor,
	ProcessContext,
	ProcessResult
} from '@xpert-ai/plugin-sdk'
import {
	LARK_TRIGGER_FLUSH_MESSAGE_TYPE,
	LarkTriggerFlushPayload
} from './lark-trigger-aggregation.types.js'
import { LarkTriggerStrategy } from './lark-trigger.strategy.js'

@Injectable()
@HandoffProcessorStrategy(LARK_TRIGGER_FLUSH_MESSAGE_TYPE, {
	types: [LARK_TRIGGER_FLUSH_MESSAGE_TYPE],
	policy: {
		lane: 'main'
	}
})
export class LarkTriggerFlushProcessor implements IHandoffProcessor<LarkTriggerFlushPayload> {
	constructor(private readonly triggerStrategy: LarkTriggerStrategy) {}

	async process(
		message: HandoffMessage<LarkTriggerFlushPayload>,
		_ctx: ProcessContext
	): Promise<ProcessResult> {
		if (!message.payload?.aggregateKey || !message.payload?.version) {
			return {
				status: 'dead',
				reason: 'Missing aggregateKey or version in Lark trigger flush payload'
			}
		}

		await this.triggerStrategy.flushBufferedConversation(message.payload)
		return {
			status: 'ok'
		}
	}
}

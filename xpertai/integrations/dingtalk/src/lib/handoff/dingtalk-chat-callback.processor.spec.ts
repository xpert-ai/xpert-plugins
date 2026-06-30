jest.mock('@xpert-ai/plugin-sdk', () => {
	const { createLarkPluginSdkMock } = require('../../../../../test-utils/larkPluginSdkMock.cjs')
	return createLarkPluginSdkMock(jest, {
		AGENT_CHAT_DISPATCH_MESSAGE_TYPE: 'agent.chat.dispatch',
		HandoffProcessorStrategy: () => (target: unknown) => target
	})
})

jest.mock('@xpert-ai/chatkit-types', () => ({
	ChatMessageEventTypeEnum: {
		ON_AGENT_END: 'on_agent_end',
		ON_AGENT_START: 'on_agent_start',
		ON_CHAT_EVENT: 'on_chat_event',
		ON_CONVERSATION_END: 'on_conversation_end',
		ON_CONVERSATION_START: 'on_conversation_start',
		ON_MESSAGE_END: 'on_message_end',
		ON_MESSAGE_START: 'on_message_start',
		ON_TOOL_END: 'on_tool_end',
		ON_TOOL_ERROR: 'on_tool_error',
		ON_TOOL_MESSAGE: 'on_tool_message',
		ON_TOOL_START: 'on_tool_start'
	},
	ChatMessageTypeEnum: {
		EVENT: 'event',
		MESSAGE: 'message'
	}
}))

jest.mock('@xpert-ai/contracts', () => ({
	messageContentText: jest.fn((value: any) => {
		if (typeof value === 'string') {
			return value
		}
		return value?.text ?? value?.delta ?? value?.content ?? ''
	}),
	XpertAgentExecutionStatusEnum: {
		ERROR: 'error',
		INTERRUPTED: 'interrupted',
		SUCCESS: 'success'
	}
}))

import { DingTalkChatStreamCallbackProcessor } from './dingtalk-chat-callback.processor.js'

describe('DingTalkChatStreamCallbackProcessor', () => {
	function createProcessor() {
		return new DingTalkChatStreamCallbackProcessor(
			{} as any,
			{} as any,
			{} as any
		) as any
	}

	it('preserves markdown structural whitespace in stream text deltas', () => {
		const processor = createProcessor()

		const delta = processor.extractMessageTextDelta({
			type: 'text_delta',
			delta: '\n\n## 标题\n\n- 第一项\n- 第二项\n'
		})

		expect(delta).toBe('\n\n## 标题\n\n- 第一项\n- 第二项\n')
		expect(processor.extractMessageTextDelta({ type: 'text_delta', delta: '\n\n' })).toBe('\n\n')
	})
})

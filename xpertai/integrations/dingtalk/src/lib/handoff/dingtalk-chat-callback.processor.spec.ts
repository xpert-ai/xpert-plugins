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
import type { DingTalkChatRunState } from './dingtalk-chat-run-state.service.js'

describe('DingTalkChatStreamCallbackProcessor', () => {
	function createProcessor(dingtalkChannel: Record<string, unknown> = {}) {
		const processor = new DingTalkChatStreamCallbackProcessor(
			dingtalkChannel as any,
			{} as any
		) as any
		processor.conversationService = {
			setActiveMessage: jest.fn().mockResolvedValue(undefined)
		}
		return processor
	}

	function createState(): DingTalkChatRunState {
		return {
			sourceMessageId: 'source-message-id',
			nextSequence: 1,
			responseMessageContent: '',
			pendingSegmentText: '',
			deliveredSegmentCount: 0,
			context: {
				tenantId: 'tenant-1',
				organizationId: 'organization-1',
				userId: 'user-1',
				xpertId: 'xpert-1',
				integrationId: 'integration-1',
				chatId: 'chat-1',
				chatType: 'group',
				robotCode: 'robot-code',
				sessionWebhook: 'https://example.com/session-webhook',
				message: {
					status: 'thinking',
					elements: []
				}
			},
			pendingEvents: {},
			renderItems: []
		}
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

	it('keeps streamed text together until a tool call starts', async () => {
		const createMessage = jest.fn().mockResolvedValue({
			data: { message_id: 'segment-message-id' }
		})
		const processor = createProcessor({ createMessage })
		const state = createState()

		await processor.applyStreamEvent(state, {
			data: {
				type: 'message',
				data: {
					type: 'text_delta',
					delta: '第一句已经完成。第二句也完成！第三句仍在生成'
				}
			}
		})

		expect(createMessage).not.toHaveBeenCalled()
		expect(state.pendingSegmentText).toBe('第一句已经完成。第二句也完成！第三句仍在生成')
		expect(state.deliveredSegmentCount).toBe(0)
	})

	it('flushes the current text segment when a tool call starts', async () => {
		const createMessage = jest.fn().mockResolvedValue({
			data: { message_id: 'segment-message-id' }
		})
		const processor = createProcessor({ createMessage })
		const state = createState()
		state.pendingSegmentText = '工具调用前的完整分析。\n\n包括表格和多行内容。'

		await processor.applyStreamEvent(state, {
			data: {
				type: 'event',
				event: 'on_tool_start',
				data: {
					id: 'tool-call-1',
					tool: 'search',
					status: 'running'
				}
			}
		})

		expect(createMessage).toHaveBeenCalledWith(
			'integration-1',
			expect.objectContaining({
				content: expect.objectContaining({
					markdown: '工具调用前的完整分析。\n\n包括表格和多行内容。'
				})
			})
		)
		expect(state.pendingSegmentText).toBe('')
		expect(state.deliveredSegmentCount).toBe(1)
	})

	it('flushes the current text segment for the real component payload emitted by tool start', async () => {
		const createMessage = jest.fn().mockResolvedValue({
			data: { message_id: 'segment-message-id' }
		})
		const processor = createProcessor({ createMessage })
		const state = createState()
		state.pendingSegmentText = '开始调用工具前的执行计划。'

		await processor.applyStreamEvent(state, {
			data: {
				type: 'message',
				data: {
					id: 'tool-call-1',
					type: 'component',
					data: {
						category: 'Tool',
						tool: 'sandbox_shell',
						status: 'running'
					}
				}
			}
		})

		expect(createMessage).toHaveBeenCalledWith(
			'integration-1',
			expect.objectContaining({
				content: expect.objectContaining({
					markdown: '开始调用工具前的执行计划。'
				})
			})
		)
		expect(state.pendingSegmentText).toBe('')
		expect(state.deliveredSegmentCount).toBe(1)
	})

	it('splits text at each real tool start and keeps the final card with the last segment', async () => {
		const createMessage = jest.fn().mockResolvedValue({
			data: { message_id: 'segment-message-id' }
		})
		const interactiveMessage = jest.fn().mockResolvedValue({
			data: { message_id: 'final-message-id' }
		})
		const processor = createProcessor({ createMessage, interactiveMessage })
		const state = createState()
		const emitText = (delta: string) =>
			processor.applyStreamEvent(state, {
				data: {
					type: 'message',
					data: {
						type: 'text_delta',
						delta
					}
				}
			})
		const emitToolStart = (id: string) =>
			processor.applyStreamEvent(state, {
				data: {
					type: 'message',
					data: {
						id,
						type: 'component',
						data: {
							category: 'Tool',
							tool: 'sandbox_shell',
							status: 'running'
						}
					}
				}
			})

		await emitText('执行计划')
		await emitToolStart('tool-call-1')
		await emitText('第一次工具结果说明')
		await emitToolStart('tool-call-2')
		await emitText('最终总结')
		await processor.completeRun(state)

		expect(createMessage.mock.calls.map(([, message]) => message.content.markdown)).toEqual([
			'执行计划',
			'第一次工具结果说明'
		])
		const finalCard = interactiveMessage.mock.calls[0][1]
		const finalMarkdown = finalCard.elements
			.filter((element: { tag?: string }) => element.tag === 'markdown')
			.map((element: { content?: string }) => element.content)
			.join('\n')
		expect(finalMarkdown).toContain('最终总结')
		expect(finalMarkdown).not.toContain('执行计划')
		expect(finalMarkdown).not.toContain('第一次工具结果说明')
	})

	it('does not duplicate delivered text in the final card', async () => {
		const interactiveMessage = jest.fn().mockResolvedValue({
			data: { message_id: 'final-message-id' }
		})
		const processor = createProcessor({ interactiveMessage })
		const state = createState()
		state.deliveredSegmentCount = 1
		state.pendingSegmentText = '最终结论'
		state.renderItems = [
			{
				kind: 'stream_text',
				text: '已经单独发送的中间段落'
			}
		]

		await processor.completeRun(state)

		const card = interactiveMessage.mock.calls[0][1]
		const markdown = card.elements
			.filter((element: { tag?: string }) => element.tag === 'markdown')
			.map((element: { content?: string }) => element.content)
			.join('\n')
		expect(markdown).toContain('最终结论')
		expect(markdown).not.toContain('已经单独发送的中间段落')
	})

})

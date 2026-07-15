jest.mock('@xpert-ai/plugin-sdk', () => {
	const { createLarkPluginSdkMock } = require('../../../../../test-utils/larkPluginSdkMock.cjs')
	return createLarkPluginSdkMock(jest, {
		HandoffProcessorStrategy: () => (target: unknown) => target
	})
})

jest.mock('@xpert-ai/chatkit-types', () => ({
	ChatMessageEventTypeEnum: {
		ON_CONVERSATION_START: 'on_conversation_start',
		ON_CONVERSATION_END: 'on_conversation_end',
		ON_MESSAGE_START: 'on_message_start',
		ON_MESSAGE_END: 'on_message_end',
		ON_TOOL_START: 'on_tool_start',
		ON_TOOL_END: 'on_tool_end',
		ON_TOOL_ERROR: 'on_tool_error',
		ON_TOOL_MESSAGE: 'on_tool_message',
		ON_AGENT_START: 'on_agent_start',
		ON_AGENT_END: 'on_agent_end',
		ON_CHAT_EVENT: 'on_chat_event'
	},
	ChatMessageTypeEnum: {
		MESSAGE: 'message',
		EVENT: 'event'
	}
}))

import {
	XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/chatkit-types'
import { LarkChatStreamCallbackProcessor } from './lark-chat-callback.processor.js'
import { LarkChatRunState, LarkChatRunStateService } from './lark-chat-run-state.service.js'

class MemoryCache {
	private readonly store = new Map<string, unknown>()

	async set(key: string, value: unknown) {
		this.store.set(key, value)
	}

	async get<T = unknown>(key: string): Promise<T | undefined> {
		return this.store.get(key) as T | undefined
	}

	async del(key: string) {
		this.store.delete(key)
	}
}

describe('LarkChatStreamCallbackProcessor', () => {
	afterEach(() => {
		delete process.env['INTEGRATION_LARK_STREAM_UPDATE_WINDOW_MS']
		jest.useRealTimers()
		jest.restoreAllMocks()
	})

	function createFixture(
		config: {
			streaming?: {
				updateWindowMs?: number
			}
		} = {}
	) {
		const cache = new MemoryCache()
		const runStateService = new LarkChatRunStateService(cache as any)
		const pluginContext = {
			resolve: jest.fn(),
			config
		}
		const larkChannel = {
			patchInteractiveMessage: jest.fn().mockResolvedValue(undefined),
			interactiveMessage: jest.fn().mockResolvedValue({ data: { message_id: 'new-lark-id' } }),
			translate: jest.fn().mockImplementation((key: string) => key)
		}
		const conversationService = {
			setConversation: jest.fn().mockResolvedValue(undefined),
			setActiveMessage: jest.fn().mockResolvedValue(undefined)
		}

		const processor = new LarkChatStreamCallbackProcessor(
			larkChannel as any,
			runStateService,
			pluginContext as any
		)
		;(processor as any).conversationService = conversationService as any

		return {
			runStateService,
			larkChannel,
			conversationService,
			processor
		}
	}

	function createRunState(overrides: Partial<LarkChatRunState> = {}): LarkChatRunState {
		const baseContext = {
			tenantId: 'tenant-id',
			organizationId: 'organization-id',
			userId: 'user-id',
			xpertId: 'xpert-id',
			integrationId: 'integration-id',
			chatId: 'chat-id',
			chatType: 'group',
			senderOpenId: 'open-id',
			principalKey: 'lark:v2:principal:integration-id:open_id:open-id',
			scopeKey: 'lark:v2:scope:integration-id:group:chat-id',
			legacyConversationUserKey: 'open_id:open-id',
			requestContext: {
				user: {
					id: 'user-id',
					tenantId: 'tenant-id'
				},
				headers: {
					['tenant-id']: 'tenant-id'
				}
			},
			message: {
				id: 'lark-message-id',
				messageId: 'chat-message-id',
				status: 'thinking',
				language: 'en_US',
				header: null,
				elements: [],
				text: 'hello'
			}
		}
		const {
			context,
			pendingEvents,
			lastFlushAt,
			lastFlushedLength,
			...rest
		} = overrides

		return {
			sourceMessageId: 'run-1',
			nextSequence: 1,
			responseMessageContent: '',
			context: {
				...baseContext,
				...(context ?? {})
			},
			pendingEvents: pendingEvents ?? {},
			lastFlushAt: lastFlushAt ?? 0,
			lastFlushedLength: lastFlushedLength ?? 0,
			renderItems: (baseContext.message?.elements ?? []).map((element) => ({
				kind: 'structured' as const,
				element: { ...element }
			})),
			...rest
		}
	}

	function createProcessContext() {
		return {
			runId: 'run-id',
			traceId: 'trace-id',
			abortSignal: new AbortController().signal
		}
	}

	function createStreamMessage(sequence: number, data: unknown, sourceMessageId: string = 'run-1') {
		return {
			id: `callback-${sequence}`,
			type: 'channel.lark.chat_stream_event.v1',
			version: 1,
			tenantId: 'tenant-id',
			sessionKey: 'session-id',
			businessKey: 'business-id',
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: 1,
			traceId: 'trace-id',
			payload: {
				kind: 'stream',
				sourceMessageId,
				sequence,
				event: {
					data: {
						type: ChatMessageTypeEnum.MESSAGE,
						data
					}
				}
			}
		}
	}

	function createComponentMessage(
		sequence: number,
		id: string,
		data: Record<string, unknown>,
		sourceMessageId: string = 'run-1'
	) {
		return createStreamMessage(
			sequence,
			{
				id,
				type: 'component',
				data
			},
			sourceMessageId
		)
	}

	function createCompleteMessage(sequence: number, sourceMessageId: string = 'run-1') {
		return {
			id: `callback-${sequence}`,
			type: 'channel.lark.chat_stream_event.v1',
			version: 1,
			tenantId: 'tenant-id',
			sessionKey: 'session-id',
			businessKey: 'business-id',
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: 1,
			traceId: 'trace-id',
			payload: {
				kind: 'complete',
				sourceMessageId,
				sequence
			}
		}
	}

	function createEventMessage(
		sequence: number,
		event: ChatMessageEventTypeEnum,
		data: unknown,
		sourceMessageId: string = 'run-1'
	) {
		return {
			id: `callback-${sequence}`,
			type: 'channel.lark.chat_stream_event.v1',
			version: 1,
			tenantId: 'tenant-id',
			sessionKey: 'session-id',
			businessKey: 'business-id',
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: 1,
			traceId: 'trace-id',
			payload: {
				kind: 'stream',
				sourceMessageId,
				sequence,
				event: {
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event,
						data
					}
				}
			}
		}
	}

	function createErrorMessage(sequence: number, error: string, sourceMessageId: string = 'run-1') {
		return {
			id: `callback-${sequence}`,
			type: 'channel.lark.chat_stream_event.v1',
			version: 1,
			tenantId: 'tenant-id',
			sessionKey: 'session-id',
			businessKey: 'business-id',
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: 1,
			traceId: 'trace-id',
			payload: {
				kind: 'error',
				sourceMessageId,
				sequence,
				error
			}
		}
	}

	function getManagedProgressElements(elements: any[]) {
		return (elements ?? []).filter(
			(element) =>
				element?.tag === 'markdown' &&
				typeof element?.content === 'string' &&
				element.content.includes('**执行过程：')
		)
	}

	function getManagedStreamTextElements(elements: any[]) {
		return (elements ?? []).filter(
			(element) =>
				element?.tag === 'markdown' &&
				typeof element?.content === 'string' &&
				!element.content.includes('**Event:**') &&
				!element.content.includes('**执行过程：') &&
				!element.content.includes("color='wathet'")
		)
	}

	it('flushes MESSAGE content when update window is reached', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		jest.useFakeTimers()
		jest.setSystemTime(1300)

			await runStateService.save(
				createRunState({
					lastFlushAt: 1000,
					context: {
						streaming: {
							updateWindowMs: 200
						}
					} as any
				})
			)

		await processor.process(createStreamMessage(1, 'hello') as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		const streamTextElements = getManagedStreamTextElements(patchPayload.elements)
		expect(streamTextElements).toHaveLength(1)
		expect(streamTextElements[0].content).toContain('hello')
		const thinkingIndex = patchPayload.elements.findIndex(
			(element: { tag?: string; content?: string }) =>
				element.tag === 'markdown' &&
				typeof element.content === 'string' &&
				element.content.includes("color='wathet'")
		)
		expect(thinkingIndex).toBeGreaterThan(-1)
		const actionIndex = patchPayload.elements.findIndex(
			(element: { tag?: string }) => element.tag === 'action'
		)
		expect(actionIndex).toBeGreaterThan(thinkingIndex)
		const state = await runStateService.get('run-1')
		expect(state?.lastFlushAt).toBe(1300)
		expect(state?.lastFlushedLength).toBe(5)
	})

	it('does not flush MESSAGE content before update window is reached', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		jest.useFakeTimers()
		jest.setSystemTime(1500)

			await runStateService.save(
				createRunState({
					lastFlushAt: 1000,
					context: {
						streaming: {
							updateWindowMs: 2000
						}
					} as any
				})
			)

		await processor.process(createStreamMessage(1, 'hello') as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(0)
		const state = await runStateService.get('run-1')
		expect(state?.responseMessageContent).toBe('hello')
		expect(state?.lastFlushAt).toBe(1000)
		expect(state?.lastFlushedLength).toBe(0)
	})

	it('suppresses intermediate patches when streaming is disabled and flushes once on complete', async () => {
		const { processor, runStateService, larkChannel } = createFixture()

		await runStateService.save(
			createRunState({
				context: {
					streaming: {
						enabled: false
					}
				} as any
			})
		)

		await processor.process(createStreamMessage(1, 'hello') as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).not.toHaveBeenCalled()

		await processor.process(createCompleteMessage(2) as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		const streamTextElements = getManagedStreamTextElements(patchPayload.elements)
		expect(streamTextElements).toHaveLength(1)
		expect(streamTextElements[0].content).toContain('hello')
	})

	it('handles out-of-order callbacks and flushes only when window condition is met', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		jest.useFakeTimers()
		jest.setSystemTime(3000)

			await runStateService.save(
				createRunState({
					context: {
						streaming: {
							updateWindowMs: 2000
						}
					} as any
				})
			)

		await processor.process(createStreamMessage(2, 'world') as any, createProcessContext() as any)
		await processor.process(createStreamMessage(1, 'hello ') as any, createProcessContext() as any)

		let state = await runStateService.get('run-1')
		expect(state?.nextSequence).toBe(3)
		expect(state?.responseMessageContent).toBe('hello world')
		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)

		jest.setSystemTime(5500)
		await processor.process(createStreamMessage(3, '!') as any, createProcessContext() as any)

		state = await runStateService.get('run-1')
		expect(state?.nextSequence).toBe(4)
		expect(state?.responseMessageContent).toBe('hello world!')
		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(2)
	})

	it('keeps compatibility with structured update payload in MESSAGE callbacks', async () => {
		const { processor, runStateService, larkChannel } = createFixture()

		await runStateService.save(createRunState())

		await processor.process(
			createStreamMessage(1, {
				type: 'update',
				data: {
					elements: [{ tag: 'markdown', content: 'partial' }]
				}
			}) as any,
			createProcessContext() as any
		)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		expect(patchPayload.elements[0]).toEqual({
			tag: 'markdown',
			content: 'partial'
		})
	})

	it('renders ON_CHAT_EVENT and updates by event id instead of appending', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(
			createEventMessage(1, ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: 'event-1',
				title: 'Preparing',
				message: 'Loading resources',
				status: 'running'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createEventMessage(2, ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: 'event-1',
				title: 'Ready',
				message: 'Resources ready',
				status: 'success'
			}) as any,
			createProcessContext() as any
		)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(2)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[1][2]
		const progressElements = getManagedProgressElements(patchPayload.elements)
		expect(progressElements).toHaveLength(1)
		expect(progressElements[0].content).toContain('**执行过程：Ready**')
		expect(progressElements[0].content).toContain('Resources ready')
		expect(progressElements[0].content).not.toContain('Preparing')
		const state = await runStateService.get('run-1')
		const progressItems = state?.renderItems.filter((item: any) => item.kind === 'progress')
		expect(progressItems).toHaveLength(1)
		expect(progressItems?.[0]).toMatchObject({
			id: 'event-1',
			title: 'Ready',
			detail: 'Resources ready',
			status: 'success'
		})
	})

	it('skips explicitly typed hidden chat events when rendering Lark messages', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(
			createEventMessage(1, ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: 'event-1',
				type: 'thread_context_usage',
				title: 'Thread context usage',
				status: 'running'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createEventMessage(2, ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: 'event-1',
				type: 'thread_context_usage',
				title: 'Thread context usage',
				status: 'success'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createEventMessage(3, ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: 'event-2',
				type: 'conversation_title_summary',
				title: 'Summarizing title',
				status: 'running'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createEventMessage(4, ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: 'event-2',
				type: 'conversation_title_summary',
				title: 'Title summarized',
				status: 'success'
			}) as any,
			createProcessContext() as any
		)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(0)
		const state = await runStateService.get('run-1')
		expect(state?.renderItems).toEqual([])
	})

	it('skips tool component details and still renders the final assistant response', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(
			createComponentMessage(1, 'tool-project-1', {
				category: 'Tool',
				tool: 'sites_create_project',
				title: 'sites_create_project',
				status: 'running'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createComponentMessage(2, 'tool-project-1', {
				status: 'success',
				output: '/workspace/sites/claw-xpert-intro/index.html'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createComponentMessage(3, 'tool-write-1', {
				category: 'Tool',
				tool: 'sandbox_write_file',
				title: 'sandbox_write_file',
				status: 'fail',
				error: 'Received tool input did not match expected schema',
				output: 'L1: private tool output'
			}) as any,
			createProcessContext() as any
		)

		expect(larkChannel.patchInteractiveMessage).not.toHaveBeenCalled()
		expect((await runStateService.get('run-1'))?.renderItems).toEqual([])

		await processor.process(
			createStreamMessage(4, '页面已经搭建完成') as any,
			createProcessContext() as any
		)
		await processor.process(createCompleteMessage(5) as any, createProcessContext() as any)

		const calls = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls
		expect(calls.length).toBeGreaterThan(0)
		const finalPayload = calls[calls.length - 1][2]
		const markdown = finalPayload.elements
			.filter((element: { tag?: string; content?: string }) => element.tag === 'markdown')
			.map((element: { content?: string }) => element.content ?? '')
			.join('\n')

		expect(markdown).toContain('页面已经搭建完成')
		expect(markdown).not.toContain('sites_create_project')
		expect(markdown).not.toContain('sandbox_write_file')
		expect(markdown).not.toContain('/workspace/sites/claw-xpert-intro/index.html')
		expect(markdown).not.toContain('Received tool input did not match expected schema')
		expect(markdown).not.toContain('L1: private tool output')
		expect(markdown).not.toContain('工具结果：')
		expect(markdown).not.toContain('工具失败：')
	})

	it('suppresses raw tool payload JSON from MESSAGE text', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(
			createStreamMessage(
				1,
				'{"tool":"lark_send_text_notification","integrationId":"integration-id","successCount":1,"failureCount":0,"results":[{"target":"open_id:ou_test","success":true,"messageId":"om_123"}]}'
			) as any,
			createProcessContext() as any
		)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(0)
		const state = await runStateService.get('run-1')
		expect(state?.responseMessageContent).toBe('')
	})

	it('skips legacy tool lifecycle events without appending render items', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(
			createEventMessage(1, ChatMessageEventTypeEnum.ON_TOOL_START, {
				id: 'tool-1',
				tool: 'answer_question',
				status: 'running'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createEventMessage(2, ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: 'tool-1',
				tool: 'answer_question',
				message: 'Querying cube'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createEventMessage(3, ChatMessageEventTypeEnum.ON_TOOL_END, {
				id: 'tool-1',
				tool: 'answer_question',
				status: 'success',
				message: 'Completed'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createEventMessage(4, ChatMessageEventTypeEnum.ON_TOOL_ERROR, {
				toolCall: {
					id: 'tool-err-1',
					name: 'answer_question'
				},
				error: 'Received tool input did not match expected schema'
			}) as any,
			createProcessContext() as any
		)

		expect(larkChannel.patchInteractiveMessage).not.toHaveBeenCalled()
		expect((await runStateService.get('run-1'))?.renderItems).toEqual([])
	})

	it('does not serialize legacy tool traces restored from run state', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(
			createRunState({
				renderItems: [
					{
						kind: 'tool_trace',
						id: 'legacy-tool-1',
						tool: 'sandbox_write_file',
						title: '/workspace/sites/claw-xpert-intro/index.html',
						detail: 'L1: private tool output',
						status: 'fail',
						error: 'Received tool input did not match expected schema'
					},
					{
						kind: 'event',
						id: 'legacy-tool-event-1',
						eventType: ChatMessageEventTypeEnum.ON_TOOL_ERROR,
						tool: 'sandbox_write_file',
						title: '/workspace/sites/legacy-tool-event/index.html',
						message: 'L2: private legacy tool event output',
						status: 'fail',
						error: 'Legacy tool event error'
					},
					{
						kind: 'stream_text',
						text: '页面已经搭建完成'
					}
				]
			})
		)

		await processor.process(createCompleteMessage(1) as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		const finalPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		const markdown = finalPayload.elements
			.filter((element: { tag?: string; content?: string }) => element.tag === 'markdown')
			.map((element: { content?: string }) => element.content ?? '')
			.join('\n')

		expect(markdown).toContain('页面已经搭建完成')
		expect(markdown).not.toContain('sandbox_write_file')
		expect(markdown).not.toContain('/workspace/sites/claw-xpert-intro/index.html')
		expect(markdown).not.toContain('L1: private tool output')
		expect(markdown).not.toContain('Received tool input did not match expected schema')
		expect(markdown).not.toContain('/workspace/sites/legacy-tool-event/index.html')
		expect(markdown).not.toContain('L2: private legacy tool event output')
		expect(markdown).not.toContain('Legacy tool event error')
	})

	it('updates active message cache when ON_MESSAGE_START is received', async () => {
		const { processor, runStateService, conversationService } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(
			createEventMessage(1, ChatMessageEventTypeEnum.ON_MESSAGE_START, {
				id: 'chat-message-2'
			}) as any,
			createProcessContext() as any
		)

		expect(conversationService.setActiveMessage).toHaveBeenCalledWith('lark:v2:scope:integration-id:group:chat-id', 'xpert-id', {
			id: 'chat-message-2',
			thirdPartyMessage: {
				id: 'lark-message-id',
				messageId: 'chat-message-2',
				status: 'thinking',
				language: 'en_US',
				header: null,
				elements: []
			}
		}, {
			legacyConversationUserKey: 'open_id:open-id'
		})
	})

	it('falls back to request context language when message language is missing', async () => {
		const { processor, runStateService, conversationService } = createFixture()
		await runStateService.save(
			createRunState({
				context: {
					requestContext: {
						user: {
							id: 'user-id',
							tenantId: 'tenant-id'
						},
						headers: {
							['tenant-id']: 'tenant-id',
							language: 'zh-Hans'
						}
					},
					message: {
						id: 'lark-message-id',
						messageId: 'chat-message-id',
						status: 'thinking',
						language: undefined,
						header: null,
						elements: [],
						text: 'hello'
					}
				} as any
			})
		)

		await processor.process(
			createEventMessage(1, ChatMessageEventTypeEnum.ON_MESSAGE_START, {
				id: 'chat-message-2'
			}) as any,
			createProcessContext() as any
		)

		expect(conversationService.setActiveMessage).toHaveBeenCalledWith('lark:v2:scope:integration-id:group:chat-id', 'xpert-id', {
			id: 'chat-message-2',
			thirdPartyMessage: {
				id: 'lark-message-id',
				messageId: 'chat-message-2',
				status: 'thinking',
				language: 'zh-Hans',
				header: null,
				elements: []
			}
		}, {
			legacyConversationUserKey: 'open_id:open-id'
		})
	})

	it('handles out-of-order stream callbacks and clears run state on complete', async () => {
		const { processor, runStateService } = createFixture()

		await runStateService.save(createRunState())

		await processor.process(createStreamMessage(2, 'world') as any, createProcessContext() as any)
		await processor.process(createStreamMessage(1, 'hello ') as any, createProcessContext() as any)

		const stateAfterStream = await runStateService.get('run-1')
		expect(stateAfterStream?.nextSequence).toBe(3)
		expect(stateAfterStream?.responseMessageContent).toBe('hello world')

		await processor.process(createCompleteMessage(3) as any, createProcessContext() as any)

		expect(await runStateService.get('run-1')).toBeNull()
	})

	it('does not append duplicate markdown when completing after flush', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		jest.useFakeTimers()
		jest.setSystemTime(1300)

		await runStateService.save(
			createRunState({
				lastFlushAt: 1000,
				context: {
					streaming: {
						updateWindowMs: 200
					}
				} as any
			})
		)

		await processor.process(createStreamMessage(1, 'hello') as any, createProcessContext() as any)
		await processor.process(createCompleteMessage(2) as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(2)
		const completePayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[1][2]
		const streamTextElements = getManagedStreamTextElements(completePayload.elements)
		expect(streamTextElements).toHaveLength(1)
		expect(streamTextElements[0].content).toContain('hello')
	})

	it('updates status to success on complete for structured update-only stream', async () => {
		const { processor, runStateService, larkChannel } = createFixture()

		await runStateService.save(createRunState())
		await processor.process(
			createStreamMessage(1, {
				type: 'update',
				data: {
					elements: [{ tag: 'markdown', content: 'partial' }]
				}
			}) as any,
			createProcessContext() as any
		)
		await processor.process(createCompleteMessage(2) as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(2)
		const completePayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[1][2]
		const partialMarkdownCount = completePayload.elements.filter(
			(element: { tag?: string; content?: string }) =>
				element.tag === 'markdown' && element.content === 'partial'
		).length
		expect(partialMarkdownCount).toBe(1)
	})

	it('keeps chart and streams text in the same card after structured update', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		jest.useFakeTimers()
		jest.setSystemTime(1300)

		await runStateService.save(
			createRunState({
				lastFlushAt: 1000,
				context: {
					streaming: {
						updateWindowMs: 200
					}
				} as any
			})
		)

		await processor.process(
			createStreamMessage(1, {
				type: 'update',
				data: {
					elements: [{ tag: 'chart', chart_spec: { type: 'line' } }]
				}
			}) as any,
			createProcessContext() as any
		)
		await processor.process(createStreamMessage(2, 'analysis text') as any, createProcessContext() as any)
		await processor.process(createCompleteMessage(3) as any, createProcessContext() as any)

		// structured update + text flush + complete
		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(3)

		const streamPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[1][2]
		expect(streamPayload.elements.some((element: { tag?: string }) => element.tag === 'chart')).toBe(true)
		expect(
			streamPayload.elements.some(
				(element: { tag?: string; content?: string }) =>
					element.tag === 'markdown' &&
					typeof element.content === 'string' &&
					element.content.includes('analysis text')
			)
		).toBe(true)

		const completePayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[2][2]
		expect(completePayload.elements.some((element: { tag?: string }) => element.tag === 'chart')).toBe(true)
		expect(
			completePayload.elements.some(
				(element: { tag?: string; content?: string }) =>
					element.tag === 'markdown' &&
					typeof element.content === 'string' &&
					element.content.includes('analysis text')
			)
		).toBe(true)
	})

	it('mixes text chart and event elements in arrival order and updates event by id', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		jest.useFakeTimers()
		jest.setSystemTime(1000)

		await runStateService.save(
			createRunState({
				lastFlushAt: 0,
				context: {
					streaming: {
						updateWindowMs: 200
					}
				} as any
			})
		)

		await processor.process(createStreamMessage(1, 'A') as any, createProcessContext() as any)
		await processor.process(createStreamMessage(2, 'B') as any, createProcessContext() as any)
		await processor.process(
			createStreamMessage(3, {
				type: 'update',
				data: {
					elements: [{ tag: 'chart', chart_spec: { type: 'line' } }]
				}
			}) as any,
			createProcessContext() as any
		)
		await processor.process(createStreamMessage(4, 'C') as any, createProcessContext() as any)

		jest.setSystemTime(1300)
		await processor.process(createStreamMessage(5, 'D') as any, createProcessContext() as any)
		await processor.process(
			createEventMessage(6, ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: 'event-1',
				title: 'Preparing',
				message: 'Loading',
				status: 'running'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createEventMessage(7, ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: 'event-1',
				title: 'Done',
				message: 'Loaded',
				status: 'success'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(createCompleteMessage(8) as any, createProcessContext() as any)

		const calls = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls
		expect(calls.length).toBeGreaterThan(0)
		const finalPayload = calls[calls.length - 1][2]
		const streamTextElements = getManagedStreamTextElements(finalPayload.elements)
		expect(streamTextElements).toHaveLength(2)
		expect(streamTextElements[0].content).toContain('AB')
		expect(streamTextElements[1].content).toContain('CD')

		const firstTextIndex = finalPayload.elements.findIndex(
			(element: { tag?: string; content?: string }) =>
				element.tag === 'markdown' &&
				typeof element.content === 'string' &&
				element.content === 'AB'
		)
		const chartIndex = finalPayload.elements.findIndex((element: { tag?: string }) => element.tag === 'chart')
		const secondTextIndex = finalPayload.elements.findIndex(
			(element: { tag?: string; content?: string }) =>
				element.tag === 'markdown' &&
				typeof element.content === 'string' &&
				element.content === 'CD'
		)
		expect(firstTextIndex).toBeGreaterThan(-1)
		expect(chartIndex).toBeGreaterThan(-1)
		expect(secondTextIndex).toBeGreaterThan(-1)
		expect(firstTextIndex).toBeLessThan(chartIndex)
		expect(chartIndex).toBeLessThan(secondTextIndex)

		const progressElements = getManagedProgressElements(finalPayload.elements)
		expect(progressElements).toHaveLength(1)
		expect(progressElements[0].content).toContain('**执行过程：Done**')
		expect(progressElements[0].content).toContain('Loaded')
		expect(progressElements[0].content).not.toContain('Preparing')
	})

	it('keeps interrupted status when complete arrives after interrupted conversation end event', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(
			createEventMessage(1, ChatMessageEventTypeEnum.ON_CONVERSATION_END, {
				status: XpertAgentExecutionStatusEnum.INTERRUPTED,
				operation: {
					tasks: []
				}
			}) as any,
			createProcessContext() as any
		)
		await processor.process(createCompleteMessage(2) as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		expect(await runStateService.get('run-1')).toBeNull()
	})

	it('handles error callback and clears run state', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(createErrorMessage(1, 'boom') as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		const errorPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		expect(errorPayload.elements[0]).toEqual({
			tag: 'markdown',
			content: 'boom'
		})
		expect(await runStateService.get('run-1')).toBeNull()
	})

	it('serializes same-source callbacks to avoid stale state overwrite', async () => {
		const { processor, runStateService } = createFixture()
		await runStateService.save(createRunState())

		const originalSave = runStateService.save.bind(runStateService)
		jest.spyOn(runStateService, 'save').mockImplementation(async (state, ttlSeconds) => {
			const isSequenceTwoSnapshot =
				state.nextSequence === 1 &&
				state.responseMessageContent === '' &&
				Boolean(state.pendingEvents?.['2']) &&
				!state.pendingEvents?.['1']
			if (isSequenceTwoSnapshot) {
				await new Promise((resolve) => setTimeout(resolve, 20))
			}
			await originalSave(state, ttlSeconds)
		})

		await Promise.all([
			processor.process(createStreamMessage(2, 'world') as any, createProcessContext() as any),
			processor.process(createStreamMessage(1, 'hello ') as any, createProcessContext() as any)
		])

		const state = await runStateService.get('run-1')
		expect(state?.nextSequence).toBe(3)
		expect(state?.responseMessageContent).toBe('hello world')
	})
})

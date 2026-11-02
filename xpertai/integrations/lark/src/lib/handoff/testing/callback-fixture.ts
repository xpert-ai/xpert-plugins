import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/chatkit-types'
import { LarkChatStreamCallbackProcessor } from '../lark-chat-callback.processor.js'
import { LarkChatRunState } from '../lark-chat-run-state.service.js'

import type { HandoffMessage, ManagedQueueJob } from '@xpert-ai/plugin-sdk'
import type { LarkChatStreamCallbackPayload } from '../lark-chat.types.js'
import type { LarkChannelStrategy } from '../../lark-channel.strategy.js'
import type { LarkMessageHistoryService } from '../../lark-message-history.service.js'
import type { LarkChatDispatchService } from '../lark-chat-dispatch.service.js'
import type { PluginContext } from '@xpert-ai/plugin-sdk'
import type { IntegrationLarkPluginConfig } from '../../plugin-config.js'
import { MemoryRunStateService } from './memory-run-state.js'
export function createFixture(
	config: {
		streaming?: {
			updateWindowMs?: number
		}
	} = {}
) {
	const runStateService = new MemoryRunStateService()
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
		setActiveMessage: jest.fn().mockResolvedValue(undefined),
		getActiveMessage: jest.fn().mockResolvedValue(null)
	}
	const messageHistoryService = {
		updateInboundStatus: jest.fn().mockResolvedValue(undefined),
		claimInboundStatus: jest.fn().mockResolvedValue(true),
		areInboundLogsInStatus: jest.fn().mockResolvedValue(false),
		areInboundLogsInStatusWithError: jest.fn().mockResolvedValue(false),
		recordOutbound: jest.fn().mockResolvedValue({ created: true })
	}
	const dispatchService = { buildDispatchMessage: jest.fn(), enqueuePreparedDispatch: jest.fn() }

	const processor = new LarkChatStreamCallbackProcessor(
		larkChannel as LarkChannelStrategy,
		runStateService,
		messageHistoryService as LarkMessageHistoryService,
		dispatchService as LarkChatDispatchService,
		pluginContext as PluginContext<IntegrationLarkPluginConfig>
	)
	Reflect.set(processor, 'conversationService', conversationService)

	const jobs: Array<{ jobName: string; payload: HandoffMessage<LarkChatStreamCallbackPayload> }> = []
	const queue = {
		enqueue: jest.fn(async (job: (typeof jobs)[number]) => {
			jobs.push(job)
		})
	}
	pluginContext.resolve.mockReturnValue(queue)
	const process = processor.process.bind(processor)
	jest.spyOn(processor, 'process').mockImplementation(async (message, context) => {
		message.payload.context ??= runStateService.states.get(message.payload.sourceMessageId)?.context
		message.headers = { ...message.headers, organizationId: message.payload.context?.organizationId }
		const result = await process(message, context)
		const pending = jobs.splice(0)
		for (const job of pending)
			if (job.jobName === 'apply')
				await processor.handle({ name: job.jobName, data: job.payload } as ManagedQueueJob<
					HandoffMessage<LarkChatStreamCallbackPayload>
				>)
		return result
	})
	return {
		receive: process,
		queue,
		runStateService,
		larkChannel,
		conversationService,
		messageHistoryService,
		dispatchService,
		processor,
		pluginContext
	}
}

export function createRunState(overrides: Partial<LarkChatRunState> = {}): LarkChatRunState {
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
	const { context, pendingEvents, lastFlushAt, lastFlushedLength, ...rest } = overrides

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

export function createProcessContext() {
	return {
		runId: 'run-id',
		traceId: 'trace-id',
		abortSignal: new AbortController().signal
	}
}

export function createStaleSteerContext() {
	return {
		tenantId: 'tenant-id',
		userId: 'user-id',
		xpertId: 'xpert-1',
		conversationId: 'conversation-1',
		integrationId: 'integration-1',
		chatId: 'chat-1',
		chatType: 'group',
		senderOpenId: 'sender-1',
		scopeKey: 'group:chat-1',
		currentInboundLogIds: ['inbound-follow-up-1'],
		followUpMode: 'steer',
		message: { id: 'unused-current-message' },
		steerFallback: {
			input: 'follow up',
			message: {
				id: 'lark-card-1',
				messageId: 'ai-1',
				deliveryMode: 'interactive',
				status: 'thinking',
				language: 'zh-Hans',
				elements: []
			}
		}
	}
}

export function createStreamMessage(sequence: number, data: unknown, sourceMessageId: string = 'run-1') {
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

export function createComponentMessage(
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

export function createCompleteMessage(sequence: number, sourceMessageId: string = 'run-1') {
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

export function createEventMessage(
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

export function createErrorMessage(sequence: number, error: string, sourceMessageId: string = 'run-1') {
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

export function getManagedProgressElements(elements: Array<{ tag?: string; content?: string }>) {
	return (elements ?? []).filter(
		(element) =>
			element?.tag === 'markdown' && typeof element?.content === 'string' && element.content.includes('**执行过程：')
	)
}

export function getManagedStreamTextElements(elements: Array<{ tag?: string; content?: string }>) {
	return (elements ?? []).filter(
		(element) =>
			element?.tag === 'markdown' &&
			typeof element?.content === 'string' &&
			!element.content.includes('**Event:**') &&
			!element.content.includes('**执行过程：') &&
			!element.content.includes("color='wathet'")
	)
}

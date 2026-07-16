jest.mock('@xpert-ai/plugin-sdk', () => {
	const { createLarkPluginSdkMock } = require('../../../../../test-utils/larkPluginSdkMock.cjs')
	return createLarkPluginSdkMock(jest, {
		AGENT_CHAT_DISPATCH_MESSAGE_TYPE: 'agent.chat.dispatch',
		HANDOFF_PERMISSION_SERVICE_TOKEN: 'HANDOFF_PERMISSION_SERVICE_TOKEN',
		MANAGED_QUEUE_SERVICE_TOKEN: 'MANAGED_QUEUE_SERVICE_TOKEN'
	})
})

import {
	HANDOFF_PERMISSION_SERVICE_TOKEN,
	MANAGED_QUEUE_SERVICE_TOKEN,
	RequestContext
} from '@xpert-ai/plugin-sdk'
import { LarkChatDispatchService } from './lark-chat-dispatch.service.js'

function createLarkMessage(
	overrides: Partial<{
		id: string
		messageId: string
		status: string
		language: string
		header: unknown
		elements: unknown[]
		integrationId: string
		chatId: string
		chatType: string
		senderOpenId: string
		principalKey: string
		scopeKey: string
		legacyConversationUserKey: string
		recipientDirectoryKey: string
		replyToMessageId: string
		typingReaction: {
			messageId: string
			reactionId: string
			emojiType: string
		}
		update: jest.Mock
		larkChannel: {
			deleteMessageReaction: jest.Mock
		}
	}> = {}
) {
	const larkChannel = overrides.larkChannel ?? {
		deleteMessageReaction: jest.fn().mockResolvedValue(undefined)
	}
	return {
		id: 'lark-message-id',
		messageId: 'chat-message-id',
		status: 'thinking',
		language: 'en_US',
		header: null,
		elements: [],
		integrationId: 'integration-1',
		chatId: 'chat-1',
		chatType: 'group',
		senderOpenId: 'ou_sender_1',
		principalKey: 'lark:v2:principal:integration-1:open_id:ou_sender_1',
		scopeKey: 'lark:v2:scope:integration-1:group:chat-1',
		legacyConversationUserKey: 'open_id:ou_sender_1',
		recipientDirectoryKey: 'lark:recipient-dir:integration-1:chat:chat-1',
		larkChannel,
		update: jest.fn().mockResolvedValue(undefined),
		...overrides
	}
}

function mockRequestContext(params?: {
	userId?: string
	tenantId?: string
	organizationId?: string
	language?: string
	headers?: Record<string, unknown>
}) {
	const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(params ?? {}, key)
	const userId = hasOwn('userId') ? params?.userId : 'request-user-id'
	const tenantId = hasOwn('tenantId') ? params?.tenantId : 'request-tenant-id'
	const organizationId = hasOwn('organizationId')
		? params?.organizationId
		: 'request-organization-id'
	const language = hasOwn('language') ? params?.language : 'en_US'

	jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(userId as any)
	jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenantId as any)
	jest
		.spyOn(RequestContext, 'getOrganizationId')
		.mockReturnValue(organizationId as any)
	jest.spyOn(RequestContext, 'getLanguageCode').mockReturnValue(language as any)
	jest
		.spyOn(RequestContext, 'currentRequest')
		.mockReturnValue({
			headers: params?.headers ?? {}
		} as any)
}

describe('LarkChatDispatchService', () => {
	afterEach(() => {
		jest.useRealTimers()
		jest.restoreAllMocks()
	})

	function createFixture(params?: {
		conversationId?: string
		dispatchContext?: {
			tenantId?: string
			organizationId?: string
			createdById?: string
			source: 'exact' | 'xpert-latest' | 'request-fallback'
		}
	}) {
		const hasConversationId = Object.prototype.hasOwnProperty.call(params ?? {}, 'conversationId')
		const conversationService = {
			getConversation: jest
				.fn()
				.mockResolvedValue(hasConversationId ? params?.conversationId : 'conversation-1'),
			getActiveMessage: jest.fn().mockResolvedValue(null),
			setActiveMessage: jest.fn().mockResolvedValue(undefined),
			resolveDispatchExecutionContext: jest.fn().mockResolvedValue(
				params?.dispatchContext ?? {
					source: 'request-fallback'
				}
			)
		}
		const runStateService = {
			save: jest.fn().mockResolvedValue(undefined)
		}
		const handoffPermissionService = {
			enqueue: jest.fn().mockResolvedValue(undefined)
		}
		const dispatchLocks = new Map<string, string>()
		const redis = {
			set: jest.fn(async (key: string, owner: string) => {
				if (dispatchLocks.has(key)) {
					return null
				}
				dispatchLocks.set(key, owner)
				return 'OK'
			}),
			eval: jest.fn(async (_script: string, _keyCount: number, key: string, owner: string) => {
				if (dispatchLocks.get(key) !== owner) {
					return 0
				}
				dispatchLocks.delete(key)
				return 1
			})
		}
		const managedQueueService = {
			getRedis: jest.fn().mockResolvedValue(redis)
		}
		const pluginContext = {
			resolve: jest.fn((token: unknown) => {
				if (token === HANDOFF_PERMISSION_SERVICE_TOKEN) {
					return handoffPermissionService
				}
				if (token === MANAGED_QUEUE_SERVICE_TOKEN) {
					return managedQueueService
				}
				throw new Error(`Unexpected token: ${String(token)}`)
			})
		}
		const service = new LarkChatDispatchService(
			conversationService as any,
			runStateService as any,
			pluginContext as any
		)

		return {
			service,
			conversationService,
			runStateService,
			handoffPermissionService,
			managedQueueService,
			redis,
			dispatchLocks
		}
	}

	it('serializes concurrent dispatch decisions and reuses the active response card', async () => {
		jest.useFakeTimers()
		mockRequestContext()
		const { service, conversationService, redis, dispatchLocks } = createFixture({
			conversationId: 'conversation-1'
		})
		let activeMessage: unknown = null
		let releaseFirstLookup!: () => void
		let notifyFirstLookupStarted!: () => void
		const firstLookupStarted = new Promise<void>((resolve) => {
			notifyFirstLookupStarted = resolve
		})
		const firstLookupGate = new Promise<void>((resolve) => {
			releaseFirstLookup = resolve
		})
		conversationService.getConversation = jest
			.fn()
			.mockImplementationOnce(async () => {
				notifyFirstLookupStarted()
				await firstLookupGate
				return 'conversation-1'
			})
			.mockResolvedValue('conversation-1')
		conversationService.getActiveMessage = jest.fn().mockImplementation(async () => activeMessage)
		conversationService.setActiveMessage = jest.fn().mockImplementation(async (_scopeKey, _xpertId, value) => {
			activeMessage = value
		})
		const firstLarkMessage = createLarkMessage({ id: 'card-1', messageId: 'message-1' })
		const secondLarkMessage = createLarkMessage({ id: 'card-2', messageId: 'message-2' })

		const firstDispatch = service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: 'first',
			currentInboundLogIds: ['log-1'],
			larkMessage: firstLarkMessage as any
		})
		await firstLookupStarted

		const secondDispatch = service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: 'second',
			currentInboundLogIds: ['log-2'],
			larkMessage: secondLarkMessage as any
		})
		await Promise.resolve()
		await Promise.resolve()

		expect(conversationService.getConversation).toHaveBeenCalledTimes(1)
		releaseFirstLookup()
		const firstMessage = await firstDispatch
		await jest.advanceTimersByTimeAsync(50)
		const secondMessage = await secondDispatch

		expect((firstMessage.payload as any).request.action).toBe('send')
		expect((secondMessage.payload as any).request).toEqual(
			expect.objectContaining({
				action: 'follow_up',
				mode: 'steer',
				target: { aiMessageId: 'message-1' }
			})
		)
		expect(firstLarkMessage.update).toHaveBeenCalledWith({ status: 'thinking' })
		expect(secondLarkMessage.update).not.toHaveBeenCalled()
		expect(conversationService.setActiveMessage).toHaveBeenCalledTimes(1)
		expect(redis.eval).toHaveBeenCalledTimes(2)
		expect(dispatchLocks.size).toBe(0)
	})

	it('releases the dispatch decision lock when message construction fails', async () => {
		mockRequestContext()
		const { service, conversationService, redis, dispatchLocks } = createFixture()
		conversationService.resolveDispatchExecutionContext
			.mockRejectedValueOnce(new Error('context lookup failed'))
			.mockResolvedValueOnce({ source: 'request-fallback' })
		const larkMessage = createLarkMessage()

		await expect(
			service.buildDispatchMessage({
				xpertId: 'xpert-1',
				input: 'first',
				larkMessage: larkMessage as any
			})
		).rejects.toThrow('context lookup failed')

		expect(redis.eval).toHaveBeenCalledTimes(1)
		expect(dispatchLocks.size).toBe(0)
		await expect(
			service.buildDispatchMessage({
				xpertId: 'xpert-1',
				input: 'retry',
				larkMessage: larkMessage as any
			})
		).resolves.toEqual(expect.objectContaining({ payload: expect.any(Object) }))
		expect(redis.eval).toHaveBeenCalledTimes(2)
		expect(dispatchLocks.size).toBe(0)
	})

	it('buildDispatchMessage uses assistant runtime principal with creator callback context', async () => {
		mockRequestContext({
			userId: 'request-user-id',
			tenantId: 'request-tenant-id',
			organizationId: 'request-organization-id'
		})
		const { service, conversationService, runStateService } = createFixture({
			conversationId: 'conversation-1',
			dispatchContext: {
				tenantId: 'binding-tenant-id',
				organizationId: 'binding-organization-id',
				createdById: 'binding-creator-id',
				source: 'exact'
			}
		})
		const larkMessage = createLarkMessage()

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: 'hello',
			larkMessage: larkMessage as any
		})

		expect(conversationService.resolveDispatchExecutionContext).toHaveBeenCalledWith(
			'xpert-1',
			{
				scopeKey: 'lark:v2:scope:integration-1:group:chat-1',
				legacyConversationUserKey: 'open_id:ou_sender_1'
			}
		)
		expect((message.payload as any).request).toEqual({
			action: 'send',
			conversationId: 'conversation-1',
			message: {
				input: {
					input: 'hello'
				}
			},
			state: {
				human: {
					input: 'hello'
				},
				lark_conversation_context_current_chat_id: 'chat-1',
				lark_conversation_context_current_chat_type: 'group',
				lark_conversation_context_current_sender_open_id: 'ou_sender_1',
				lark_conversation_context_current_sender_name: '',
				lark_current_context: {
					chatId: 'chat-1',
					chatType: 'group',
					senderOpenId: 'ou_sender_1',
					senderName: ''
				},
				recipientDirectoryKey: 'lark:recipient-dir:integration-1:chat:chat-1',
				lark_notify_recipient_directory_key: 'lark:recipient-dir:integration-1:chat:chat-1'
			}
		})
		expect(message.tenantId).toBe('binding-tenant-id')
		expect((message.payload as any).options.fromEndUserId).toBeUndefined()
		expect((message.payload as any).options.user).toEqual({
			id: 'binding-creator-id',
			tenantId: 'binding-tenant-id'
		})
		expect((message.payload as any).options.organizationId).toBe('binding-organization-id')
		expect((message.payload as any).options.runtimePrincipal).toEqual({
			type: 'assistant',
			xpertId: 'xpert-1',
			sourceIntegrationId: 'integration-1'
		})
		expect(message.headers?.userId).toBe('binding-creator-id')
		expect((message.payload as any).callback.headers?.userId).toBe('binding-creator-id')
		expect((message.payload as any).callback.context?.userId).toBe('binding-creator-id')
		expect((message.payload as any).options.channelUserId).toBe('ou_sender_1')
		expect((message.payload as any).request.state).toEqual({
			human: {
				input: 'hello'
			},
			lark_conversation_context_current_chat_id: 'chat-1',
			lark_conversation_context_current_chat_type: 'group',
			lark_conversation_context_current_sender_name: '',
			lark_conversation_context_current_sender_open_id: 'ou_sender_1',
			lark_current_context: {
				chatId: 'chat-1',
				chatType: 'group',
				senderName: '',
				senderOpenId: 'ou_sender_1'
			},
			recipientDirectoryKey: 'lark:recipient-dir:integration-1:chat:chat-1',
			lark_notify_recipient_directory_key: 'lark:recipient-dir:integration-1:chat:chat-1'
		})
		expect(larkMessage.update).toHaveBeenCalledWith({ status: 'thinking' })
		expect(runStateService.save).toHaveBeenCalledWith(
			expect.objectContaining({
				context: expect.objectContaining({
					tenantId: 'binding-tenant-id',
					organizationId: 'binding-organization-id',
					userId: 'binding-creator-id',
					recipientDirectoryKey: 'lark:recipient-dir:integration-1:chat:chat-1'
				})
			})
		)
	})

	it('buildDispatchMessage deletes typing reaction before sending thinking state', async () => {
		mockRequestContext()
		const { service } = createFixture()
		const callOrder: string[] = []
		const larkMessage = createLarkMessage({
			typingReaction: {
				messageId: 'source-message-1',
				reactionId: 'reaction-1',
				emojiType: 'Typing'
			},
			larkChannel: {
				deleteMessageReaction: jest.fn().mockImplementation(async () => {
					callOrder.push('delete')
				})
			} as any,
			update: jest.fn().mockImplementation(async () => {
				callOrder.push('update')
			})
		})

		await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: 'hello',
			larkMessage: larkMessage as any
		})

		expect(larkMessage.larkChannel.deleteMessageReaction).toHaveBeenCalledWith(
			'integration-1',
			'source-message-1',
			'reaction-1'
		)
		expect(callOrder).toEqual(['delete', 'update'])
	})

	it('buildDispatchMessage forwards image files through request and human state', async () => {
		mockRequestContext()
		const { service } = createFixture()
		const larkMessage = createLarkMessage()
		const files = [
			{
				fileUrl: 'data:image/png;base64,YWJj',
				mimeType: 'image/png',
				originalName: 'photo.png',
				fileKey: 'img_1'
			}
		]

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			files,
			larkMessage: larkMessage as any
		})

		expect((message.payload as any).request.message.input).toEqual({
			input: '',
			files
		})
		expect((message.payload as any).request.state.human).toEqual({
			input: '',
			files
		})
	})

	it('composes local history once while preserving the raw callback snapshot', async () => {
		mockRequestContext()
		const { service, runStateService } = createFixture()
		const larkMessage = createLarkMessage()
		const currentFile = {
			fileAssetId: 'asset-current',
			workspacePath: 'files/lark/current.txt',
			originalName: 'current.txt'
		}
		const historyFile = {
			fileAssetId: 'asset-history',
			workspacePath: 'files/lark/history.txt',
			originalName: 'history.txt'
		}

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: '请总结',
			files: [currentFile],
			historyContext: '[历史上下文]\n用户: 上一条',
			historyFiles: [historyFile, historyFile],
			currentInboundLogIds: ['log-1', 'log-2', 'log-1'],
			larkMessage: larkMessage as any
		})

		expect((message.payload as any).request.message.input).toEqual({
			input: '[历史上下文]\n用户: 上一条\n\n[本次用户消息]\n请总结',
			files: [currentFile, historyFile]
		})
		expect((message.payload as any).request.state.human.input).toBe(
			'[历史上下文]\n用户: 上一条\n\n[本次用户消息]\n请总结'
		)
		expect((message.payload as any).options.context).toEqual(
			expect.objectContaining({
				integrationId: 'integration-1',
				scopeKey: 'lark:v2:scope:integration-1:group:chat-1',
				currentInboundLogIds: ['log-1', 'log-2'],
				sourceMessageLogIds: ['log-1', 'log-2']
			})
		)
		expect(runStateService.save).toHaveBeenCalledWith(
			expect.objectContaining({
				context: expect.objectContaining({
					currentInboundLogIds: ['log-1', 'log-2'],
					message: expect.objectContaining({ text: '请总结' })
				})
			})
		)
	})

	it('turns a new inbound message into a steer follow-up while the active response is still running', async () => {
		mockRequestContext()
		const { service, conversationService, runStateService } = createFixture({
			conversationId: 'conversation-1'
		})
		conversationService.getActiveMessage = jest.fn().mockResolvedValue({
			id: 'ai-message-1',
			thirdPartyMessage: {
				id: 'lark-card-1',
				messageId: 'ai-message-1',
				status: 'thinking'
			}
		})
		const larkMessage = createLarkMessage()
		const currentFile = {
			fileAssetId: 'asset-current',
			workspacePath: 'files/lark/current.txt',
			originalName: 'current.txt'
		}
		const historyFile = {
			fileAssetId: 'asset-history',
			workspacePath: 'files/lark/history.txt',
			originalName: 'history.txt'
		}

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: '先调整成简版',
			files: [currentFile],
			historyContext: '[历史上下文]\n用户: 不应重复注入',
			historyFiles: [historyFile],
			currentInboundLogIds: ['log-follow-up-1'],
			larkMessage: larkMessage as any
		})

		expect((message.payload as any).request).toEqual({
			action: 'follow_up',
			conversationId: 'conversation-1',
			mode: 'steer',
			message: {
				clientMessageId: 'log-follow-up-1',
				input: {
					input: '[历史上下文]\n用户: 不应重复注入\n\n[本次用户消息]\n先调整成简版',
					files: [currentFile, historyFile]
				}
			},
			target: {
				aiMessageId: 'ai-message-1'
			},
			state: expect.objectContaining({
				human: {
					input: '[历史上下文]\n用户: 不应重复注入\n\n[本次用户消息]\n先调整成简版',
					files: [currentFile, historyFile]
				}
			})
		})
		expect((message.payload as any).callback.context).toEqual(
			expect.objectContaining({
				followUpMode: 'steer',
				conversationId: 'conversation-1',
				currentInboundLogIds: ['log-follow-up-1']
			})
		)
		expect(larkMessage.update).not.toHaveBeenCalled()
		expect(conversationService.setActiveMessage).not.toHaveBeenCalled()
		expect(runStateService.save).not.toHaveBeenCalled()
	})

	it('forces stale steer recovery into a normal send while reusing the same card and client message id', async () => {
		mockRequestContext()
		const { service, conversationService, runStateService } = createFixture({
			conversationId: 'conversation-1'
		})
		conversationService.getActiveMessage.mockResolvedValue({
			id: 'ai-message-1',
			thirdPartyMessage: { id: 'lark-card-1', status: 'success' }
		})
		const larkMessage = createLarkMessage({
			id: 'lark-card-1',
			messageId: 'ai-message-1',
			status: 'success',
			elements: [{ tag: 'markdown', content: 'previous response' }]
		})

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: 'continue safely',
			currentInboundLogIds: ['log-follow-up-1'],
			larkMessage: larkMessage as any,
			options: { forceNewRun: true }
		})

		expect((message.payload as any).request).toEqual(
			expect.objectContaining({
				action: 'send',
				conversationId: 'conversation-1',
				message: expect.objectContaining({
					clientMessageId: 'log-follow-up-1',
					input: expect.objectContaining({ input: 'continue safely' })
				})
			})
		)
		expect((message.payload as any).callback.context.followUpMode).toBeUndefined()
		expect(message.id).toMatch(/^lark_chat_recovery_[a-f0-9]{32}$/)
		expect(message.id).not.toContain(':')
		const duplicate = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: 'continue safely',
			currentInboundLogIds: ['log-follow-up-1'],
			larkMessage: larkMessage as any,
			options: { forceNewRun: true }
		})
		expect(duplicate.id).toBe(message.id)
		expect(larkMessage.update).toHaveBeenCalledWith({ status: 'thinking' })
		expect(conversationService.setActiveMessage).toHaveBeenCalled()
		expect(runStateService.save).toHaveBeenCalled()
	})

	it('uses a normal send only after the active response completes while waiting for its conversation', async () => {
		mockRequestContext()
		const { service, conversationService, runStateService } = createFixture({
			conversationId: undefined
		})
		conversationService.getActiveMessage = jest
			.fn()
			.mockResolvedValueOnce({
				id: 'ai-message-1',
				thirdPartyMessage: { status: 'thinking' }
			})
			.mockResolvedValueOnce({
				id: 'ai-message-1',
				thirdPartyMessage: { status: 'success' }
			})
		const larkMessage = createLarkMessage()

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: '开始下一件事',
			larkMessage: larkMessage as any
		})

		expect((message.payload as any).request).toEqual(
			expect.objectContaining({
				action: 'send'
			})
		)
		expect((message.payload as any).request.conversationId).toBeUndefined()
		expect(larkMessage.update).toHaveBeenCalledWith({ status: 'thinking' })
		expect(conversationService.setActiveMessage).toHaveBeenCalledTimes(1)
		expect(runStateService.save).toHaveBeenCalledTimes(1)
	})

	it('does not fall back to a second response card while an active response lacks a conversation binding', async () => {
		jest.useFakeTimers()
		mockRequestContext()
		const { service, conversationService, runStateService } = createFixture({
			conversationId: undefined
		})
		conversationService.getActiveMessage = jest.fn().mockResolvedValue({
			id: 'ai-message-1',
			thirdPartyMessage: { status: 'thinking' }
		})
		const larkMessage = createLarkMessage({
			typingReaction: {
				messageId: 'source-message-1',
				reactionId: 'reaction-1',
				emojiType: 'Typing'
			}
		})

		const dispatch = service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: '继续补充',
			larkMessage: larkMessage as any
		})
		const rejection = expect(dispatch).rejects.toThrow('follow-up was not dispatched')
		await jest.advanceTimersByTimeAsync(30_000)

		await rejection
		expect(larkMessage.update).not.toHaveBeenCalled()
		expect(larkMessage.larkChannel.deleteMessageReaction).toHaveBeenCalledWith(
			'integration-1',
			'source-message-1',
			'reaction-1'
		)
		expect(conversationService.setActiveMessage).not.toHaveBeenCalled()
		expect(runStateService.save).not.toHaveBeenCalled()
	})

	it('keeps the normal send path after the active response has completed', async () => {
		mockRequestContext()
		const { service, conversationService, runStateService } = createFixture({
			conversationId: 'conversation-1'
		})
		conversationService.getActiveMessage = jest.fn().mockResolvedValue({
			id: 'ai-message-1',
			thirdPartyMessage: {
				status: 'success'
			}
		})
		const larkMessage = createLarkMessage()

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: '开始下一件事',
			larkMessage: larkMessage as any
		})

		expect((message.payload as any).request).toEqual(
			expect.objectContaining({
				action: 'send',
				conversationId: 'conversation-1'
			})
		)
		expect((message.payload as any).callback.context.followUpMode).toBeUndefined()
		expect(larkMessage.update).toHaveBeenCalledWith({ status: 'thinking' })
		expect(conversationService.setActiveMessage).toHaveBeenCalledTimes(1)
		expect(runStateService.save).toHaveBeenCalledTimes(1)
	})

	it('buildDispatchMessage continues when deleting typing reaction fails', async () => {
		mockRequestContext()
		const { service } = createFixture()
		const larkMessage = createLarkMessage({
			typingReaction: {
				messageId: 'source-message-1',
				reactionId: 'reaction-1',
				emojiType: 'Typing'
			},
			larkChannel: {
				deleteMessageReaction: jest.fn().mockRejectedValue(new Error('delete failed'))
			} as any
		})

		await expect(
			service.buildDispatchMessage({
				xpertId: 'xpert-1',
				input: 'hello',
				larkMessage: larkMessage as any
			})
		).resolves.toEqual(expect.objectContaining({ payload: expect.any(Object) }))
		expect(larkMessage.update).toHaveBeenCalledWith({ status: 'thinking' })
	})

	it('buildDispatchMessage uses xpert latest context when exact binding is missing', async () => {
		mockRequestContext()
		const { service } = createFixture({
			conversationId: undefined,
			dispatchContext: {
				tenantId: 'latest-tenant-id',
				organizationId: 'latest-organization-id',
				createdById: 'latest-creator-id',
				source: 'xpert-latest'
			}
		})
		const larkMessage = createLarkMessage()

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: 'hello',
			larkMessage: larkMessage as any
		})

		expect(message.sessionKey).toBe(message.id)
		expect(message.businessKey).toBe(message.id)
		expect((message.payload as any).options.user).toEqual({
			id: 'latest-creator-id',
			tenantId: 'latest-tenant-id'
		})
		expect((message.payload as any).callback.context?.userId).toBe('latest-creator-id')
	})

	it('buildDispatchMessage creates resume request for confirm action', async () => {
		mockRequestContext()
		const { service, conversationService } = createFixture({
			conversationId: 'conversation-1'
		})
		conversationService.getActiveMessage = jest.fn().mockResolvedValue({
			id: 'ai-message-1'
		})
		const larkMessage = createLarkMessage()

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			larkMessage: larkMessage as any,
			options: {
				confirm: true
			}
		})

		expect((message.payload as any).request).toEqual({
			action: 'resume',
			conversationId: 'conversation-1',
			target: {
				aiMessageId: 'ai-message-1'
			},
			decision: {
				type: 'confirm'
			},
			state: {
				lark_conversation_context_current_chat_id: 'chat-1',
				lark_conversation_context_current_chat_type: 'group',
				lark_conversation_context_current_sender_open_id: 'ou_sender_1',
				lark_conversation_context_current_sender_name: '',
				lark_current_context: {
					chatId: 'chat-1',
					chatType: 'group',
					senderOpenId: 'ou_sender_1',
					senderName: ''
				},
				recipientDirectoryKey: 'lark:recipient-dir:integration-1:chat:chat-1',
				lark_notify_recipient_directory_key: 'lark:recipient-dir:integration-1:chat:chat-1'
			}
		})
	})

	it('buildDispatchMessage creates resume request for reject action without cached ai message id', async () => {
		mockRequestContext()
		const { service, conversationService } = createFixture({
			conversationId: 'conversation-1'
		})
		conversationService.getActiveMessage = jest.fn().mockResolvedValue(null)
		const larkMessage = createLarkMessage()

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			larkMessage: larkMessage as any,
			options: {
				reject: true
			}
		})

		expect((message.payload as any).request).toEqual({
			action: 'resume',
			conversationId: 'conversation-1',
			target: {},
			decision: {
				type: 'reject'
			},
			state: {
				lark_conversation_context_current_chat_id: 'chat-1',
				lark_conversation_context_current_chat_type: 'group',
				lark_conversation_context_current_sender_open_id: 'ou_sender_1',
				lark_conversation_context_current_sender_name: '',
				lark_current_context: {
					chatId: 'chat-1',
					chatType: 'group',
					senderOpenId: 'ou_sender_1',
					senderName: ''
				},
				recipientDirectoryKey: 'lark:recipient-dir:integration-1:chat:chat-1',
				lark_notify_recipient_directory_key: 'lark:recipient-dir:integration-1:chat:chat-1'
			}
		})
	})

	it('buildDispatchMessage keeps mapped sender as end user and runs as assistant when binding is unavailable', async () => {
		mockRequestContext({
			userId: 'mapped-user-id',
			tenantId: 'request-tenant-id',
			organizationId: 'request-organization-id'
		})
		const { service } = createFixture({
			dispatchContext: {
				source: 'request-fallback'
			}
		})
		const larkMessage = createLarkMessage()

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: 'hello',
			larkMessage: larkMessage as any,
			options: {
				fromEndUserId: 'mapped-user-id'
			}
		})

		expect((message.payload as any).options.user).toEqual({
			id: 'mapped-user-id',
			tenantId: 'request-tenant-id'
		})
		expect((message.payload as any).options.fromEndUserId).toBe('mapped-user-id')
		expect((message.payload as any).options.organizationId).toBe('request-organization-id')
		expect((message.payload as any).options.runtimePrincipal).toEqual({
			type: 'assistant',
			xpertId: 'xpert-1',
			sourceIntegrationId: 'integration-1'
		})
		expect(message.headers?.userId).toBe('mapped-user-id')
		expect((message.payload as any).callback.context?.userId).toBe('mapped-user-id')
	})

	it('buildDispatchMessage uses explicit executor and fromEndUser overrides when provided', async () => {
		mockRequestContext({
			userId: 'creator-user-id',
			tenantId: 'request-tenant-id',
			organizationId: 'request-organization-id'
		})
		const { service } = createFixture({
			dispatchContext: {
				tenantId: 'binding-tenant-id',
				organizationId: 'binding-organization-id',
				createdById: 'binding-creator-id',
				source: 'request-fallback'
			}
		})
		const larkMessage = createLarkMessage()

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: 'hello',
			larkMessage: larkMessage as any,
			options: {
				fromEndUserId: 'mapped-user-id',
				executorUserId: 'mapped-user-id'
			} as any
		})

		expect((message.payload as any).options.fromEndUserId).toBe('mapped-user-id')
		expect((message.payload as any).options.user).toEqual({
			id: 'mapped-user-id',
			tenantId: 'binding-tenant-id'
		})
		expect((message.payload as any).callback.context?.userId).toBe('mapped-user-id')
		expect(message.headers?.userId).toBe('mapped-user-id')
		expect((message.payload as any).options.runtimePrincipal).toBeUndefined()
	})

	it('buildDispatchMessage passes streaming enabled flag into callback context', async () => {
		mockRequestContext()
		const { service } = createFixture()
		const larkMessage = createLarkMessage()

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: 'hello',
			larkMessage: larkMessage as any,
			options: {
				streamingEnabled: false
			} as any
		})

		expect((message.payload as any).callback.context?.streaming).toEqual({
			enabled: false
		})
	})

	it('buildDispatchMessage throws when final tenantId cannot be resolved', async () => {
		mockRequestContext({
			userId: 'request-user-id',
			tenantId: undefined,
			organizationId: 'request-organization-id'
		})
		const { service } = createFixture({
			dispatchContext: {
				source: 'request-fallback'
			}
		})
		const larkMessage = createLarkMessage()

		await expect(
			service.buildDispatchMessage({
				xpertId: 'xpert-1',
				input: 'hello',
				larkMessage: larkMessage as any
			})
		).rejects.toThrow('Missing tenantId in resolved dispatch context')
	})

	it('buildDispatchMessage uses trusted trigger execution context for a first async conversation', async () => {
		mockRequestContext({
			userId: undefined,
			tenantId: undefined,
			organizationId: undefined
		})
		const { service } = createFixture({
			conversationId: undefined,
			dispatchContext: {
				source: 'request-fallback'
			}
		})
		const larkMessage = createLarkMessage()

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			executionContext: {
				tenantId: 'trigger-tenant-id',
				organizationId: 'trigger-organization-id',
				createdById: 'trigger-created-by-id'
			},
			input: 'hello',
			larkMessage: larkMessage as any
		})

		expect(message.tenantId).toBe('trigger-tenant-id')
		expect(message.headers).toEqual(
			expect.objectContaining({
				organizationId: 'trigger-organization-id',
				userId: 'trigger-created-by-id'
			})
		)
		expect((message.payload as any).options).toEqual(
			expect.objectContaining({
				tenantId: 'trigger-tenant-id',
				organizationId: 'trigger-organization-id',
				user: {
					id: 'trigger-created-by-id',
					tenantId: 'trigger-tenant-id'
				}
			})
		)
	})

	it('buildDispatchMessage throws when final executor userId cannot be resolved', async () => {
		mockRequestContext({
			userId: undefined,
			tenantId: 'request-tenant-id',
			organizationId: 'request-organization-id'
		})
		const { service } = createFixture({
			dispatchContext: {
				tenantId: 'binding-tenant-id',
				organizationId: 'binding-organization-id',
				source: 'request-fallback'
			}
		})
		const larkMessage = createLarkMessage()

		await expect(
			service.buildDispatchMessage({
				xpertId: 'xpert-1',
				input: 'hello',
				larkMessage: larkMessage as any
			})
		).rejects.toThrow('Missing executor userId in resolved dispatch context')
	})

	it('buildDispatchMessage throws when resume action misses conversationId', async () => {
		mockRequestContext()
		const { service } = createFixture({
			conversationId: undefined
		})
		const larkMessage = createLarkMessage()

		await expect(
			service.buildDispatchMessage({
				xpertId: 'xpert-1',
				larkMessage: larkMessage as any,
				options: {
					confirm: true
				}
			})
		).rejects.toThrow('Missing conversationId for Lark resume action')
	})
})

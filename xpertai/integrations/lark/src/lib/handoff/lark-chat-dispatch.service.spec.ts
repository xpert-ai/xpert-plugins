import {
	HANDOFF_PERMISSION_SERVICE_TOKEN,
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
		const pluginContext = {
			resolve: jest.fn((token: unknown) => {
				if (token === HANDOFF_PERMISSION_SERVICE_TOKEN) {
					return handoffPermissionService
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
			handoffPermissionService
		}
	}

	it('buildDispatchMessage uses creator context when exact binding context is resolved', async () => {
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
			lark_conversation_context_current_sender_open_id: 'ou_sender_1',
			lark_current_context: {
				chatId: 'chat-1',
				chatType: 'group',
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

	it('buildDispatchMessage falls back to request context when binding context is unavailable', async () => {
		mockRequestContext({
			userId: 'request-user-id',
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
			larkMessage: larkMessage as any
		})

		expect((message.payload as any).options.user).toEqual({
			id: 'request-user-id',
			tenantId: 'request-tenant-id'
		})
		expect((message.payload as any).options.fromEndUserId).toBeUndefined()
		expect((message.payload as any).options.organizationId).toBe('request-organization-id')
		expect(message.headers?.userId).toBe('request-user-id')
		expect((message.payload as any).callback.context?.userId).toBe('request-user-id')
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

jest.mock('@xpert-ai/plugin-sdk', () => {
	const { createLarkPluginSdkMock } = require('../../../../../test-utils/larkPluginSdkMock.cjs')
	return createLarkPluginSdkMock(jest, {
		AGENT_CHAT_DISPATCH_MESSAGE_TYPE: 'agent.chat.dispatch',
		HANDOFF_PERMISSION_SERVICE_TOKEN: 'HANDOFF_PERMISSION_SERVICE_TOKEN'
	})
})

import {
	HANDOFF_PERMISSION_SERVICE_TOKEN,
	RequestContext
} from '@xpert-ai/plugin-sdk'
import { DingTalkChatDispatchService } from './dingtalk-chat-dispatch.service.js'

function createDingTalkMessage(
	overrides: Partial<{
		id: string
		messageId: string
		status: string
		language: string
		header: unknown
		elements: unknown[]
		integrationId: string
		chatId: string
		senderOpenId: string
		senderRecipient: { type: 'user_id' | 'open_id'; id: string }
		chatType: 'private' | 'group'
		robotCode: string
		sessionWebhook: string
		update: jest.Mock
	}> = {}
) {
	return {
		id: overrides.id ?? 'dingtalk-message-id',
		messageId: overrides.messageId ?? 'chat-message-id',
		status: overrides.status ?? 'thinking',
		language: overrides.language ?? 'zh-Hans',
		header: overrides.header ?? null,
		elements: overrides.elements ?? [],
		integrationId: overrides.integrationId ?? 'integration-1',
		chatId: overrides.chatId ?? 'chat-1',
		senderOpenId: overrides.senderOpenId ?? 'sender-open-id',
		senderRecipient: overrides.senderRecipient ?? { type: 'user_id', id: 'sender-staff-id' },
		chatType: overrides.chatType ?? 'private',
		robotCode: overrides.robotCode ?? 'robot-code-1',
		sessionWebhook: overrides.sessionWebhook ?? 'https://oapi.dingtalk.com/robot/send/session',
		update: overrides.update ?? jest.fn().mockResolvedValue(undefined),
		isDegradedWithoutMessageId: jest.fn(() => false),
		isTerminalDelivered: jest.fn(() => false)
	}
}

function mockRequestContext(params?: {
	userId?: string
	tenantId?: string
	organizationId?: string
	language?: string
	headers?: Record<string, unknown>
}) {
	jest.spyOn(RequestContext, 'currentUserId').mockReturnValue((params?.userId ?? 'request-user-id') as any)
	jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue((params?.tenantId ?? 'request-tenant-id') as any)
	jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue((params?.organizationId ?? 'request-organization-id') as any)
	jest.spyOn(RequestContext, 'getLanguageCode').mockReturnValue((params?.language ?? 'zh-Hans') as any)
	jest.spyOn(RequestContext, 'currentRequest').mockReturnValue({
		headers: params?.headers ?? {}
	} as any)
}

describe('DingTalkChatDispatchService', () => {
	afterEach(() => {
		jest.restoreAllMocks()
	})

	function createFixture(params?: {
		conversationId?: string
		activeMessage?: { id?: string } | null
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
			getActiveMessage: jest.fn().mockResolvedValue(params?.activeMessage ?? null),
			setActiveMessage: jest.fn().mockResolvedValue(undefined),
			resolveDispatchExecutionContext: jest.fn().mockResolvedValue(
				params?.dispatchContext ?? {
					tenantId: 'binding-tenant-id',
					organizationId: 'binding-organization-id',
					createdById: '11111111-1111-4111-8111-111111111111',
					source: 'exact'
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
		const service = new DingTalkChatDispatchService(
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

	it('buildDispatchMessage uses the current send request shape', async () => {
		mockRequestContext()
		const { service } = createFixture()
		const dingtalkMessage = createDingTalkMessage()

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: 'hi',
			dingtalkMessage: dingtalkMessage as any
		})

		expect((message.payload as any).request).toEqual({
			action: 'send',
			conversationId: 'conversation-1',
			message: {
				input: {
					input: 'hi'
				}
			}
		})
		expect((message.payload as any).request.input).toBeUndefined()
		expect((message.payload as any).request.confirm).toBeUndefined()
		expect((message.payload as any).options.context).toEqual({
			from: 'dingtalk',
			channelType: 'dingtalk',
			sourceIntegrationId: 'integration-1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			chatType: 'private',
			senderRecipient: { type: 'user_id', id: 'sender-staff-id' },
			robotCode: 'robot-code-1',
			sessionWebhook: 'https://oapi.dingtalk.com/robot/send/session',
			xpertId: 'xpert-1'
		})
	})

	it('buildDispatchMessage forwards inbound files to the chat request input', async () => {
		mockRequestContext()
		const { service } = createFixture()
		const dingtalkMessage = createDingTalkMessage()
		const files = [
			{
				fileUrl: 'data:image/png;base64,YWJj',
				mimeType: 'image/png',
				originalName: 'photo.png',
				fileKey: 'download-code-1'
			}
		]

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			input: '',
			files,
			dingtalkMessage: dingtalkMessage as any
		} as any)

		expect((message.payload as any).request).toEqual({
			action: 'send',
			conversationId: 'conversation-1',
			message: {
				input: {
					input: '',
					files
				}
			}
		})
	})

	it('buildDispatchMessage creates resume request for confirm action', async () => {
		mockRequestContext()
		const { service } = createFixture({
			activeMessage: {
				id: 'ai-message-1'
			}
		})
		const dingtalkMessage = createDingTalkMessage()

		const message = await service.buildDispatchMessage({
			xpertId: 'xpert-1',
			dingtalkMessage: dingtalkMessage as any,
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
			}
		})
	})
})

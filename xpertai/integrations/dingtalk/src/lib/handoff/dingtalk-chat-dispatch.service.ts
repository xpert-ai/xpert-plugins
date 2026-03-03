import {
	LanguagesEnum,
	TChatOptions
} from '@metad/contracts'
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import {
	AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
	HandoffMessage,
	HANDOFF_PERMISSION_SERVICE_TOKEN,
	HandoffPermissionService,
	type PluginContext,
	RequestContext,
	AgentChatDispatchPayload
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { DingTalkConversationService } from '../conversation.service.js'
import { resolveConversationUserKey } from '../conversation-user-key.js'
import { ChatDingTalkMessage } from '../message.js'
import { DINGTALK_PLUGIN_CONTEXT } from '../tokens.js'
import { DispatchDingTalkChatPayload } from './commands/dispatch-dingtalk-chat.command.js'
import { DingTalkChatRunStateService } from './dingtalk-chat-run-state.service.js'
import {
	DINGTALK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE,
	DingTalkChatCallbackContext,
	DingTalkChatMessageSnapshot
} from './dingtalk-chat.types.js'

export type TDingTalkChatDispatchInput = DispatchDingTalkChatPayload

/**
 * Builds and enqueues handoff messages for DingTalk chat requests.
 *
 * Responsibilities:
 * - Translate DingTalk-side input/message context into agent chat dispatch payloads.
 * - Persist stream/run callback state used by incremental UI updates.
 * - Update active message/session cache so follow-up actions can resume context.
 */
@Injectable()
export class DingTalkChatDispatchService {
	private readonly logger = new Logger(DingTalkChatDispatchService.name)
	private _handoffPermissionService: HandoffPermissionService

	constructor(
		@Inject(forwardRef(() => DingTalkConversationService))
		private readonly conversationService: DingTalkConversationService,
		private readonly runStateService: DingTalkChatRunStateService,
		@Inject(DINGTALK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext
	) {}

	private get handoffPermissionService(): HandoffPermissionService {
		if (!this._handoffPermissionService) {
			this._handoffPermissionService = this.pluginContext.resolve(HANDOFF_PERMISSION_SERVICE_TOKEN)
		}
		return this._handoffPermissionService
	}

	async enqueueDispatch(input: TDingTalkChatDispatchInput): Promise<ChatDingTalkMessage> {
		const message = await this.buildDispatchMessage(input)
		await this.handoffPermissionService.enqueue(message, {
			delayMs: 0
		})
		return input.dingtalkMessage
	}

	async buildDispatchMessage(input: TDingTalkChatDispatchInput): Promise<HandoffMessage<AgentChatDispatchPayload>> {
		const { xpertId, dingtalkMessage } = input
		const requestUserId = RequestContext.currentUserId()
		const requestTenantId = RequestContext.currentTenantId()
		const requestOrganizationId = RequestContext.getOrganizationId()
		const conversationUserKey = resolveConversationUserKey({
			integrationId: dingtalkMessage.integrationId,
			conversationId: dingtalkMessage.chatId,
			senderOpenId: dingtalkMessage.senderOpenId,
			fallbackUserId: requestUserId
		})
		const conversationId = conversationUserKey
			? await this.conversationService.getConversation(conversationUserKey, xpertId)
			: undefined
		// Dispatch must run under xpert creator context; request context is only a safety fallback.
		const dispatchContext = await this.conversationService.resolveDispatchExecutionContext(
			xpertId,
			conversationUserKey
		)
		const tenantId = dispatchContext.tenantId ?? requestTenantId
		const organizationId = dispatchContext.organizationId ?? requestOrganizationId
		const executorUserId = dispatchContext.createdById ?? requestUserId
		if (!tenantId) {
			throw new Error('Missing tenantId in resolved dispatch context')
		}
		if (!executorUserId || !this.isUuid(executorUserId)) {
			throw new Error(
				`Missing valid UUID executor userId in resolved dispatch context (got: ${executorUserId || 'empty'})`
			)
		}
		this.logger.debug(
			`Resolved DingTalk dispatch context: source=${dispatchContext.source}, xpertId=${xpertId}, conversationUserKey=${
				conversationUserKey ?? 'n/a'
			}, tenantId=${tenantId}, organizationId=${organizationId ?? 'n/a'}, executorUserId=${executorUserId}, requestUserId=${
				requestUserId ?? 'n/a'
			}`
		)

		await dingtalkMessage.update({ status: 'thinking' })
		if (conversationUserKey) {
			await this.conversationService.setActiveMessage(
				conversationUserKey,
				xpertId,
				this.toActiveMessageCache(dingtalkMessage)
			)
		}

		const runId = `dingtalk-chat-${randomUUID()}`
		const sessionKey = conversationId ?? runId
		const language = dingtalkMessage.language || RequestContext.getLanguageCode()
			const callbackContext: DingTalkChatCallbackContext = {
				tenantId,
				organizationId,
				userId: executorUserId,
				xpertId,
				integrationId: dingtalkMessage.integrationId,
				chatId: dingtalkMessage.chatId,
				senderOpenId: dingtalkMessage.senderOpenId,
				robotCode: dingtalkMessage.robotCode,
				sessionWebhook: dingtalkMessage.sessionWebhook,
				reject: Boolean(input.options?.reject),
				streaming: this.resolveStreamingOverrideFromRequest(),
				message: this.toMessageSnapshot(dingtalkMessage, input.input)
			}

		await this.runStateService.save({
			sourceMessageId: runId,
			nextSequence: 1,
			responseMessageContent: '',
			context: callbackContext,
			pendingEvents: {},
			lastFlushAt: 0,
			lastFlushedLength: 0,
			renderItems: (callbackContext.message?.elements ?? []).map((element) => ({
				kind: 'structured' as const,
				element: { ...element }
			}))
		})

		return {
			id: runId,
			type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
			version: 1,
			tenantId,
			sessionKey,
			businessKey: sessionKey,
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: Date.now(),
			traceId: runId,
			payload: {
				request: {
					input: {
						input: input.input
					},
					conversationId,
					confirm: input.options?.confirm
				},
				options: {
					xpertId,
					from: 'dingtalk',
					// Keep the inbound DingTalk user as end-user identity for conversation attribution.
					fromEndUserId: requestUserId,
					tenantId,
					organizationId,
					// Force execution user to xpert creator (minimal shape is enough for downstream context).
					user: {
						id: executorUserId,
						tenantId
					},
					language: language as LanguagesEnum,
					channelType: 'dingtalk',
					integrationId: dingtalkMessage.integrationId,
					chatId: dingtalkMessage.chatId,
					channelUserId: dingtalkMessage.senderOpenId,
					...(dingtalkMessage.robotCode ? { robotCode: dingtalkMessage.robotCode } : {}),
					// sessionWebhook for notify tools fallback when robotCode is unavailable (e.g. group reply)
					...(dingtalkMessage.sessionWebhook ? { sessionWebhook: dingtalkMessage.sessionWebhook } : {})
				} as TChatOptions & { xpertId: string },
				callback: {
					messageType: DINGTALK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE,
					headers: {
						...(organizationId ? { organizationId } : {}),
						// Callback/user headers must use executor user so agent-chat runs in creator context.
						...(executorUserId ? { userId: executorUserId } : {}),
						...(language ? { language } : {}),
						...(conversationId ? { conversationId } : {}),
						source: 'api',
						handoffQueue: 'integration',
						requestedLane: 'main',
						...(dingtalkMessage.integrationId ? { integrationId: dingtalkMessage.integrationId } : {})
					},
					context: callbackContext
				}
			} as AgentChatDispatchPayload,
			headers: {
				...(organizationId ? { organizationId } : {}),
				// Queue-level user header drives request context reconstruction in agent-chat processor.
				...(executorUserId ? { userId: executorUserId } : {}),
				...(language ? { language } : {}),
				...(conversationId ? { conversationId } : {}),
				source: 'api',
				requestedLane: 'main',
				handoffQueue: 'realtime',
				...(dingtalkMessage.integrationId ? { integrationId: dingtalkMessage.integrationId } : {})
			}
		}
	}

	private toMessageSnapshot(message: ChatDingTalkMessage, text?: string): DingTalkChatMessageSnapshot {
		return {
			id: message.id,
			messageId: message.messageId,
			status: message.status,
			language: message.language,
			header: message.header,
			elements: [...(message.elements ?? [])],
			text,
			degradedWithoutMessageId: message.isDegradedWithoutMessageId(),
			terminalDelivered: message.isTerminalDelivered()
		}
	}

	private toActiveMessageCache(message: ChatDingTalkMessage) {
		return {
			id: message.messageId,
			thirdPartyMessage: {
				id: message.id,
				messageId: message.messageId,
				status: message.status as string,
				language: message.language,
				header: message.header,
				elements: [...(message.elements ?? [])]
			}
		}
	}

	private resolveStreamingOverrideFromRequest(): DingTalkChatCallbackContext['streaming'] | undefined {
		const request = RequestContext.currentRequest()
		const rawHeader =
			request?.headers?.['x-dingtalk-update-window-ms'] ??
			request?.headers?.['dingtalk-update-window-ms']
		const rawValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
		if (!rawValue) {
			return undefined
		}
		const parsed = parseInt(String(rawValue), 10)
		if (!Number.isFinite(parsed) || parsed <= 0) {
			return undefined
		}
		return {
			updateWindowMs: parsed
		}
	}

	private isUuid(value: string): boolean {
		return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
	}
}

import type { LanguagesEnum as TLanguagesEnum, TChatRequest } from '@xpert-ai/contracts'
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import {
	AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
	HandoffMessage,
	HANDOFF_PERMISSION_SERVICE_TOKEN,
	HandoffPermissionService,
	MANAGED_QUEUE_SERVICE_TOKEN,
	type ManagedQueueService,
	type PluginContext,
	RequestContext,
	AgentChatDispatchPayload
} from '@xpert-ai/plugin-sdk'
import { createHash, randomUUID } from 'crypto'
import { LarkConversationService } from '../conversation.service.js'
import { LanguagesEnum, STATE_VARIABLE_HUMAN } from '../contracts-compat.js'
import { ChatLarkMessage } from '../message.js'
import { LARK_PLUGIN_CONTEXT } from '../tokens.js'
import { DispatchLarkChatPayload } from './commands/dispatch-lark-chat.command.js'
import { LarkChatRunStateService } from './lark-chat-run-state.service.js'
import {
	LARK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE,
	LarkChatCallbackContext,
	LarkChatMessageSnapshot
} from './lark-chat.types.js'

export type TLarkChatDispatchInput = DispatchLarkChatPayload

const LARK_STEER_CONVERSATION_WAIT_MS = 30_000
const LARK_STEER_CONVERSATION_POLL_MS = 100
const LARK_DISPATCH_BUILD_LOCK_TTL_MS = 60_000
const LARK_DISPATCH_BUILD_LOCK_WAIT_MS = 35_000
const LARK_DISPATCH_BUILD_LOCK_POLL_MS = 50

type LarkAgentChatDispatchOptions = AgentChatDispatchPayload['options'] & {
	tenantId: string
	organizationId?: string
	channelType: 'lark'
	integrationId: string
	chatId: string
	channelUserId: string
	user: {
		id: string
		tenantId: string
	}
	context?: Record<string, unknown>
}

/**
 * Builds and enqueues handoff messages for Lark chat requests.
 *
 * Responsibilities:
 * - Translate Lark-side input/message context into agent chat dispatch payloads.
 * - Persist stream/run callback state used by incremental UI updates.
 * - Update active message/session cache so follow-up actions can resume context.
 */
@Injectable()
export class LarkChatDispatchService {
	private readonly logger = new Logger(LarkChatDispatchService.name)
	private _handoffPermissionService: HandoffPermissionService

	constructor(
		@Inject(forwardRef(() => LarkConversationService))
		private readonly conversationService: LarkConversationService,
		private readonly runStateService: LarkChatRunStateService,
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext
	) {}

	private get handoffPermissionService(): HandoffPermissionService {
		if (!this._handoffPermissionService) {
			this._handoffPermissionService = this.pluginContext.resolve(HANDOFF_PERMISSION_SERVICE_TOKEN)
		}
		return this._handoffPermissionService
	}

	async enqueueDispatch(input: TLarkChatDispatchInput): Promise<ChatLarkMessage> {
		const message = await this.buildDispatchMessage(input)
		await this.handoffPermissionService.enqueue(message, {
			delayMs: 0
		})
		return input.larkMessage
	}

	async buildDispatchMessage(input: TLarkChatDispatchInput): Promise<HandoffMessage<AgentChatDispatchPayload>> {
		const scopeKey = input.larkMessage['scopeKey'] as string | undefined
		if (!scopeKey) {
			return this.buildDispatchMessageUnlocked(input)
		}
		return this.runWithDispatchBuildLock(scopeKey, input.xpertId, () =>
			this.buildDispatchMessageUnlocked(input)
		)
	}

	private async buildDispatchMessageUnlocked(input: TLarkChatDispatchInput): Promise<HandoffMessage<AgentChatDispatchPayload>> {
		const { xpertId, larkMessage } = input
		const requestUserId = RequestContext.currentUserId()
		const requestTenantId = RequestContext.currentTenantId()
		const requestOrganizationId = RequestContext.getOrganizationId()
		const scopeKey = larkMessage['scopeKey'] as string | undefined
		const legacyConversationUserKey = larkMessage['legacyConversationUserKey'] as string | undefined
		const principalKey = larkMessage['principalKey'] as string | undefined
		const currentInboundLogIds = this.normalizeInboundLogIds(input.currentInboundLogIds)
		let conversationId = scopeKey
			? await this.conversationService.getConversation(scopeKey, xpertId, {
					legacyConversationUserKey
			  })
			: undefined
		let activeMessage = scopeKey
			? await this.conversationService.getActiveMessage(scopeKey, xpertId, {
					legacyConversationUserKey
			  })
			: null
		let steerCandidate =
			!input.options?.forceNewRun &&
			!input.options?.confirm &&
			!input.options?.reject &&
			this.isActiveMessageInProgress(activeMessage)
		if (!conversationId && steerCandidate && scopeKey) {
			let resolved: Awaited<ReturnType<LarkChatDispatchService['waitForConversationOrCompletion']>>
			try {
				resolved = await this.waitForConversationOrCompletion(
					scopeKey,
					xpertId,
					legacyConversationUserKey
				)
			} catch (error) {
				await this.clearTypingReaction(larkMessage)
				throw error
			}
			conversationId = resolved.conversationId
			activeMessage = resolved.activeMessage
			steerCandidate = this.isActiveMessageInProgress(activeMessage)
		}
		const followUpMode = conversationId && steerCandidate ? ('steer' as const) : undefined
		const dispatchInput = this.composeDispatchInput(input.input, input.historyContext)
		const dispatchFiles = this.mergeFiles(input.files, input.historyFiles)
		// Dispatch must run under xpert creator context; request context is only a safety fallback.
		const dispatchContext = await this.conversationService.resolveDispatchExecutionContext(
			xpertId,
			{
				scopeKey,
				legacyConversationUserKey
			}
		)
		const tenantId = dispatchContext.tenantId ?? input.executionContext?.tenantId ?? requestTenantId
		const organizationId =
			dispatchContext.organizationId ?? input.executionContext?.organizationId ?? requestOrganizationId
		const mappedExecutorUserId = input.options?.executorUserId
		const executorUserId =
			mappedExecutorUserId ?? dispatchContext.createdById ?? input.executionContext?.createdById ?? requestUserId
		if (!tenantId) {
			throw new Error('Missing tenantId in resolved dispatch context')
		}
		if (!executorUserId) {
			throw new Error('Missing executor userId in resolved dispatch context')
		}
		this.logger.debug(
			`Resolved Lark dispatch context: source=${dispatchContext.source}, xpertId=${xpertId}, scopeKey=${
				scopeKey ?? 'n/a'
			}, tenantId=${tenantId}, organizationId=${organizationId ?? 'n/a'}, executorUserId=${executorUserId}, requestUserId=${
				requestUserId ?? 'n/a'
			}`
		)

		await this.clearTypingReaction(larkMessage)
		if (!followUpMode) {
			await larkMessage.update({ status: 'thinking' })
			if (scopeKey) {
				await this.conversationService.setActiveMessage(
					scopeKey,
					xpertId,
					this.toActiveMessageCache(larkMessage),
					{
						legacyConversationUserKey
					}
				)
			}
		}

		const runId =
			input.options?.forceNewRun && currentInboundLogIds.length
				? this.buildRecoveryRunId(larkMessage.integrationId, currentInboundLogIds)
				: `lark-chat-${randomUUID()}`
		const sessionKey = conversationId ?? runId
		const language = larkMessage.language || RequestContext.getLanguageCode()
		const callbackContext: LarkChatCallbackContext = {
			tenantId,
			organizationId,
			userId: executorUserId,
			xpertId,
			conversationId,
			connectionMode: larkMessage.connectionMode,
			integrationId: larkMessage.integrationId,
			chatId: larkMessage.chatId,
			chatType: larkMessage['chatType'] as string | undefined,
			senderOpenId: larkMessage.senderOpenId,
			senderName: larkMessage['senderName'] as string | undefined,
			principalKey,
			scopeKey,
			legacyConversationUserKey,
			recipientDirectoryKey: larkMessage.recipientDirectoryKey,
			groupWindowId: input.options?.groupWindow?.windowId,
			groupWindow: input.options?.groupWindow,
			...(currentInboundLogIds.length ? { currentInboundLogIds } : {}),
			...(followUpMode
				? {
						followUpMode,
						steerFallback: {
							input: dispatchInput,
							files: dispatchFiles,
							message: this.toMessageSnapshotFromActive(activeMessage),
							fromEndUserId: input.options?.fromEndUserId,
							executorUserId: input.options?.executorUserId,
							streamingEnabled: input.options?.streamingEnabled
						}
				  }
				: {}),
			reject: Boolean(input.options?.reject),
			streaming: this.resolveStreamingConfig(input.options),
			message: this.toMessageSnapshot(larkMessage, input.input)
		}

		if (!followUpMode) {
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
		}

		this.logger.debug(
			`[lark-dispatch] runId=${runId} integration=${larkMessage.integrationId ?? 'n/a'} chat=${larkMessage.chatId ?? 'n/a'} conversationId=${
				conversationId ?? 'n/a'
			} recipientDirectoryKey=${larkMessage.recipientDirectoryKey ?? 'n/a'}`
		)
		const state = this.buildChatState({
			...input,
			input: dispatchInput,
			files: dispatchFiles
		})
		const request = this.buildChatRequest({
			conversationId,
			activeMessageId: activeMessage?.id,
			followUpMode,
			clientMessageId: currentInboundLogIds[0],
			state,
			options: input.options,
			input: dispatchInput,
			files: dispatchFiles
		})
		const dispatchOptions: LarkAgentChatDispatchOptions = {
			xpertId,
			from: 'feishu',
			...(!mappedExecutorUserId
				? {
						runtimePrincipal: {
							type: 'assistant',
							xpertId,
							sourceIntegrationId: larkMessage.integrationId
						}
				  }
				: {}),
			// Keep the inbound Lark user as end-user identity for conversation attribution.
			...(input.options?.fromEndUserId
				? { fromEndUserId: input.options.fromEndUserId }
				: {}),
			tenantId,
			organizationId,
			// Retain user context for Lark callbacks; runtimePrincipal controls assistant execution.
			user: {
				id: executorUserId,
				tenantId
			},
			language: language as TLanguagesEnum,
			channelType: 'lark',
			integrationId: larkMessage.integrationId,
			chatId: larkMessage.chatId,
			channelUserId: larkMessage.senderOpenId,
			context: {
				from: 'lark',
				channelType: 'lark',
				sourceIntegrationId: larkMessage.integrationId,
				integrationId: larkMessage.integrationId,
				chatId: larkMessage.chatId,
				chatType: larkMessage['chatType'] as string | undefined,
				senderOpenId: larkMessage.senderOpenId,
				senderName: larkMessage['senderName'] as string | undefined,
				scopeKey,
				xpertId,
				...(currentInboundLogIds.length
					? {
							currentInboundLogIds,
							sourceMessageLogIds: currentInboundLogIds
					  }
					: {})
			}
		}
		const payload: AgentChatDispatchPayload = {
			request,
			options: dispatchOptions,
			callback: {
				messageType: LARK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE,
				headers: {
					...(organizationId ? { organizationId } : {}),
					// Callback headers keep the user context needed by the Lark response path.
					...(executorUserId ? { userId: executorUserId } : {}),
					...(language ? { language } : {}),
					...(conversationId ? { conversationId } : {}),
					source: 'lark',
					handoffQueue: 'integration',
					requestedLane: 'main',
					...(larkMessage.integrationId ? { integrationId: larkMessage.integrationId } : {})
				},
				context: callbackContext
			}
		}

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
			payload,
			headers: {
				...(organizationId ? { organizationId } : {}),
				// Legacy user context is retained; assistant runtime principal takes precedence when present.
				...(executorUserId ? { userId: executorUserId } : {}),
				...(language ? { language } : {}),
				...(conversationId ? { conversationId } : {}),
				source: 'lark',
				requestedLane: 'main',
				handoffQueue: 'realtime',
				...(larkMessage.integrationId ? { integrationId: larkMessage.integrationId } : {})
			}
		}
	}

	private async runWithDispatchBuildLock<T>(scopeKey: string, xpertId: string, task: () => Promise<T>): Promise<T> {
		const queue = this.pluginContext.resolve(MANAGED_QUEUE_SERVICE_TOKEN) as ManagedQueueService
		const redis = await queue.getRedis()
		const key = this.dispatchBuildLockKey(scopeKey, xpertId)
		const owner = randomUUID()
		const deadline = Date.now() + LARK_DISPATCH_BUILD_LOCK_WAIT_MS

		while (Date.now() < deadline) {
			const claimed = await redis.set(key, owner, 'PX', LARK_DISPATCH_BUILD_LOCK_TTL_MS, 'NX')
			if (claimed === 'OK') {
				try {
					return await task()
				} finally {
					try {
						await redis.eval(
							`if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`,
							1,
							key,
							owner
						)
					} catch (error) {
						this.logger.warn(`Unable to release Lark dispatch decision lock: ${String(error)}`)
					}
				}
			}
			await new Promise((resolve) => setTimeout(resolve, LARK_DISPATCH_BUILD_LOCK_POLL_MS))
		}

		throw new Error(`Timed out waiting for the active Lark response decision for scope=${scopeKey}, xpertId=${xpertId}`)
	}

	private dispatchBuildLockKey(scopeKey: string, xpertId: string): string {
		const digest = createHash('sha256').update(`${scopeKey}\0${xpertId}`).digest('hex').slice(0, 32)
		return `lark:dispatch-build:${digest}`
	}

	private buildRecoveryRunId(integrationId: string, inboundLogIds: string[]): string {
		const digest = createHash('sha256')
			.update([integrationId, ...inboundLogIds].join('\u0000'))
			.digest('hex')
			.slice(0, 32)
		return `lark_chat_recovery_${digest}`
	}

	private async clearTypingReaction(larkMessage: ChatLarkMessage): Promise<void> {
		const typingReaction = larkMessage.typingReaction
		const deleteMessageReaction = larkMessage.larkChannel?.deleteMessageReaction
		if (
			!typingReaction?.messageId ||
			!typingReaction.reactionId ||
			typeof deleteMessageReaction !== 'function'
		) {
			return
		}

		try {
			await deleteMessageReaction.call(
				larkMessage.larkChannel,
				larkMessage.integrationId,
				typingReaction.messageId,
				typingReaction.reactionId
			)
		} catch (error) {
			this.logger.warn(
				`Failed to delete Lark typing reaction "${typingReaction.reactionId}" before dispatch: ${
					error instanceof Error ? error.message : String(error)
				}`
			)
		}
	}

	private buildChatState(input: TLarkChatDispatchInput): Record<string, any> {
		const { larkMessage } = input
		const sourceMessageLogIds = this.normalizeInboundLogIds(input.currentInboundLogIds)
		const files = Array.isArray(input.files) && input.files.length > 0 ? input.files : undefined
		const humanInput =
			input.input !== undefined || files
				? {
						input: input.input ?? '',
						...(files ? { files } : {})
				  }
				: undefined
		return {
			...(humanInput ? { [STATE_VARIABLE_HUMAN]: humanInput } : {}),
			lark_conversation_context_current_chat_id: larkMessage.chatId ?? '',
			lark_conversation_context_current_chat_type: (larkMessage['chatType'] as string | undefined) ?? '',
			lark_conversation_context_current_sender_open_id: larkMessage.senderOpenId ?? '',
			lark_conversation_context_current_sender_name: (larkMessage['senderName'] as string | undefined) ?? '',
			lark_current_context: {
				chatId: larkMessage.chatId ?? '',
				chatType: (larkMessage['chatType'] as string | undefined) ?? '',
				senderOpenId: larkMessage.senderOpenId ?? '',
				senderName: (larkMessage['senderName'] as string | undefined) ?? '',
				...(sourceMessageLogIds.length
					? { currentInboundLogIds: sourceMessageLogIds, sourceMessageLogIds }
					: {})
			},
			...(sourceMessageLogIds.length
				? { currentInboundLogIds: sourceMessageLogIds, sourceMessageLogIds }
				: {}),
			...(larkMessage.recipientDirectoryKey
				? {
						recipientDirectoryKey: larkMessage.recipientDirectoryKey,
						lark_notify_recipient_directory_key: larkMessage.recipientDirectoryKey
					}
				: {}),
			...(input.options?.groupWindow
				? {
						lark_group_window: input.options.groupWindow
					}
				: {})
		}
	}

	private buildChatRequest(params: {
		conversationId?: string
		activeMessageId?: string
		followUpMode?: 'steer'
		clientMessageId?: string
		state: Record<string, any>
		options?: TLarkChatDispatchInput['options']
		input?: string
		files?: TLarkChatDispatchInput['files']
	}): TChatRequest {
		if (params.options?.confirm || params.options?.reject) {
			if (!params.conversationId) {
				throw new Error('Missing conversationId for Lark resume action')
			}

			return {
				action: 'resume',
				conversationId: params.conversationId,
				target: {
					...(params.activeMessageId ? { aiMessageId: params.activeMessageId } : {})
				},
				decision: {
					type: params.options.reject ? 'reject' : 'confirm'
				},
				state: params.state
			} as unknown as TChatRequest
		}
		if (params.followUpMode) {
			if (!params.conversationId) {
				throw new Error('Missing conversationId for Lark steer follow-up')
			}

			return {
				action: 'follow_up',
				conversationId: params.conversationId,
				mode: params.followUpMode,
				message: {
					...(params.clientMessageId ? { clientMessageId: params.clientMessageId } : {}),
					input: {
						input: params.input ?? '',
						...(params.files?.length ? { files: params.files } : {})
					}
				},
				target: {
					...(params.activeMessageId ? { aiMessageId: params.activeMessageId } : {})
				},
				state: params.state
			} as unknown as TChatRequest
		}

		return {
			action: 'send',
			...(params.conversationId ? { conversationId: params.conversationId } : {}),
			message: {
				...(params.clientMessageId ? { clientMessageId: params.clientMessageId } : {}),
				input: {
					input: params.input ?? '',
					...(params.files?.length ? { files: params.files } : {})
				}
			},
			state: params.state
		} as unknown as TChatRequest
	}

	private isActiveMessageInProgress(
		message: Awaited<ReturnType<LarkConversationService['getActiveMessage']>>
	): boolean {
		const status = message?.thirdPartyMessage?.status
		return status === 'thinking' || status === 'continuing'
	}

	private async waitForConversationOrCompletion(
		scopeKey: string,
		xpertId: string,
		legacyConversationUserKey?: string
	): Promise<{
		conversationId?: string
		activeMessage: Awaited<ReturnType<LarkConversationService['getActiveMessage']>>
	}> {
		const deadline = Date.now() + LARK_STEER_CONVERSATION_WAIT_MS
		while (Date.now() < deadline) {
			const [conversationId, activeMessage] = await Promise.all([
				this.conversationService.getConversation(scopeKey, xpertId, {
					legacyConversationUserKey
				}),
				this.conversationService.getActiveMessage(scopeKey, xpertId, {
					legacyConversationUserKey
				})
			])
			if (!this.isActiveMessageInProgress(activeMessage)) {
				return {
					conversationId,
					activeMessage
				}
			}
			if (conversationId) {
				return {
					conversationId,
					activeMessage
				}
			}
			await new Promise((resolve) => setTimeout(resolve, LARK_STEER_CONVERSATION_POLL_MS))
		}
		const message =
			`Active Lark response has no conversation binding after ${LARK_STEER_CONVERSATION_WAIT_MS}ms; ` +
			`follow-up was not dispatched to avoid creating a duplicate response card for scope=${scopeKey}, xpertId=${xpertId}`
		this.logger.warn(message)
		throw new Error(message)
	}

	private composeDispatchInput(input?: string, historyContext?: string): string | undefined {
		const history = typeof historyContext === 'string' ? historyContext.trim() : ''
		if (!history) {
			return input
		}
		return `${history}\n\n[本次用户消息]\n${input ?? ''}`
	}

	private normalizeInboundLogIds(ids?: string[]): string[] {
		return Array.from(
			new Set(
				(ids ?? [])
					.map((id) => (typeof id === 'string' ? id.trim() : ''))
					.filter((id): id is string => Boolean(id))
			)
		)
	}

	private mergeFiles(
		current?: TLarkChatDispatchInput['files'],
		history?: TLarkChatDispatchInput['historyFiles']
	): TLarkChatDispatchInput['files'] {
		const files = [...(current ?? []), ...(history ?? [])]
		if (!files.length) {
			return undefined
		}
		const seen = new Set<string>()
		return files.filter((file, index) => {
			const key =
				file.fileAssetId ??
				file.fileId ??
				file.storageFileId ??
				file.workspacePath ??
				file.filePath ??
				file.fileUrl ??
				file.url ??
				file.fileKey ??
				`index:${index}`
			if (seen.has(key)) {
				return false
			}
			seen.add(key)
			return true
		})
	}

	private toMessageSnapshot(message: ChatLarkMessage, text?: string): LarkChatMessageSnapshot {
		return {
			id: message.id,
			messageId: message.messageId,
			deliveryMode: message.deliveryMode,
			status: message.status,
			language: message.language,
			header: message.header,
			elements: [...(message.elements ?? [])],
			text
		}
	}

	private toMessageSnapshotFromActive(
		message: Awaited<ReturnType<LarkConversationService['getActiveMessage']>>
	): LarkChatMessageSnapshot {
		const snapshot = message?.thirdPartyMessage
		if (!snapshot?.id) {
			throw new Error('Missing active Lark response card for steer fallback')
		}
		return {
			id: snapshot.id,
			messageId: snapshot.messageId ?? message?.id,
			deliveryMode: snapshot.deliveryMode,
			status: snapshot.status,
			language: snapshot.language,
			header: snapshot.header,
			elements: [...(snapshot.elements ?? [])]
		}
	}

	private toActiveMessageCache(message: ChatLarkMessage) {
		return {
			id: message.messageId,
			thirdPartyMessage: {
				id: message.id,
				messageId: message.messageId,
				deliveryMode: message.deliveryMode,
				status: message.status as string,
				language: message.language,
				header: message.header,
				elements: [...(message.elements ?? [])]
			}
		}
	}

	private resolveStreamingConfig(
		options?: TLarkChatDispatchInput['options']
	): LarkChatCallbackContext['streaming'] | undefined {
		const enabled = options?.streamingEnabled
		const request = RequestContext.currentRequest()
		const rawHeader =
			request?.headers?.['x-lark-stream-update-window-ms'] ??
			request?.headers?.['lark-stream-update-window-ms']
		const rawValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
		if (!rawValue) {
			return enabled === undefined ? undefined : { enabled }
		}
		const parsed = parseInt(String(rawValue), 10)
		if (!Number.isFinite(parsed) || parsed <= 0) {
			return enabled === undefined ? undefined : { enabled }
		}
		return {
			...(enabled === undefined ? {} : { enabled }),
			updateWindowMs: parsed
		}
	}
}

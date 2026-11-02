import { Logger } from '@nestjs/common'
import type { PluginContext } from '@xpert-ai/plugin-sdk'
import { ChatEventEnvelope, ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/chatkit-types'
import { ChatLarkMessage, cloneStructuredElement } from '../message.js'
import type { LarkConversationService } from '../conversation.service.js'
import { resolveConversationUserKey as resolveLegacyConversationUserKey } from '../conversation-user-key.js'
import type { LarkChannelStrategy } from '../lark-channel.strategy.js'
import {
	DEFAULT_STREAM_UPDATE_WINDOW_MS,
	IntegrationLarkPluginConfig,
	MAX_STREAM_UPDATE_WINDOW_MS,
	MIN_STREAM_UPDATE_WINDOW_MS
} from '../plugin-config.js'
import type {
	LarkChatCallbackContext,
	LarkChatMessageSnapshot,
	LarkProgressRenderItem,
	LarkRenderItem
} from './lark-chat.types.js'
import type { LarkChatRunState } from './lark-chat-run-state.service.js'
import type { LarkCardElement, LarkStructuredElement } from '../types.js'
import { messageContentText, XpertAgentExecutionStatusEnum } from '../contracts-compat.js'
import type { LarkMessageHistoryService } from '../lark-message-history.service.js'

const HIDDEN_LARK_CHAT_EVENT_TYPES = ['thread_context_usage', 'conversation_title_summary'] as const
type HiddenLarkChatEventType = (typeof HIDDEN_LARK_CHAT_EVENT_TYPES)[number]
const HIDDEN_LARK_CHAT_EVENT_TYPE_SET = new Set<HiddenLarkChatEventType>(HIDDEN_LARK_CHAT_EVENT_TYPES)

/** Per-invocation renderer: all outbound operations retain the callback worker's lease. */
export class LarkCallbackDelivery {
	private readonly logger = new Logger(LarkCallbackDelivery.name)
	constructor(
		private readonly larkChannel: LarkChannelStrategy,
		private readonly conversationService: LarkConversationService,
		private readonly messageHistoryService: LarkMessageHistoryService,
		private readonly pluginContext: PluginContext<IntegrationLarkPluginConfig>,
		private readonly ensureOwned: () => Promise<void>
	) {}

	async applyStreamEvent(state: LarkChatRunState, event: unknown) {
		const context = state.context
		const streamingEnabled = this.isStreamingEnabled(context)
		let larkMessage: ChatLarkMessage | undefined
		const ensureLarkMessage = (): ChatLarkMessage => {
			if (!larkMessage) {
				larkMessage = this.createLarkMessage(context)
				const fallbackLanguage = this.resolveMessageLanguage(context)
				if (!larkMessage.language && fallbackLanguage) {
					larkMessage.language = fallbackLanguage
				}
			}
			return larkMessage
		}

		const eventPayload = (event as MessageEvent | undefined)?.data as ChatEventEnvelope
		if (!eventPayload) {
			this.logger.warn('Unrecognized handoff stream event')
			return
		}

		if (eventPayload.type === ChatMessageTypeEnum.MESSAGE) {
			const messageData = eventPayload.data
			const structuredMessageData = this.toRecord(messageData)
			const textDelta = messageContentText(messageData)
			const shouldSuppressTextDelta = this.shouldSuppressToolPayloadText(textDelta)
			this.logReplacementCharacter('callback.messageContentText', textDelta, state.sourceMessageId)
			if (textDelta && !shouldSuppressTextDelta) {
				state.responseMessageContent += textDelta
				this.logReplacementCharacter(
					'callback.responseMessageContent',
					state.responseMessageContent,
					state.sourceMessageId
				)
				this.appendStreamTextDelta(state, textDelta)
			}

			if (typeof messageData !== 'string') {
				if (structuredMessageData?.type === 'update') {
					const updatePayload = structuredMessageData.data as Record<string, unknown> | undefined
					const structuredElements = this.extractStructuredElements(updatePayload?.elements)
					if (structuredElements.length > 0) {
						this.appendStructuredElements(state, structuredElements)
					}
					if (!streamingEnabled) {
						context.message = {
							...(context.message ?? {}),
							...(typeof updatePayload?.status === 'string'
								? { status: updatePayload.status as ChatLarkMessage['status'] }
								: {}),
							...(updatePayload?.header !== undefined ? { header: updatePayload.header } : {}),
							...(typeof updatePayload?.language === 'string' ? { language: updatePayload.language } : {})
						}
						return
					}
					const message = ensureLarkMessage()
					message.renderItems = state.renderItems
					await message.update({
						status:
							typeof updatePayload?.status === 'string'
								? (updatePayload.status as ChatLarkMessage['status'])
								: undefined,
						header: updatePayload?.header,
						language: typeof updatePayload?.language === 'string' ? updatePayload.language : undefined
					})
					context.message = this.toMessageSnapshot(message, context.message?.text)
					await this.syncActiveMessageCache(context)
					return
				} else if (structuredMessageData?.type === 'component') {
					// ChatKit components are Web UI and execution payloads. Lark renders
					// assistant text, structured update elements, and explicit chat progress events.
					return
				} else if (structuredMessageData?.type !== 'text') {
					if (structuredMessageData?.type === 'reasoning') {
						// skip for now, as the rendering is not finalized and may change in the future
					} else {
						this.logger.warn(`Unprocessed chat message event payload: ${JSON.stringify(structuredMessageData)}`)
					}
				}
			}

			if (!textDelta || shouldSuppressTextDelta) {
				return
			}

			if (!streamingEnabled) {
				return
			}
			const now = Date.now()
			const updateWindowMs = this.resolveStreamUpdateWindowMs(context)
			if (this.shouldFlushStreamContent(state, now, updateWindowMs)) {
				const message = ensureLarkMessage()
				await this.flushStreamContent(state, message, now)
				context.message = this.toMessageSnapshot(message, context.message?.text)
				await this.syncActiveMessageCache(context)
			}
			return
		}

		if (eventPayload.type !== ChatMessageTypeEnum.EVENT) {
			return
		}

		const eventData = this.toRecord(eventPayload.data)
		switch (eventPayload.event) {
			case ChatMessageEventTypeEnum.ON_CONVERSATION_START: {
				const conversationUserKey = this.resolveConversationUserKey(context)
				const conversationId = this.toNonEmptyString(eventData?.id)
				if (conversationUserKey && conversationId) {
					context.conversationId = conversationId
					await this.conversationService.setConversation(conversationUserKey, context.xpertId, conversationId, {
						integrationId: context.integrationId,
						principalKey: context.principalKey,
						scopeKey: context.scopeKey,
						chatType: context.chatType,
						chatId: context.chatId,
						senderOpenId: context.senderOpenId,
						legacyConversationUserKey: context.legacyConversationUserKey
					})
					await this.messageHistoryService.updateInboundStatus(
						context.currentInboundLogIds ?? [],
						'dispatched',
						undefined,
						conversationId
					)
				}
				break
			}
			case ChatMessageEventTypeEnum.ON_MESSAGE_START: {
				const messageId = this.toNonEmptyString(eventData?.id)
				context.message = {
					...(context.message ?? {}),
					...(messageId ? { messageId } : {})
				}
				await this.syncActiveMessageCache(context)
				break
			}
			case ChatMessageEventTypeEnum.ON_CONVERSATION_END: {
				const status = this.toNonEmptyString(eventData?.status)
				const operation = eventData?.operation
				if (status === XpertAgentExecutionStatusEnum.INTERRUPTED && operation) {
					const message = ensureLarkMessage()
					await message.confirm(operation)
				} else if (status === XpertAgentExecutionStatusEnum.ERROR) {
					const message = ensureLarkMessage()
					await message.error(this.toNonEmptyString(eventData?.error) || 'Internal Error')
				}
				break
			}
			case ChatMessageEventTypeEnum.ON_AGENT_START:
			case ChatMessageEventTypeEnum.ON_AGENT_END:
			case ChatMessageEventTypeEnum.ON_MESSAGE_END: {
				break
			}
			case ChatMessageEventTypeEnum.ON_TOOL_START:
			case ChatMessageEventTypeEnum.ON_TOOL_END:
			case ChatMessageEventTypeEnum.ON_TOOL_ERROR:
			case ChatMessageEventTypeEnum.ON_TOOL_MESSAGE: {
				// Keep legacy tool lifecycle callbacks out of the user-facing card.
				break
			}
			case ChatMessageEventTypeEnum.ON_CHAT_EVENT: {
				const data = (eventPayload.data ?? {}) as Record<string, unknown>
				if (!this.upsertManagedEventElement(state, String(eventPayload.event), data)) {
					this.logger.warn(`Skip ${String(eventPayload.event)} without id`)
					break
				}

				if (!streamingEnabled) {
					break
				}

				const message = ensureLarkMessage()
				message.renderItems = state.renderItems
				await message.update()
				break
			}
			default: {
				this.logger.warn(`Unprocessed chat event type from handoff stream: ${eventPayload.event as string}`)
			}
		}

		if (larkMessage && (streamingEnabled || this.isTerminalStatus(larkMessage.status))) {
			context.message = this.toMessageSnapshot(larkMessage, context.message?.text)
			await this.syncActiveMessageCache(context)
		}
	}

	async completeRun(state: LarkChatRunState) {
		const context = state.context
		const larkMessage = this.createLarkMessage(context)
		const currentStatus = context.message?.status
		const keepTerminalState =
			currentStatus === XpertAgentExecutionStatusEnum.INTERRUPTED ||
			currentStatus === XpertAgentExecutionStatusEnum.ERROR

		if (!keepTerminalState) {
			larkMessage.renderItems = state.renderItems
			await larkMessage.update({ status: XpertAgentExecutionStatusEnum.SUCCESS })
		}

		context.message = this.toMessageSnapshot(larkMessage, context.message?.text)
		await this.syncActiveMessageCache(context)
		await this.recordRunHistory(
			state,
			keepTerminalState ? 'failed' : 'sent',
			larkMessage,
			keepTerminalState ? String(currentStatus ?? 'agent_execution_failed') : undefined
		)
	}

	async failRun(state: LarkChatRunState, error?: string) {
		const larkMessage = this.createLarkMessage(state.context)
		await larkMessage.error(error || 'Internal Error')
		state.context.message = this.toMessageSnapshot(larkMessage, state.context.message?.text)
		await this.syncActiveMessageCache(state.context)
		await this.recordRunHistory(state, 'failed', larkMessage, error || 'Internal Error')
	}

	private async recordRunHistory(
		state: LarkChatRunState,
		status: 'sent' | 'failed',
		larkMessage: ChatLarkMessage,
		error?: string
	): Promise<void> {
		const context = state.context
		if (!context.currentInboundLogIds?.length || !context.integrationId || !context.scopeKey || !context.xpertId) {
			return
		}
		await this.messageHistoryService.recordOutbound({
			integrationId: context.integrationId,
			scopeKey: context.scopeKey,
			xpertId: context.xpertId,
			tenantId: context.tenantId,
			organizationId: context.organizationId,
			runId: state.sourceMessageId,
			status,
			content: state.responseMessageContent,
			messageId: larkMessage.messageId ?? larkMessage.id,
			conversationId: context.conversationId,
			error,
			sentAt: status === 'sent' ? new Date() : undefined,
			createdById: context.userId
		})
	}

	public createLarkMessage(context: LarkChatCallbackContext): ChatLarkMessage {
		const language = this.resolveMessageLanguage(context)
		if (language && context.message?.language !== language) {
			context.message = {
				...(context.message ?? {}),
				language
			}
		}

		return new ChatLarkMessage(
			{
				tenant: null,
				organizationId: context.organizationId,
				integrationId: context.integrationId,
				connectionMode: context.connectionMode ?? 'webhook',
				userId: context.userId,
				chatId: context.chatId,
				chatType: context.chatType,
				senderOpenId: context.senderOpenId,
				principalKey: context.principalKey,
				scopeKey: context.scopeKey,
				legacyConversationUserKey: context.legacyConversationUserKey,
				recipientDirectoryKey: context.recipientDirectoryKey,
				larkChannel: {
					interactiveMessage: async (...args) => {
						await this.ensureOwned()
						return this.larkChannel.interactiveMessage(...args)
					},
					patchInteractiveMessage: async (...args) => {
						await this.ensureOwned()
						return this.larkChannel.patchInteractiveMessage(...args)
					},
					textMessage: async (...args) => {
						await this.ensureOwned()
						return this.larkChannel.textMessage(...args)
					},
					deleteMessageReaction: async (...args) => {
						await this.ensureOwned()
						return this.larkChannel.deleteMessageReaction(...args)
					}
				}
			},
			{
				id: context.message?.id,
				messageId: context.message?.messageId,
				deliveryMode: context.message?.deliveryMode,
				status: context.message?.status as ChatLarkMessage['status'],
				language,
				header: context.message?.header,
				elements: [...(context.message?.elements ?? [])],
				text: context.message?.text
			}
		)
	}

	private resolveStreamUpdateWindowMs(context: LarkChatCallbackContext): number {
		const fromContext = context.streaming?.updateWindowMs
		const fromConfig = this.pluginContext.config?.streaming?.updateWindowMs
		const candidate = fromContext ?? fromConfig ?? DEFAULT_STREAM_UPDATE_WINDOW_MS
		return Math.min(MAX_STREAM_UPDATE_WINDOW_MS, Math.max(MIN_STREAM_UPDATE_WINDOW_MS, candidate))
	}

	private isStreamingEnabled(context: LarkChatCallbackContext): boolean {
		return context.streaming?.enabled !== false
	}

	private isTerminalStatus(status?: string | null): boolean {
		return (
			status === 'interrupted' ||
			status === XpertAgentExecutionStatusEnum.ERROR ||
			status === XpertAgentExecutionStatusEnum.SUCCESS
		)
	}

	private shouldFlushStreamContent(state: LarkChatRunState, now: number, updateWindowMs: number): boolean {
		if (!state.responseMessageContent) {
			return false
		}
		if (state.responseMessageContent.length <= state.lastFlushedLength) {
			return false
		}
		return now - state.lastFlushAt >= updateWindowMs
	}

	private appendStreamTextDelta(state: LarkChatRunState, textDelta: string): void {
		if (!textDelta) {
			return
		}

		const items = state.renderItems
		const last = items[items.length - 1]
		if (last?.kind === 'stream_text') {
			last.text = `${last.text}${textDelta}`
		} else {
			items.push({
				kind: 'stream_text',
				text: textDelta
			})
		}
	}

	private appendStructuredElements(state: LarkChatRunState, elements: readonly LarkStructuredElement[]): void {
		for (const element of elements) {
			state.renderItems.push({
				kind: 'structured',
				element: cloneStructuredElement(element)
			})
		}
	}

	private async flushStreamContent(state: LarkChatRunState, larkMessage: ChatLarkMessage, now: number) {
		this.logger.debug(
			`Flushing stream content for source message "${state.sourceMessageId}", content length: ${state.responseMessageContent.length}`
		)
		larkMessage.renderItems = state.renderItems
		await larkMessage.update()
		state.lastFlushAt = now
		state.lastFlushedLength = state.responseMessageContent.length
	}

	private upsertManagedEventElement(
		state: LarkChatRunState,
		eventType: string,
		data: Record<string, unknown>
	): boolean {
		const item = this.buildManagedRenderItem(state, eventType, data)
		if (!item) {
			return false
		}

		const items = state.renderItems
		const existingIndex = this.findManagedRenderItemIndex(items, item.id)
		if (existingIndex >= 0) {
			items[existingIndex] = item
		} else {
			items.push(item)
		}
		return true
	}

	private buildManagedRenderItem(
		state: LarkChatRunState,
		eventType: string,
		data: Record<string, unknown>
	): LarkProgressRenderItem | null {
		if (eventType === ChatMessageEventTypeEnum.ON_CHAT_EVENT) {
			const chatEventType = this.toNonEmptyString(data?.type)
			if (this.isHiddenLarkChatEventType(chatEventType)) {
				return null
			}
			this.logger.debug(`Received chat event: ${chatEventType ?? 'unknown'}: ${JSON.stringify(data)}`)
		}

		const id = this.resolveManagedEventId(data) ?? this.buildSyntheticManagedEventId(state, eventType, data)
		if (!id) {
			return null
		}

		const existing = this.findManagedRenderItemById(state.renderItems, id)

		return {
			kind: 'progress',
			id,
			title:
				this.toNonEmptyString(data?.title) ??
				(existing?.kind === 'progress' ? existing.title : null) ??
				(this.toNonEmptyString(data?.status) === 'running' ? '正在处理' : '执行过程'),
			detail: this.toNonEmptyString(data?.message) ?? (existing?.kind === 'progress' ? existing.detail : null) ?? null,
			status: this.toNonEmptyString(data?.status) ?? (existing?.kind === 'progress' ? existing.status : null) ?? null
		}
	}

	private resolveManagedEventId(data: Record<string, unknown>): string | null {
		const directId =
			this.toNonEmptyString(data?.id) ??
			this.toNonEmptyString(data?.tool_call_id) ??
			this.toNonEmptyString(data?.toolCallId)
		if (directId) {
			return directId
		}

		const toolCall = this.toRecord(data?.toolCall)
		const toolCallId = this.toNonEmptyString(toolCall?.id)
		if (toolCallId) {
			return toolCallId
		}

		const output = this.toRecord(data?.output)
		const outputToolCallId = this.toNonEmptyString(output?.tool_call_id) ?? this.toNonEmptyString(output?.toolCallId)
		if (outputToolCallId) {
			return outputToolCallId
		}

		return null
	}

	private buildSyntheticManagedEventId(
		state: LarkChatRunState,
		eventType: string,
		data: Record<string, unknown>
	): string | null {
		const seed = [
			state.sourceMessageId,
			eventType,
			this.resolveManagedEventTool(data),
			this.toNonEmptyString(data?.title),
			this.toNonEmptyString(data?.status),
			this.toNonEmptyString(data?.type)
		]
			.filter((value): value is string => Boolean(value))
			.join(':')

		if (!seed) {
			return null
		}

		return `managed:${seed.replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 160)}`
	}

	private resolveManagedEventTool(data: Record<string, unknown>): string | null {
		const directTool = this.toNonEmptyString(data?.tool) ?? this.toNonEmptyString(data?.name)
		if (directTool) {
			return directTool
		}

		const toolCall = this.toRecord(data?.toolCall)
		const toolCallName = this.toNonEmptyString(toolCall?.name)
		if (toolCallName) {
			return toolCallName
		}

		return null
	}

	private parseJsonLikeValue(value: unknown): unknown {
		if (typeof value !== 'string') {
			return value
		}

		const normalized = value.trim()
		if (!normalized) {
			return value
		}

		try {
			return JSON.parse(normalized)
		} catch {
			return value
		}
	}

	private isHiddenLarkChatEventType(value: unknown): value is HiddenLarkChatEventType {
		const type = this.toNonEmptyString(value)
		return Boolean(type && HIDDEN_LARK_CHAT_EVENT_TYPE_SET.has(type as HiddenLarkChatEventType))
	}

	private shouldSuppressToolPayloadText(value: string | null | undefined, tool?: string | null): boolean {
		if (!value) {
			return false
		}

		const normalized = value.trim()
		if (!normalized || (!normalized.startsWith('{') && !normalized.startsWith('['))) {
			return false
		}

		if (tool?.startsWith('lark_')) {
			return true
		}

		const parsed = this.parseJsonLikeValue(normalized)
		const record = this.toRecord(parsed)
		const data = this.toRecord(record?.data)
		const effective = data ?? record
		if (!effective) {
			return false
		}

		if (this.toNonEmptyString(record?.tool) || this.toNonEmptyString(effective?.tool)) {
			return true
		}

		return (
			typeof effective?.successCount === 'number' ||
			typeof effective?.failureCount === 'number' ||
			typeof effective?.hasMore === 'boolean' ||
			Array.isArray(effective?.results) ||
			Array.isArray(effective?.items) ||
			Boolean(effective?.item && typeof effective.item === 'object')
		)
	}

	private findManagedRenderItemById(items: readonly LarkRenderItem[], id: string) {
		return items.find((item) => {
			if (item.kind === 'progress' || item.kind === 'tool_trace' || item.kind === 'event') {
				return item.id === id
			}
			return false
		})
	}

	private findManagedRenderItemIndex(items: readonly LarkRenderItem[], id: string): number {
		return items.findIndex((item) => {
			if (item.kind === 'progress' || item.kind === 'tool_trace' || item.kind === 'event') {
				return item.id === id
			}
			return false
		})
	}

	private logReplacementCharacter(stage: string, value: string | null | undefined, sourceMessageId: string): void {
		if (!value || !value.includes('\uFFFD')) {
			return
		}

		const preview = value.length > 320 ? `${value.slice(0, 320)}...(truncated)` : value
		this.logger.warn(
			`[encoding] replacement char detected at lark.${stage}: ${JSON.stringify({
				sourceMessageId,
				preview
			})}`
		)
	}

	private extractStructuredElements(value: unknown): LarkStructuredElement[] {
		if (!Array.isArray(value)) {
			return []
		}
		return value.filter((item): item is LarkStructuredElement => this.isLarkCardElement(item))
	}

	private isLarkCardElement(value: unknown): value is LarkCardElement {
		return Boolean(
			value && typeof value === 'object' && 'tag' in value && typeof (value as { tag?: unknown }).tag === 'string'
		)
	}

	private toNonEmptyString(value: unknown): string | null {
		if (typeof value !== 'string') {
			return null
		}
		const text = value.trim()
		return text.length ? text : null
	}
	private toRecord(value: unknown): Record<string, unknown> | null {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return null
		}
		return value as Record<string, unknown>
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

	private async syncActiveMessageCache(context: LarkChatCallbackContext): Promise<void> {
		const conversationScopeKey = this.resolveConversationUserKey(context)
		if (!conversationScopeKey || !context?.xpertId) {
			return
		}

		await this.ensureOwned()
		const message = context.message ?? {}
		const language = this.resolveMessageLanguage(context)
		await this.conversationService.setActiveMessage(
			conversationScopeKey,
			context.xpertId,
			{
				id: message.messageId,
				thirdPartyMessage: {
					id: message.id,
					messageId: message.messageId,
					deliveryMode: message.deliveryMode,
					status: message.status,
					language,
					header: message.header,
					elements: [...(message.elements ?? [])]
				}
			},
			{
				legacyConversationUserKey: context.legacyConversationUserKey
			}
		)
	}

	private resolveConversationUserKey(context: LarkChatCallbackContext): string | null {
		return (
			this.toNonEmptyString(context.scopeKey) ??
			resolveLegacyConversationUserKey({
				senderOpenId: context?.senderOpenId,
				fallbackUserId: context?.userId
			})
		)
	}

	private resolveMessageLanguage(context: LarkChatCallbackContext): string | undefined {
		const snapshotLanguage = context.message?.language
		if (typeof snapshotLanguage === 'string' && snapshotLanguage.length > 0) {
			return snapshotLanguage
		}

		const preferLanguage = (context as { preferLanguage?: unknown }).preferLanguage
		if (typeof preferLanguage === 'string' && preferLanguage.length > 0) {
			return preferLanguage
		}

		const requestLanguage = (context as { requestContext?: { headers?: Record<string, unknown> } }).requestContext
			?.headers?.language
		if (typeof requestLanguage === 'string' && requestLanguage.length > 0) {
			return requestLanguage
		}
		if (Array.isArray(requestLanguage)) {
			const first = requestLanguage.find((item) => typeof item === 'string' && item.length > 0)
			if (typeof first === 'string') {
				return first
			}
		}

		return undefined
	}
}

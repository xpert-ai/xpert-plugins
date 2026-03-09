import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import {
	HandoffMessage,
	HandoffProcessorStrategy,
	IHandoffProcessor,
	type PluginContext,
	ProcessContext,
	ProcessResult,
} from '@xpert-ai/plugin-sdk'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/chatkit-types'
import { ChatDingTalkMessage, cloneStructuredElement } from '../message.js'
import { DingTalkConversationService } from '../conversation.service.js'
import { resolveConversationUserKey as resolveDingTalkConversationUserKey } from '../conversation-user-key.js'
import { DingTalkChannelStrategy } from '../dingtalk-channel.strategy.js'
import {
	DEFAULT_STREAM_UPDATE_WINDOW_MS,
	DEFAULT_FIRST_FLUSH_MIN_CHARS,
	MAX_FIRST_FLUSH_MIN_CHARS,
	IntegrationDingTalkPluginConfig,
	MAX_STREAM_UPDATE_WINDOW_MS,
	MIN_FIRST_FLUSH_MIN_CHARS,
	MIN_STREAM_UPDATE_WINDOW_MS
} from '../plugin-config.js'
import { DINGTALK_PLUGIN_CONTEXT } from '../tokens.js'
import {
	DINGTALK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE,
	DingTalkChatCallbackContext,
	DingTalkChatMessageSnapshot,
	DingTalkChatStreamCallbackPayload,
	DingTalkEventRenderItem,
} from './dingtalk-chat.types.js'
import { DingTalkChatRunState, DingTalkChatRunStateService } from './dingtalk-chat-run-state.service.js'
import { DingTalkCardElement, DingTalkStructuredElement } from '../types.js'
import { messageContentText, XpertAgentExecutionStatusEnum } from '@metad/contracts'

/**
 * Callback processor for DingTalk stream events.
 *
 * End-to-end path:
 * server-ai system dispatch processor -> callback queue message -> this processor.
 *
 * Responsibilities:
 * - restore run state per source message id
 * - reorder out-of-order callbacks by sequence
 * - apply stream/event callbacks to DingTalk message
 * - finalize run and clear run state on completion
 */
@Injectable()
@HandoffProcessorStrategy(DINGTALK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE, {
	types: [DINGTALK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE],
	policy: {
		lane: 'main'
	}
})
export class DingTalkChatStreamCallbackProcessor implements IHandoffProcessor<DingTalkChatStreamCallbackPayload> {
	private readonly logger = new Logger(DingTalkChatStreamCallbackProcessor.name)
	private readonly sourceLocks = new Map<string, Promise<unknown>>()

	@Inject(forwardRef(() => DingTalkConversationService))
	private readonly conversationService: DingTalkConversationService
	
	constructor(
		private readonly dingtalkChannel: DingTalkChannelStrategy,
		private readonly runStateService: DingTalkChatRunStateService,
		@Inject(DINGTALK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext<IntegrationDingTalkPluginConfig>
	) {}

	async process(
		message: HandoffMessage<DingTalkChatStreamCallbackPayload>,
		_ctx: ProcessContext
	): Promise<ProcessResult> {
		const payload = message.payload
		if (!payload?.sourceMessageId) {
			return {
				status: 'dead',
				reason: 'Missing sourceMessageId in DingTalk callback payload'
			}
		}
		if (!payload?.sequence || payload.sequence <= 0) {
			return {
				status: 'dead',
				reason: 'Missing sequence in DingTalk callback payload'
			}
		}

		return this.runWithSourceLock(payload.sourceMessageId, async () => {
			let state = await this.runStateService.get(payload.sourceMessageId)
			if (!state) {
				if (!payload.context) {
					return {
						status: 'dead',
						reason: `Run state not found for source message "${payload.sourceMessageId}"`
					}
				}
				state = this.createRunState(payload.sourceMessageId, payload.context)
			}
			state = this.ensureRunStateDefaults(state)

			if (payload.sequence < state.nextSequence) {
				return { status: 'ok' }
			}

			if (!state.pendingEvents[String(payload.sequence)]) {
				state.pendingEvents[String(payload.sequence)] = payload
			}

			const completed = await this.processPendingEvents(state)
			if (completed) {
				await this.runStateService.clear(state.sourceMessageId)
			} else {
				await this.runStateService.save(state)
			}

			return { status: 'ok' }
		})
	}

	private async runWithSourceLock(
		sourceMessageId: string,
		task: () => Promise<ProcessResult>
	): Promise<ProcessResult> {
		const previous = this.sourceLocks.get(sourceMessageId) ?? Promise.resolve()
		const current = previous
			.catch(() => undefined)
			.then(task)
		this.sourceLocks.set(sourceMessageId, current)

		try {
			return await current
		} finally {
			if (this.sourceLocks.get(sourceMessageId) === current) {
				this.sourceLocks.delete(sourceMessageId)
			}
		}
	}

	/**
	 * Flush pending callbacks strictly by nextSequence.
	 *
	 * We process only when the expected sequence exists; out-of-order messages
	 * stay buffered in pendingEvents until earlier sequence arrives.
	 */
	private async processPendingEvents(state: DingTalkChatRunState): Promise<boolean> {
		this.logger.debug(
			`Processing pending events for source message "${state.sourceMessageId}": nextSequence=${state.nextSequence}, pendingCount=${Object.keys(state.pendingEvents).length}`
		)
		
		while (state.pendingEvents[String(state.nextSequence)]) {
			const payload = state.pendingEvents[String(state.nextSequence)]
			delete state.pendingEvents[String(state.nextSequence)]
			this.logger.debug(
				`Applying callback payload for source message "${state.sourceMessageId}": sequence=${payload.sequence}, kind=${payload.kind}`
			)

			switch (payload.kind) {
				case 'stream': {
					await this.applyStreamEvent(state, payload.event)
					break
				}
				case 'complete': {
					await this.completeRun(state)
					return true
				}
				case 'error': {
					await this.failRun(state, payload.error)
					return true
				}
				default: {
					this.logger.warn(
						`Unprocessed DingTalk callback kind "${(payload as { kind?: unknown }).kind}" in source message "${state.sourceMessageId}"`
					)
				}
			}

			state.nextSequence += 1
		}

		return false
	}

	/**
	 * Apply one callback stream event.
	 *
	 * MESSAGE:
	 * - append content into response buffer
	 * - keep compatibility with structured update payload
	 * - flush buffered text to DingTalk by configurable time window
	 *
	 * EVENT:
	 * - apply conversation/message lifecycle events
	 */
	private async applyStreamEvent(state: DingTalkChatRunState, event: unknown) {
		const context = state.context
		let dingtalkMessage: ChatDingTalkMessage | undefined
		const ensureDingTalkMessage = (): ChatDingTalkMessage => {
			if (!dingtalkMessage) {
				dingtalkMessage = this.createDingTalkMessage(context)
				const fallbackLanguage = this.resolveMessageLanguage(context)
				if (!dingtalkMessage.language && fallbackLanguage) {
					dingtalkMessage.language = fallbackLanguage
				}
			}
			return dingtalkMessage
		}

		const eventPayload = (event as MessageEvent | undefined)?.data
		if (!eventPayload) {
			this.logger.warn('Unrecognized handoff stream event')
			return
		}
		this.logger.debug(
			`Applying stream event for source message "${state.sourceMessageId}": type=${eventPayload.type}`
		)

		if (eventPayload.type === ChatMessageTypeEnum.MESSAGE) {
			const rawTextDelta = messageContentText(eventPayload.data)
			const textDelta = this.normalizeStreamText(rawTextDelta)

			if (textDelta) {
				state.responseMessageContent += textDelta
				this.appendStreamTextDelta(state, textDelta)
			}

			if (typeof eventPayload.data !== 'string') {
				if (eventPayload.data?.type === 'update') {
					const message = ensureDingTalkMessage()
					const updatePayload = eventPayload.data.data as Record<string, unknown> | undefined
					const structuredElements = this.extractStructuredElements(updatePayload?.elements)
					if (structuredElements.length > 0) {
						this.appendStructuredElements(state, structuredElements)
					}
					message.renderItems = state.renderItems
					await message.update({
						status:
							typeof updatePayload?.status === 'string'
								? (updatePayload.status as ChatDingTalkMessage['status'])
								: undefined,
						header: updatePayload?.header,
						language: typeof updatePayload?.language === 'string' ? updatePayload.language : undefined
					})
					context.message = this.toMessageSnapshot(message, context.message?.text)
					await this.syncActiveMessageCache(context)
					return
				} else if (eventPayload.data?.type !== 'text') {
					this.logger.warn('Unprocessed chat message event payload')
				}
			}

			if (!textDelta) {
				return
			}

			this.logger.debug(`Appended stream content for source message "${state.sourceMessageId}", current buffered length: ${state.responseMessageContent.length}`)
			const now = Date.now()
			const updateWindowMs = this.resolveStreamUpdateWindowMs(context)
			const firstFlushMinChars = this.resolveFirstFlushMinChars(context)
			if (
				this.shouldFlushStreamContent(
					state,
					now,
					updateWindowMs,
					firstFlushMinChars,
					Boolean(context.message?.id)
				)
			) {
				const message = ensureDingTalkMessage()
				await this.flushStreamContent(state, message, now)
				context.message = this.toMessageSnapshot(message, context.message?.text)
				await this.syncActiveMessageCache(context)
			}
			return
		}

		if (eventPayload.type !== ChatMessageTypeEnum.EVENT) {
			return
		}

		switch (eventPayload.event) {
			case ChatMessageEventTypeEnum.ON_CONVERSATION_START: {
				const conversationUserKey = this.resolveConversationUserKey(context)
				if (conversationUserKey) {
					await this.conversationService.setConversation(
						conversationUserKey,
						context.xpertId,
						eventPayload.data.id
					)
				}
				break
			}
			case ChatMessageEventTypeEnum.ON_MESSAGE_START: {
				context.message = {
					...(context.message ?? {}),
					messageId: eventPayload.data.id
				}
				await this.syncActiveMessageCache(context)
				break
			}
			case ChatMessageEventTypeEnum.ON_CONVERSATION_END: {
				if (
					eventPayload.data.status === XpertAgentExecutionStatusEnum.INTERRUPTED &&
					eventPayload.data.operation
				) {
					const message = ensureDingTalkMessage()
					await message.confirm(eventPayload.data.operation)
				} else if (eventPayload.data.status === XpertAgentExecutionStatusEnum.ERROR) {
					const message = ensureDingTalkMessage()
					await message.error(eventPayload.data.error || 'Internal Error')
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
			case ChatMessageEventTypeEnum.ON_TOOL_MESSAGE:
			case ChatMessageEventTypeEnum.ON_CHAT_EVENT: {
				const data = (eventPayload.data ?? {}) as Record<string, unknown>
				const toolName = this.resolveManagedEventTool(data)
				if (this.shouldSkipManagedToolEventRender(toolName)) {
					break
				}

				if (!this.upsertManagedEventElement(state, String(eventPayload.event), data)) {
					this.logger.warn(`Skip ${String(eventPayload.event)} without id`)
					break
				}

				const message = ensureDingTalkMessage()
				message.renderItems = state.renderItems
				await message.update()
				break
			}
			default: {
				this.logger.warn(
					`Unprocessed chat event type from handoff stream: ${eventPayload.event as string}`
				)
			}
		}

		if (dingtalkMessage) {
			context.message = this.toMessageSnapshot(dingtalkMessage, context.message?.text)
			await this.syncActiveMessageCache(context)
		}
	}

	private async completeRun(state: DingTalkChatRunState) {
		const context = state.context
		const dingtalkMessage = this.createDingTalkMessage(context)
		const currentStatus = context.message?.status
		const keepTerminalState =
			currentStatus === XpertAgentExecutionStatusEnum.INTERRUPTED ||
			currentStatus === XpertAgentExecutionStatusEnum.ERROR

		if (!keepTerminalState) {
			if (state.renderItems.length > 0 || context.reject || dingtalkMessage.elements.length > 0) {
				dingtalkMessage.renderItems = state.renderItems
				await dingtalkMessage.update({
					status: XpertAgentExecutionStatusEnum.SUCCESS
				})
			}
		}

		context.message = this.toMessageSnapshot(dingtalkMessage, context.message?.text)
		await this.syncActiveMessageCache(context)
	}

	private async failRun(state: DingTalkChatRunState, error?: string) {
		const dingtalkMessage = this.createDingTalkMessage(state.context)
		await dingtalkMessage.error(error || 'Internal Error')
		state.context.message = this.toMessageSnapshot(dingtalkMessage, state.context.message?.text)
		await this.syncActiveMessageCache(state.context)
	}

	private createDingTalkMessage(context: DingTalkChatCallbackContext): ChatDingTalkMessage {
		const language = this.resolveMessageLanguage(context)
		if (language && context.message?.language !== language) {
			context.message = {
				...(context.message ?? {}),
				language
			}
		}

			return new ChatDingTalkMessage(
				{
					tenant: null,
					organizationId: context.organizationId,
					integrationId: context.integrationId,
					userId: context.userId,
					chatId: context.chatId,
					senderOpenId: context.senderOpenId,
					robotCode: context.robotCode,
					sessionWebhook: context.sessionWebhook,
					dingtalkChannel: this.dingtalkChannel
				},
				{
					id: context.message?.id,
					messageId: context.message?.messageId,
					status: context.message?.status as any,
					language,
					header: context.message?.header,
					elements: [...(context.message?.elements ?? [])],
					text: context.message?.text,
					degradedWithoutMessageId: context.message?.degradedWithoutMessageId === true,
					terminalDelivered: context.message?.terminalDelivered === true
				}
			)
		}

	private createRunState(sourceMessageId: string, context: DingTalkChatCallbackContext): DingTalkChatRunState {
		const renderItems = Array.isArray(context?.message?.renderItems)
			? context.message.renderItems
			: (context?.message?.elements ?? []).map((element) => ({
					kind: 'structured' as const,
					element: cloneStructuredElement(element)
			  }))

		return {
			sourceMessageId,
			nextSequence: 1,
			responseMessageContent: '',
			context,
			pendingEvents: {},
			lastFlushAt: 0,
			lastFlushedLength: 0,
			renderItems
		}
	}

	private ensureRunStateDefaults(state: DingTalkChatRunState): DingTalkChatRunState {
		return {
			...state,
			pendingEvents: state.pendingEvents ?? {},
			lastFlushAt: state.lastFlushAt ?? 0,
			lastFlushedLength: state.lastFlushedLength ?? 0
		}
	}

	private resolveStreamUpdateWindowMs(context: DingTalkChatCallbackContext): number {
		const fromContext = context.streaming?.updateWindowMs
		const fromConfig = this.pluginContext.config?.streaming?.updateWindowMs
		const candidate = fromContext ?? fromConfig ?? DEFAULT_STREAM_UPDATE_WINDOW_MS
		return Math.min(
			MAX_STREAM_UPDATE_WINDOW_MS,
			Math.max(MIN_STREAM_UPDATE_WINDOW_MS, candidate)
		)
	}

	private resolveFirstFlushMinChars(context: DingTalkChatCallbackContext): number {
		const fromContext = context.streaming?.firstFlushMinChars
		const fromConfig = this.pluginContext.config?.streaming?.firstFlushMinChars
		const candidate = fromContext ?? fromConfig ?? DEFAULT_FIRST_FLUSH_MIN_CHARS
		return Math.min(
			MAX_FIRST_FLUSH_MIN_CHARS,
			Math.max(MIN_FIRST_FLUSH_MIN_CHARS, candidate)
		)
	}

	private shouldFlushStreamContent(
		state: DingTalkChatRunState,
		now: number,
		updateWindowMs: number,
		firstFlushMinChars: number,
		hasMessageId: boolean
	): boolean {
		if (!state.responseMessageContent) {
			return false
		}
		if (state.responseMessageContent.length <= state.lastFlushedLength) {
			return false
		}
		if (!hasMessageId) {
			const text = state.responseMessageContent
			if (text.length < firstFlushMinChars) {
				return false
			}
		}
		return now - state.lastFlushAt >= updateWindowMs
	}

	private appendStreamTextDelta(state: DingTalkChatRunState, textDelta: string): void {
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

	private appendStructuredElements(
		state: DingTalkChatRunState,
		elements: readonly DingTalkStructuredElement[]
	): void {
		for (const element of elements) {
			state.renderItems.push({
				kind: 'structured',
				element: cloneStructuredElement(element)
			})
		}
	}

	private async flushStreamContent(
		state: DingTalkChatRunState,
		dingtalkMessage: ChatDingTalkMessage,
		now: number
	) {
		this.logger.debug(`Flushing stream content for source message "${state.sourceMessageId}", content length: ${state.responseMessageContent.length}`)
		dingtalkMessage.renderItems = state.renderItems
		await dingtalkMessage.update()
		state.lastFlushAt = now
		state.lastFlushedLength = state.responseMessageContent.length
	}

	private upsertManagedEventElement(
		state: DingTalkChatRunState,
		eventType: string,
		data: Record<string, unknown>
	): boolean {
		const id = this.resolveManagedEventId(data)
		if (!id) {
			return false
		}

		const items = state.renderItems
		const eventItem = this.buildManagedEventItem(id, eventType, data)
		const existingIndex = items.findIndex(
			(item): item is DingTalkEventRenderItem => item.kind === 'event' && item.id === id
		)
		if (existingIndex >= 0) {
			items[existingIndex] = eventItem
		} else {
			items.push(eventItem)
		}
		return true
	}

	private buildManagedEventItem(
		id: string,
		eventType: string,
		data: Record<string, unknown>
	): DingTalkEventRenderItem {
		const errorData = this.toRecord(data?.error)
		return {
			kind: 'event',
			id,
			eventType,
			tool: this.resolveManagedEventTool(data),
			title: this.toNonEmptyString(data?.title),
			message: this.toNonEmptyString(data?.message),
			status: this.toNonEmptyString(data?.status),
			error: this.toNonEmptyString(data?.error) ?? this.toNonEmptyString(errorData?.message)
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
		const outputToolCallId =
			this.toNonEmptyString(output?.tool_call_id) ?? this.toNonEmptyString(output?.toolCallId)
		if (outputToolCallId) {
			return outputToolCallId
		}

		return null
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

	private extractStructuredElements(value: unknown): DingTalkStructuredElement[] {
		if (!Array.isArray(value)) {
			return []
		}
		return value.filter((item): item is DingTalkStructuredElement => this.isDingTalkCardElement(item))
	}

	private isDingTalkCardElement(value: unknown): value is DingTalkCardElement {
		return Boolean(
			value &&
				typeof value === 'object' &&
				'tag' in value &&
				typeof (value as { tag?: unknown }).tag === 'string'
		)
	}

	private toNonEmptyString(value: unknown): string | null {
		if (typeof value !== 'string') {
			return null
		}
		const text = value.trim()
		return text.length ? text : null
	}

	private normalizeStreamText(value: string | null | undefined): string {
		if (typeof value !== 'string') {
			return ''
		}

		const normalized = value
			.replace(/\r/g, '')
			.split('\n')
			.filter((line) => !this.isPlaceholderText(line))
			.join('\n')
			.trim()
		if (!normalized) {
			return ''
		}
		return normalized
	}

	private shouldSkipManagedToolEventRender(toolName?: string | null): boolean {
		if (!toolName) {
			return false
		}

		return this.isDingTalkNotifyTool(toolName)
	}

	private isDingTalkNotifyTool(toolName: string): boolean {
		const normalized = toolName.trim().toLowerCase()
		return (
			normalized === 'dingtalk_send_text_notification' ||
			normalized === 'dingtalk_send_rich_notification' ||
			normalized === 'dingtalk_update_message' ||
			normalized === 'dingtalk_recall_message'
		)
	}

	private isPlaceholderText(value: string): boolean {
		return value.trim().toLowerCase() === '#text#'
	}

	private toRecord(value: unknown): Record<string, unknown> | null {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return null
		}
		return value as Record<string, unknown>
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

	private async syncActiveMessageCache(context: DingTalkChatCallbackContext): Promise<void> {
		const conversationUserKey = this.resolveConversationUserKey(context)
		if (!conversationUserKey || !context?.xpertId) {
			return
		}

		const message = context.message ?? {}
		const language = this.resolveMessageLanguage(context)
		await this.conversationService.setActiveMessage(conversationUserKey, context.xpertId, {
			id: message.messageId,
			thirdPartyMessage: {
				id: message.id,
				messageId: message.messageId,
				status: message.status,
				language,
				header: message.header,
				elements: [...(message.elements ?? [])]
			}
		})
	}

	private resolveConversationUserKey(context: DingTalkChatCallbackContext): string | null {
		return resolveDingTalkConversationUserKey({
			integrationId: context?.integrationId,
			conversationId: context?.chatId,
			senderOpenId: context?.senderOpenId,
			fallbackUserId: context?.userId
		})
	}

	private resolveMessageLanguage(context: DingTalkChatCallbackContext): string | undefined {
		const snapshotLanguage = context.message?.language
		if (typeof snapshotLanguage === 'string' && snapshotLanguage.length > 0) {
			return snapshotLanguage
		}

		const preferLanguage = (context as { preferLanguage?: unknown }).preferLanguage
		if (typeof preferLanguage === 'string' && preferLanguage.length > 0) {
			return preferLanguage
		}

		const requestLanguage = (context as { requestContext?: { headers?: Record<string, unknown> } })
			.requestContext?.headers?.language
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

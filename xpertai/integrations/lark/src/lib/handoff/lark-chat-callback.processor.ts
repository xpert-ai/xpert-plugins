import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import {
	HandoffMessage,
	HandoffProcessorStrategy,
	IHandoffProcessor,
	type PluginContext,
	ProcessContext,
	ProcessResult,
} from '@xpert-ai/plugin-sdk'
import { ChatEventEnvelope, ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/chatkit-types'
import { ChatLarkMessage, cloneStructuredElement } from '../message.js'
import { LarkConversationService } from '../conversation.service.js'
import { resolveConversationUserKey as resolveLegacyConversationUserKey } from '../conversation-user-key.js'
import { LarkChannelStrategy } from '../lark-channel.strategy.js'
import {
	DEFAULT_STREAM_UPDATE_WINDOW_MS,
	IntegrationLarkPluginConfig,
	MAX_STREAM_UPDATE_WINDOW_MS,
	MIN_STREAM_UPDATE_WINDOW_MS
} from '../plugin-config.js'
import { LARK_PLUGIN_CONTEXT } from '../tokens.js'
import {
	LARK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE,
	LarkChatCallbackContext,
	LarkChatMessageSnapshot,
	LarkChatStreamCallbackPayload,
	LarkProgressRenderItem,
	LarkRenderItem,
	LarkToolTraceRenderItem,
} from './lark-chat.types.js'
import { LarkChatRunState, LarkChatRunStateService } from './lark-chat-run-state.service.js'
import { LarkCardElement, LarkStructuredElement } from '../types.js'
import { messageContentText, XpertAgentExecutionStatusEnum } from '../contracts-compat.js'

const HIDDEN_LARK_CHAT_EVENT_TYPES = [
	'thread_context_usage',
	'conversation_title_summary'
] as const

type HiddenLarkChatEventType = (typeof HIDDEN_LARK_CHAT_EVENT_TYPES)[number]
const HIDDEN_LARK_CHAT_EVENT_TYPE_SET = new Set<HiddenLarkChatEventType>(HIDDEN_LARK_CHAT_EVENT_TYPES)

/**
 * Callback processor for Lark stream events.
 *
 * End-to-end path:
 * server-ai system dispatch processor -> callback queue message -> this processor.
 *
 * Responsibilities:
 * - restore run state per source message id
 * - reorder out-of-order callbacks by sequence
 * - apply stream/event callbacks to Lark message
 * - finalize run and clear run state on completion
 */
@Injectable()
@HandoffProcessorStrategy(LARK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE, {
	types: [LARK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE],
	policy: {
		lane: 'main'
	}
})
export class LarkChatStreamCallbackProcessor implements IHandoffProcessor<LarkChatStreamCallbackPayload> {
	private readonly logger = new Logger(LarkChatStreamCallbackProcessor.name)
	private readonly sourceLocks = new Map<string, Promise<unknown>>()

	@Inject(forwardRef(() => LarkConversationService))
	private readonly conversationService: LarkConversationService
	
	constructor(
		private readonly larkChannel: LarkChannelStrategy,
		private readonly runStateService: LarkChatRunStateService,
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext<IntegrationLarkPluginConfig>
	) {}

	async process(
		message: HandoffMessage<LarkChatStreamCallbackPayload>,
		_ctx: ProcessContext
	): Promise<ProcessResult> {
		const payload = message.payload
		if (!payload?.sourceMessageId) {
			return {
				status: 'dead',
				reason: 'Missing sourceMessageId in Lark callback payload'
			}
		}
		if (!payload?.sequence || payload.sequence <= 0) {
			return {
				status: 'dead',
				reason: 'Missing sequence in Lark callback payload'
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
	private async processPendingEvents(state: LarkChatRunState): Promise<boolean> {
		while (state.pendingEvents[String(state.nextSequence)]) {
			const payload = state.pendingEvents[String(state.nextSequence)]
			delete state.pendingEvents[String(state.nextSequence)]

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
						`Unprocessed Lark callback kind "${(payload as { kind?: unknown }).kind}" in source message "${state.sourceMessageId}"`
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
	 * - flush buffered text to Lark by configurable time window
	 *
	 * EVENT:
	 * - apply conversation/message lifecycle events
	 */
	private async applyStreamEvent(state: LarkChatRunState, event: unknown) {
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
							...(typeof updatePayload?.language === 'string'
								? { language: updatePayload.language }
								: {})
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
					if (this.upsertComponentRenderItem(state, structuredMessageData)) {
						if (!streamingEnabled) {
							return
						}
						const message = ensureLarkMessage()
						message.renderItems = state.renderItems
						await message.update()
						context.message = this.toMessageSnapshot(message, context.message?.text)
						await this.syncActiveMessageCache(context)
					}
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
					await this.conversationService.setConversation(
						conversationUserKey,
						context.xpertId,
						conversationId,
						{
							integrationId: context.integrationId,
							principalKey: context.principalKey,
							scopeKey: context.scopeKey,
							chatType: context.chatType,
							chatId: context.chatId,
							senderOpenId: context.senderOpenId,
							legacyConversationUserKey: context.legacyConversationUserKey
						}
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
				if (
					status === XpertAgentExecutionStatusEnum.INTERRUPTED &&
					operation
				) {
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
			case ChatMessageEventTypeEnum.ON_TOOL_MESSAGE:
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
				this.logger.warn(
					`Unprocessed chat event type from handoff stream: ${eventPayload.event as string}`
				)
			}
		}

		if (larkMessage && (streamingEnabled || this.isTerminalStatus(context.message?.status))) {
			context.message = this.toMessageSnapshot(larkMessage, context.message?.text)
			await this.syncActiveMessageCache(context)
		}
	}

	private async completeRun(state: LarkChatRunState) {
		const context = state.context
		const larkMessage = this.createLarkMessage(context)
		const currentStatus = context.message?.status
		const keepTerminalState =
			currentStatus === XpertAgentExecutionStatusEnum.INTERRUPTED ||
			currentStatus === XpertAgentExecutionStatusEnum.ERROR

		if (!keepTerminalState) {
			if (state.renderItems.length > 0 || context.reject || larkMessage.elements.length > 0) {
				larkMessage.renderItems = state.renderItems
				await larkMessage.update({
					status: XpertAgentExecutionStatusEnum.SUCCESS
				})
			}
		}

		context.message = this.toMessageSnapshot(larkMessage, context.message?.text)
		await this.syncActiveMessageCache(context)
	}

	private async failRun(state: LarkChatRunState, error?: string) {
		const larkMessage = this.createLarkMessage(state.context)
		await larkMessage.error(error || 'Internal Error')
		state.context.message = this.toMessageSnapshot(larkMessage, state.context.message?.text)
		await this.syncActiveMessageCache(state.context)
	}

	private createLarkMessage(context: LarkChatCallbackContext): ChatLarkMessage {
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
				larkChannel: this.larkChannel
			},
				{
					id: context.message?.id,
					messageId: context.message?.messageId,
					deliveryMode: context.message?.deliveryMode,
					status: context.message?.status as any,
					language,
				header: context.message?.header,
				elements: [...(context.message?.elements ?? [])],
				text: context.message?.text
			}
		)
	}

	private createRunState(sourceMessageId: string, context: LarkChatCallbackContext): LarkChatRunState {
		return {
			sourceMessageId,
			nextSequence: 1,
			responseMessageContent: '',
			context,
			pendingEvents: {},
			lastFlushAt: 0,
			lastFlushedLength: 0,
			renderItems: context.message.renderItems // this.deserializeRenderItems(context.message?.elements)
		}
	}

	private ensureRunStateDefaults(state: LarkChatRunState): LarkChatRunState {
		// const legacyElements = this.toArrayOfUnknown((state as { renderElements?: unknown }).renderElements)
		return {
			...state,
			pendingEvents: state.pendingEvents ?? {},
			lastFlushAt: state.lastFlushAt ?? 0,
			lastFlushedLength: state.lastFlushedLength ?? 0,
			// renderItems:
			// 	state.renderItems ??
			// 	this.deserializeRenderItems(legacyElements ?? state.context?.message?.elements)
		}
	}

	private resolveStreamUpdateWindowMs(context: LarkChatCallbackContext): number {
		const fromContext = context.streaming?.updateWindowMs
		const fromConfig = this.pluginContext.config?.streaming?.updateWindowMs
		const candidate = fromContext ?? fromConfig ?? DEFAULT_STREAM_UPDATE_WINDOW_MS
		return Math.min(
			MAX_STREAM_UPDATE_WINDOW_MS,
			Math.max(MIN_STREAM_UPDATE_WINDOW_MS, candidate)
		)
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

	private shouldFlushStreamContent(
		state: LarkChatRunState,
		now: number,
		updateWindowMs: number
	): boolean {
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

	private appendStructuredElements(
		state: LarkChatRunState,
		elements: readonly LarkStructuredElement[]
	): void {
		for (const element of elements) {
			state.renderItems.push({
				kind: 'structured',
				element: cloneStructuredElement(element)
			})
		}
	}

	private async flushStreamContent(
		state: LarkChatRunState,
		larkMessage: ChatLarkMessage,
		now: number
	) {
		this.logger.debug(`Flushing stream content for source message "${state.sourceMessageId}", content length: ${state.responseMessageContent.length}`)
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
	): LarkProgressRenderItem | LarkToolTraceRenderItem | null {
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
		if (
			eventType === ChatMessageEventTypeEnum.ON_TOOL_START ||
			eventType === ChatMessageEventTypeEnum.ON_TOOL_END ||
			eventType === ChatMessageEventTypeEnum.ON_TOOL_ERROR ||
			eventType === ChatMessageEventTypeEnum.ON_TOOL_MESSAGE
		) {
			return this.buildToolTraceItem(id, data, existing?.kind === 'tool_trace' ? existing : null)
		}

		return {
			kind: 'progress',
			id,
			title:
				this.toNonEmptyString(data?.title) ??
				(existing?.kind === 'progress' ? existing.title : null) ??
				(this.toNonEmptyString(data?.status) === 'running' ? '正在处理' : '执行过程'),
			detail:
				this.toNonEmptyString(data?.message) ??
				(existing?.kind === 'progress' ? existing.detail : null) ??
				null,
			status: this.toNonEmptyString(data?.status) ?? (existing?.kind === 'progress' ? existing.status : null) ?? null
		}
	}

	private upsertComponentRenderItem(
		state: LarkChatRunState,
		componentEnvelope: Record<string, unknown>
	): boolean {
		const component = this.toRecord(componentEnvelope.data)
		if (!component) {
			return false
		}

		const id =
			this.toNonEmptyString(componentEnvelope.id) ??
			this.resolveManagedEventId(component) ??
			this.buildSyntheticManagedEventId(state, 'component', component)
		if (!id) {
			return false
		}

		const existing = this.findManagedRenderItemById(state.renderItems, id)
		const item = this.buildToolTraceItem(id, component, existing?.kind === 'tool_trace' ? existing : null)
		const existingIndex = this.findManagedRenderItemIndex(state.renderItems, id)
		if (existingIndex >= 0) {
			state.renderItems[existingIndex] = item
		} else {
			state.renderItems.push(item)
		}
		return true
	}

	private buildToolTraceItem(
		id: string,
		data: Record<string, unknown>,
		existing?: LarkToolTraceRenderItem | null
	): LarkToolTraceRenderItem {
		const errorData = this.toRecord(data?.error)
		const tool = this.resolveManagedEventTool(data) ?? existing?.tool ?? null
		return {
			kind: 'tool_trace',
			id,
			tool,
			title:
				this.toNonEmptyString(data?.title) ??
				existing?.title ??
				tool ??
				'工具',
			detail:
				this.resolveToolTraceDetail(data, tool) ??
				existing?.detail ??
				null,
			status: this.toNonEmptyString(data?.status) ?? existing?.status ?? null,
			error:
				this.toNonEmptyString(data?.error) ??
				this.toNonEmptyString(errorData?.message) ??
				existing?.error ??
				null
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

	private resolveToolTraceDetail(data: Record<string, unknown>, tool: string | null): string | null {
		const directMessage = this.toNonEmptyString(data?.message)
		if (directMessage && !this.shouldSuppressToolPayloadText(directMessage, tool)) {
			return directMessage
		}

		const error =
			this.toNonEmptyString(data?.error) ??
			this.toNonEmptyString(this.toRecord(data?.error)?.message)
		if (error) {
			return error
		}

		if (this.toNonEmptyString(data?.status) === 'running') {
			return this.summarizeToolInput(data?.input, tool)
		}

		return this.summarizeToolOutput(data?.output ?? directMessage, tool)
	}

	private summarizeToolInput(value: unknown, tool: string | null): string | null {
		switch (tool) {
			case 'lark_list_messages':
				return '正在查看当前群聊上下文'
			case 'lark_get_message':
				return '正在读取消息详情'
			case 'lark_get_message_resource':
				return '正在读取消息资源'
			default:
				return this.summarizeUnknownValue(value, '正在准备执行工具')
		}
	}

	private summarizeToolOutput(value: unknown, tool: string | null): string | null {
		const parsed = this.parseJsonLikeValue(value)
		const record = this.toRecord(parsed)
		const data = this.toRecord(record?.data)
		const effective = data ?? record

		switch (tool) {
			case 'lark_list_messages': {
				const items = Array.isArray(effective?.items) ? effective.items : []
				const hasMore = effective?.hasMore === true
				return `已获取 ${items.length} 条消息${hasMore ? '，还有更多内容可继续加载' : ''}`
			}
			case 'lark_get_message':
				return '已获取消息详情'
			case 'lark_get_message_resource':
				return '已获取消息资源'
			case 'lark_send_text_notification':
				return this.summarizeCountedToolResult(effective, '已发送通知')
			case 'lark_send_rich_notification':
				return this.summarizeCountedToolResult(effective, '已发送富文本通知')
			case 'lark_update_message':
				return this.summarizeCountedToolResult(effective, '已更新消息')
			case 'lark_recall_message':
				return this.summarizeCountedToolResult(effective, '已撤回消息')
			default: {
				if (Array.isArray(effective?.items)) {
					return `已返回 ${effective.items.length} 条结果`
				}
				if (effective?.item && typeof effective.item === 'object') {
					return '已返回工具结果'
				}
				return this.summarizeUnknownValue(parsed, '已返回工具结果')
			}
		}
	}

	private summarizeCountedToolResult(
		value: Record<string, unknown> | null,
		actionLabel: string
	): string {
		const successCount = this.toInteger(value?.successCount)
		const failureCount = this.toInteger(value?.failureCount)
		const resultsCount = Array.isArray(value?.results) ? value.results.length : null

		const success = successCount ?? (resultsCount && resultsCount > 0 ? resultsCount : null)
		const failure = failureCount ?? 0

		if (success && success > 0 && failure > 0) {
			return `${actionLabel} ${success} 条，失败 ${failure} 条`
		}
		if (success && success > 0) {
			return `${actionLabel} ${success} 条`
		}
		if (failure > 0) {
			return `${actionLabel}失败 ${failure} 条`
		}
		return actionLabel
	}

	private summarizeUnknownValue(value: unknown, fallback: string): string {
		if (typeof value === 'string') {
			const normalized = value.trim()
			if (!normalized) {
				return fallback
			}
			if (this.shouldSuppressToolPayloadText(normalized)) {
				return fallback
			}
			return normalized.length > 240 ? `${normalized.slice(0, 240)}...` : normalized
		}

		if (value && typeof value === 'object') {
			if (Array.isArray(value)) {
				return value.length ? `已返回 ${value.length} 条结果` : fallback
			}
			return fallback
		}

		return fallback
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

	private logReplacementCharacter(
		stage: string,
		value: string | null | undefined,
		sourceMessageId: string
	): void {
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

	private toInteger(value: unknown): number | null {
		const candidate = typeof value === 'number' ? value : Number(value)
		if (!Number.isFinite(candidate)) {
			return null
		}
		return Math.trunc(candidate)
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

		const message = context.message ?? {}
		const language = this.resolveMessageLanguage(context)
		await this.conversationService.setActiveMessage(conversationScopeKey, context.xpertId, {
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
		}, {
			legacyConversationUserKey: context.legacyConversationUserKey
		})
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

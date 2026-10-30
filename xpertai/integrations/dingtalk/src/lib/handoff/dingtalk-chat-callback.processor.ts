import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import {
	HandoffMessage,
	HandoffProcessorStrategy,
	IHandoffProcessor,
	ProcessContext,
	ProcessResult,
	MANAGED_QUEUE_SERVICE_TOKEN,
	PluginJobProcessor,
	type ManagedQueueService,
	type ManagedQueueJob,
	type PluginContext,
} from '@xpert-ai/plugin-sdk'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/chatkit-types'
import { ChatDingTalkMessage, cloneStructuredElement } from '../message.js'
import { DingTalkConversationService } from '../conversation.service.js'
import { resolveConversationUserKey as resolveDingTalkConversationUserKey } from '../conversation-user-key.js'
import { DingTalkChannelStrategy } from '../dingtalk-channel.strategy.js'
import {
	DINGTALK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE,
	DingTalkChatCallbackContext,
	DingTalkChatMessageSnapshot,
	DingTalkChatStreamCallbackPayload,
	DingTalkEventRenderItem,
	DingTalkRenderItem,
} from './dingtalk-chat.types.js'
import { DingTalkChatRunState, DingTalkChatRunStateService, type DingTalkRunLease } from './dingtalk-chat-run-state.service.js'
import { createHash } from 'node:crypto'
import { DINGTALK_PLUGIN_CONTEXT } from '../tokens.js'
import { DINGTALK_CALLBACK_QUEUE, DINGTALK_CALLBACK_RECOVERY_DELAY_MS, finalMessageSnapshot, isTerminalCallback, lifecycleEvent } from './dingtalk-callback-recovery.js'
import { DingTalkCardElement, DingTalkStructuredElement } from '../types.js'
import { messageContentText, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { translate } from '../i18n.js'

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
@PluginJobProcessor({ ...DINGTALK_CALLBACK_QUEUE, jobName: 'apply', concurrency: 8 })
@PluginJobProcessor({ ...DINGTALK_CALLBACK_QUEUE, jobName: 'recover', concurrency: 2 })
@Injectable()
@HandoffProcessorStrategy(DINGTALK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE, {
	types: [DINGTALK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE],
	policy: {
		lane: 'main'
	}
})
export class DingTalkChatStreamCallbackProcessor implements IHandoffProcessor<DingTalkChatStreamCallbackPayload> {
	private readonly logger = new Logger(DingTalkChatStreamCallbackProcessor.name)

	@Inject(forwardRef(() => DingTalkConversationService))
	private readonly conversationService: DingTalkConversationService
	
	constructor(
		private readonly dingtalkChannel: DingTalkChannelStrategy,
		private readonly runStateService: DingTalkChatRunStateService,
		@Inject(DINGTALK_PLUGIN_CONTEXT) private readonly pluginContext: PluginContext
	) {}

	private get queue(): ManagedQueueService {
		return this.pluginContext.resolve<ManagedQueueService>(MANAGED_QUEUE_SERVICE_TOKEN)
	}

	async process(
		message: HandoffMessage<DingTalkChatStreamCallbackPayload>,
		_ctx: ProcessContext
	): Promise<ProcessResult> {
		const payload = message.payload
		if (!payload?.sourceMessageId || !Number.isSafeInteger(payload.sequence) || payload.sequence <= 0) {
			return { status: 'dead', reason: 'Invalid DingTalk callback sequence or source' }
		}
		const context = payload.context
		if (
			!context ||
			context.tenantId !== message.tenantId ||
			!context.userId ||
			!context.xpertId ||
			context.organizationId !== message.headers?.organizationId
		) {
			return { status: 'dead', reason: 'Invalid DingTalk callback scope' }
		}
		// Acknowledge Handoff only after the retryable plugin job is durable.
		await this.queue.enqueue({
			...DINGTALK_CALLBACK_QUEUE,
			jobName: 'apply',
			payload: message,
			scopeKey: this.pluginContext.scopeKey,
			tenantId: context.tenantId,
			organizationId: context.organizationId,
			userId: context.userId,
			jobId: this.jobId(message, 'apply', payload.sequence),
			attempts: 8,
			backoffMs: 1000,
			removeOnComplete: { age: 86400 },
			removeOnFail: { age: 86400 }
		})
		return { status: 'ok' }
	}

	async handle(job: ManagedQueueJob<HandoffMessage<DingTalkChatStreamCallbackPayload>>): Promise<void> {
		const message = job.data,
			payload = message.payload,
			context = payload.context
		if (
			!context ||
			context.tenantId !== message.tenantId ||
			context.organizationId !== message.headers?.organizationId
		) {
			throw new Error('Invalid DingTalk callback job scope')
		}
		await this.runStateService.withRun(payload.sourceMessageId, context, async (lease) => {
			if (lease.completed) return
			let state = lease.state
			if (job.name === 'recover') {
				if (!state) return
				state = this.ensureRunStateDefaults(state)
				if (await this.processPendingEvents(state, lease)) {
					await lease.finish()
					return
				}
				await this.recoverRun(state, lease)
				return
			}
			state = this.ensureRunStateDefaults(state ?? this.createRunState(payload.sourceMessageId, context))
			if (payload.sequence >= state.nextSequence) {
				state.pendingEvents[String(payload.sequence)] ??= payload
				const snapshot = finalMessageSnapshot(payload)
				if (snapshot && (!state.finalMessage || snapshot.sequence > state.finalMessage.sequence))
					state.finalMessage = snapshot
				// Persist before any sends, so another worker can retry after this worker exits.
				await lease.save(state)
			}
			if (isTerminalCallback(payload)) {
				await this.queue.enqueue({
					...DINGTALK_CALLBACK_QUEUE,
					jobName: 'recover',
					payload: message,
					scopeKey: this.pluginContext.scopeKey,
					tenantId: context.tenantId,
					organizationId: context.organizationId,
					userId: context.userId,
					jobId: this.jobId(message, 'recover', payload.sequence),
					delayMs: DINGTALK_CALLBACK_RECOVERY_DELAY_MS,
					attempts: 8,
					backoffMs: 1000,
					removeOnComplete: { age: 86400 },
					removeOnFail: { age: 86400 }
				})
			}
			if (await this.processPendingEvents(state, lease)) await lease.finish()
			else await lease.save(state)
		})
	}

	private jobId(message: HandoffMessage<DingTalkChatStreamCallbackPayload>, kind: string, sequence: number): string {
		const context = message.payload.context
		const scope = JSON.stringify([
			message.tenantId,
			context?.organizationId,
			context?.integrationId,
			context?.xpertId,
			message.payload.sourceMessageId,
			sequence,
			kind
		])
		return `dingtalk-callback-${createHash('sha256').update(scope).digest('hex')}`
	}

	private async recoverRun(state: DingTalkChatRunState, lease: DingTalkRunLease): Promise<void> {
		if (state.context.message?.status === 'error' || state.context.message?.status === 'interrupted') {
			await lease.finish()
			return
		}
		const pending = Object.values(state.pendingEvents).sort((a, b) => a.sequence - b.sequence)
		const failure = pending.find((payload) => payload.kind === 'error')
		const terminal = pending.find((payload) => {
			const end = lifecycleEvent(payload)
			return end?.name === 'on_conversation_end'
		})
		const snapshot = state.finalMessage
		const end = terminal ? lifecycleEvent(terminal) : null
		const endData = end?.data
		if (failure || snapshot?.status === 'error') {
			await this.failRun(state, failure?.error ?? snapshot?.error, lease.ensureOwned)
		} else if (
			endData &&
			typeof endData === 'object' &&
			'status' in endData &&
			(endData.status === 'error' || endData.status === 'interrupted')
		) {
			await this.applyStreamEvent(state, terminal.event, lease.ensureOwned)
		} else if (snapshot?.status === 'success') {
			const delivered = state.deliveredText ?? ''
			if ((state.deliveredSegmentCount > 0 && !state.deliveredText) || !snapshot.text.startsWith(delivered)) {
				await this.failRun(
					state,
					translate('Error.ReplyRecoveryPrefixMismatch', { lng: this.resolveMessageLanguage(state.context) }),
					lease.ensureOwned
				)
			} else {
				state.responseMessageContent = snapshot.text
				state.pendingSegmentText = snapshot.text.slice(delivered.length)
				state.renderItems = []
				await this.completeRun(state, lease.ensureOwned)
			}
		} else {
			await this.failRun(
				state,
				translate('Error.ReplyRecoveryUnavailable', { lng: this.resolveMessageLanguage(state.context) }),
				lease.ensureOwned
			)
		}
		await lease.finish()
	}
	/**
	 * Flush pending callbacks strictly by nextSequence.
	 *
	 * We process only when the expected sequence exists; out-of-order messages
	 * stay buffered in pendingEvents until earlier sequence arrives.
	 */
	private async processPendingEvents(state: DingTalkChatRunState, lease: DingTalkRunLease): Promise<boolean> {
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
					await this.applyStreamEvent(state, payload.event, lease.ensureOwned)
					break
				}
				case 'complete': {
					await this.completeRun(state, lease.ensureOwned)
					return true
				}
				case 'error': {
					await this.failRun(state, payload.error, lease.ensureOwned)
					return true
				}
				default: {
					this.logger.warn(
						`Unprocessed DingTalk callback kind "${(payload as { kind?: unknown }).kind}" in source message "${state.sourceMessageId}"`
					)
				}
			}

			state.nextSequence += 1
			await lease.save(state)
		}

		return false
	}

	/**
	 * Apply one callback stream event.
	 *
	 * MESSAGE:
	 * - append content into response buffer
	 * - keep compatibility with structured update payload
	 * - flush buffered text at tool-call boundaries
	 *
	 * EVENT:
	 * - apply conversation/message lifecycle events
	 */
	private async applyStreamEvent(state: DingTalkChatRunState, event: unknown, ensureOwned: () => Promise<void> = async () => {}) {
		const context = state.context
		let dingtalkMessage: ChatDingTalkMessage | undefined
		const ensureDingTalkMessage = (): ChatDingTalkMessage => {
			if (!dingtalkMessage) {
				dingtalkMessage = this.createDingTalkMessage(context, ensureOwned)
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
			const messageData = eventPayload.data
			const structuredMessageData = this.toRecord(messageData)
			const textDelta = this.extractMessageTextDelta(messageData)

			if (this.isToolCallStartMessage(structuredMessageData)) {
				await this.flushPendingTextSegment(state, ensureOwned)
			}

			if (textDelta) {
				state.responseMessageContent += textDelta
				state.pendingSegmentText += textDelta
			}

			if (typeof messageData !== 'string') {
				if (structuredMessageData?.type === 'update') {
					const message = ensureDingTalkMessage()
					const updatePayload = this.toRecord(structuredMessageData.data)
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
				} else if (!this.isKnownMessagePayloadType(structuredMessageData?.type)) {
					this.logger.warn('Unprocessed chat message event payload')
				}
			}

			if (!textDelta) {
				return
			}

			this.logger.debug(
				`Appended stream content for source message "${state.sourceMessageId}", current buffered length: ${state.responseMessageContent.length}`
			)
			return
		}

		if (eventPayload.type !== ChatMessageTypeEnum.EVENT) {
			return
		}

		switch (eventPayload.event) {
			case ChatMessageEventTypeEnum.ON_CONVERSATION_START: {
				const conversationUserKey = this.resolveConversationUserKey(context)
				const eventData = this.toRecord(eventPayload.data)
				const conversationId = this.toNonEmptyString(eventData?.id)
				if (conversationUserKey && conversationId) {
					await this.conversationService.setConversation(
						conversationUserKey,
						context.xpertId,
						conversationId,
						new Date(),
						{
							tenantId: context.tenantId,
							organizationId: context.organizationId,
							createdById: context.userId,
							updatedById: context.userId
						}
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
				if (eventPayload.event === ChatMessageEventTypeEnum.ON_TOOL_START) {
					await this.flushPendingTextSegment(state, ensureOwned)
				}
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

	private async completeRun(state: DingTalkChatRunState, ensureOwned: () => Promise<void> = async () => {}) {
		const context = state.context
		const dingtalkMessage = this.createDingTalkMessage(context, ensureOwned)
		const currentStatus = context.message?.status
		const keepTerminalState =
			currentStatus === XpertAgentExecutionStatusEnum.INTERRUPTED ||
			currentStatus === XpertAgentExecutionStatusEnum.ERROR

		if (!keepTerminalState) {
			const finalSegmentText = state.pendingSegmentText.trim()
			const finalRenderItems: DingTalkRenderItem[] = state.renderItems.filter(
				(item) => item.kind !== 'stream_text'
			)
			if (finalSegmentText) {
				finalRenderItems.push({
					kind: 'stream_text',
					text: finalSegmentText
				})
			}
			if (
				finalRenderItems.length > 0 ||
				context.reject ||
				dingtalkMessage.elements.length > 0
			) {
				dingtalkMessage.renderItems = finalRenderItems
				await dingtalkMessage.update({
					status: XpertAgentExecutionStatusEnum.SUCCESS
				})
				state.pendingSegmentText = ''
			}
		}

		context.message = this.toMessageSnapshot(dingtalkMessage, context.message?.text)
		await this.syncActiveMessageCache(context)
	}

	private async failRun(state: DingTalkChatRunState, error?: string, ensureOwned: () => Promise<void> = async () => {}) {
		const dingtalkMessage = this.createDingTalkMessage(state.context, ensureOwned)
		await dingtalkMessage.error(error || 'Internal Error')
		state.context.message = this.toMessageSnapshot(dingtalkMessage, state.context.message?.text)
		await this.syncActiveMessageCache(state.context)
	}

	private createDingTalkMessage(
		context: DingTalkChatCallbackContext,
		ensureOwned: () => Promise<void>
	): ChatDingTalkMessage {
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
				senderRecipient: context.senderRecipient,
				chatType: context.chatType,
				sessionWebhook: context.sessionWebhook,
				dingtalkChannel: {
					interactiveMessage: async (...args) => {
						await ensureOwned()
						return this.dingtalkChannel.interactiveMessage(...args)
					},
					patchInteractiveMessage: async (...args) => {
						await ensureOwned()
						return this.dingtalkChannel.patchInteractiveMessage(...args)
					},
					deleteMessage: async (...args) => {
						await ensureOwned()
						return this.dingtalkChannel.deleteMessage(...args)
					}
				}
			},
			{
				id: context.message?.id,
				messageId: context.message?.messageId,
				status: context.message?.status as ChatDingTalkMessage['status'],
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
			pendingSegmentText: '',
			deliveredSegmentCount: 0,
			context,
			pendingEvents: {},
			renderItems
		}
	}

	private ensureRunStateDefaults(state: DingTalkChatRunState): DingTalkChatRunState {
		return {
			...state,
			pendingEvents: state.pendingEvents ?? {},
			pendingSegmentText: state.pendingSegmentText ?? '',
			deliveredSegmentCount: state.deliveredSegmentCount ?? 0
		}
	}

	private async flushPendingTextSegment(state: DingTalkChatRunState, ensureOwned: () => Promise<void>): Promise<void> {
		const content = state.pendingSegmentText.trim()
		if (!content) {
			state.pendingSegmentText = ''
			return
		}

		await this.sendStandaloneTextSegment(state, content, ensureOwned)
		state.pendingSegmentText = ''
	}

	private async sendStandaloneTextSegment(
		state: DingTalkChatRunState,
		content: string,
		ensureOwned: () => Promise<void>
	): Promise<void> {
		const context = state.context
		if (!context.integrationId || !context.chatId) {
			throw new Error('DingTalk stream segment requires integrationId and chatId')
		}

		await ensureOwned()
		await this.dingtalkChannel.createMessage(context.integrationId, {
			recipient: {
				type: 'chat_id',
				id: context.chatId
			},
			sessionWebhook: context.sessionWebhook,
			robotCodeOverride: context.robotCode,
			msgType: 'markdown',
			content: {
				title: 'Xpert Notification',
				markdown: content
			},
			preferSessionWebhook: Boolean(context.sessionWebhook)
		})

		state.deliveredSegmentCount += 1
		state.deliveredText = state.responseMessageContent
		this.logger.debug(
			`Delivered DingTalk stream segment for source message "${state.sourceMessageId}", segment=${state.deliveredSegmentCount}, length=${content.length}`
		)
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

	private toStringValue(value: unknown): string | null {
		return typeof value === 'string' ? value : null
	}

	private extractMessageTextDelta(value: unknown): string {
		try {
			const contractText = this.normalizeStreamText(messageContentText(value as never))
			if (contractText) {
				return contractText
			}
		} catch {
			// Older callback payloads may not match the shared message content contract.
		}

		const record = this.toRecord(value)
		const type = this.toNonEmptyString(record?.type)
		if (type !== 'text' && type !== 'text_delta') {
			return ''
		}

		return this.normalizeStreamText(
			this.toStringValue(record?.text) ??
				this.toStringValue(record?.delta) ??
				this.toStringValue(record?.content)
		)
	}

	private isKnownMessagePayloadType(value: unknown): boolean {
		const type = this.toNonEmptyString(value)
		return type === 'text' || type === 'text_delta' || type === 'update' || type === 'reasoning' || type === 'component'
	}

	private isToolCallStartMessage(value: Record<string, unknown> | null): boolean {
		if (value?.type !== 'component') {
			return false
		}

		const component = this.toRecord(value.data)
		return component?.category === 'Tool' && component?.status === 'running'
	}

	private normalizeStreamText(value: string | null | undefined): string {
		if (typeof value !== 'string') {
			return ''
		}

		const lines = value.replace(/\r/g, '').split('\n')
		const hasPlaceholder = lines.some((line) => this.isPlaceholderText(line))
		const normalized = lines.filter((line) => !this.isPlaceholderText(line)).join('\n')
		if (hasPlaceholder && !normalized.trim()) {
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
			normalized === 'dingtalk_send_file' ||
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
		}).catch(() => {
			// A cache outage must not replay an already accepted DingTalk send.
			this.logger.warn('Could not refresh DingTalk active message cache')
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

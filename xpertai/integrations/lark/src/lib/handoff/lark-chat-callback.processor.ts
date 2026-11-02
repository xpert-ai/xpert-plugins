// Invariants: callback progress is shared across API replicas. Handoff ACK follows durable
// enqueue; only the fenced lease holder may update the card or commit run progress.
import { forwardRef, Inject, Injectable } from '@nestjs/common'
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
	type PluginContext
} from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { LarkConversationService } from '../conversation.service.js'
import { LarkChannelStrategy } from '../lark-channel.strategy.js'
import { LarkMessageHistoryService } from '../lark-message-history.service.js'
import type { IntegrationLarkPluginConfig } from '../plugin-config.js'
import { LARK_PLUGIN_CONTEXT } from '../tokens.js'
import { translate } from '../i18n.js'
import { LarkChatDispatchService } from './lark-chat-dispatch.service.js'
import { LarkCallbackDelivery } from './lark-callback-delivery.js'
import {
	LARK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE,
	LarkChatCallbackContext,
	LarkChatStreamCallbackPayload
} from './lark-chat.types.js'
import { LarkChatRunState, LarkChatRunStateService, type LarkRunLease } from './lark-chat-run-state.service.js'
import {
	LARK_CALLBACK_QUEUE,
	LARK_CALLBACK_RECOVERY_DELAY_MS,
	finalMessageSnapshot,
	isTerminalCallback,
	lifecycleEvent
} from './lark-callback-recovery.js'

@PluginJobProcessor({ ...LARK_CALLBACK_QUEUE, jobName: 'apply', concurrency: 8 })
@PluginJobProcessor({ ...LARK_CALLBACK_QUEUE, jobName: 'recover', concurrency: 2 })
@Injectable()
@HandoffProcessorStrategy(LARK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE, {
	types: [LARK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE],
	policy: { lane: 'main' }
})
export class LarkChatStreamCallbackProcessor implements IHandoffProcessor<LarkChatStreamCallbackPayload> {
	@Inject(forwardRef(() => LarkConversationService))
	private readonly conversationService: LarkConversationService
	constructor(
		private readonly larkChannel: LarkChannelStrategy,
		private readonly runStateService: LarkChatRunStateService,
		private readonly messageHistoryService: LarkMessageHistoryService,
		private readonly dispatchService: LarkChatDispatchService,
		@Inject(LARK_PLUGIN_CONTEXT) private readonly pluginContext: PluginContext<IntegrationLarkPluginConfig>
	) {}
	private get queue(): ManagedQueueService {
		return this.pluginContext.resolve<ManagedQueueService>(MANAGED_QUEUE_SERVICE_TOKEN)
	}

	async process(message: HandoffMessage<LarkChatStreamCallbackPayload>, _ctx: ProcessContext): Promise<ProcessResult> {
		const payload = message.payload
		if (!payload?.sourceMessageId || !Number.isSafeInteger(payload.sequence) || payload.sequence <= 0) {
			return { status: 'dead', reason: 'Invalid Lark callback sequence or source' }
		}
		const context = payload.context
		if (
			!context ||
			context.tenantId !== message.tenantId ||
			!context.userId ||
			!context.xpertId ||
			context.organizationId !== message.headers?.organizationId
		) {
			return { status: 'dead', reason: 'Invalid Lark callback scope' }
		}
		// Acknowledge Handoff only after the retryable plugin job is durable.
		await this.queue.enqueue({
			...LARK_CALLBACK_QUEUE,
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

	async handle(job: ManagedQueueJob<HandoffMessage<LarkChatStreamCallbackPayload>>): Promise<void> {
		const message = job.data,
			payload = message.payload,
			context = payload.context
		if (
			!context ||
			context.tenantId !== message.tenantId ||
			context.organizationId !== message.headers?.organizationId
		) {
			throw new Error('Invalid Lark callback job scope')
		}
		await this.runStateService.withRun(payload.sourceMessageId, context, async (lease) => {
			const delivery = new LarkCallbackDelivery(
				this.larkChannel,
				this.conversationService,
				this.messageHistoryService,
				this.pluginContext,
				lease.ensureOwned
			)
			if (context.followUpMode === 'steer') {
				if (!lease.completed) await this.recoverSteer(message, lease, delivery)
				return
			}
			if (lease.completed) return
			let state = lease.state
			if (job.name === 'recover') {
				if (!state) return
				if (await this.processPendingEvents(state, lease, delivery)) {
					await lease.finish()
					return
				}
				await this.recoverRun(state, lease, delivery)
				return
			}
			state = state ?? this.createRunState(payload.sourceMessageId, context)
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
					...LARK_CALLBACK_QUEUE,
					jobName: 'recover',
					payload: message,
					scopeKey: this.pluginContext.scopeKey,
					tenantId: context.tenantId,
					organizationId: context.organizationId,
					userId: context.userId,
					jobId: this.jobId(message, 'recover', payload.sequence),
					delayMs: LARK_CALLBACK_RECOVERY_DELAY_MS,
					attempts: 8,
					backoffMs: 1000,
					removeOnComplete: { age: 86400 },
					removeOnFail: { age: 86400 }
				})
			}
			if (await this.processPendingEvents(state, lease, delivery)) await lease.finish()
			else await lease.save(state)
		})
	}

	private jobId(message: HandoffMessage<LarkChatStreamCallbackPayload>, kind: string, sequence: number): string {
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
		return `lark-callback-${createHash('sha256').update(scope).digest('hex')}`
	}

	private async processPendingEvents(
		state: LarkChatRunState,
		lease: LarkRunLease,
		delivery: LarkCallbackDelivery
	): Promise<boolean> {
		while (state.pendingEvents[String(state.nextSequence)]) {
			const payload = state.pendingEvents[String(state.nextSequence)]
			if (payload.kind === 'complete') {
				await delivery.completeRun(state)
				return true
			}
			if (payload.kind === 'error') {
				await delivery.failRun(state, payload.error)
				return true
			}
			await delivery.applyStreamEvent(state, payload.event)
			delete state.pendingEvents[String(state.nextSequence)]
			state.nextSequence++
			await lease.save(state)
		}
		return false
	}

	private async recoverRun(
		state: LarkChatRunState,
		lease: LarkRunLease,
		delivery: LarkCallbackDelivery
	): Promise<void> {
		if (state.context.message.status === 'error' || state.context.message.status === 'interrupted') {
			await delivery.completeRun(state)
			await lease.finish()
			return
		}
		const pending = Object.values(state.pendingEvents).sort((a, b) => a.sequence - b.sequence)
		for (const callback of pending) {
			const name = lifecycleEvent(callback)?.name
			if (name === 'on_conversation_start' || name === 'on_message_start')
				await delivery.applyStreamEvent(state, callback.event)
		}
		const failure = pending.find((event) => event.kind === 'error')
		const terminal = pending.find((event) => lifecycleEvent(event)?.name === 'on_conversation_end')
		const end = terminal ? lifecycleEvent(terminal)?.data : null
		const snapshot = state.finalMessage
		if (failure || snapshot?.status === 'error') {
			await delivery.failRun(state, failure?.error ?? snapshot?.error)
		} else if (
			end &&
			typeof end === 'object' &&
			'status' in end &&
			(end.status === 'error' || end.status === 'interrupted')
		) {
			await delivery.applyStreamEvent(state, terminal.event)
			if (state.context.message.status !== 'error' && state.context.message.status !== 'interrupted')
				await delivery.failRun(state, this.recoveryUnavailable(state))
		} else if (snapshot?.status === 'success') {
			// A card can be replaced in full: never concatenate incomplete deltas after a gap.
			state.responseMessageContent = snapshot.text
			state.renderItems = [{ kind: 'stream_text', text: snapshot.text }]
			await delivery.completeRun(state)
		} else {
			await delivery.failRun(state, this.recoveryUnavailable(state))
		}
		await lease.finish()
	}

	private recoveryUnavailable(state: LarkChatRunState): string {
		return translate('Error.ReplyRecoveryUnavailable', {
			lng: state.context.message.language ?? state.context.preferLanguage
		})
	}

	private createRunState(sourceMessageId: string, context: LarkChatCallbackContext): LarkChatRunState {
		return {
			sourceMessageId,
			context,
			nextSequence: 1,
			responseMessageContent: '',
			pendingEvents: {},
			lastFlushAt: 0,
			lastFlushedLength: 0,
			renderItems: context.message.renderItems ?? []
		}
	}

	private async recoverSteer(
		message: HandoffMessage<LarkChatStreamCallbackPayload>,
		lease: LarkRunLease,
		delivery: LarkCallbackDelivery
	): Promise<void> {
		const payload = message.payload,
			context = payload.context
		if (payload.kind !== 'error') return
		if (payload.errorCode !== 'steer_target_not_running' || !context.steerFallback) {
			await this.messageHistoryService.updateInboundStatus(context.currentInboundLogIds ?? [], 'failed', payload.error)
			await lease.finish()
			return
		}
		if (!context.scopeKey || !context.xpertId) throw new Error('Missing trusted Lark scope for stale steer fallback')
		const state = lease.state ?? this.createRunState(payload.sourceMessageId, context)
		// Persist the exact envelope before enqueue. A retry after enqueue or marker failure
		// reuses its ID, including when message history is disabled.
		if (
			!state.steerDispatch &&
			context.currentInboundLogIds?.length &&
			(await this.messageHistoryService.areInboundLogsInStatusWithError(
				context.currentInboundLogIds,
				'queued',
				'stale_steer_fallback_enqueued'
			))
		) {
			await lease.finish()
			return
		}
		if (!state.steerDispatch) {
			const fallback = context.steerFallback
			const active = await this.conversationService.getActiveMessage(context.scopeKey, context.xpertId, {
				legacyConversationUserKey: context.legacyConversationUserKey
			})
			if (!fallback.message.id || active?.thirdPartyMessage?.id !== fallback.message.id) {
				await this.messageHistoryService.updateInboundStatus(
					context.currentInboundLogIds ?? [],
					'failed',
					'stale_steer_active_card_changed'
				)
				await lease.finish()
				return
			}
			if (
				!state.steerPreparing &&
				(active.thirdPartyMessage.status === 'thinking' || active.thirdPartyMessage.status === 'continuing')
			) {
				throw new Error('Waiting for the previous Lark response card to finish before stale steer fallback')
			}
			state.steerPreparing = true
			await lease.save(state)
			await lease.ensureOwned()
			const larkMessage = delivery.createLarkMessage({
				...context,
				message: fallback.message,
				followUpMode: undefined,
				steerFallback: undefined
			})
			state.steerDispatch = await this.dispatchService.buildDispatchMessage({
				xpertId: context.xpertId,
				executionContext: {
					tenantId: context.tenantId,
					organizationId: context.organizationId,
					createdById: context.userId
				},
				input: fallback.input,
				files: fallback.files,
				currentInboundLogIds: context.currentInboundLogIds,
				larkMessage,
				options: {
					forceNewRun: true,
					recoverySourceMessageId: payload.sourceMessageId,
					fromEndUserId: fallback.fromEndUserId,
					executorUserId: fallback.executorUserId,
					streamingEnabled: fallback.streamingEnabled
				}
			})
			await lease.save(state)
		}
		await lease.ensureOwned()
		await this.dispatchService.enqueuePreparedDispatch(state.steerDispatch)
		await this.messageHistoryService.updateInboundStatus(
			context.currentInboundLogIds ?? [],
			'queued',
			'stale_steer_fallback_enqueued'
		)
		await lease.finish()
	}
}

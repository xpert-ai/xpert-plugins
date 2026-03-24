import { Inject, Injectable, Logger } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { type Cache } from 'cache-manager'
import {
	LarkChatCallbackContext,
	LarkRenderItem,
	LarkChatStreamCallbackPayload,
} from './lark-chat.types.js'

const DEFAULT_RUN_STATE_TTL_SECONDS = 15 * 60
const RUN_STATE_CACHE_ENCODING_PREFIX = 'lark-run-state:b64json:'

/**
 * Ephemeral run state for one Lark callback stream.
 *
 * A run is keyed by sourceMessageId (the original dispatch message id from system queue).
 * The state is stored in cache only for short-term ordering/recovery, not as business persistence.
 */
export interface LarkChatRunState<TRenderItem extends LarkRenderItem = LarkRenderItem> {
	/** One source dispatch message corresponds to one callback run state. */
	sourceMessageId: string
	/** Next expected callback sequence for in-order processing. */
	nextSequence: number
	/** Buffered full response text built from stream MESSAGE callbacks. */
	responseMessageContent: string
	/** Snapshot to reconstruct ChatLarkMessage and conversation context for every callback. */
	context: LarkChatCallbackContext
	/** Out-of-order callbacks are parked here until nextSequence is available. */
	pendingEvents: Record<string, LarkChatStreamCallbackPayload>
	/** Last timestamp when stream text was flushed to Lark card. */
	lastFlushAt: number
	/** Length of responseMessageContent already flushed to Lark. */
	lastFlushedLength: number
	/** Ordered, mixed internal render items by callback arrival time. */
	renderItems: TRenderItem[]
}

@Injectable()
/**
 * Cache-backed short-lived storage for callback run state.
 *
 * Design intent:
 * - keep stream callback ordering state across queue messages
 * - support temporary recovery window for out-of-order callbacks
 * - avoid using persistent DB for transient streaming state
 */
export class LarkChatRunStateService {
	private readonly logger = new Logger(LarkChatRunStateService.name)
	private readonly volatileStates = new Map<string, LarkChatRunState>()
	private readonly volatileStateTimers = new Map<string, ReturnType<typeof setTimeout>>()

	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	/** Save run state with TTL (default 15 minutes). */
	async save(
		state: LarkChatRunState,
		ttlSeconds: number = DEFAULT_RUN_STATE_TTL_SECONDS
	): Promise<void> {
		this.setVolatileState(state, ttlSeconds)
		this.logReplacementCharacter('save.responseMessageContent', state.sourceMessageId, state.responseMessageContent)
		this.logReplacementCharacter(
			'save.renderItems',
			state.sourceMessageId,
			JSON.stringify(state.renderItems)
		)
		await this.cacheManager.set(
			this.buildKey(state.sourceMessageId),
			this.serializeState(state),
			ttlSeconds * 1000
		)
	}

	/** Load run state by source message id. */
	async get(sourceMessageId: string): Promise<LarkChatRunState | null> {
		const volatileState = this.volatileStates.get(sourceMessageId)
		if (volatileState) {
			this.logReplacementCharacter(
				'volatile.responseMessageContent',
				sourceMessageId,
				volatileState.responseMessageContent
			)
			this.logReplacementCharacter(
				'volatile.renderItems',
				sourceMessageId,
				JSON.stringify(volatileState.renderItems)
			)
			return volatileState
		}

		const rawState = await this.cacheManager.get<string | LarkChatRunState>(
			this.buildKey(sourceMessageId)
		)
		const state = this.deserializeState(rawState, sourceMessageId)
		if (state) {
			this.setVolatileState(state, DEFAULT_RUN_STATE_TTL_SECONDS)
			this.logReplacementCharacter('get.responseMessageContent', sourceMessageId, state.responseMessageContent)
			this.logReplacementCharacter('get.renderItems', sourceMessageId, JSON.stringify(state.renderItems))
		}
		return state ?? null
	}

	/** Clear run state once callback stream is completed or failed. */
	async clear(sourceMessageId: string): Promise<void> {
		this.clearVolatileState(sourceMessageId)
		await this.cacheManager.del(this.buildKey(sourceMessageId))
	}

	private buildKey(sourceMessageId: string): string {
		return `lark:handoff:run:${sourceMessageId}`
	}

	private setVolatileState(state: LarkChatRunState, ttlSeconds: number): void {
		this.volatileStates.set(state.sourceMessageId, state)

		const existingTimer = this.volatileStateTimers.get(state.sourceMessageId)
		if (existingTimer) {
			clearTimeout(existingTimer)
		}

		const timer = setTimeout(() => {
			this.clearVolatileState(state.sourceMessageId)
		}, ttlSeconds * 1000)
		this.volatileStateTimers.set(state.sourceMessageId, timer)
	}

	private clearVolatileState(sourceMessageId: string): void {
		this.volatileStates.delete(sourceMessageId)
		const timer = this.volatileStateTimers.get(sourceMessageId)
		if (timer) {
			clearTimeout(timer)
			this.volatileStateTimers.delete(sourceMessageId)
		}
	}

	private serializeState(state: LarkChatRunState): string {
		const json = JSON.stringify(state)
		return `${RUN_STATE_CACHE_ENCODING_PREFIX}${Buffer.from(json, 'utf8').toString('base64')}`
	}

	private deserializeState(
		rawState: string | LarkChatRunState | null | undefined,
		sourceMessageId: string
	): LarkChatRunState | null {
		if (!rawState) {
			return null
		}

		if (typeof rawState === 'string') {
			if (rawState.startsWith(RUN_STATE_CACHE_ENCODING_PREFIX)) {
				try {
					const payload = rawState.slice(RUN_STATE_CACHE_ENCODING_PREFIX.length)
					const json = Buffer.from(payload, 'base64').toString('utf8')
					return JSON.parse(json) as LarkChatRunState
				} catch (error) {
					this.logger.warn(
						`Failed to decode cached run state for "${sourceMessageId}": ${
							error instanceof Error ? error.message : String(error)
						}`
					)
					return null
				}
			}

			try {
				return JSON.parse(rawState) as LarkChatRunState
			} catch {
				this.logger.warn(
					`Ignoring cached run state for "${sourceMessageId}" because it is neither base64-json nor plain JSON`
				)
				return null
			}
		}

		return rawState
	}

	private logReplacementCharacter(stage: string, sourceMessageId: string, value: string | null | undefined) {
		if (!value || !value.includes('\uFFFD')) {
			return
		}

		const preview = value.length > 360 ? `${value.slice(0, 360)}...(truncated)` : value
		this.logger.warn(
			`[encoding] replacement char detected at run-state.${stage}: ${JSON.stringify({
				sourceMessageId,
				preview
			})}`
		)
	}
}

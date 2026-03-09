import { Inject, Injectable } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { type Cache } from 'cache-manager'
import {
	DingTalkChatCallbackContext,
	DingTalkRenderItem,
	DingTalkChatStreamCallbackPayload,
} from './dingtalk-chat.types.js'

const DEFAULT_RUN_STATE_TTL_SECONDS = 15 * 60

/**
 * Ephemeral run state for one DingTalk callback stream.
 *
 * A run is keyed by sourceMessageId (the original dispatch message id from system queue).
 * The state is stored in cache only for short-term ordering/recovery, not as business persistence.
 */
export interface DingTalkChatRunState<TRenderItem extends DingTalkRenderItem = DingTalkRenderItem> {
	/** One source dispatch message corresponds to one callback run state. */
	sourceMessageId: string
	/** Next expected callback sequence for in-order processing. */
	nextSequence: number
	/** Buffered full response text built from stream MESSAGE callbacks. */
	responseMessageContent: string
	/** Snapshot to reconstruct ChatDingTalkMessage and conversation context for every callback. */
	context: DingTalkChatCallbackContext
	/** Out-of-order callbacks are parked here until nextSequence is available. */
	pendingEvents: Record<string, DingTalkChatStreamCallbackPayload>
	/** Last timestamp when stream text was flushed to DingTalk card. */
	lastFlushAt: number
	/** Length of responseMessageContent already flushed to DingTalk. */
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
export class DingTalkChatRunStateService {
	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	/** Save run state with TTL (default 15 minutes). */
	async save(
		state: DingTalkChatRunState,
		ttlSeconds: number = DEFAULT_RUN_STATE_TTL_SECONDS
	): Promise<void> {
		await this.cacheManager.set(this.buildKey(state.sourceMessageId), state, ttlSeconds * 1000)
	}

	/** Load run state by source message id. */
	async get(sourceMessageId: string): Promise<DingTalkChatRunState | null> {
		const state = await this.cacheManager.get<DingTalkChatRunState>(this.buildKey(sourceMessageId))
		return state ?? null
	}

	/** Clear run state once callback stream is completed or failed. */
	async clear(sourceMessageId: string): Promise<void> {
		await this.cacheManager.del(this.buildKey(sourceMessageId))
	}

	private buildKey(sourceMessageId: string): string {
		return `dingtalk:handoff:run:${sourceMessageId}`
	}
}

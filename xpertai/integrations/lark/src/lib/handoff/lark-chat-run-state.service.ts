import { Inject, Injectable } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { type Cache } from 'cache-manager'
import { createHash, randomUUID } from 'node:crypto'
import {
	MANAGED_QUEUE_SERVICE_TOKEN,
	type ManagedQueueService,
	type PluginContext,
	type HandoffMessage,
	type AgentChatDispatchPayload
} from '@xpert-ai/plugin-sdk'
import { LARK_PLUGIN_CONTEXT } from '../tokens.js'
import { LarkChatCallbackContext, LarkRenderItem, LarkChatStreamCallbackPayload } from './lark-chat.types.js'

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
	lastFlushAt: number
	lastFlushedLength: number
	/** Snapshot to reconstruct ChatLarkMessage and conversation context for every callback. */
	context: LarkChatCallbackContext
	/** Out-of-order callbacks are parked here until nextSequence is available. */
	pendingEvents: Record<string, LarkChatStreamCallbackPayload>
	/** Ordered, mixed internal render items by callback arrival time. */
	renderItems: TRenderItem[]
	steerPreparing?: boolean
	steerDispatch?: HandoffMessage<AgentChatDispatchPayload>
	finalMessage?: { sequence: number; text: string; status: string; error?: string }
}

export interface LarkRunLease {
	state: LarkChatRunState | null
	completed: boolean
	ensureOwned(): Promise<void>
	save(state: LarkChatRunState): Promise<void>
	finish(): Promise<void>
}

@Injectable()
/**
 * Redis-backed callback state, with a read-only bridge for runs created by older plugin versions.
 *
 * Design intent:
 * - keep stream callback ordering state across queue messages
 * - support temporary recovery window for out-of-order callbacks
 * - avoid using persistent DB for transient streaming state
 */
export class LarkChatRunStateService {
	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext
	) {}

	// A process-local mutex cannot protect read/modify/write across API replicas.
	// Fenced writes and token-checked release prevent an expired owner overwriting its successor.
	async withRun<T>(
		sourceMessageId: string,
		context: LarkChatCallbackContext,
		callback: (lease: LarkRunLease) => Promise<T>,
		options: { leaseMs?: number } = {}
	): Promise<T> {
		const queue = this.pluginContext.resolve<ManagedQueueService>(MANAGED_QUEUE_SERVICE_TOKEN)
		const redis = await queue.getRedis()
		const scope = JSON.stringify([
			context.tenantId,
			context.organizationId ?? null,
			context.integrationId ?? null,
			context.xpertId,
			sourceMessageId
		])
		const hash = createHash('sha256').update(scope).digest('hex')
		const prefix = `plugin_lark:callback:{${hash}}`
		const lockKey = `${prefix}:lock`,
			stateKey = `${prefix}:state`,
			doneKey = `${prefix}:done`
		const token = randomUUID()
		const ttl = options.leaseMs ?? 30_000
		const deadline = Date.now() + 30_000
		while ((await redis.set(lockKey, token, 'PX', ttl, 'NX')) !== 'OK') {
			if (Date.now() >= deadline) throw new Error('Lark callback lease unavailable')
			await new Promise<void>((resolve) => setTimeout(resolve, 25 + Math.random() * 50))
		}
		let lost = false
		let renewing: Promise<void> | undefined
		const ensureOwned = async () => {
			if (
				lost ||
				(await redis.eval(
					"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
					1,
					lockKey,
					token,
					ttl
				)) !== 1
			) {
				lost = true
				throw new Error('Lark callback lease lost')
			}
		}
		const timer = setInterval(() => {
			if (!renewing)
				renewing = ensureOwned()
					.catch(() => {
						lost = true
					})
					.finally(() => {
						renewing = undefined
					})
		}, ttl / 3)
		try {
			const completed = (await redis.get(doneKey)) === '1'
			const raw = completed ? null : await redis.get(stateKey)
			const state = completed
				? null
				: raw
				? parseRunState(raw, sourceMessageId, context)
				: await this.getLegacy(sourceMessageId, context)
			if (state && !sameContext(state.context, context)) throw new Error('Lark callback scope mismatch')
			return await callback({
				state,
				completed,
				ensureOwned,
				save: async (state) => {
					await ensureOwned()
					const saved = await redis.eval(
						"if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end redis.call('set', KEYS[2], ARGV[2], 'EX', 86400) return 1",
						2,
						lockKey,
						stateKey,
						token,
						JSON.stringify(state)
					)
					if (saved !== 1) throw new Error('Lark callback lease lost before save')
				},
				finish: async () => {
					await ensureOwned()
					const finished = await redis.eval(
						"if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end redis.call('set', KEYS[2], '1', 'EX', 86400) redis.call('del', KEYS[3]) return 1",
						3,
						lockKey,
						doneKey,
						stateKey,
						token
					)
					if (finished !== 1) throw new Error('Lark callback lease lost before completion')
				}
			})
		} finally {
			clearInterval(timer)
			await renewing
			await redis.eval(
				"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
				1,
				lockKey,
				token
			)
		}
	}

	/** Seed new runs in the same scoped, fenced store used by callback workers. */
	async initialize(state: LarkChatRunState): Promise<void> {
		await this.withRun(state.sourceMessageId, state.context, async (lease) => {
			if (!lease.completed && !lease.state) await lease.save(state)
		})
	}

	private async getLegacy(sourceMessageId: string, context: LarkChatCallbackContext): Promise<LarkChatRunState | null> {
		const raw = await this.cacheManager.get<string | LarkChatRunState>(this.buildKey(sourceMessageId))
		if (!raw) return null
		const prefix = 'lark-run-state:b64json:'
		const json =
			typeof raw === 'string'
				? raw.startsWith(prefix)
					? Buffer.from(raw.slice(prefix.length), 'base64').toString('utf8')
					: raw
				: JSON.stringify(raw)
		return parseRunState(json, sourceMessageId, context)
	}

	private buildKey(sourceMessageId: string): string {
		return `lark:handoff:run:${sourceMessageId}`
	}
}

function sameContext(left: LarkChatCallbackContext, right: LarkChatCallbackContext): boolean {
	return (
		left.tenantId === right.tenantId &&
		left.organizationId === right.organizationId &&
		left.integrationId === right.integrationId &&
		left.xpertId === right.xpertId &&
		left.userId === right.userId &&
		left.chatId === right.chatId &&
		left.scopeKey === right.scopeKey
	)
}

/** Redis contains only plugin-written snapshots, but reject corrupt or mismatched records before use. */
function parseRunState(raw: string, sourceMessageId: string, context: LarkChatCallbackContext): LarkChatRunState {
	const value: unknown = JSON.parse(raw)
	if (
		!value ||
		typeof value !== 'object' ||
		!('sourceMessageId' in value) ||
		value.sourceMessageId !== sourceMessageId ||
		!('nextSequence' in value) ||
		typeof value.nextSequence !== 'number' ||
		!Number.isSafeInteger(value.nextSequence) ||
		!('context' in value) ||
		!value.context ||
		typeof value.context !== 'object' ||
		!('pendingEvents' in value) ||
		!value.pendingEvents ||
		typeof value.pendingEvents !== 'object' ||
		!('renderItems' in value) ||
		!Array.isArray(value.renderItems) ||
		!('responseMessageContent' in value) ||
		typeof value.responseMessageContent !== 'string'
	) {
		throw new Error('Invalid Lark callback state')
	}
	const state = value as LarkChatRunState
	if (!sameContext(state.context, context)) throw new Error('Lark callback scope mismatch')
	return state
}

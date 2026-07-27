import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import {
	MANAGED_QUEUE_SERVICE_TOKEN,
	type ManagedQueueRedis,
	type ManagedQueueService,
	type PluginContext
} from '@xpert-ai/plugin-sdk'
import type { Cache } from 'cache-manager'
import { randomUUID } from 'crypto'
import { DINGTALK_PLUGIN_CONTEXT } from '../tokens.js'
import { DingTalkTriggerAggregationState } from './dingtalk-trigger-aggregation.types.js'

const DEFAULT_AGGREGATION_TTL_SECONDS = 2 * 60 * 60
const DEFAULT_LOCK_TTL_MS = 5000
const DEFAULT_LOCK_ACQUIRE_TIMEOUT_MS = 15_000
const DEFAULT_LOCK_RETRY_MIN_DELAY_MS = 50
const DEFAULT_LOCK_RETRY_MAX_DELAY_MS = 250

export type DingTalkAggregateLockLease = {
	ensureOwned(): Promise<void>
	clearStateIfOwned(): Promise<void>
}

export type DingTalkAggregateLockOptions = {
	ttlMs?: number
	acquireTimeoutMs?: number
	retryMinDelayMs?: number
	retryMaxDelayMs?: number
}

@Injectable()
export class DingTalkTriggerAggregationService {
	private _managedQueueService?: ManagedQueueService

	constructor(
		@Inject(DINGTALK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	private get managedQueueService(): ManagedQueueService {
		if (!this._managedQueueService) {
			this._managedQueueService = this.pluginContext.resolve(MANAGED_QUEUE_SERVICE_TOKEN)
		}
		return this._managedQueueService
	}

	async save(
		state: DingTalkTriggerAggregationState,
		ttlSeconds: number = DEFAULT_AGGREGATION_TTL_SECONDS
	): Promise<void> {
		await (await this.getRedis()).set(
			this.buildKey(state.aggregateKey),
			JSON.stringify(state),
			'PX',
			ttlSeconds * 1000
		)
	}

	async get(aggregateKey: string): Promise<DingTalkTriggerAggregationState | null> {
		const redis = await this.getRedis()
		const raw = await redis.get(this.buildKey(aggregateKey))
		if (raw) {
			try {
				return JSON.parse(raw) as DingTalkTriggerAggregationState
			} catch {
				await this.clear(aggregateKey)
				return null
			}
		}

		const legacyState = await this.cacheManager.get<DingTalkTriggerAggregationState>(
			this.buildLegacyKey(aggregateKey)
		)
		return legacyState ?? null
	}

	async clear(aggregateKey: string): Promise<void> {
		await this.cacheManager.del(this.buildLegacyKey(aggregateKey))
		await (await this.getRedis()).del(
			this.buildKey(aggregateKey),
			this.buildLegacyKey(aggregateKey)
		)
	}

	async withAggregateLock<T>(
		aggregateKey: string,
		callback: (lease: DingTalkAggregateLockLease) => Promise<T>,
		options: DingTalkAggregateLockOptions = {}
	): Promise<T> {
		const ttlMs = Math.max(1, options.ttlMs ?? DEFAULT_LOCK_TTL_MS)
		const acquireTimeoutMs = Math.max(
			0,
			options.acquireTimeoutMs ?? DEFAULT_LOCK_ACQUIRE_TIMEOUT_MS
		)
		const retryMinDelayMs = Math.max(
			1,
			options.retryMinDelayMs ?? DEFAULT_LOCK_RETRY_MIN_DELAY_MS
		)
		const retryMaxDelayMs = Math.max(
			retryMinDelayMs,
			options.retryMaxDelayMs ?? DEFAULT_LOCK_RETRY_MAX_DELAY_MS
		)
		const token = randomUUID()
		const key = this.buildLockKey(aggregateKey)
		const stateKey = this.buildKey(aggregateKey)
		const legacyStateKey = this.buildLegacyKey(aggregateKey)
		const acquired = await this.acquireLockWithWait(
			key,
			token,
			ttlMs,
			acquireTimeoutMs,
			retryMinDelayMs,
			retryMaxDelayMs
		)
		if (!acquired) {
			throw new Error('inbound_aggregate_lock_unavailable')
		}

		let stopped = false
		let lostError: Error | undefined
		let renewalInFlight: Promise<void> | undefined
		const renew = async (): Promise<void> => {
			if (stopped || lostError) {
				return
			}
			try {
				if (!(await this.renewLock(key, token, ttlMs))) {
					lostError = new Error('inbound_aggregate_lock_lost')
				}
			} catch {
				lostError = new Error('inbound_aggregate_lock_renew_failed')
			}
		}
		const ensureOwned = async (): Promise<void> => {
			if (renewalInFlight) {
				await renewalInFlight
			}
			if (lostError) {
				throw lostError
			}
			await renew()
			if (lostError) {
				throw lostError
			}
		}
		const clearStateIfOwned = async (): Promise<void> => {
			if (renewalInFlight) {
				await renewalInFlight
			}
			if (lostError) {
				throw lostError
			}
			await this.cacheManager.del(legacyStateKey)
			if (!(await this.deleteAggregateStateIfLockOwned(key, stateKey, legacyStateKey, token))) {
				lostError = new Error('inbound_aggregate_lock_lost')
				throw lostError
			}
		}
		const renewTimer = setInterval(() => {
			if (!renewalInFlight && !lostError) {
				renewalInFlight = renew().finally(() => {
					renewalInFlight = undefined
				})
			}
		}, Math.max(1, Math.floor(ttlMs / 3)))

		try {
			const result = await callback({ ensureOwned, clearStateIfOwned })
			await ensureOwned()
			return result
		} finally {
			stopped = true
			clearInterval(renewTimer)
			await renewalInFlight?.catch(() => undefined)
			await this.releaseLock(key, token)
		}
	}

	private async getRedis(): Promise<ManagedQueueRedis> {
		return this.managedQueueService.getRedis()
	}

	private async acquireLock(key: string, token: string, ttlMs: number): Promise<boolean> {
		const result = await (await this.getRedis()).set(key, token, 'PX', ttlMs, 'NX')
		return result === 'OK'
	}

	private async acquireLockWithWait(
		key: string,
		token: string,
		ttlMs: number,
		acquireTimeoutMs: number,
		retryMinDelayMs: number,
		retryMaxDelayMs: number
	): Promise<boolean> {
		const deadline = Date.now() + acquireTimeoutMs
		while (!(await this.acquireLock(key, token, ttlMs))) {
			const remainingMs = deadline - Date.now()
			if (remainingMs <= 0) {
				return false
			}
			const jitterMs =
				retryMinDelayMs +
				Math.floor(Math.random() * (retryMaxDelayMs - retryMinDelayMs + 1))
			await this.delay(Math.min(jitterMs, remainingMs))
		}
		return true
	}

	private async renewLock(key: string, token: string, ttlMs: number): Promise<boolean> {
		const result = await (await this.getRedis()).eval(
			"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
			1,
			key,
			token,
			String(ttlMs)
		)
		return result === 1
	}

	private async releaseLock(key: string, token: string): Promise<void> {
		await (await this.getRedis()).eval(
			"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
			1,
			key,
			token
		)
	}

	private async deleteAggregateStateIfLockOwned(
		lockKey: string,
		stateKey: string,
		legacyStateKey: string,
		token: string
	): Promise<boolean> {
		const result = await (await this.getRedis()).eval(
			"if redis.call('get', KEYS[1]) ~= ARGV[1] then return -1 end redis.call('del', KEYS[2], KEYS[3]) return 1",
			3,
			lockKey,
			stateKey,
			legacyStateKey,
			token
		)
		return result === 1
	}

	private buildKey(aggregateKey: string): string {
		return `plugin_dingtalk:trigger:aggregate:${aggregateKey}`
	}

	private buildLegacyKey(aggregateKey: string): string {
		return `dingtalk:trigger:aggregate:${aggregateKey}`
	}

	private buildLockKey(aggregateKey: string): string {
		return `plugin_dingtalk:lock:inbound:${aggregateKey}`
	}

	private async delay(milliseconds: number): Promise<void> {
		await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
	}
}

import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { type Cache } from 'cache-manager'
import { LarkTriggerAggregationState } from './lark-trigger-aggregation.types.js'

const DEFAULT_AGGREGATION_TTL_SECONDS = 2 * 60 * 60

@Injectable()
export class LarkTriggerAggregationService {
	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	async save(
		state: LarkTriggerAggregationState,
		ttlSeconds: number = DEFAULT_AGGREGATION_TTL_SECONDS
	): Promise<void> {
		await this.cacheManager.set(this.buildKey(state.aggregateKey), state, ttlSeconds * 1000)
	}

	async get(aggregateKey: string): Promise<LarkTriggerAggregationState | null> {
		const state = await this.cacheManager.get<LarkTriggerAggregationState>(this.buildKey(aggregateKey))
		return state ?? null
	}

	async clear(aggregateKey: string): Promise<void> {
		await this.cacheManager.del(this.buildKey(aggregateKey))
	}

	private buildKey(aggregateKey: string): string {
		return `lark:trigger:aggregate:${aggregateKey}`
	}
}

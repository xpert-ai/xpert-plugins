import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { type Cache } from 'cache-manager'
import { DingTalkTriggerAggregationState } from './dingtalk-trigger-aggregation.types.js'

const DEFAULT_AGGREGATION_TTL_SECONDS = 2 * 60 * 60

@Injectable()
export class DingTalkTriggerAggregationService {
	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	async save(
		state: DingTalkTriggerAggregationState,
		ttlSeconds: number = DEFAULT_AGGREGATION_TTL_SECONDS
	): Promise<void> {
		await this.cacheManager.set(this.buildKey(state.aggregateKey), state, ttlSeconds * 1000)
	}

	async get(aggregateKey: string): Promise<DingTalkTriggerAggregationState | null> {
		const state = await this.cacheManager.get<DingTalkTriggerAggregationState>(this.buildKey(aggregateKey))
		return state ?? null
	}

	async clear(aggregateKey: string): Promise<void> {
		await this.cacheManager.del(this.buildKey(aggregateKey))
	}

	private buildKey(aggregateKey: string): string {
		return `dingtalk:trigger:aggregate:${aggregateKey}`
	}
}

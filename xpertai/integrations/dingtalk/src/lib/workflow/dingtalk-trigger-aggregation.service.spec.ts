jest.mock('@xpert-ai/plugin-sdk', () => ({
	MANAGED_QUEUE_SERVICE_TOKEN: 'MANAGED_QUEUE_SERVICE_TOKEN'
}))

import { DingTalkTriggerAggregationService } from './dingtalk-trigger-aggregation.service.js'
import type { DingTalkTriggerAggregationState } from './dingtalk-trigger-aggregation.types.js'

describe('DingTalkTriggerAggregationService', () => {
	function createRedis(overrides: Record<string, jest.Mock> = {}) {
		return {
			get: jest.fn(async () => null),
			set: jest.fn(async () => 'OK'),
			del: jest.fn(async () => 1),
			eval: jest.fn(async () => 1),
			...overrides
		}
	}

	function createStatefulRedis() {
		const values = new Map<string, string>()
		return {
			get: jest.fn(async (key: string) => values.get(key) ?? null),
			set: jest.fn(
				async (
					key: string,
					value: string,
					_mode?: string,
					_ttlMode?: string | number,
					ttlOrMode?: number | string
				) => {
					if (ttlOrMode === 'NX' && values.has(key)) {
						return null
					}
					values.set(key, value)
					return 'OK'
				}
			),
			del: jest.fn(async (...keys: string[]) => {
				let deleted = 0
				for (const key of keys) {
					if (values.delete(key)) {
						deleted += 1
					}
				}
				return deleted
			}),
			eval: jest.fn(async (script: string, _keyCount: number, ...args: string[]) => {
				const lockKey = args[0]
				const token = script.includes("KEYS[2], KEYS[3]") ? args[3] : args[1]
				if (values.get(lockKey) !== token) {
					return script.includes("KEYS[2], KEYS[3]") ? -1 : 0
				}
				if (script.includes("redis.call('pexpire'")) {
					return 1
				}
				if (script.includes("KEYS[2], KEYS[3]")) {
					values.delete(args[1])
					values.delete(args[2])
					return 1
				}
				values.delete(lockKey)
				return 1
			})
		}
	}

	function createCacheManager(overrides: Record<string, jest.Mock> = {}) {
		return {
			get: jest.fn(async () => null),
			del: jest.fn(async () => true),
			...overrides
		}
	}

	function createService(redis = createRedis(), cacheManager = createCacheManager()) {
		const managedQueue = {
			getRedis: jest.fn(async () => redis)
		}
		const pluginContext = {
			resolve: jest.fn(() => managedQueue)
		}
		return {
			service: new DingTalkTriggerAggregationService(
				pluginContext as any,
				cacheManager as any
			),
			redis,
			cacheManager
		}
	}

	function createState(): DingTalkTriggerAggregationState {
		return {
			aggregateKey: 'integration-1:chat-1:sender-1',
			integrationId: 'integration-1',
			conversationUserKey: 'integration-1:chat-1:sender-1',
			xpertId: 'xpert-1',
			version: 1,
			inputParts: ['hello'],
			lastMessageAt: 1,
			latestMessage: {
				integrationId: 'integration-1'
			}
		}
	}

	it('stores aggregate state as JSON in plugin-scoped Redis keys', async () => {
		const state = createState()
		const redis = createRedis({
			get: jest.fn(async () => JSON.stringify(state))
		})
		const { service } = createService(redis)

		await service.save(state, 60)
		await expect(service.get(state.aggregateKey)).resolves.toEqual(state)

		expect(redis.set).toHaveBeenCalledWith(
			`plugin_dingtalk:trigger:aggregate:${state.aggregateKey}`,
			JSON.stringify(state),
			'PX',
			60000
		)
	})

	it('reads legacy aggregate state during the Redis key migration', async () => {
		const state = createState()
		const redis = createRedis()
		const cacheManager = createCacheManager({
			get: jest.fn(async () => state)
		})
		const { service } = createService(redis, cacheManager)

		await expect(service.get(state.aggregateKey)).resolves.toEqual(state)

		expect(redis.get).toHaveBeenCalledWith(
			`plugin_dingtalk:trigger:aggregate:${state.aggregateKey}`
		)
		expect(cacheManager.get).toHaveBeenCalledWith(
			`dingtalk:trigger:aggregate:${state.aggregateKey}`
		)
	})

	it('clears current and legacy aggregate keys together', async () => {
		const { service, redis, cacheManager } = createService()

		await service.clear('aggregate-1')

		expect(cacheManager.del).toHaveBeenCalledWith(
			'dingtalk:trigger:aggregate:aggregate-1'
		)
		expect(redis.del).toHaveBeenCalledWith(
			'plugin_dingtalk:trigger:aggregate:aggregate-1',
			'dingtalk:trigger:aggregate:aggregate-1'
		)
	})

	it('clears aggregate state only while the per-conversation lock is still owned', async () => {
		const { service, redis, cacheManager } = createService()

		await service.withAggregateLock('aggregate-1', async (lease) => {
			await lease.clearStateIfOwned()
		})

		expect(cacheManager.del).toHaveBeenCalledWith(
			'dingtalk:trigger:aggregate:aggregate-1'
		)
		expect(redis.eval).toHaveBeenCalledWith(
			expect.stringContaining("redis.call('del', KEYS[2], KEYS[3])"),
			3,
			'plugin_dingtalk:lock:inbound:aggregate-1',
			'plugin_dingtalk:trigger:aggregate:aggregate-1',
			'dingtalk:trigger:aggregate:aggregate-1',
			expect.any(String)
		)
	})

	it('does not revive legacy aggregate state after it is cleared', async () => {
		const state = createState()
		let legacyState: DingTalkTriggerAggregationState | undefined = state
		const cacheManager = createCacheManager({
			get: jest.fn(async () => legacyState),
			del: jest.fn(async () => {
				legacyState = undefined
				return true
			})
		})
		const { service } = createService(createRedis(), cacheManager)

		await expect(service.get(state.aggregateKey)).resolves.toEqual(state)
		await service.clear(state.aggregateKey)
		await expect(service.get(state.aggregateKey)).resolves.toBeNull()
	})

	it('waits for another worker to release the aggregate lock before running', async () => {
		const { service } = createService(createStatefulRedis())
		const order: string[] = []
		let signalFirstEntered: () => void = () => undefined
		let releaseFirst: () => void = () => undefined
		const firstEntered = new Promise<void>((resolve) => {
			signalFirstEntered = resolve
		})
		const firstCanFinish = new Promise<void>((resolve) => {
			releaseFirst = resolve
		})

		const first = service.withAggregateLock('aggregate-1', async () => {
			order.push('first')
			signalFirstEntered()
			await firstCanFinish
		})
		await firstEntered

		const second = service.withAggregateLock(
			'aggregate-1',
			async () => {
				order.push('second')
			},
			{
				acquireTimeoutMs: 1000,
				retryMinDelayMs: 1,
				retryMaxDelayMs: 1
			}
		)
		await new Promise<void>((resolve) => setTimeout(resolve, 10))
		expect(order).toEqual(['first'])

		releaseFirst()
		await Promise.all([first, second])
		expect(order).toEqual(['first', 'second'])
	})

	it('rejects work after the bounded aggregate lock wait expires', async () => {
		const redis = createRedis({
			set: jest.fn(async () => null)
		})
		const { service } = createService(redis)
		const callback = jest.fn(async () => undefined)

		await expect(
			service.withAggregateLock('aggregate-1', callback, { acquireTimeoutMs: 0 })
		).rejects.toThrow('inbound_aggregate_lock_unavailable')
		expect(callback).not.toHaveBeenCalled()
	})

	it('does not clear a newer aggregate after lock ownership is lost', async () => {
		let lockToken = ''
		let aggregateState = 'version-2'
		const redis = createRedis({
			set: jest.fn(async (_key: string, token: string) => {
				lockToken = token
				return 'OK'
			}),
			eval: jest.fn(async (script: string, _keyCount: number, ...args: string[]) => {
				if (script.includes("redis.call('del', KEYS[2], KEYS[3])")) {
					if (lockToken !== args[3]) {
						return -1
					}
					aggregateState = ''
					return 1
				}
				if (script.includes("redis.call('pexpire'")) {
					return lockToken === args[1] ? 1 : 0
				}
				return lockToken === args[1] ? 1 : 0
			})
		})
		const { service } = createService(redis)

		await expect(
			service.withAggregateLock('aggregate-1', async (lease) => {
				lockToken = 'new-owner-token'
				aggregateState = 'version-3'
				await lease.clearStateIfOwned()
			})
		).rejects.toThrow('inbound_aggregate_lock_lost')

		expect(aggregateState).toBe('version-3')
	})
})

jest.mock('@xpert-ai/plugin-sdk', () => {
	const { createLarkPluginSdkMock } = require('../../../../test-utils/larkPluginSdkMock.cjs')
	return createLarkPluginSdkMock(jest, {
		MANAGED_QUEUE_SERVICE_TOKEN: 'MANAGED_QUEUE_SERVICE_TOKEN'
	})
})

jest.mock('@larksuiteoapi/node-sdk', () => {
	class EventDispatcher {
		readonly handles = new Map<string, (data: unknown) => Promise<unknown>>()

		register(handles: Record<string, (data: unknown) => Promise<unknown>>) {
			for (const [event, handler] of Object.entries(handles)) {
				this.handles.set(event, handler)
			}
			return this
		}
	}

	return {
		EventDispatcher,
		LoggerLevel: {
			debug: 'debug'
		},
		adaptExpress: jest.fn()
	}
})

import { LarkChannelStrategy } from './lark-channel.strategy.js'

describe('LarkChannelStrategy card action callbacks', () => {
	const ctx = {
		integration: {
			id: 'integration-1',
			options: {
				appId: 'app-id',
				appSecret: 'app-secret',
				verificationToken: 'verification-token',
				encryptKey: 'encrypt-key'
			}
		}
	} as any

	afterEach(() => {
		jest.restoreAllMocks()
	})

	function createStrategy(resolve = jest.fn()) {
		const strategy = new LarkChannelStrategy(
			{
				resolve
			} as any,
			{} as any
		)
		const action = {
			action: 'end',
			messageId: 'message-1'
		}
		jest.spyOn(strategy, 'parseCardAction').mockReturnValue(action as any)
		return { strategy, action }
	}

	function getCardActionCallback(strategy: LarkChannelStrategy, onCardAction: jest.Mock) {
		const dispatcher = strategy.createEventDispatcher(ctx, { onCardAction } as any)
		return (dispatcher as any).handles.get('card.action.trigger') as (
			data: unknown
		) => Promise<unknown>
	}

	async function flushBackgroundHandlers() {
		await new Promise((resolve) => setImmediate(resolve))
		await new Promise((resolve) => setImmediate(resolve))
	}

	it('returns a valid empty card response while processing the action in background', async () => {
		const { strategy, action } = createStrategy()
		const onCardAction = jest.fn().mockResolvedValue(undefined)
		const callback = getCardActionCallback(strategy, onCardAction)

		await expect(callback({ event: 'card-action' })).resolves.toEqual({})
		await flushBackgroundHandlers()

		expect(onCardAction).toHaveBeenCalledTimes(1)
		expect(onCardAction).toHaveBeenCalledWith(action, ctx)
	})

	it('claims the event id through Redis so duplicate deliveries across instances execute once', async () => {
		const claimedKeys = new Set<string>()
		const redis = {
			set: jest.fn(async (key: string) => {
				if (claimedKeys.has(key)) {
					return null
				}
				claimedKeys.add(key)
				return 'OK'
			})
		}
		const managedQueue = {
			getRedis: jest.fn().mockResolvedValue(redis)
		}
		const resolve = jest.fn().mockReturnValue(managedQueue)
		const first = createStrategy(resolve)
		const second = createStrategy(resolve)
		const onCardAction = jest.fn().mockResolvedValue(undefined)
		const firstCallback = getCardActionCallback(first.strategy, onCardAction)
		const secondCallback = getCardActionCallback(second.strategy, onCardAction)

		await expect(
			Promise.all([
				firstCallback({ event_id: 'event-duplicate' }),
				secondCallback({ event_id: 'event-duplicate' })
			])
		).resolves.toEqual([{}, {}])
		await flushBackgroundHandlers()

		expect(onCardAction).toHaveBeenCalledTimes(1)
		expect(redis.set).toHaveBeenCalledTimes(2)
		expect(redis.set).toHaveBeenCalledWith(
			'plugin_lark:card_action:event:integration-1:event-duplicate',
			'1',
			'PX',
			10 * 60 * 1000,
			'NX'
		)
	})

	it('processes different event ids independently', async () => {
		const redis = {
			set: jest.fn().mockResolvedValue('OK')
		}
		const { strategy } = createStrategy(
			jest.fn().mockReturnValue({ getRedis: jest.fn().mockResolvedValue(redis) })
		)
		const onCardAction = jest.fn().mockResolvedValue(undefined)
		const callback = getCardActionCallback(strategy, onCardAction)

		await Promise.all([
			callback({ event_id: 'event-distinct-a' }),
			callback({ event_id: 'event-distinct-b' })
		])
		await flushBackgroundHandlers()

		expect(onCardAction).toHaveBeenCalledTimes(2)
		expect(redis.set).toHaveBeenCalledTimes(2)
	})

	it('preserves legacy behavior when event_id is missing', async () => {
		const resolve = jest.fn()
		const { strategy } = createStrategy(resolve)
		const onCardAction = jest.fn().mockResolvedValue(undefined)
		const callback = getCardActionCallback(strategy, onCardAction)

		await Promise.all([callback({ event: 'legacy-action' }), callback({ event: 'legacy-action' })])
		await flushBackgroundHandlers()

		expect(onCardAction).toHaveBeenCalledTimes(2)
		expect(resolve).not.toHaveBeenCalled()
	})

	it('acks immediately and uses process-local deduplication when Redis is unavailable', async () => {
		let rejectRedis: (error: Error) => void = () => undefined
		const pendingRedis = new Promise<never>((_resolve, reject) => {
			rejectRedis = reject
		})
		const getRedis = jest
			.fn()
			.mockReturnValueOnce(pendingRedis)
			.mockRejectedValue(new Error('redis unavailable'))
		const resolve = jest.fn().mockReturnValue({ getRedis })
		const first = createStrategy(resolve)
		const second = createStrategy(resolve)
		const onCardAction = jest.fn().mockResolvedValue(undefined)
		const firstCallback = getCardActionCallback(first.strategy, onCardAction)
		const secondCallback = getCardActionCallback(second.strategy, onCardAction)

		await expect(firstCallback({ event_id: 'event-fallback' })).resolves.toEqual({})
		expect(onCardAction).not.toHaveBeenCalled()

		rejectRedis(new Error('redis unavailable'))
		await flushBackgroundHandlers()
		await expect(secondCallback({ event_id: 'event-fallback' })).resolves.toEqual({})
		await flushBackgroundHandlers()

		expect(onCardAction).toHaveBeenCalledTimes(1)
	})
})

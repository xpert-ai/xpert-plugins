import { LarkChatRunStateService } from './lark-chat-run-state.service.js'
import { MemoryRedis } from './testing/memory-redis.js'
import type { Cache } from 'cache-manager'
import type { PluginContext } from '@xpert-ai/plugin-sdk'
import { createRunState } from './testing/callback-fixture.js'

jest.mock('@xpert-ai/plugin-sdk', () => {
	const { createLarkPluginSdkMock } = require('../../../../../test-utils/larkPluginSdkMock.cjs')
	return createLarkPluginSdkMock(jest, {
		HandoffProcessorStrategy: () => (target: unknown) => target,
		PluginJobProcessor: () => (target: unknown) => target
	})
})
describe('LarkChatRunStateService', () => {
	const redis = new MemoryRedis()
	const cache = { get: jest.fn() }
	const context = { resolve: () => ({ getRedis: async () => redis }) }
	const service = () => new LarkChatRunStateService(cache as Cache, context as PluginContext)
	beforeEach(() => {
		redis.values.clear()
		cache.get.mockReset()
	})
	it('observes progress committed by another callback worker', async () => {
		const first = service(),
			second = service(),
			state = createRunState()
		await first.initialize(state)
		await second.withRun(state.sourceMessageId, state.context, async (lease) => {
			lease.state.nextSequence = 3
			await lease.save(lease.state)
		})
		await first.withRun(state.sourceMessageId, state.context, async (lease) => {
			expect(lease.state.nextSequence).toBe(3)
		})
	})
	it('reads a legacy multilingual base64 snapshot then uses the shared store', async () => {
		const state = createRunState({ responseMessageContent: '你好，飞书 👋' })
		cache.get.mockResolvedValue('lark-run-state:b64json:' + Buffer.from(JSON.stringify(state)).toString('base64'))
		await service().withRun(state.sourceMessageId, state.context, async (lease) => {
			expect(lease.state.responseMessageContent).toBe('你好，飞书 👋')
			await lease.save(lease.state)
		})
		cache.get.mockResolvedValue('corrupt')
		await service().withRun(state.sourceMessageId, state.context, async (lease) => {
			expect(lease.state.responseMessageContent).toBe('你好，飞书 👋')
		})
	})
	it('does not resurrect a completed run from a legacy snapshot', async () => {
		const state = createRunState()
		await service().initialize(state)
		await service().withRun(state.sourceMessageId, state.context, async (lease) => {
			await lease.finish()
		})
		cache.get.mockResolvedValue(state)
		await service().withRun(state.sourceMessageId, state.context, async (lease) => {
			expect(lease.completed).toBe(true)
			expect(lease.state).toBeNull()
		})
	})
})

import { Test } from '@nestjs/testing'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { LarkChatRunStateService, LarkChatRunState } from './lark-chat-run-state.service.js'

describe('LarkChatRunStateService', () => {
	const store = new Map<string, unknown>()
	const cacheManager = {
		set: jest.fn(async (key: string, value: unknown) => {
			store.set(key, value)
		}),
		get: jest.fn(async (key: string) => store.get(key)),
		del: jest.fn(async (key: string) => {
			store.delete(key)
		})
	}

	beforeEach(() => {
		store.clear()
		jest.clearAllMocks()
	})

	function createState(sourceMessageId: string): LarkChatRunState {
		return {
			sourceMessageId,
			nextSequence: 1,
			responseMessageContent: '您说得对，李林浩确实已经被@提及了。我现在就给他发送消息。',
			context: {
				tenantId: 'tenant-id',
				userId: 'user-id',
				xpertId: 'xpert-id',
				message: {
					text: '@飞书测试 @李林浩 这不是提到了吗？',
					elements: [],
					renderItems: []
				}
			},
			pendingEvents: {},
			lastFlushAt: 0,
			lastFlushedLength: 0,
			renderItems: [
				{
					kind: 'stream_text',
					text: '您说得对，李林浩确实已经被@提及了。我现在就给他发送消息。'
				}
			]
		}
	}

	it('round-trips multilingual run state from encoded cache payload', async () => {
		const moduleRef = await Test.createTestingModule({
			providers: [
				LarkChatRunStateService,
				{
					provide: CACHE_MANAGER,
					useValue: cacheManager
				}
			]
		}).compile()

		const service = moduleRef.get(LarkChatRunStateService)
		const state = createState('run-zh')

		await service.save(state)
		await service.clear('run-zh')

		const cacheKey = 'lark:handoff:run:run-zh'
		const serialized = store.get(cacheKey)
		expect(typeof serialized).toBe('string')

		await cacheManager.set(cacheKey, serialized)
		const restored = await service.get('run-zh')

		expect(restored?.responseMessageContent).toBe(state.responseMessageContent)
		expect((restored?.renderItems[0] as { text?: string })?.text).toBe(
			(state.renderItems[0] as { text?: string })?.text
		)
		expect(restored?.context.message.text).toBe(state.context.message.text)
	})

	it('prefers in-memory hot state without requiring cache roundtrip', async () => {
		const moduleRef = await Test.createTestingModule({
			providers: [
				LarkChatRunStateService,
				{
					provide: CACHE_MANAGER,
					useValue: cacheManager
				}
			]
		}).compile()

		const service = moduleRef.get(LarkChatRunStateService)
		const state = createState('run-hot')

		await service.save(state)
		store.set('lark:handoff:run:run-hot', 'corrupted')

		const restored = await service.get('run-hot')
		expect(restored?.responseMessageContent).toBe(state.responseMessageContent)
	})
})

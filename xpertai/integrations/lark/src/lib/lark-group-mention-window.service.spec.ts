import { buildLarkGroupWindowPrompt } from './lark-agent-prompt.js'
import { LarkChannelStrategy } from './lark-channel.strategy.js'
import { LarkGroupMentionWindowService } from './lark-group-mention-window.service.js'
import { LARK_TYPING_REACTION_EMOJI_TYPE } from './types.js'

class MemoryCache {
	private readonly store = new Map<string, unknown>()

	async get<T = unknown>(key: string): Promise<T | undefined> {
		return this.store.get(key) as T | undefined
	}

	async set(key: string, value: unknown) {
		this.store.set(key, value)
	}

	async del(key: string) {
		this.store.delete(key)
	}
}

describe('LarkGroupMentionWindowService', () => {
	afterEach(() => {
		jest.useRealTimers()
	})

	function createFlushQueueMock() {
		return {
			getJob: jest.fn().mockResolvedValue(null),
			add: jest.fn().mockResolvedValue(undefined),
			process: jest.fn(),
			on: jest.fn(),
			close: jest.fn().mockResolvedValue(undefined)
		}
	}

	function createService(config?: Partial<{
		debounceMs: number
		maxWindowMs: number
		maxMessages: number
		maxParticipants: number
	}>) {
		const scopeQueue = {
			add: jest.fn().mockResolvedValue(undefined)
		}
		const larkChannel = {
			createMessageReaction: jest.fn().mockImplementation(async (_integrationId: string, messageId: string, emojiType: string) => ({
				messageId,
				reactionId: `reaction-for-${messageId}`,
				emojiType
			}))
		}
		const service = new LarkGroupMentionWindowService(new MemoryCache() as any, {
			config: {
				groupMentionWindow: {
					debounceMs: config?.debounceMs ?? 2000,
					maxWindowMs: config?.maxWindowMs ?? 8000,
					maxMessages: config?.maxMessages ?? 8,
					maxParticipants: config?.maxParticipants ?? 6
				}
			}
		} as any, {
			get: jest.fn().mockImplementation((token: unknown) => {
				if (token === LarkChannelStrategy) {
					return larkChannel
				}
				return {
					getScopeQueue: jest.fn().mockResolvedValue(scopeQueue)
				}
			})
		} as any)
		;(service as any).flushQueue = createFlushQueueMock()
		return {
			service,
			scopeQueue,
			larkChannel,
			flushQueue: (service as any).flushQueue
		}
	}

	function createContext(overrides: Record<string, unknown> = {}) {
		return {
			tenant: null,
			organizationId: 'org-1',
			integrationId: 'integration-1',
			userId: 'user-1',
			chatId: 'chat-1',
			chatType: 'group',
			senderOpenId: 'ou-1',
			senderName: 'Alice',
			scopeKey: 'lark:v2:scope:integration-1:group:chat-1',
			input: 'hello',
			message: {
				message: {
					message_id: 'm-1',
					create_time: '1710000000000'
				}
			},
			semanticMessage: {
				mentions: []
			},
			...overrides
		} as any
	}

	it('merges multiple group mentions into one flushed context', async () => {
		const { service, scopeQueue, larkChannel } = createService({
			maxMessages: 2
		})

		await service.ingest(createContext())
		await service.ingest(
			createContext({
				userId: 'user-2',
				senderOpenId: 'ou-2',
				senderName: 'Bob',
				input: 'world',
				message: {
					message: {
						message_id: 'm-2',
						create_time: '1710000002000'
					}
				}
			})
		)

		expect(scopeQueue.add).toHaveBeenCalledTimes(1)
		const flushed = (scopeQueue.add as jest.Mock).mock.calls[0][0]
		expect(flushed.groupWindow.items).toHaveLength(2)
		expect(flushed.replyToMessageId).toBe('m-1')
		expect(flushed.typingReaction).toEqual({
			messageId: 'm-1',
			reactionId: 'reaction-for-m-1',
			emojiType: LARK_TYPING_REACTION_EMOJI_TYPE
		})
		expect(flushed.input).toContain('[\u7fa4\u804a\u77ed\u7a97\u4e0a\u4e0b\u6587]')
		expect(flushed.input).toContain('- Alice [00:00:00]: hello')
		expect(flushed.input).toContain('- Bob [00:00:02]: world')
		expect(larkChannel.createMessageReaction).toHaveBeenCalledTimes(1)
		expect(larkChannel.createMessageReaction).toHaveBeenCalledWith(
			'integration-1',
			'm-1',
			LARK_TYPING_REACTION_EMOJI_TYPE
		)
	})

	it('flushes a restored cached window without relying on in-memory handlers', async () => {
		const cache = new MemoryCache()
		const firstScopeQueue = {
			add: jest.fn().mockResolvedValue(undefined)
		}
		const firstLarkChannel = {
			createMessageReaction: jest.fn().mockResolvedValue({
				messageId: 'm-1',
				reactionId: 'reaction-for-m-1',
				emojiType: LARK_TYPING_REACTION_EMOJI_TYPE
			})
		}
		const first = new LarkGroupMentionWindowService(cache as any, {
			config: {
				groupMentionWindow: {
					debounceMs: 2000,
					maxWindowMs: 8000,
					maxMessages: 8,
					maxParticipants: 6
				}
			}
		} as any, {
			get: jest.fn().mockImplementation((token: unknown) => {
				if (token === LarkChannelStrategy) {
					return firstLarkChannel
				}
				return {
					getScopeQueue: jest.fn().mockResolvedValue(firstScopeQueue)
				}
			})
		} as any)
		;(first as any).flushQueue = createFlushQueueMock()

		await first.ingest(createContext())

		const scopeQueue = {
			add: jest.fn().mockResolvedValue(undefined)
		}
		const restored = new LarkGroupMentionWindowService(cache as any, {
			config: {
				groupMentionWindow: {
					debounceMs: 2000,
					maxWindowMs: 8000,
					maxMessages: 8,
					maxParticipants: 6
				}
			}
		} as any, {
			get: jest.fn().mockImplementation((token: unknown) => {
				if (token === LarkChannelStrategy) {
					return {
						createMessageReaction: jest.fn()
					}
				}
				return {
					getScopeQueue: jest.fn().mockResolvedValue(scopeQueue)
				}
			})
		} as any)
		;(restored as any).flushQueue = createFlushQueueMock()

		const key = restored.buildKey({
			integrationId: 'integration-1',
			chatId: 'chat-1'
		})
		await (restored as any).flushWindow(key)

		expect(scopeQueue.add).toHaveBeenCalledTimes(1)
		const flushed = (scopeQueue.add as jest.Mock).mock.calls[0][0]
		expect(flushed.groupWindow.items).toHaveLength(1)
		expect(flushed.input).toBe('Alice: hello')
	})
})

describe('buildLarkGroupWindowPrompt', () => {
	it('uses speaker context for a single message window', () => {
		const prompt = buildLarkGroupWindowPrompt({
			windowId: 'window-1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			scopeKey: 'scope-1',
			openedAt: 1,
			lastEventAt: 1,
			items: [
				{
					messageId: 'm-1',
					senderOpenId: 'ou-1',
					senderName: 'Alice',
					text: 'hello',
					mentions: []
				}
			],
			participants: []
		} as any)

		expect(prompt).toBe('Alice: hello')
	})
})

import { LarkConversationService } from './conversation.service.js'
import {
	CancelConversationCommand,
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	RequestContext
} from '@xpert-ai/plugin-sdk'
import { DispatchLarkChatCommand } from './handoff/commands/dispatch-lark-chat.command.js'
import {
	ChatLarkContext,
	LARK_CONFIRM,
	LARK_END_CONVERSATION,
	LARK_REJECT,
	LARK_TYPING_REACTION_EMOJI_TYPE
} from './types.js'
import { LarkTriggerStrategy } from './workflow/lark-trigger.strategy.js'

const DEFAULT_TRIGGER_CONFIG = {
	enabled: true,
	singleChatScope: 'all_users',
	singleChatUserOpenIds: [],
	executeAsMappedUser: false,
	streamingEnabled: true,
	allowedGroupScope: 'all_chats',
	allowedGroupChatIds: [],
	groupUserScope: 'all_users',
	groupUserOpenIds: [],
	groupReplyStrategy: 'mention_only'
} as const

class MemoryCache {
	private readonly store = new Map<string, unknown>()

	async set(key: string, value: unknown) {
		this.store.set(key, value)
	}

	async get<T = unknown>(key: string): Promise<T | undefined> {
		return this.store.get(key) as T | undefined
	}

	async del(key: string) {
		this.store.delete(key)
	}
}

type PersistedConversationBinding = {
	userId?: string | null
	integrationId?: string | null
	principalKey?: string | null
	scopeKey?: string | null
	chatType?: string | null
	chatId?: string | null
	senderOpenId?: string | null
	conversationUserKey?: string | null
	xpertId: string
	conversationId: string
	tenantId?: string | null
	organizationId?: string | null
	createdById?: string | null
	updatedById?: string | null
	updatedAt?: Date
}

type PersistedTriggerBinding = {
	integrationId: string
	xpertId: string
	config?: Record<string, unknown>
	ownerOpenId?: string | null
}

describe('LarkConversationService', () => {
	const userId = 'user-1'
	const xpertId = 'xpert-1'

	function createChatContext(): ChatLarkContext {
		return {
			tenant: null as any,
			organizationId: 'org-1',
			integrationId: 'integration-1',
			userId,
			chatId: 'chat-1'
		}
	}

	function createFixture(params?: {
		boundXpertId?: string | null
		triggerHandled?: boolean
		triggerMatches?: boolean
		legacyXpertId?: string | null
		conversationBindings?: PersistedConversationBinding[]
		triggerConfig?: Record<string, unknown>
		triggerOwnerOpenId?: string | null
	}) {
		const persistedConversationBindings = [...(params?.conversationBindings ?? [])]
		let bindingSequence = persistedConversationBindings.length
		const nextUpdatedAt = () => {
			bindingSequence += 1
			return new Date(bindingSequence * 1000)
		}
		const commandBus = {
			execute: jest.fn().mockResolvedValue(undefined)
		}
		const integrationPermissionService = {
			read: jest.fn().mockResolvedValue({
				id: 'integration-1',
				options: {
					xpertId: params?.legacyXpertId === undefined ? 'legacy-xpert' : params.legacyXpertId,
					preferLanguage: 'en_US'
				}
			})
		}
		const larkTriggerStrategy = {
			normalizeConfig: jest.fn().mockImplementation((config?: Record<string, unknown>) => ({
				...DEFAULT_TRIGGER_CONFIG,
				integrationId: 'integration-1',
				...(config ?? {})
			})),
			matchesInboundMessage: jest.fn().mockImplementation((options: any) => {
				if (params?.triggerMatches !== undefined) {
					return params.triggerMatches
				}
				const config = {
					...DEFAULT_TRIGGER_CONFIG,
					integrationId: 'integration-1',
					...(options?.binding?.config ?? options?.config ?? {})
				}
				if (config.groupReplyStrategy !== 'all_messages') {
					return false
				}
				return true
			}),
			handleInboundMessage: jest
				.fn()
				.mockResolvedValue(params?.triggerHandled === undefined ? false : params.triggerHandled)
		}
		const persistedTriggerBinding: PersistedTriggerBinding | null =
			params?.boundXpertId === undefined || params.boundXpertId === null
				? null
				: {
						integrationId: 'integration-1',
						xpertId: params.boundXpertId,
						config: params?.triggerConfig ?? {
							integrationId: 'integration-1',
							...DEFAULT_TRIGGER_CONFIG
						},
						ownerOpenId: params?.triggerOwnerOpenId ?? 'ou_owner_1'
				  }
		const sortBindings = (
			items: PersistedConversationBinding[],
			order?: {
				updatedAt?: 'ASC' | 'DESC'
			}
		) => {
			const toTime = (value?: Date) => (value instanceof Date ? value.getTime() : 0)
			return [...items].sort((a, b) => {
				if (order?.updatedAt === 'ASC') {
					return toTime(a.updatedAt) - toTime(b.updatedAt)
				}
				return toTime(b.updatedAt) - toTime(a.updatedAt)
			})
		}
		const conversationBindingRepository = {
			findOne: jest
				.fn()
				.mockImplementation(
					async ({
						where,
						order
					}: {
						where: Partial<PersistedConversationBinding>
						order?: {
							updatedAt?: 'ASC' | 'DESC'
						}
					}) => {
						if (where.scopeKey && where.xpertId) {
							return (
								persistedConversationBindings.find(
									(item) => item.scopeKey === where.scopeKey && item.xpertId === where.xpertId
								) ?? null
							)
						}
						if (where.scopeKey) {
							return sortBindings(
								persistedConversationBindings.filter((item) => item.scopeKey === where.scopeKey),
								order
							)[0] ?? null
						}
						if (where.principalKey) {
							return sortBindings(
								persistedConversationBindings.filter((item) => item.principalKey === where.principalKey),
								order
							)[0] ?? null
						}
						if (where.integrationId && where.chatId) {
							return sortBindings(
								persistedConversationBindings.filter(
									(item) => item.integrationId === where.integrationId && item.chatId === where.chatId
								),
								order
							)[0] ?? null
						}
						if (where.userId !== undefined && where.integrationId !== undefined) {
							return sortBindings(
								persistedConversationBindings.filter(
									(item) => item.userId === where.userId && item.integrationId === where.integrationId
								),
								order
							)[0] ?? null
						}
						if (where.userId !== undefined) {
							return sortBindings(
								persistedConversationBindings.filter((item) => item.userId === where.userId),
								order
							)[0] ?? null
						}
						if (where.conversationUserKey && where.xpertId) {
							return (
								persistedConversationBindings.find(
									(item) =>
										item.conversationUserKey === where.conversationUserKey && item.xpertId === where.xpertId
								) ?? null
							)
						}
						if (where.xpertId) {
							const items = sortBindings(
								persistedConversationBindings.filter((item) => item.xpertId === where.xpertId),
								order
							)
							if (!items.length) {
								return null
							}
							return items[0]
						}
						return null
					}
				),
				find: jest
					.fn()
					.mockImplementation(
						async ({
							where,
							order
						}: {
							where: Partial<PersistedConversationBinding>
							order?: {
								updatedAt?: 'ASC' | 'DESC'
							}
						}) => {
							if (where.userId !== undefined) {
								return sortBindings(
									persistedConversationBindings.filter((item) => item.userId === where.userId),
									order
								)
							}
							return []
						}
					),
				upsert: jest
				.fn()
				.mockImplementation(
					async (
						payload: PersistedConversationBinding,
						conflictPaths: Array<'userId' | 'conversationUserKey' | 'scopeKey' | 'xpertId'>
					) => {
						if (conflictPaths.includes('scopeKey') && payload.scopeKey) {
							const index = persistedConversationBindings.findIndex(
								(item) => item.scopeKey === payload.scopeKey && item.xpertId === payload.xpertId
							)
							if (index >= 0) {
								persistedConversationBindings[index] = {
									...persistedConversationBindings[index],
									...payload,
									updatedAt: nextUpdatedAt()
								}
							} else {
								persistedConversationBindings.push({
									...payload,
									updatedAt: payload.updatedAt ?? nextUpdatedAt()
								})
							}
						} else if (conflictPaths.includes('userId') && payload.userId) {
							const index = persistedConversationBindings.findIndex(
								(item) => item.userId === payload.userId
							)
							if (index >= 0) {
								persistedConversationBindings[index] = {
									...persistedConversationBindings[index],
									...payload,
									updatedAt: nextUpdatedAt()
								}
							} else {
								persistedConversationBindings.push({
									...payload,
									updatedAt: payload.updatedAt ?? nextUpdatedAt()
								})
							}
						} else {
							const index = persistedConversationBindings.findIndex(
								(item) =>
									item.conversationUserKey === payload.conversationUserKey && item.xpertId === payload.xpertId
							)
							if (index >= 0) {
								persistedConversationBindings[index] = {
									...persistedConversationBindings[index],
									...payload,
									updatedAt: nextUpdatedAt()
								}
							} else {
								persistedConversationBindings.push({
									...payload,
									updatedAt: payload.updatedAt ?? nextUpdatedAt()
								})
							}
						}
						return { generatedMaps: [], raw: [], identifiers: [] }
					}
				),
			delete: jest
				.fn()
				.mockImplementation(async (criteria: Partial<PersistedConversationBinding>) => {
					let removed = 0
					for (let index = persistedConversationBindings.length - 1; index >= 0; index--) {
						const item = persistedConversationBindings[index]
						const matchUserId = criteria.userId === undefined || item.userId === criteria.userId
						const matchScopeKey = criteria.scopeKey === undefined || item.scopeKey === criteria.scopeKey
						const matchUserKey =
							criteria.conversationUserKey === undefined ||
							item.conversationUserKey === criteria.conversationUserKey
						const matchXpertId = criteria.xpertId === undefined || item.xpertId === criteria.xpertId
						if (matchUserId && matchScopeKey && matchUserKey && matchXpertId) {
							persistedConversationBindings.splice(index, 1)
							removed++
						}
					}
					return { affected: removed }
				})
		}
		const triggerBindingRepository = {
			findOne: jest
				.fn()
				.mockImplementation(async ({ where }: { where: { integrationId?: string } }) => {
					if (!where.integrationId) {
						return null
					}
					if (
						persistedTriggerBinding &&
						persistedTriggerBinding.integrationId === where.integrationId
					) {
						return persistedTriggerBinding
					}
					return null
				})
		}
		const pluginContext = {
			resolve: jest.fn((token: unknown) => {
				if (token === INTEGRATION_PERMISSION_SERVICE_TOKEN) {
					return integrationPermissionService
				}
				if (token === LarkTriggerStrategy) {
					return larkTriggerStrategy
				}
				throw new Error(`Unexpected token: ${String(token)}`)
			})
		}
		const cache = new MemoryCache()
		const larkChannel = {
			createMessageReaction: jest.fn().mockImplementation(async (_integrationId: string, messageId: string, emojiType: string) => ({
				messageId,
				reactionId: `reaction-for-${messageId}`,
				emojiType
			})),
			deleteMessageReaction: jest.fn().mockResolvedValue(undefined),
			errorMessage: jest.fn().mockResolvedValue(undefined),
			patchInteractiveMessage: jest.fn().mockResolvedValue(undefined),
			interactiveMessage: jest.fn().mockResolvedValue({ data: { message_id: 'generated-lark-message-id' } }),
			resolveUserNameByOpenId: jest.fn().mockResolvedValue(null)
		}
		const recipientDirectoryService = {
			buildKey: jest.fn().mockImplementation(({ integrationId, chatType, chatId, senderOpenId }) => {
				if (!integrationId) {
					return null
				}
				return chatType === 'group'
					? `lark:recipient-dir:${integrationId}:chat:${chatId}`
					: `lark:recipient-dir:${integrationId}:user:${senderOpenId}`
			}),
			upsertSender: jest.fn().mockResolvedValue(undefined),
			upsertMentions: jest.fn().mockResolvedValue(undefined),
			resolveByName: jest.fn().mockResolvedValue({ status: 'not_found' }),
			resolveByOpenId: jest.fn().mockResolvedValue(null)
		}
		const groupMentionWindowService = {
			ingest: jest.fn().mockResolvedValue(false)
		}
		const service = new LarkConversationService(
			commandBus as any,
			cache as any,
			larkChannel as any,
			recipientDirectoryService as any,
			groupMentionWindowService as any,
			conversationBindingRepository as any,
			triggerBindingRepository as any,
			pluginContext as any
		)

		return {
			service,
			commandBus,
			larkChannel,
			integrationPermissionService,
			larkTriggerStrategy,
			recipientDirectoryService,
			groupMentionWindowService,
			conversationBindingRepository,
			triggerBindingRepository,
			persistedConversationBindings
		}
	}

	beforeEach(() => {
		jest.restoreAllMocks()
	})

	function getExecutedDispatchCommands(commandBus: { execute: jest.Mock }) {
		return commandBus.execute.mock.calls
			.map(([command]) => command)
			.filter((command) => command instanceof DispatchLarkChatCommand) as DispatchLarkChatCommand[]
	}

	it('handleMessage routes non-mentioned group messages into trigger queue when all_messages is enabled', async () => {
		const { service, groupMentionWindowService, larkChannel } = createFixture({
			boundXpertId: 'trigger-xpert',
			triggerConfig: {
				integrationId: 'integration-1',
				...DEFAULT_TRIGGER_CONFIG,
				groupReplyStrategy: 'all_messages'
			}
		})
		const add = jest.fn().mockResolvedValue(undefined)
		jest.spyOn(service, 'getScopeQueue').mockResolvedValue({
			add
		} as any)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: 'creator-user-1',
			tenantId: 'tenant-1',
			larkInboundIdentity: {
				mappedUserId: 'mapped-user-1'
			}
		} as any)

		await service.handleMessage(
			{
				chatId: 'chat-1',
				chatType: 'group',
				messageId: 'message-1',
				senderId: 'ou_sender_1',
				senderName: 'Alice',
				content: 'hello',
				raw: {},
				semanticMessage: {
					rawText: 'hello',
					displayText: 'hello',
					agentText: 'hello',
					mentions: []
				},
				isBotMentioned: false
			} as any,
			{
				organizationId: 'org-1',
				integration: {
					id: 'integration-1',
					tenant: null,
					options: {
						preferLanguage: 'en_US'
					}
				}
			} as any
		)

		expect(add).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'creator-user-1',
				mappedUserId: 'mapped-user-1',
				botMentioned: false,
				replyToMessageId: 'message-1',
				typingReaction: {
					messageId: 'message-1',
					reactionId: 'reaction-for-message-1',
					emojiType: LARK_TYPING_REACTION_EMOJI_TYPE
				}
			})
		)
		expect(larkChannel.createMessageReaction).toHaveBeenCalledWith(
			'integration-1',
			'message-1',
			LARK_TYPING_REACTION_EMOJI_TYPE
		)
		expect(groupMentionWindowService.ingest).not.toHaveBeenCalled()
	})

	it('handleMessage keeps group fallback mention-only when all_messages is not enabled', async () => {
		const { service, groupMentionWindowService } = createFixture({
			boundXpertId: 'trigger-xpert',
			triggerConfig: {
				integrationId: 'integration-1',
				...DEFAULT_TRIGGER_CONFIG,
				groupReplyStrategy: 'mention_only'
			}
		})
		const add = jest.fn().mockResolvedValue(undefined)
		jest.spyOn(service, 'getScopeQueue').mockResolvedValue({
			add
		} as any)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: 'creator-user-1',
			tenantId: 'tenant-1'
		} as any)

		await service.handleMessage(
			{
				chatId: 'chat-1',
				chatType: 'group',
				senderId: 'ou_sender_1',
				senderName: 'Alice',
				content: 'hello',
				raw: {},
				semanticMessage: {
					rawText: 'hello',
					displayText: 'hello',
					agentText: 'hello',
					mentions: []
				},
				isBotMentioned: false
			} as any,
			{
				organizationId: 'org-1',
				integration: {
					id: 'integration-1',
					tenant: null,
					options: {
						preferLanguage: 'en_US'
					}
				}
			} as any
		)

		expect(add).not.toHaveBeenCalled()
		expect(groupMentionWindowService.ingest).not.toHaveBeenCalled()
	})

	it('processMessage uses mapped sender as fromEndUserId instead of creator fallback', async () => {
		const { service, commandBus } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: 'legacy-xpert'
		})

		await service.processMessage({
			userId: 'creator-user-1',
			mappedUserId: 'mapped-user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello' })
				}
			}
		} as any)

		const dispatchCommands = getExecutedDispatchCommands(commandBus as any)
		expect(dispatchCommands).toHaveLength(1)
		expect(dispatchCommands[0].input.options?.fromEndUserId).toBe('mapped-user-1')
	})

	it('setConversation persists to binding table and resolves latest by open_id', async () => {
		const { service, conversationBindingRepository } = createFixture()

		await service.setConversation('open_id:ou_sender_1', 'xpert-1', 'conversation-1')

		expect(conversationBindingRepository.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'ou_sender_1',
				conversationUserKey: 'open_id:ou_sender_1',
				xpertId: 'xpert-1',
				conversationId: 'conversation-1'
			}),
			['userId']
		)
		expect(await service.getLatestConversationBindingByUserId('ou_sender_1')).toEqual({
			xpertId: 'xpert-1',
			conversationId: 'conversation-1',
			conversationUserKey: 'open_id:ou_sender_1'
		})
	})

	it('setConversation for non-open_id binding does not participate latest user lookup', async () => {
		const { service, conversationBindingRepository } = createFixture()

		await service.setConversation('email:target@example.com', 'xpert-1', 'conversation-1')

		expect(conversationBindingRepository.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: null,
				conversationUserKey: 'email:target@example.com',
				xpertId: 'xpert-1',
				conversationId: 'conversation-1'
			}),
			['conversationUserKey', 'xpertId']
		)
		expect(await service.getLatestConversationBindingByUserId('target@example.com')).toBeNull()
		expect(await service.getConversation('email:target@example.com', 'xpert-1')).toBe('conversation-1')
	})

	it('getLatestConversationBindingByUserId prefers bindings from the current integration', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					integrationId: 'integration-2',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-other-integration',
					conversationId: 'conversation-other',
					updatedAt: new Date('2026-02-01T00:00:00.000Z')
				},
				{
					userId: 'ou_sender_1',
					integrationId: 'integration-1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-current-integration',
					conversationId: 'conversation-current',
					updatedAt: new Date('2026-01-01T00:00:00.000Z')
				}
			]
		})

		await expect(
			service.getLatestConversationBindingByUserId('ou_sender_1', 'integration-1')
		).resolves.toEqual({
			userId: 'ou_sender_1',
			integrationId: 'integration-1',
			xpertId: 'xpert-current-integration',
			conversationId: 'conversation-current',
			conversationUserKey: 'open_id:ou_sender_1'
		})
	})

	it('getLatestConversationBindingByUserId falls back to integrationless legacy bindings before crossing integrations', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					integrationId: 'integration-2',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-other-integration',
					conversationId: 'conversation-other',
					updatedAt: new Date('2026-03-01T00:00:00.000Z')
				},
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-legacy',
					conversationId: 'conversation-legacy',
					updatedAt: new Date('2026-01-01T00:00:00.000Z')
				}
			]
		})

		await expect(
			service.getLatestConversationBindingByUserId('ou_sender_1', 'integration-1')
		).resolves.toEqual({
			userId: 'ou_sender_1',
			xpertId: 'xpert-legacy',
			conversationId: 'conversation-legacy',
			conversationUserKey: 'open_id:ou_sender_1'
		})
	})

	it('setConversation for group scope does not persist legacy conversationUserKey', async () => {
		const { service, conversationBindingRepository } = createFixture()

		await service.setConversation('lark:v2:scope:integration-1:group:chat-1', 'xpert-1', 'conversation-1', {
			userId: 'user-1',
			integrationId: 'integration-1',
			principalKey: 'lark:v2:principal:integration-1:open_id:ou_sender_1',
			scopeKey: 'lark:v2:scope:integration-1:group:chat-1',
			chatType: 'group',
			chatId: 'chat-1',
			senderOpenId: 'ou_sender_1',
			legacyConversationUserKey: 'open_id:ou_sender_1'
		})

		expect(conversationBindingRepository.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				scopeKey: 'lark:v2:scope:integration-1:group:chat-1',
				conversationUserKey: null,
				xpertId: 'xpert-1',
				conversationId: 'conversation-1'
			}),
			['scopeKey', 'xpertId']
		)
	})

	it('resolveDispatchExecutionContext uses exact binding when exact context is complete', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-1',
					conversationId: 'conversation-1',
					tenantId: 'tenant-exact',
					organizationId: 'org-exact',
					createdById: 'creator-exact',
					updatedAt: new Date('2026-01-01T00:00:00.000Z')
				},
				{
					userId: 'ou_sender_2',
					conversationUserKey: 'open_id:ou_sender_2',
					xpertId: 'xpert-1',
					conversationId: 'conversation-2',
					tenantId: 'tenant-latest',
					organizationId: 'org-latest',
					createdById: 'creator-latest',
					updatedAt: new Date('2026-02-01T00:00:00.000Z')
				}
			]
		})

		await expect(
			service.resolveDispatchExecutionContext('xpert-1', 'open_id:ou_sender_1')
		).resolves.toEqual({
			tenantId: 'tenant-exact',
			organizationId: 'org-exact',
			createdById: 'creator-exact',
			source: 'exact'
		})
	})

	it('resolveDispatchExecutionContext fills missing exact fields from latest xpert binding', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-1',
					conversationId: 'conversation-1',
					tenantId: 'tenant-exact',
					organizationId: null,
					createdById: null,
					updatedAt: new Date('2026-01-01T00:00:00.000Z')
				},
				{
					userId: 'ou_sender_2',
					conversationUserKey: 'open_id:ou_sender_2',
					xpertId: 'xpert-1',
					conversationId: 'conversation-2',
					tenantId: 'tenant-latest',
					organizationId: 'org-latest',
					createdById: 'creator-latest',
					updatedAt: new Date('2026-02-01T00:00:00.000Z')
				}
			]
		})

		await expect(
			service.resolveDispatchExecutionContext('xpert-1', 'open_id:ou_sender_1')
		).resolves.toEqual({
			tenantId: 'tenant-exact',
			organizationId: 'org-latest',
			createdById: 'creator-latest',
			source: 'exact'
		})
	})

	it('resolveDispatchExecutionContext falls back to latest xpert binding when exact binding missing', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-1',
					conversationId: 'conversation-1',
					tenantId: 'tenant-older',
					organizationId: 'org-older',
					createdById: 'creator-older',
					updatedAt: new Date('2026-01-01T00:00:00.000Z')
				},
				{
					userId: 'ou_sender_2',
					conversationUserKey: 'open_id:ou_sender_2',
					xpertId: 'xpert-1',
					conversationId: 'conversation-2',
					tenantId: 'tenant-newest',
					organizationId: 'org-newest',
					createdById: 'creator-newest',
					updatedAt: new Date('2026-02-01T00:00:00.000Z')
				}
			]
		})

		await expect(
			service.resolveDispatchExecutionContext('xpert-1', 'open_id:ou_sender_3')
		).resolves.toEqual({
			tenantId: 'tenant-newest',
			organizationId: 'org-newest',
			createdById: 'creator-newest',
			source: 'xpert-latest'
		})
	})

	it('getConversation falls back to persisted binding table on cache miss', async () => {
		const { service, conversationBindingRepository } = createFixture({
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-from-db',
					conversationId: 'conversation-from-db'
				}
			]
		})

		const first = await service.getConversation('open_id:ou_sender_1', 'xpert-from-db')
		const second = await service.getConversation('open_id:ou_sender_1', 'xpert-from-db')

		expect(first).toBe('conversation-from-db')
		expect(second).toBe('conversation-from-db')
		expect(conversationBindingRepository.findOne).toHaveBeenCalledTimes(1)
	})

	it('getConversation does not reuse legacy open_id binding for a new group scope', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-from-db',
					conversationId: 'conversation-from-db'
				}
			]
		})

		await expect(
			service.getConversation('lark:v2:scope:integration-1:group:chat-new', 'xpert-from-db', {
				legacyConversationUserKey: 'open_id:ou_sender_1'
			})
		).resolves.toBeUndefined()
	})

	it('getActiveMessage does not reuse legacy open_id cache for a new group scope', async () => {
		const { service } = createFixture()

		await service.setActiveMessage('open_id:ou_sender_1', 'xpert-from-db', {
			id: 'message-1',
			thirdPartyMessage: {
				id: 'lark-message-1',
				messageId: 'message-1',
				language: 'en_US',
				status: 'thinking'
			}
		})

		await expect(
			service.getActiveMessage('lark:v2:scope:integration-1:group:chat-new', 'xpert-from-db', {
				legacyConversationUserKey: 'open_id:ou_sender_1'
			})
		).resolves.toBeNull()
	})

	it.each([LARK_CONFIRM, LARK_REJECT, LARK_END_CONVERSATION])(
		'returns timeout and clears caches when active message is missing (%s)',
		async (action) => {
			const { service, larkChannel } = createFixture()
			await service.setConversation(userId, xpertId, 'conversation-1')

			await service.onAction(action, createChatContext(), userId, xpertId, 'action-message-id')

			expect(larkChannel.errorMessage).toHaveBeenCalledTimes(1)
			expect(await service.getConversation(userId, xpertId)).toBeUndefined()
			expect(await service.getActiveMessage(userId, xpertId)).toBeNull()
		}
	)

	it('uses action.messageId fallback when cached thirdPartyMessage.id is missing', async () => {
		const { service, larkChannel, commandBus } = createFixture()
		await service.setConversation(userId, xpertId, 'conversation-1')
		await service.setActiveMessage(userId, xpertId, {
			id: 'chat-message-id',
			thirdPartyMessage: {
				messageId: 'chat-message-id',
				language: 'en_US',
				header: null,
				elements: [{ tag: 'markdown', content: 'cached body' }],
				status: 'thinking'
			}
		})

		await service.onAction(LARK_CONFIRM, createChatContext(), userId, xpertId, 'action-message-id')

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledWith(
			'integration-1',
			'action-message-id',
			expect.any(Object)
		)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		expect(patchPayload.elements).toContainEqual({ tag: 'markdown', content: 'cached body' })
		const dispatchCommands = getExecutedDispatchCommands(commandBus as any)
		expect(dispatchCommands).toHaveLength(1)
		expect(dispatchCommands[0].input.options).toEqual({ confirm: true })
	})

	it('keeps existing card content on end, cancels conversation and clears conversation session', async () => {
		const { service, larkChannel, commandBus } = createFixture()
		await service.setConversation(userId, xpertId, 'conversation-1')
		await service.setActiveMessage(userId, xpertId, {
			id: 'chat-message-id',
			thirdPartyMessage: {
				id: 'cached-lark-message-id',
				messageId: 'chat-message-id',
				language: 'en_US',
				header: null,
				elements: [{ tag: 'markdown', content: 'persisted body' }],
				status: 'thinking'
			}
		})

		await service.onAction(LARK_END_CONVERSATION, createChatContext(), userId, xpertId)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledWith(
			'integration-1',
			'cached-lark-message-id',
			expect.any(Object)
		)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		expect(
			patchPayload.elements.some(
				(element: { tag?: string; content?: string }) =>
					element.tag === 'markdown' && element.content === 'persisted body'
			)
		).toBe(true)
		expect(commandBus.execute).toHaveBeenCalledTimes(1)
		expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(CancelConversationCommand)
		expect(commandBus.execute.mock.calls[0][0].input).toEqual({ conversationId: 'conversation-1' })
		expect(getExecutedDispatchCommands(commandBus as any)).toHaveLength(0)
		expect(await service.getConversation(userId, xpertId)).toBeUndefined()
		expect(await service.getActiveMessage(userId, xpertId)).toBeNull()
	})

	it('handleCardAction prioritizes latest binding by open_id over integration default xpert', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou-action-1',
					conversationUserKey: 'open_id:ou-action-1',
					xpertId: 'xpert-from-db',
					conversationId: 'conversation-from-db'
				}
			]
		})
		const onAction = jest.spyOn(service, 'onAction').mockResolvedValue(undefined as any)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: userId,
			tenantId: 'tenant-1'
		} as any)

		await service.handleCardAction(
			{
				value: LARK_CONFIRM,
				userId: 'ou-action-1',
				chatId: 'chat-1',
				messageId: 'action-message-id'
			} as any,
			{
				organizationId: 'org-1',
				integration: {
					id: 'integration-1',
					tenant: null,
					options: {
						xpertId: 'xpert-from-integration'
					}
				}
			} as any
		)

		expect(onAction).toHaveBeenCalledWith(
			LARK_CONFIRM,
			expect.objectContaining({
				userId,
				senderOpenId: 'ou-action-1'
			}),
			'open_id:ou-action-1',
			'xpert-from-db',
			'action-message-id'
		)
	})

	it('handleCardAction blocks trigger-bound users that no longer match current trigger scope', async () => {
		const { service, larkTriggerStrategy } = createFixture({
			boundXpertId: 'trigger-xpert',
			triggerMatches: false,
			conversationBindings: [
				{
					userId: 'ou-action-1',
					integrationId: 'integration-1',
					scopeKey: 'lark:v2:scope:integration-1:p2p:ou-action-1',
					chatType: 'p2p',
					conversationUserKey: 'open_id:ou-action-1',
					xpertId: 'trigger-xpert',
					conversationId: 'conversation-from-db'
				}
			]
		})
		const onAction = jest.spyOn(service, 'onAction').mockResolvedValue(undefined as any)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: userId,
			tenantId: 'tenant-1'
		} as any)

		await service.handleCardAction(
			{
				value: LARK_CONFIRM,
				userId: 'ou-action-1',
				chatId: 'chat-1',
				messageId: 'action-message-id'
			} as any,
			{
				organizationId: 'org-1',
				integration: {
					id: 'integration-1',
					tenant: null,
					options: {
						xpertId: 'xpert-from-integration'
					}
				}
			} as any
		)

		expect(larkTriggerStrategy.matchesInboundMessage).toHaveBeenCalledTimes(1)
		expect(onAction).not.toHaveBeenCalled()
		await expect(
			service.getConversation('lark:v2:scope:integration-1:p2p:ou-action-1', 'trigger-xpert', {
				legacyConversationUserKey: 'open_id:ou-action-1'
			})
		).resolves.toBeUndefined()
	})

	it('handleCardAction ignores user history from other integrations', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou-action-1',
					integrationId: 'integration-2',
					conversationUserKey: 'open_id:ou-action-1',
					xpertId: 'xpert-from-other-integration',
					conversationId: 'conversation-other'
				}
			]
		})
		const onAction = jest.spyOn(service, 'onAction').mockResolvedValue(undefined as any)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: userId,
			tenantId: 'tenant-1'
		} as any)

		await service.handleCardAction(
			{
				value: LARK_CONFIRM,
				userId: 'ou-action-1',
				chatId: 'chat-1',
				messageId: 'action-message-id'
			} as any,
			{
				organizationId: 'org-1',
				integration: {
					id: 'integration-1',
					tenant: null,
					options: {
						xpertId: 'xpert-from-integration'
					}
				}
			} as any
		)

		expect(onAction).toHaveBeenCalledWith(
			LARK_CONFIRM,
			expect.objectContaining({
				userId,
				senderOpenId: 'ou-action-1'
			}),
			'open_id:ou-action-1',
			'xpert-from-integration',
			'action-message-id'
		)
	})

	it('handleCardAction ignores integrationless legacy history when current integration points to a different xpert', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou-action-1',
					conversationUserKey: 'open_id:ou-action-1',
					xpertId: 'xpert-from-legacy-history',
					conversationId: 'conversation-legacy'
				}
			]
		})
		const onAction = jest.spyOn(service, 'onAction').mockResolvedValue(undefined as any)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: userId,
			tenantId: 'tenant-1'
		} as any)

		await service.handleCardAction(
			{
				value: LARK_CONFIRM,
				userId: 'ou-action-1',
				chatId: 'chat-1',
				messageId: 'action-message-id'
			} as any,
			{
				organizationId: 'org-1',
				integration: {
					id: 'integration-1',
					tenant: null,
					options: {
						xpertId: 'xpert-from-integration'
					}
				}
			} as any
		)

		expect(onAction).toHaveBeenCalledWith(
			LARK_CONFIRM,
			expect.objectContaining({
				userId,
				senderOpenId: 'ou-action-1'
			}),
			'open_id:ou-action-1',
			'xpert-from-integration',
			'action-message-id'
		)
		await expect(service.getConversation('open_id:ou-action-1', 'xpert-from-legacy-history')).resolves.toBeUndefined()
	})

	it('handleCardAction clears stale exact binding when integration now points to a different xpert', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou-action-1',
					integrationId: 'integration-1',
					chatId: 'chat-1',
					chatType: 'group',
					scopeKey: 'lark:v2:scope:integration-1:group:chat-1',
					conversationUserKey: 'open_id:ou-action-1',
					xpertId: 'xpert-from-stale-binding',
					conversationId: 'conversation-stale'
				}
			]
		})
		const onAction = jest.spyOn(service, 'onAction').mockResolvedValue(undefined as any)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: userId,
			tenantId: 'tenant-1'
		} as any)

		await service.handleCardAction(
			{
				value: LARK_CONFIRM,
				userId: 'ou-action-1',
				chatId: 'chat-1',
				messageId: 'action-message-id'
			} as any,
			{
				organizationId: 'org-1',
				integration: {
					id: 'integration-1',
					tenant: null,
					options: {
						xpertId: 'xpert-from-integration'
					}
				}
			} as any
		)

		expect(onAction).toHaveBeenCalledWith(
			LARK_CONFIRM,
			expect.objectContaining({
				userId,
				senderOpenId: 'ou-action-1'
			}),
			'lark:v2:scope:integration-1:group:chat-1',
			'xpert-from-integration',
			'action-message-id'
		)
		await expect(
			service.getConversation('lark:v2:scope:integration-1:group:chat-1', 'xpert-from-stale-binding', {
				legacyConversationUserKey: 'open_id:ou-action-1'
			})
		).resolves.toBeUndefined()
	})

	it('skips card action handling when action open_id is missing', async () => {
		const { service } = createFixture()
		const onAction = jest.spyOn(service, 'onAction').mockResolvedValue(undefined as any)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: userId,
			tenantId: 'tenant-1'
		} as any)

		await service.handleCardAction(
			{
				value: LARK_CONFIRM,
				chatId: 'chat-1',
				messageId: 'action-message-id'
			} as any,
			{
				organizationId: 'org-1',
				integration: {
					id: 'integration-1',
					tenant: null,
					options: {
						xpertId
					}
				}
			} as any
		)

		expect(onAction).not.toHaveBeenCalled()
	})

	it('processMessage prioritizes latest conversation binding and bypasses trigger routing', async () => {
		const { service, larkTriggerStrategy, commandBus, larkChannel } = createFixture({
			boundXpertId: 'trigger-xpert',
			triggerHandled: true,
			legacyXpertId: 'legacy-xpert',
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-from-db',
					conversationId: 'conversation-from-db'
				}
			]
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello' })
				}
			}
		} as any)

		expect(larkTriggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
		const dispatchCommands = getExecutedDispatchCommands(commandBus as any)
		expect(dispatchCommands).toHaveLength(1)
		expect(dispatchCommands[0].input.xpertId).toBe('xpert-from-db')
		expect(larkChannel.errorMessage).not.toHaveBeenCalled()
	})

	it('processMessage does not fall back to integration xpert when trigger scope rejects inbound sender', async () => {
		const { service, larkTriggerStrategy, commandBus, larkChannel } = createFixture({
			boundXpertId: 'trigger-xpert',
			triggerHandled: false,
			triggerMatches: false,
			legacyXpertId: 'legacy-xpert'
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_blocked_1',
			integrationId: 'integration-1',
			chatType: 'p2p',
			message: {
				message: {
					content: JSON.stringify({ text: 'blocked sender' })
				}
			}
		} as any)

		expect(larkTriggerStrategy.matchesInboundMessage).toHaveBeenCalledTimes(1)
		expect(larkTriggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
		expect(getExecutedDispatchCommands(commandBus as any)).toHaveLength(0)
		expect(larkChannel.errorMessage).not.toHaveBeenCalled()
	})

	it('processMessage clears typing reaction before returning on trigger mismatch', async () => {
		const { service, larkChannel } = createFixture({
			boundXpertId: 'trigger-xpert',
			triggerHandled: false,
			triggerMatches: false,
			legacyXpertId: 'legacy-xpert'
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_blocked_1',
			integrationId: 'integration-1',
			chatType: 'p2p',
			replyToMessageId: 'message-1',
			typingReaction: {
				messageId: 'message-1',
				reactionId: 'reaction-1',
				emojiType: LARK_TYPING_REACTION_EMOJI_TYPE
			},
			message: {
				message: {
					message_id: 'message-1',
					content: JSON.stringify({ text: 'blocked sender' })
				}
			}
		} as any)

		expect(larkChannel.deleteMessageReaction).toHaveBeenCalledWith(
			'integration-1',
			'message-1',
			'reaction-1'
		)
		expect(larkChannel.errorMessage).not.toHaveBeenCalled()
	})

	it('processMessage does not reuse sender history to bypass trigger routing for a new group scope', async () => {
		const { service, commandBus, larkTriggerStrategy } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: 'legacy-xpert',
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					principalKey: 'lark:v2:principal:integration-1:open_id:ou_sender_1',
					xpertId: 'xpert-from-db',
					conversationId: 'conversation-from-db'
				}
			]
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-new',
			chatType: 'group',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello from new group' })
				}
			}
		} as any)

		const dispatchCommands = getExecutedDispatchCommands(commandBus as any)
		expect(dispatchCommands).toHaveLength(1)
		expect(dispatchCommands[0].input.xpertId).toBe('legacy-xpert')
		expect(
			await service.getConversation('lark:v2:scope:integration-1:group:chat-new', 'xpert-from-db')
		).toBeUndefined()
		expect(larkTriggerStrategy.handleInboundMessage).toHaveBeenCalledTimes(1)
	})

	it('processMessage reuses sender history for p2p scope when exact scope binding is missing', async () => {
		const { service, commandBus, larkTriggerStrategy } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: 'legacy-xpert',
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					principalKey: 'lark:v2:principal:integration-1:open_id:ou_sender_1',
					xpertId: 'xpert-from-db',
					conversationId: 'conversation-from-db'
				}
			]
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatType: 'p2p',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello from p2p' })
				}
			}
		} as any)

		const dispatchCommands = getExecutedDispatchCommands(commandBus as any)
		expect(dispatchCommands).toHaveLength(1)
		expect(dispatchCommands[0].input.xpertId).toBe('xpert-from-db')
		expect(larkTriggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
	})

	it('processMessage purges p2p history when trigger scope no longer allows the sender', async () => {
		const { service, commandBus, larkTriggerStrategy } = createFixture({
			boundXpertId: 'trigger-xpert',
			triggerHandled: false,
			triggerMatches: false,
			legacyXpertId: 'legacy-xpert',
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					integrationId: 'integration-1',
					scopeKey: 'lark:v2:scope:integration-1:p2p:ou_sender_1',
					principalKey: 'lark:v2:principal:integration-1:open_id:ou_sender_1',
					chatType: 'p2p',
					senderOpenId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'trigger-xpert',
					conversationId: 'conversation-from-db'
				}
			]
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatType: 'p2p',
			message: {
				message: {
					content: JSON.stringify({ text: 'sender should now be blocked' })
				}
			}
		} as any)

		expect(larkTriggerStrategy.matchesInboundMessage).toHaveBeenCalledTimes(1)
		expect(larkTriggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
		expect(getExecutedDispatchCommands(commandBus as any)).toHaveLength(0)
		await expect(
			service.getConversation('lark:v2:scope:integration-1:p2p:ou_sender_1', 'trigger-xpert', {
				legacyConversationUserKey: 'open_id:ou_sender_1'
			})
		).resolves.toBeUndefined()
	})

	it('processMessage ignores sender history from other integrations during p2p reuse', async () => {
		const { service, commandBus, larkTriggerStrategy } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: 'legacy-xpert',
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					integrationId: 'integration-2',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-other-integration',
					conversationId: 'conversation-other'
				}
			]
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatType: 'p2p',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello from p2p' })
				}
			}
		} as any)

		const dispatchCommands = getExecutedDispatchCommands(commandBus as any)
		expect(dispatchCommands).toHaveLength(1)
		expect(dispatchCommands[0].input.xpertId).toBe('legacy-xpert')
		expect(larkTriggerStrategy.handleInboundMessage).toHaveBeenCalledTimes(1)
	})

	it('processMessage ignores integrationless legacy history when current integration points to a different xpert', async () => {
		const { service, commandBus, larkTriggerStrategy } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: 'xpert-from-integration',
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-from-legacy-history',
					conversationId: 'conversation-legacy'
				}
			]
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatType: 'p2p',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello from p2p' })
				}
			}
		} as any)

		const dispatchCommands = getExecutedDispatchCommands(commandBus as any)
		expect(dispatchCommands).toHaveLength(1)
		expect(dispatchCommands[0].input.xpertId).toBe('xpert-from-integration')
		expect(larkTriggerStrategy.handleInboundMessage).toHaveBeenCalledTimes(1)
		await expect(service.getConversation('open_id:ou_sender_1', 'xpert-from-legacy-history')).resolves.toBeUndefined()
	})

	it('processMessage clears stale exact scope binding when integration now points to a different xpert', async () => {
		const { service, commandBus, larkTriggerStrategy } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: 'xpert-from-integration',
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					integrationId: 'integration-1',
					scopeKey: 'lark:v2:scope:integration-1:p2p:ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-from-stale-scope',
					conversationId: 'conversation-stale-scope'
				}
			]
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatType: 'p2p',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello from p2p' })
				}
			}
		} as any)

		const dispatchCommands = getExecutedDispatchCommands(commandBus as any)
		expect(dispatchCommands).toHaveLength(1)
		expect(dispatchCommands[0].input.xpertId).toBe('xpert-from-integration')
		expect(larkTriggerStrategy.handleInboundMessage).toHaveBeenCalledTimes(1)
		await expect(
			service.getConversation('lark:v2:scope:integration-1:p2p:ou_sender_1', 'xpert-from-stale-scope', {
				legacyConversationUserKey: 'open_id:ou_sender_1'
			})
		).resolves.toBeUndefined()
	})

	it('processMessage falls back to trigger strategy when latest binding does not exist', async () => {
		const { service, larkTriggerStrategy, commandBus, larkChannel } = createFixture({
			boundXpertId: 'trigger-xpert',
			triggerHandled: true,
			legacyXpertId: 'legacy-xpert'
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello' })
				}
			}
		} as any)

		expect(larkTriggerStrategy.handleInboundMessage).toHaveBeenCalledTimes(1)
		expect(getExecutedDispatchCommands(commandBus as any)).toHaveLength(0)
		expect(larkChannel.errorMessage).not.toHaveBeenCalled()
	})

	it('processMessage falls back to legacy xpert dispatch when trigger is not handled', async () => {
		const { service, larkTriggerStrategy, commandBus } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: 'legacy-xpert'
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello' })
				}
			}
		} as any)

		expect(larkTriggerStrategy.handleInboundMessage).toHaveBeenCalledTimes(1)
		const dispatchCommands = getExecutedDispatchCommands(commandBus as any)
		expect(dispatchCommands).toHaveLength(1)
		expect(dispatchCommands[0].input.xpertId).toBe('legacy-xpert')
	})

	it('processMessage returns error when neither latest binding nor integration fallback is configured', async () => {
		const { service, commandBus, larkChannel } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: null
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello' })
				}
			}
		} as any)

		expect(getExecutedDispatchCommands(commandBus as any)).toHaveLength(0)
		expect(larkChannel.errorMessage).toHaveBeenCalledTimes(1)
	})

	it('processMessage clears typing reaction before sending integration error reply', async () => {
		const { service, larkChannel } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: null
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			replyToMessageId: 'message-2',
			typingReaction: {
				messageId: 'message-2',
				reactionId: 'reaction-2',
				emojiType: LARK_TYPING_REACTION_EMOJI_TYPE
			},
			message: {
				message: {
					message_id: 'message-2',
					content: JSON.stringify({ text: 'hello' })
				}
			}
		} as any)

		expect(larkChannel.deleteMessageReaction).toHaveBeenCalledWith(
			'integration-1',
			'message-2',
			'reaction-2'
		)
		expect(larkChannel.errorMessage).toHaveBeenCalledTimes(1)
	})

	it('processMessage prefers semanticMessage agentText and keeps recipientDirectoryKey in dispatch payload', async () => {
		const { service, commandBus, larkTriggerStrategy } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: 'legacy-xpert'
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			chatType: 'group',
			recipientDirectoryKey: 'lark:recipient-dir:integration-1:chat:chat-1',
			semanticMessage: {
				rawText: '<at user_id="ou_user_1">Tom Jerry</at> hi',
				displayText: '@Tom Jerry hi',
				agentText: 'Tom Jerry hi',
				mentions: [
					{
						key: '@_user_1',
						id: 'ou_user_1',
						idType: 'open_id',
						name: 'Tom Jerry',
						rawToken: '<at user_id="ou_user_1">Tom Jerry</at>'
					}
				]
			},
			message: {
				message: {
					content: JSON.stringify({ text: 'fallback text' })
				}
			}
		} as any)

		expect(larkTriggerStrategy.handleInboundMessage).toHaveBeenCalledTimes(1)
		const dispatchCommands = getExecutedDispatchCommands(commandBus as any)
		expect(dispatchCommands).toHaveLength(1)
		expect(dispatchCommands[0].input.input).toBe('Tom Jerry hi')
		expect(dispatchCommands[0].input.larkMessage.recipientDirectoryKey).toBe(
			'lark:recipient-dir:integration-1:chat:chat-1'
		)
	})

	it('processMessage appends speaker context when sender name is resolved from open_id', async () => {
		const { service, commandBus, larkTriggerStrategy, recipientDirectoryService, larkChannel } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: 'legacy-xpert'
		})
		recipientDirectoryService.resolveByOpenId.mockResolvedValue({
			ref: 'u_1',
			openId: 'ou_sender_1',
			name: 'Alice Zhang',
			aliases: ['Alice Zhang'],
			source: 'sender',
			firstSeenAt: Date.now(),
			lastSeenAt: Date.now()
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			chatType: 'group',
			recipientDirectoryKey: 'lark:recipient-dir:integration-1:chat:chat-1',
			message: {
				message: {
					content: JSON.stringify({ text: '\u8bf7\u5e2e\u6211\u603b\u7ed3\u4e00\u4e0b\u4eca\u5929\u7684\u8ba8\u8bba' })
				}
			}
		} as any)

		expect(larkTriggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				input: '\u8bf7\u5e2e\u6211\u603b\u7ed3\u4e00\u4e0b\u4eca\u5929\u7684\u8ba8\u8bba'
			})
		)
		const dispatchCommands = getExecutedDispatchCommands(commandBus as any)
		expect(dispatchCommands).toHaveLength(1)
		expect(dispatchCommands[0].input.input).toBe('Alice Zhang: \u8bf7\u5e2e\u6211\u603b\u7ed3\u4e00\u4e0b\u4eca\u5929\u7684\u8ba8\u8bba')
		expect(larkChannel.resolveUserNameByOpenId).not.toHaveBeenCalled()
	})

	it('processMessage passes speaker context into trigger-bound dispatches', async () => {
		const { service, commandBus, larkTriggerStrategy, recipientDirectoryService } = createFixture({
			boundXpertId: 'trigger-xpert',
			triggerHandled: true,
			legacyXpertId: 'legacy-xpert'
		})
		recipientDirectoryService.resolveByOpenId.mockResolvedValue({
			ref: 'u_1',
			openId: 'ou_sender_1',
			name: 'Alice Zhang',
			aliases: ['Alice Zhang'],
			source: 'sender',
			firstSeenAt: Date.now(),
			lastSeenAt: Date.now()
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			chatType: 'group',
			recipientDirectoryKey: 'lark:recipient-dir:integration-1:chat:chat-1',
			message: {
				message: {
					content: JSON.stringify({ text: '\u8bf7\u5e2e\u6211\u603b\u7ed3\u4e00\u4e0b\u4eca\u5929\u7684\u8ba8\u8bba' })
				}
			}
		} as any)

		expect(larkTriggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				input: 'Alice Zhang: \u8bf7\u5e2e\u6211\u603b\u7ed3\u4e00\u4e0b\u4eca\u5929\u7684\u8ba8\u8bba'
			})
		)
		expect(getExecutedDispatchCommands(commandBus as any)).toHaveLength(0)
	})
})

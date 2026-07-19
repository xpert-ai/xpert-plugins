jest.mock('@xpert-ai/plugin-sdk', () => ({
	HANDOFF_PERMISSION_SERVICE_TOKEN: 'HANDOFF_PERMISSION_SERVICE_TOKEN',
	INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
	WorkflowTriggerStrategy: () => () => undefined,
	defineChannelMessageType: (...parts: Array<string | number>) => parts.join('.'),
	RequestContext: {
		currentTenantId: jest.fn(() => null),
		getOrganizationId: jest.fn(() => null),
		currentUserId: jest.fn(() => null)
	}
}))

jest.mock('../lark-channel.strategy.js', () => ({
	LarkChannelStrategy: class LarkChannelStrategy {}
}))

import { HANDOFF_PERMISSION_SERVICE_TOKEN, INTEGRATION_PERMISSION_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
import { LarkTriggerStrategy } from './lark-trigger.strategy.js'

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
	groupReplyStrategy: 'mention_only',
	sessionTimeoutSeconds: 3600,
	summaryWindowSeconds: 0,
	captureUnmentionedGroupMessages: false,
	historyContextLimit: 20,
	historyContextWindowSeconds: 3600,
	historyRetentionDays: 30,
	historyAttachmentMaxSizeMb: 10
} as const

type PersistedBinding = {
	integrationId: string
	xpertId: string
	config?: Record<string, unknown>
	ownerOpenId?: string | null
	tenantId?: string | null
	organizationId?: string | null
	createdById?: string | null
}

describe('LarkTriggerStrategy', () => {
	function createStrategy(params?: {
		bindings?: PersistedBinding[]
		ownerUserId?: string
		ownerUnionId?: string | null
		ownerOpenId?: string | null
	}) {
		const persistedBindings = new Map<string, PersistedBinding>()
		for (const binding of params?.bindings ?? []) {
			persistedBindings.set(binding.integrationId, { ...binding })
		}
		const dispatchService = {
			buildDispatchMessage: jest.fn().mockResolvedValue({
				id: 'handoff-id'
			}),
			enqueueDispatch: jest.fn().mockResolvedValue({
				messageId: 'enqueued-message'
			})
		}
		const aggregationStates = new Map<string, any>()
		const aggregationService = {
			get: jest.fn().mockImplementation(async (key: string) => aggregationStates.get(key) ?? null),
			save: jest.fn().mockImplementation(async (state: any) => {
				aggregationStates.set(state.aggregateKey, state)
			}),
			clear: jest.fn().mockImplementation(async (key: string) => {
				aggregationStates.delete(key)
			})
		}
		const handoffPermissionService = {
			enqueue: jest.fn().mockResolvedValue({
				id: 'flush-message-id'
			})
		}
		const integrationPermissionService = {
			read: jest.fn().mockResolvedValue({
				id: 'integration-1',
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				createdById: params?.ownerUserId ?? 'user-1',
				updatedById: params?.ownerUserId ?? 'user-1'
			})
		}
		const larkChannel = {
			getUserById: jest.fn().mockResolvedValue(
				params?.ownerUnionId === null
					? null
					: {
							id: params?.ownerUserId ?? 'user-1',
							thirdPartyId: params?.ownerUnionId ?? 'union-1'
					  }
			),
			getOrCreateLarkClient: jest.fn().mockReturnValue({
				client: {
					contact: {
						v3: {
							user: {
								get: jest.fn().mockResolvedValue({
									data: {
										user: {
											open_id: params?.ownerOpenId ?? 'ou_owner_1'
										}
									}
								})
							}
						}
					}
				}
			})
		}
		const bindingRepository = {
			findOne: jest.fn().mockImplementation(async ({ where }: { where: { integrationId: string } }) => {
				return persistedBindings.get(where.integrationId) ?? null
			}),
			find: jest.fn().mockImplementation(async ({ where }: { where: { xpertId: string } }) => {
				return [...persistedBindings.values()].filter((binding) => binding.xpertId === where.xpertId)
			}),
			upsert: jest.fn().mockImplementation(async (payload: PersistedBinding) => {
				persistedBindings.set(payload.integrationId, {
					...(persistedBindings.get(payload.integrationId) ?? {}),
					...payload
				})
				return { generatedMaps: [], raw: [], identifiers: [] }
			}),
			delete: jest.fn().mockImplementation(async (criteria: { integrationId?: string; xpertId?: string }) => {
				if (criteria.integrationId) {
					const current = persistedBindings.get(criteria.integrationId)
					if (!criteria.xpertId || current?.xpertId === criteria.xpertId) {
						persistedBindings.delete(criteria.integrationId)
					}
				} else if (criteria.xpertId) {
					for (const [integrationId, binding] of persistedBindings.entries()) {
						if (binding.xpertId === criteria.xpertId) {
							persistedBindings.delete(integrationId)
						}
					}
				}
				return { affected: 1 }
			})
		}
		const pluginContext = {
			resolve: jest.fn((token: unknown) => {
				if (token === INTEGRATION_PERMISSION_SERVICE_TOKEN) {
					return integrationPermissionService
				}
				if (token === HANDOFF_PERMISSION_SERVICE_TOKEN) {
					return handoffPermissionService
				}
				throw new Error(`Unexpected token: ${String(token)}`)
			})
		}
		const messageHistoryService = {
			updateInboundStatus: jest.fn().mockResolvedValue(undefined)
		}
		const messageHistoryQueue = {
			scheduleCleanup: jest.fn().mockResolvedValue(undefined)
		}

		const strategy = new (LarkTriggerStrategy as any)(
			dispatchService as any,
			aggregationService as any,
			larkChannel as any,
			bindingRepository as any,
			messageHistoryService as any,
			messageHistoryQueue as any,
			pluginContext as any
		)
		return {
			strategy,
			dispatchService,
			aggregationService,
			handoffPermissionService,
			bindingRepository,
			messageHistoryService,
			messageHistoryQueue,
			persistedBindings
		}
	}

	function createBinding(overrides: Partial<PersistedBinding> = {}): PersistedBinding {
		return {
			integrationId: 'integration-1',
			xpertId: 'xpert-1',
			config: {
				integrationId: 'integration-1',
				...DEFAULT_TRIGGER_CONFIG
			},
			ownerOpenId: 'ou_owner_1',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			createdById: 'user-1',
			...overrides
		}
	}

	it('exposes session, summary, and stored-history defaults in trigger schema', () => {
		const { strategy } = createStrategy()
		const properties = strategy.meta.configSchema.properties as Record<string, any>

		expect(properties.sessionTimeoutSeconds.default).toBe(3600)
		expect(properties.sessionTimeoutSeconds.title).toEqual({
			en_US: 'Session Timeout (seconds)',
			zh_Hans: '会话超时时间（秒）'
		})
		expect(properties.summaryWindowSeconds.default).toBe(0)
		expect(properties.summaryWindowSeconds.title).toEqual({
			en_US: 'Summary Window (seconds)',
			zh_Hans: '汇总时间（秒）'
		})
		expect(properties.captureUnmentionedGroupMessages.default).toBe(false)
		expect(properties.historyContextLimit).toEqual(
			expect.objectContaining({ default: 20, minimum: 0, maximum: 100 })
		)
		expect(properties.historyContextWindowSeconds).toEqual(
			expect.objectContaining({ default: 3600, minimum: 0 })
		)
		expect(properties.historyRetentionDays).toEqual(
			expect.objectContaining({ default: 30, minimum: 0 })
		)
		expect(properties.historyRetentionDays.description.zh_Hans).toContain('0 表示永久保留')
		expect(properties.historyAttachmentMaxSizeMb).toEqual(
			expect.objectContaining({ default: 10, minimum: 1, maximum: 25 })
		)
	})

	it('keeps legacy persisted bindings opted out when history fields are missing', () => {
		const { strategy } = createStrategy()

		expect(
			strategy.normalizeConfig({
				enabled: true,
				integrationId: 'integration-1'
			})
		).toEqual(
			expect.objectContaining({
				captureUnmentionedGroupMessages: false,
				historyContextLimit: 0,
				historyContextWindowSeconds: 3600,
				historyRetentionDays: 30,
				historyAttachmentMaxSizeMb: 10
			})
		)
	})

	it('normalizes explicitly configured message-history fields', () => {
		const { strategy } = createStrategy()

		expect(
			strategy.normalizeConfig({
				enabled: true,
				integrationId: 'integration-1',
				captureUnmentionedGroupMessages: true,
				historyContextLimit: 999,
				historyContextWindowSeconds: 0,
				historyRetentionDays: 0,
				historyAttachmentMaxSizeMb: 999
			})
		).toEqual(
			expect.objectContaining({
				captureUnmentionedGroupMessages: true,
				historyContextLimit: 100,
				historyContextWindowSeconds: 0,
				historyRetentionDays: 0,
				historyAttachmentMaxSizeMb: 25
			})
		)
	})

	it('reports validation error when integration is missing', async () => {
		const { strategy } = createStrategy()

		const checklist = await strategy.validate({
			xpertId: 'xpert-1',
			node: { key: 'trigger-1' },
			config: {
				enabled: true,
				integrationId: ''
			}
		} as any)

		expect(checklist).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					ruleCode: 'TRIGGER_LARK_INTEGRATION_REQUIRED',
					field: 'integrationId'
				})
			])
		)
	})

	it('reports validation error when selected users are empty', async () => {
		const { strategy } = createStrategy()

		const checklist = await strategy.validate({
			xpertId: 'xpert-1',
			node: { key: 'trigger-1' },
			config: {
				integrationId: 'integration-1',
				enabled: true,
				singleChatScope: 'selected_users',
				singleChatUserOpenIds: []
			}
		} as any)

		expect(checklist).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					ruleCode: 'TRIGGER_LARK_SINGLE_CHAT_USERS_REQUIRED',
					field: 'singleChatUserOpenIds'
				})
			])
		)
	})

	it('reports validation errors when group enums are invalid', async () => {
		const { strategy } = createStrategy()

		const checklist = await strategy.validate({
			xpertId: 'xpert-1',
			node: { key: 'trigger-1' },
			config: {
				integrationId: 'integration-1',
				enabled: true,
				allowedGroupScope: 'invalid_scope',
				groupReplyStrategy: 'invalid_reply_strategy'
			}
		} as any)

		expect(checklist).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					ruleCode: 'TRIGGER_LARK_ALLOWED_GROUP_SCOPE_INVALID',
					field: 'allowedGroupScope'
				}),
				expect.objectContaining({
					ruleCode: 'TRIGGER_LARK_GROUP_REPLY_STRATEGY_INVALID',
					field: 'groupReplyStrategy'
				})
			])
		)
	})

	it('reports validation error when single-chat self scope is disabled', async () => {
		const { strategy } = createStrategy()

		const checklist = await strategy.validate({
			xpertId: 'xpert-1',
			node: { key: 'trigger-1' },
			config: {
				integrationId: 'integration-1',
				enabled: true,
				singleChatScope: 'self'
			}
		} as any)

		expect(checklist).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					ruleCode: 'TRIGGER_LARK_SINGLE_CHAT_SELF_DISABLED',
					field: 'singleChatScope'
				})
			])
		)
	})

	it('reports validation error when group self scope is disabled', async () => {
		const { strategy } = createStrategy()

		const checklist = await strategy.validate({
			xpertId: 'xpert-1',
			node: { key: 'trigger-1' },
			config: {
				integrationId: 'integration-1',
				enabled: true,
				groupUserScope: 'self'
			}
		} as any)

		expect(checklist).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					ruleCode: 'TRIGGER_LARK_GROUP_USER_SELF_DISABLED',
					field: 'groupUserScope'
				})
			])
		)
	})

	it('includes bound xpert id in validation conflict message', async () => {
		const { strategy } = createStrategy({
			bindings: [
				createBinding({
					xpertId: 'xpert-conflict-1'
				})
			]
		})

		const checklist = await strategy.validate({
			xpertId: 'xpert-2',
			node: { key: 'trigger-1' },
			config: {
				integrationId: 'integration-1',
				enabled: true
			}
		} as any)

		expect(checklist).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					ruleCode: 'TRIGGER_LARK_INTEGRATION_CONFLICT',
					field: 'integrationId',
					message: expect.objectContaining({
						zh_Hans: expect.stringContaining('xpertId: xpert-conflict-1')
					})
				})
			])
		)
	})

	it('matches inbound message matrix for private and group scopes', () => {
		const { strategy } = createStrategy()
		const binding = createBinding({
			config: {
				integrationId: 'integration-1',
				...DEFAULT_TRIGGER_CONFIG,
				singleChatScope: 'selected_users',
				singleChatUserOpenIds: ['ou_private_1'],
				allowedGroupScope: 'selected_chats',
				allowedGroupChatIds: ['chat-1'],
				groupUserScope: 'selected_users',
				groupUserOpenIds: ['ou_group_1'],
				groupReplyStrategy: 'all_messages'
			}
		})

		expect(
			(strategy as any).matchesInboundMessage({
				binding,
				integrationId: 'integration-1',
				chatType: 'p2p',
				senderOpenId: 'ou_private_1'
			})
		).toBe(true)
		expect(
			(strategy as any).matchesInboundMessage({
				binding,
				integrationId: 'integration-1',
				chatType: 'p2p',
				senderOpenId: 'ou_private_2'
			})
		).toBe(false)
		expect(
			(strategy as any).matchesInboundMessage({
				binding,
				integrationId: 'integration-1',
				chatType: 'group',
				chatId: 'chat-1',
				senderOpenId: 'ou_group_1'
			})
		).toBe(true)
		expect(
			(strategy as any).matchesInboundMessage({
				binding,
				integrationId: 'integration-1',
				chatType: 'group',
				chatId: 'chat-2',
				senderOpenId: 'ou_group_1'
			})
		).toBe(false)
		expect(
			(strategy as any).matchesInboundMessage({
				binding,
				integrationId: 'integration-1',
				chatType: 'group',
				chatId: 'chat-1',
				senderOpenId: 'ou_group_2'
			})
		).toBe(false)
	})

	it('distinguishes mention only and all messages for group trigger matching', () => {
		const { strategy } = createStrategy()
		const mentionOnlyBinding = createBinding({
			config: {
				integrationId: 'integration-1',
				...DEFAULT_TRIGGER_CONFIG,
				groupReplyStrategy: 'mention_only'
			}
		})
		const allMessagesBinding = createBinding({
			config: {
				integrationId: 'integration-1',
				...DEFAULT_TRIGGER_CONFIG,
				groupReplyStrategy: 'all_messages'
			}
		})

		expect(
			(strategy as any).matchesInboundMessage({
				binding: mentionOnlyBinding,
				integrationId: 'integration-1',
				chatType: 'group',
				chatId: 'chat-1',
				senderOpenId: 'ou_sender_1',
				botMentioned: false
			})
		).toBe(false)
		expect(
			(strategy as any).matchesInboundMessage({
				binding: mentionOnlyBinding,
				integrationId: 'integration-1',
				chatType: 'group',
				chatId: 'chat-1',
				senderOpenId: 'ou_sender_1',
				botMentioned: true
			})
		).toBe(true)
		expect(
			(strategy as any).matchesInboundMessage({
				binding: allMessagesBinding,
				integrationId: 'integration-1',
				chatType: 'group',
				chatId: 'chat-1',
				senderOpenId: 'ou_sender_1',
				botMentioned: false
			})
		).toBe(true)
	})

	it('matches inbound scope without applying the group mention requirement', () => {
		const { strategy } = createStrategy()
		const binding = createBinding({
			config: {
				integrationId: 'integration-1',
				...DEFAULT_TRIGGER_CONFIG,
				allowedGroupScope: 'selected_chats',
				allowedGroupChatIds: ['chat-1'],
				groupReplyStrategy: 'mention_only'
			}
		})

		expect(
			strategy.matchesInboundScope({
				binding: binding as any,
				integrationId: 'integration-1',
				chatType: 'group',
				chatId: 'chat-1',
				senderOpenId: 'ou_sender_1',
				botMentioned: false
			})
		).toBe(true)
		expect(
			strategy.matchesInboundScope({
				binding: binding as any,
				integrationId: 'integration-1',
				chatType: 'group',
				chatId: 'chat-2',
				senderOpenId: 'ou_sender_1',
				botMentioned: true
			})
		).toBe(false)
		expect(
			strategy.matchesInboundScope({
				binding: binding as any,
				integrationId: 'integration-2',
				chatType: 'group',
				chatId: 'chat-1',
				senderOpenId: 'ou_sender_1',
				botMentioned: true
			})
		).toBe(false)
	})

	it('checks inbound scope before applying group reply strategy', () => {
		const { strategy } = createStrategy()
		const scopeSpy = jest.spyOn(strategy, 'matchesInboundScope').mockReturnValue(false)

		expect(
			strategy.matchesInboundMessage({
				config: {
					integrationId: 'integration-1',
					...DEFAULT_TRIGGER_CONFIG,
					groupReplyStrategy: 'all_messages'
				},
				integrationId: 'integration-1',
				chatType: 'group',
				botMentioned: true
			})
		).toBe(false)
		expect(scopeSpy).toHaveBeenCalledTimes(1)
	})

	it('publishes normalized config without owner open id for supported scopes', async () => {
		const { strategy, bindingRepository, persistedBindings } = createStrategy()

		await strategy.publish(
			{
				xpertId: 'xpert-1',
				config: {
					integrationId: 'integration-1',
					enabled: true,
					singleChatScope: 'all_users',
					groupReplyStrategy: 'all_messages'
				}
			} as any,
			jest.fn()
		)

		expect(bindingRepository.upsert).toHaveBeenCalledTimes(1)
		expect(persistedBindings.get('integration-1')).toEqual(
			expect.objectContaining({
				integrationId: 'integration-1',
				xpertId: 'xpert-1',
				ownerOpenId: null,
				config: expect.objectContaining({
					integrationId: 'integration-1',
					singleChatScope: 'all_users',
					groupReplyStrategy: 'all_messages',
					streamingEnabled: true,
					sessionTimeoutSeconds: 3600,
					summaryWindowSeconds: 0
				})
			})
		)
	})

	it('does not block trigger publication when cleanup scheduling fails', async () => {
		const { strategy, bindingRepository, messageHistoryQueue } = createStrategy()
		const callback = jest.fn()
		messageHistoryQueue.scheduleCleanup.mockRejectedValueOnce(new Error('cleanup queue unavailable'))

		await expect(
			strategy.publish(
				{
					xpertId: 'xpert-1',
					config: {
						integrationId: 'integration-1',
						enabled: true,
						captureUnmentionedGroupMessages: true,
						historyRetentionDays: 30
					}
				} as any,
				callback
			)
		).resolves.toBeUndefined()

		expect(bindingRepository.upsert).toHaveBeenCalledTimes(1)
		expect(messageHistoryQueue.scheduleCleanup).toHaveBeenCalledTimes(1)
		expect((strategy as any).callbacks.get('integration-1')).toBe(callback)
	})

	it('persists zero summary window without changing session timeout fallback behavior', async () => {
		const { strategy, persistedBindings } = createStrategy()

		await strategy.publish(
			{
				xpertId: 'xpert-1',
				config: {
					integrationId: 'integration-1',
					enabled: true,
					sessionTimeoutSeconds: 0,
					summaryWindowSeconds: 0
				}
			} as any,
			jest.fn()
		)

		expect(persistedBindings.get('integration-1')?.config).toEqual(
			expect.objectContaining({
				sessionTimeoutSeconds: 3600,
				summaryWindowSeconds: 0
			})
		)
	})

	it('rejects publish when single-chat self scope is disabled', async () => {
		const { strategy } = createStrategy()

		await expect(
			strategy.publish(
				{
					xpertId: 'xpert-1',
					config: {
						integrationId: 'integration-1',
						enabled: true,
						singleChatScope: 'self'
					}
				} as any,
				jest.fn()
			)
		).rejects.toThrow('Single-chat "Only Me" is temporarily disabled')
	})

	it('throws publish conflict error with bound xpert id', async () => {
		const { strategy } = createStrategy({
			bindings: [
				createBinding({
					xpertId: 'xpert-conflict-1'
				})
			]
		})

		await expect(
			strategy.publish(
				{
					xpertId: 'xpert-2',
					config: {
						integrationId: 'integration-1',
						enabled: true
					}
				} as any,
				jest.fn()
			)
		).rejects.toThrow('xpertId: xpert-conflict-1')
	})

	it('rejects publish when allowed group scope is invalid', async () => {
		const { strategy } = createStrategy()

		await expect(
			strategy.publish(
				{
					xpertId: 'xpert-1',
					config: {
						integrationId: 'integration-1',
						enabled: true,
						allowedGroupScope: 'invalid_scope'
					}
				} as any,
				jest.fn()
			)
		).rejects.toThrow('Invalid allowedGroupScope')
	})

	it('rejects publish when group reply strategy is invalid', async () => {
		const { strategy } = createStrategy()

		await expect(
			strategy.publish(
				{
					xpertId: 'xpert-1',
					config: {
						integrationId: 'integration-1',
						enabled: true,
						groupReplyStrategy: 'invalid_reply_strategy'
					}
				} as any,
				jest.fn()
			)
		).rejects.toThrow('Invalid groupReplyStrategy')
	})

	it('handles inbound message by persisted binding when runtime callback is missing', async () => {
		const binding = createBinding({
			config: {
				integrationId: 'integration-1',
				...DEFAULT_TRIGGER_CONFIG,
				groupReplyStrategy: 'all_messages'
			}
		})
		const { strategy, dispatchService } = createStrategy({
			bindings: [binding]
		})

		const handled = await strategy.handleInboundMessage({
			integrationId: 'integration-1',
			input: 'hello',
			larkMessage: {
				chatType: 'group',
				chatId: 'chat-1',
				senderOpenId: 'ou_sender_1'
			} as any,
			options: {
				fromEndUserId: 'mapped-user-1',
				botMentioned: false
			} as any
		})

		expect(handled).toBe(true)
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				xpertId: 'xpert-1',
				options: expect.objectContaining({
					fromEndUserId: 'mapped-user-1',
					streamingEnabled: true
				})
			})
		)
	})

	it('buffers inbound messages and schedules a delayed flush', async () => {
		const { strategy, aggregationService, dispatchService, handoffPermissionService } = createStrategy({
			bindings: [
				createBinding({
					config: {
						integrationId: 'integration-1',
						...DEFAULT_TRIGGER_CONFIG,
						groupReplyStrategy: 'all_messages',
						summaryWindowSeconds: 7
					}
				})
			]
		})

		await expect(
			strategy.handleInboundMessage({
				integrationId: 'integration-1',
				input: '第一条消息',
				files: [{ fileUrl: 'data:image/png;base64,YWJj', mimeType: 'image/png' }],
				historyContext: '[历史上下文]\n用户: 更早消息',
				historyFiles: [{ fileAssetId: 'history-asset-1' }],
				currentInboundLogIds: ['log-1'],
				historyBefore: '2026-07-15T08:00:00.000Z',
				larkMessage: {
					integrationId: 'integration-1',
					chatId: 'chat-1',
					chatType: 'group',
					senderOpenId: 'ou_sender_1',
					senderName: 'Alice',
					scopeKey: 'lark:v2:scope:integration-1:group:chat-1',
					legacyConversationUserKey: 'open_id:ou_sender_1',
					principalKey: 'lark:v2:principal:integration-1:open_id:ou_sender_1',
					recipientDirectoryKey: 'lark:recipient-dir:integration-1:chat:chat-1',
					language: 'zh-Hans',
					connectionMode: 'webhook'
				} as any,
				options: {
					fromEndUserId: 'mapped-user-1',
					botMentioned: false
				} as any
			})
		).resolves.toBe(true)

		expect(aggregationService.save).toHaveBeenCalledWith(
			expect.objectContaining({
				aggregateKey: 'lark:v2:scope:integration-1:group:chat-1',
				integrationId: 'integration-1',
				xpertId: 'xpert-1',
				version: 1,
				inputParts: ['第一条消息'],
				files: [{ fileUrl: 'data:image/png;base64,YWJj', mimeType: 'image/png' }],
				historyContext: '[历史上下文]\n用户: 更早消息',
				historyFiles: [{ fileAssetId: 'history-asset-1' }],
				currentInboundLogIds: ['log-1'],
				historyBefore: '2026-07-15T08:00:00.000Z',
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				executorUserId: 'user-1',
				endUserId: 'mapped-user-1',
				latestMessage: expect.objectContaining({
					chatId: 'chat-1',
					chatType: 'group',
					senderOpenId: 'ou_sender_1'
				})
			}),
			expect.any(Number)
		)
		expect(handoffPermissionService.enqueue).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: 'tenant-1',
				headers: expect.objectContaining({
					organizationId: 'org-1',
					userId: 'user-1'
				}),
				payload: {
					aggregateKey: 'lark:v2:scope:integration-1:group:chat-1',
					version: 1
				}
			}),
			{
				delayMs: 7000
			}
		)
		expect(dispatchService.enqueueDispatch).not.toHaveBeenCalled()
	})

	it('flushes the current aggregate into a single dispatch payload', async () => {
		const { strategy, aggregationService, dispatchService, messageHistoryService } = createStrategy()
		aggregationService.get.mockResolvedValue({
			aggregateKey: 'lark:v2:scope:integration-1:group:chat-1',
			integrationId: 'integration-1',
			xpertId: 'xpert-1',
			version: 2,
			inputParts: ['第一条消息', '第二条消息'],
			files: [{ fileUrl: 'data:image/png;base64,YWJj', mimeType: 'image/png' }],
			historyContext: '[历史上下文]\n用户: 更早消息',
			historyFiles: [{ fileAssetId: 'history-asset-1' }],
			currentInboundLogIds: ['log-1', 'log-2'],
			lastMessageAt: Date.now(),
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			executorUserId: 'user-1',
			endUserId: 'mapped-user-1',
			latestMessage: {
				integrationId: 'integration-1',
				chatId: 'chat-1',
				chatType: 'group',
				senderOpenId: 'ou_sender_1',
				senderName: 'Alice',
				scopeKey: 'lark:v2:scope:integration-1:group:chat-1',
				legacyConversationUserKey: 'open_id:ou_sender_1',
				principalKey: 'lark:v2:principal:integration-1:open_id:ou_sender_1',
				recipientDirectoryKey: 'lark:recipient-dir:integration-1:chat:chat-1',
				language: 'zh-Hans',
				connectionMode: 'webhook'
			}
		})

		await expect(
			strategy.flushBufferedConversation({
				aggregateKey: 'lark:v2:scope:integration-1:group:chat-1',
				version: 2
			})
		).resolves.toBe(true)

		expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				xpertId: 'xpert-1',
				executionContext: {
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					createdById: 'user-1'
				},
				input: '第一条消息\n第二条消息',
				files: [{ fileUrl: 'data:image/png;base64,YWJj', mimeType: 'image/png' }],
				historyContext: '[历史上下文]\n用户: 更早消息',
				historyFiles: [{ fileAssetId: 'history-asset-1' }],
				currentInboundLogIds: ['log-1', 'log-2'],
				options: expect.objectContaining({
					fromEndUserId: 'mapped-user-1'
				})
			})
		)
		expect(dispatchService.enqueueDispatch.mock.calls[0][0].larkMessage.chatId).toBe('chat-1')
		expect(messageHistoryService.updateInboundStatus).toHaveBeenCalledWith(
			['log-1', 'log-2'],
			'dispatched'
		)
		expect(aggregationService.clear).toHaveBeenCalledWith('lark:v2:scope:integration-1:group:chat-1')
	})
})

import { INTEGRATION_PERMISSION_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
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
	groupReplyStrategy: 'mention_only'
} as const

type PersistedBinding = {
	integrationId: string
	xpertId: string
	config?: Record<string, unknown>
	ownerOpenId?: string | null
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
				throw new Error(`Unexpected token: ${String(token)}`)
			})
		}

		const strategy = new (LarkTriggerStrategy as any)(
			dispatchService as any,
			larkChannel as any,
			bindingRepository as any,
			pluginContext as any
		)
		return {
			strategy,
			dispatchService,
			bindingRepository,
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
			...overrides
		}
	}

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
					streamingEnabled: true
				})
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
})

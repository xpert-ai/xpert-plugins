jest.mock('@xpert-ai/plugin-sdk', () => ({
	HANDOFF_PERMISSION_SERVICE_TOKEN: 'HANDOFF_PERMISSION_SERVICE_TOKEN',
	INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
	MANAGED_QUEUE_SERVICE_TOKEN: 'MANAGED_QUEUE_SERVICE_TOKEN',
	WorkflowTriggerStrategy: () => () => undefined,
	defineChannelMessageType: (...parts: Array<string | number>) => parts.join('.'),
	RequestContext: {
		currentTenantId: jest.fn(() => null),
		getOrganizationId: jest.fn(() => null),
		currentUserId: jest.fn(() => null)
	}
}))

jest.mock('../handoff/dingtalk-chat-dispatch.service.js', () => ({
	DingTalkChatDispatchService: class DingTalkChatDispatchService {}
}))

jest.mock('../dingtalk-channel.strategy.js', () => ({
	DingTalkChannelStrategy: class DingTalkChannelStrategy {}
}))

import { DingTalkTriggerStrategy } from './dingtalk-trigger.strategy.js'

describe('DingTalkTriggerStrategy', () => {
	function createStrategy(params?: {
		dbBindings?: Array<
			[string, { xpertId: string; sessionTimeoutSeconds?: number; summaryWindowSeconds?: number }]
		>
	}) {
		const persistedBindings = new Map<
			string,
			{ xpertId: string; sessionTimeoutSeconds: number; summaryWindowSeconds: number }
		>(
			(params?.dbBindings ?? []).map(([integrationId, value]) => [
				integrationId,
				{
					xpertId: value.xpertId,
					sessionTimeoutSeconds: value.sessionTimeoutSeconds ?? 3600,
					summaryWindowSeconds: value.summaryWindowSeconds ?? 0
				}
			])
		)
		const aggregationStates = new Map<string, any>()
		let lockedAggregateKey: string | undefined
		const aggregateLockLease = {
			ensureOwned: jest.fn().mockResolvedValue(undefined),
			clearStateIfOwned: jest.fn().mockImplementation(async () => {
				if (lockedAggregateKey) {
					aggregationStates.delete(lockedAggregateKey)
				}
			})
		}
		const dispatchService = {
			buildDispatchMessage: jest.fn().mockResolvedValue({
				id: 'handoff-id'
			}),
			enqueueDispatch: jest.fn().mockResolvedValue({
				messageId: 'enqueued-message'
			})
		}
		const aggregationService = {
			get: jest.fn().mockImplementation(async (key: string) => aggregationStates.get(key) ?? null),
			save: jest.fn().mockImplementation(async (state: any) => {
				aggregationStates.set(state.aggregateKey, state)
			}),
			clear: jest.fn().mockImplementation(async (key: string) => {
				aggregationStates.delete(key)
			}),
			withAggregateLock: jest.fn(
				async (key: string, callback: (lease: typeof aggregateLockLease) => Promise<unknown>) => {
					lockedAggregateKey = key
					try {
						return await callback(aggregateLockLease)
					} finally {
						lockedAggregateKey = undefined
					}
				}
			)
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
				createdById: 'user-1',
				updatedById: 'user-1'
			})
		}
		const bindingRepository = {
			findOne: jest.fn().mockImplementation(async ({ where }: { where: { integrationId: string } }) => {
				const binding = persistedBindings.get(where.integrationId)
				if (!binding) {
					return null
				}
				return {
					integrationId: where.integrationId,
					...binding
				}
			}),
			find: jest.fn().mockImplementation(async ({ where }: { where: { xpertId: string } }) => {
				const rows: Array<{ integrationId: string; xpertId: string }> = []
				for (const [integrationId, binding] of persistedBindings.entries()) {
					if (binding.xpertId === where.xpertId) {
						rows.push({
							integrationId,
							xpertId: binding.xpertId
						})
					}
				}
				return rows
			}),
			upsert: jest
				.fn()
				.mockImplementation(async (payload: any) => {
					persistedBindings.set(payload.integrationId, {
						xpertId: payload.xpertId,
						sessionTimeoutSeconds: payload.sessionTimeoutSeconds,
						summaryWindowSeconds: payload.summaryWindowSeconds
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
					for (const [integrationId, binding] of persistedBindings) {
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
				if (token === 'INTEGRATION_PERMISSION_SERVICE_TOKEN') {
					return integrationPermissionService
				}
				if (token === 'HANDOFF_PERMISSION_SERVICE_TOKEN') {
					return handoffPermissionService
				}
				throw new Error(`Unexpected token: ${String(token)}`)
			})
		}

		const strategy = new (DingTalkTriggerStrategy as any)(
			dispatchService as any,
			aggregationService as any,
			{} as any,
			bindingRepository as any,
			pluginContext as any
		)
		return {
			strategy,
			dispatchService,
			aggregationService,
			aggregateLockLease,
			handoffPermissionService,
			bindingRepository,
			persistedBindings,
			aggregationStates
		}
	}

	it('loads DingTalk integrations from the plugin select endpoint', () => {
		const { strategy } = createStrategy()
		const properties = strategy.meta.configSchema.properties as Record<string, any>

		expect(properties.integrationId['x-ui'].selectUrl).toBe('/api/dingtalk/integration-select-options')
	})

	it('exposes session timeout and summary window defaults in trigger schema', () => {
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
	})

	it('publishes binding and forwards inbound messages via callback', async () => {
		const { strategy, dispatchService, bindingRepository, persistedBindings } = createStrategy()
		const callback = jest.fn()

		await strategy.publish(
			{
				xpertId: 'xpert-1',
				config: {
					enabled: true,
					integrationId: 'integration-1'
				}
			} as any,
			callback
		)

		const handled = await strategy.handleInboundMessage({
			integrationId: 'integration-1',
			input: 'hello',
			dingtalkMessage: {} as any
		})

		expect(handled).toBe(true)
		expect(dispatchService.buildDispatchMessage).toHaveBeenCalledTimes(1)
		expect(bindingRepository.upsert).toHaveBeenCalledTimes(1)
		expect(persistedBindings.get('integration-1')).toEqual({
			xpertId: 'xpert-1',
			sessionTimeoutSeconds: 3600,
			summaryWindowSeconds: 0
		})
		expect(callback).toHaveBeenCalledWith(
			expect.objectContaining({
				from: 'dingtalk',
				xpertId: 'xpert-1',
				handoffMessage: expect.objectContaining({ id: 'handoff-id' })
			})
		)
	})

	it('throws when one integration is bound to different xperts', async () => {
		const { strategy } = createStrategy({
			dbBindings: [['integration-1', { xpertId: 'xpert-1' }]]
		})

		await expect(
			strategy.publish(
				{
					xpertId: 'xpert-2',
					config: {
						enabled: true,
						integrationId: 'integration-1'
					}
				} as any,
				jest.fn()
			)
		).rejects.toThrow(/already bound/)
	})

	it('reports validation error when integration binding conflicts', async () => {
		const { strategy } = createStrategy({
			dbBindings: [['integration-1', { xpertId: 'xpert-1' }]]
		})

		const checklist = await strategy.validate({
			xpertId: 'xpert-2',
			node: { key: 'trigger-1' },
			config: {
				enabled: true,
				integrationId: 'integration-1'
			}
		} as any)

		expect(checklist).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					ruleCode: 'TRIGGER_DINGTALK_INTEGRATION_CONFLICT',
					field: 'integrationId',
					level: 'error'
				})
			])
		)
	})

	it('resolves bound xpert id from persisted binding table', async () => {
		const { strategy, bindingRepository } = createStrategy({
			dbBindings: [['integration-1', { xpertId: 'xpert-from-db' }]]
		})

		const xpertId = await strategy.getBoundXpertId('integration-1')

		expect(xpertId).toBe('xpert-from-db')
		expect(bindingRepository.findOne).toHaveBeenCalledTimes(1)
	})

	it('handles inbound message by persisted binding when runtime callback is missing', async () => {
		const { strategy, dispatchService } = createStrategy({
			dbBindings: [['integration-1', { xpertId: 'xpert-from-db' }]]
		})

		const handled = await strategy.handleInboundMessage({
			integrationId: 'integration-1',
			input: 'hello',
			dingtalkMessage: {} as any
		})

		expect(handled).toBe(true)
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				xpertId: 'xpert-from-db',
				input: 'hello'
			})
		)
		expect(dispatchService.buildDispatchMessage).not.toHaveBeenCalled()
	})

	it('persists zero summary window without changing session timeout fallback behavior', async () => {
		const { strategy, persistedBindings } = createStrategy()

		await strategy.publish(
			{
				xpertId: 'xpert-1',
				config: {
					enabled: true,
					integrationId: 'integration-1',
					sessionTimeoutSeconds: 0,
					summaryWindowSeconds: 0
				}
			} as any,
			jest.fn()
		)

		expect(persistedBindings.get('integration-1')).toEqual({
			xpertId: 'xpert-1',
			sessionTimeoutSeconds: 3600,
			summaryWindowSeconds: 0
		})
	})

	it('buffers inbound messages and schedules a delayed flush', async () => {
		const { strategy, aggregationService, dispatchService, handoffPermissionService } = createStrategy({
			dbBindings: [['integration-1', { xpertId: 'xpert-1', summaryWindowSeconds: 7 }]]
		})

		await expect(
			(strategy as any).handleInboundMessage({
				integrationId: 'integration-1',
				input: '第一条消息',
				dingtalkMessage: {
					integrationId: 'integration-1',
					chatId: 'chat-1',
					dingtalkUserId: 'user-1',
					senderOpenId: 'sender-1',
					senderRecipient: { type: 'user_id', id: 'staff-1' },
					chatType: 'private',
					sessionWebhook: 'https://example.com/session',
					language: 'zh-Hans'
				} as any,
				conversationId: 'conversation-1',
				conversationUserKey: 'integration-1:chat-1:sender-1',
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				executorUserId: 'user-1',
				endUserId: 'sender-1'
			})
		).resolves.toBe(true)

		expect(aggregationService.save).toHaveBeenCalledWith(
			expect.objectContaining({
				aggregateKey: 'integration-1:chat-1:sender-1',
				version: 1,
				inputParts: ['第一条消息'],
				xpertId: 'xpert-1',
				conversationId: 'conversation-1',
				latestMessage: expect.objectContaining({
					chatId: 'chat-1',
					senderOpenId: 'sender-1',
					senderRecipient: { type: 'user_id', id: 'staff-1' },
					chatType: 'private'
				})
			}),
			expect.any(Number)
		)
		expect(handoffPermissionService.enqueue).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: {
					aggregateKey: 'integration-1:chat-1:sender-1',
					version: 1
				}
			}),
			{
				delayMs: 7000
			}
		)
		expect(dispatchService.enqueueDispatch).not.toHaveBeenCalled()
	})

	it('flushes and clears one aggregate while holding the same lock used by updates', async () => {
		const { strategy, aggregationService, aggregateLockLease, dispatchService, handoffPermissionService } =
			createStrategy({
				dbBindings: [['integration-1', { xpertId: 'xpert-1', summaryWindowSeconds: 3 }]]
			})

		await strategy.handleInboundMessage({
			integrationId: 'integration-1',
			input: '看一下文件',
			files: [{ fileAssetId: 'file-asset-1', originalName: 'report.pdf' }],
			dingtalkMessage: {
				integrationId: 'integration-1',
				chatId: 'chat-1',
				dingtalkUserId: 'user-1',
				senderOpenId: 'sender-1',
				chatType: 'private'
			} as any,
			conversationUserKey: 'integration-1:chat-1:sender-1'
		})

		const flushPayload = handoffPermissionService.enqueue.mock.calls[0][0].payload
		await expect(strategy.flushBufferedConversation(flushPayload)).resolves.toBe(true)

		expect(aggregationService.withAggregateLock).toHaveBeenCalledTimes(2)
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				dispatchMessageId: expect.stringMatching(/^dingtalk-chat-aggregate-/),
				input: '看一下文件',
				files: [{ fileAssetId: 'file-asset-1', originalName: 'report.pdf' }]
			})
		)
		expect(aggregateLockLease.clearStateIfOwned).toHaveBeenCalledTimes(1)
	})

	it('merges separate file and text events and ignores the stale first flush', async () => {
		const { strategy, aggregateLockLease, dispatchService, handoffPermissionService } = createStrategy({
			dbBindings: [['integration-1', { xpertId: 'xpert-1', summaryWindowSeconds: 3 }]]
		})
		const message = {
			integrationId: 'integration-1',
			chatId: 'chat-1',
			dingtalkUserId: 'user-1',
			senderOpenId: 'sender-1',
			chatType: 'private'
		} as any
		const conversationUserKey = 'integration-1:chat-1:sender-1'

		await strategy.handleInboundMessage({
			integrationId: 'integration-1',
			files: [{ fileAssetId: 'file-asset-1', originalName: 'report.pdf' }],
			dingtalkMessage: message,
			conversationUserKey
		})
		await strategy.handleInboundMessage({
			integrationId: 'integration-1',
			input: '看一下文件内容',
			dingtalkMessage: message,
			conversationUserKey
		})

		const firstFlush = handoffPermissionService.enqueue.mock.calls[0][0].payload
		const latestFlush = handoffPermissionService.enqueue.mock.calls[1][0].payload
		await expect(strategy.flushBufferedConversation(firstFlush)).resolves.toBe(false)
		await expect(strategy.flushBufferedConversation(latestFlush)).resolves.toBe(true)

		expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				input: '看一下文件内容',
				files: [{ fileAssetId: 'file-asset-1', originalName: 'report.pdf' }]
			})
		)
		expect(aggregateLockLease.clearStateIfOwned).toHaveBeenCalledTimes(1)
		for (const [message] of handoffPermissionService.enqueue.mock.calls) {
			expect(message.maxAttempts).toBe(3)
		}
	})

	it('retries a transient flush enqueue with the same handoff message', async () => {
		const { strategy, handoffPermissionService } = createStrategy({
			dbBindings: [['integration-1', { xpertId: 'xpert-1', summaryWindowSeconds: 3 }]]
		})
		handoffPermissionService.enqueue
			.mockRejectedValueOnce(new Error('temporary enqueue failure'))
			.mockResolvedValueOnce({ id: 'flush-message-id' })

		await expect(
			strategy.handleInboundMessage({
				integrationId: 'integration-1',
				input: '看一下文件',
				dingtalkMessage: {
					integrationId: 'integration-1',
					chatId: 'chat-1',
					dingtalkUserId: 'user-1',
					senderOpenId: 'sender-1',
					chatType: 'private'
				} as any,
				conversationUserKey: 'integration-1:chat-1:sender-1'
			})
		).resolves.toBe(true)

		expect(handoffPermissionService.enqueue).toHaveBeenCalledTimes(2)
		expect(handoffPermissionService.enqueue.mock.calls[1][0]).toBe(
			handoffPermissionService.enqueue.mock.calls[0][0]
		)
		expect(handoffPermissionService.enqueue.mock.calls[0][0].maxAttempts).toBe(3)
	})

	it('dispatches synchronously when delayed flush scheduling is exhausted', async () => {
		const { strategy, dispatchService, handoffPermissionService, aggregationStates } =
			createStrategy({
				dbBindings: [['integration-1', { xpertId: 'xpert-1', summaryWindowSeconds: 3 }]]
			})
		handoffPermissionService.enqueue.mockRejectedValue(new Error('queue unavailable'))

		await expect(
			strategy.handleInboundMessage({
				integrationId: 'integration-1',
				input: '立即降级派发',
				dingtalkMessage: {
					integrationId: 'integration-1',
					chatId: 'chat-1',
					dingtalkUserId: 'user-1',
					senderOpenId: 'sender-1',
					chatType: 'private'
				} as any,
				conversationUserKey: 'integration-1:chat-1:sender-1'
			})
		).resolves.toBe(true)

		expect(handoffPermissionService.enqueue).toHaveBeenCalledTimes(3)
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				input: '立即降级派发'
			})
		)
		expect(aggregationStates.has('integration-1:chat-1:sender-1')).toBe(false)
	})

	it('does not retry dispatch when both the dispatched marker and aggregate cleanup fail', async () => {
		const {
			strategy,
			aggregationService,
			aggregateLockLease,
			dispatchService,
			handoffPermissionService,
			aggregationStates
		} = createStrategy({
			dbBindings: [['integration-1', { xpertId: 'xpert-1', summaryWindowSeconds: 3 }]]
		})
		await strategy.handleInboundMessage({
			integrationId: 'integration-1',
			input: '只派发一次',
			dingtalkMessage: {
				integrationId: 'integration-1',
				chatId: 'chat-1',
				dingtalkUserId: 'user-1',
				senderOpenId: 'sender-1',
				chatType: 'private'
			} as any,
			conversationUserKey: 'integration-1:chat-1:sender-1'
		})
		const flushPayload = handoffPermissionService.enqueue.mock.calls[0][0].payload
		aggregationService.save
			.mockImplementationOnce(async (state: any) => {
				aggregationStates.set(state.aggregateKey, state)
			})
			.mockRejectedValueOnce(new Error('marker save failed'))
			.mockRejectedValueOnce(new Error('marker save failed'))
			.mockRejectedValueOnce(new Error('marker save failed'))
		aggregateLockLease.clearStateIfOwned.mockRejectedValue(new Error('aggregate clear failed'))

		await expect(strategy.flushBufferedConversation(flushPayload)).resolves.toBe(true)
		await expect(strategy.flushBufferedConversation(flushPayload)).resolves.toBe(true)

		expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)
		expect(aggregationService.save).toHaveBeenCalledTimes(5)
		expect(aggregateLockLease.clearStateIfOwned).toHaveBeenCalledTimes(2)
		expect(aggregationStates.get('integration-1:chat-1:sender-1')).toEqual(
			expect.objectContaining({
				deliveryStatus: 'dispatching',
				dispatchMessageId: expect.stringMatching(/^dingtalk-chat-aggregate-/)
			})
		)
	})

	it('does not merge an already dispatched aggregate after cleanup fails', async () => {
		const {
			strategy,
			aggregateLockLease,
			dispatchService,
			handoffPermissionService,
			aggregationStates
		} = createStrategy({
			dbBindings: [['integration-1', { xpertId: 'xpert-1', summaryWindowSeconds: 3 }]]
		})
		const dingtalkMessage = {
			integrationId: 'integration-1',
			chatId: 'chat-1',
			dingtalkUserId: 'user-1',
			senderOpenId: 'sender-1',
			chatType: 'private'
		} as any
		const conversationUserKey = 'integration-1:chat-1:sender-1'

		await strategy.handleInboundMessage({
			integrationId: 'integration-1',
			input: '第一条',
			files: [{ fileAssetId: 'file-asset-1', originalName: 'report.pdf' }],
			dingtalkMessage,
			conversationUserKey
		})

		const firstFlushMessage = handoffPermissionService.enqueue.mock.calls[0][0]
		aggregateLockLease.clearStateIfOwned.mockRejectedValueOnce(new Error('aggregate clear failed'))

		await expect(strategy.flushBufferedConversation(firstFlushMessage.payload)).resolves.toBe(true)
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)
		expect(aggregationStates.get(conversationUserKey)).toEqual(
			expect.objectContaining({
				deliveryStatus: 'dispatched',
				inputParts: ['第一条']
			})
		)

		await expect(
			strategy.flushBufferedConversation(firstFlushMessage.payload)
		).resolves.toBe(false)
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)

		await strategy.handleInboundMessage({
			integrationId: 'integration-1',
			input: '第二条',
			dingtalkMessage,
			conversationUserKey
		})
		const secondFlushMessage = handoffPermissionService.enqueue.mock.calls[1][0]
		await expect(strategy.flushBufferedConversation(secondFlushMessage.payload)).resolves.toBe(true)

		expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(2)
		expect(dispatchService.enqueueDispatch).toHaveBeenLastCalledWith(
			expect.objectContaining({
				input: '第二条',
				files: []
			})
		)
	})
})

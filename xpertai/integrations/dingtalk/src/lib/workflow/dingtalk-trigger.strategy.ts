import type { ChecklistItem, TWorkflowTriggerMeta } from '@xpert-ai/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
	HANDOFF_PERMISSION_SERVICE_TOKEN,
	HandoffMessage,
	HandoffPermissionService,
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	IntegrationPermissionService,
	IWorkflowTriggerStrategy,
	type PluginContext,
	RequestContext,
	TWorkflowTriggerParams,
	WorkflowTriggerStrategy
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { Repository } from 'typeorm'
import { DingTalkChannelStrategy } from '../dingtalk-channel.strategy.js'
import {
	DingTalkChatDispatchService,
	type TDingTalkChatDispatchInput
} from '../handoff/dingtalk-chat-dispatch.service.js'
import { ChatDingTalkMessage } from '../message.js'
import { DINGTALK_PLUGIN_CONTEXT } from '../tokens.js'
import { DINGTALK_INTEGRATION_SELECT_URL, type DingTalkInboundFile, iconImage } from '../types.js'
import { DingTalkTriggerBindingEntity } from '../entities/dingtalk-trigger-binding.entity.js'
import { DingTalkTriggerAggregationService } from './dingtalk-trigger-aggregation.service.js'
import {
	DINGTALK_TRIGGER_FLUSH_MESSAGE_TYPE,
	DingTalkTriggerAggregationState,
	DingTalkTriggerFlushPayload
} from './dingtalk-trigger-aggregation.types.js'
import { DingTalkTrigger, TDingTalkTriggerConfig } from './dingtalk-trigger.types.js'

const DEFAULT_SESSION_TIMEOUT_SECONDS = 3600
const DEFAULT_SUMMARY_WINDOW_SECONDS = 0

@Injectable()
@WorkflowTriggerStrategy(DingTalkTrigger)
export class DingTalkTriggerStrategy implements IWorkflowTriggerStrategy<TDingTalkTriggerConfig> {
	private readonly logger = new Logger(DingTalkTriggerStrategy.name)
	/**
	 * @deprecated use persisted binding and handoff message queue instead of in-memory callback
	 */
	private readonly callbacks = new Map<string, (payload: any) => void>()
	private _integrationPermissionService: IntegrationPermissionService
	private _handoffPermissionService: HandoffPermissionService

	readonly meta: TWorkflowTriggerMeta = {
		name: DingTalkTrigger,
		label: {
			en_US: 'DingTalk Trigger',
			zh_Hans: '钉钉触发器'
		},
		icon: {
			type: 'svg',
			value: iconImage
		},
		configSchema: {
			type: 'object',
			properties: {
				enabled: {
					type: 'boolean',
					title: {
						en_US: 'Enabled',
						zh_Hans: '启用'
					},
					default: true
				},
				integrationId: {
					type: 'string',
					title: {
						en_US: 'DingTalk Integration',
						zh_Hans: '钉钉集成'
					},
					'x-ui': {
						component: 'remoteSelect',
						selectUrl: DINGTALK_INTEGRATION_SELECT_URL
					} as any
				},
				sessionTimeoutSeconds: {
					type: 'number',
					title: {
						en_US: 'Session Timeout (seconds)',
						zh_Hans: '会话超时时间（秒）'
					},
					description: {
						en_US: 'Messages after this idle window start a new conversation.',
						zh_Hans: '超过该空闲时长后的下一条消息会按新会话处理。'
					},
					default: DEFAULT_SESSION_TIMEOUT_SECONDS
				},
				summaryWindowSeconds: {
					type: 'number',
					title: {
						en_US: 'Summary Window (seconds)',
						zh_Hans: '汇总时间（秒）'
					},
					description: {
						en_US: 'Messages received in this window are merged before dispatching to the xpert.',
						zh_Hans: '连续消息会在该窗口内汇总后再发送给数字专家。'
					},
					default: DEFAULT_SUMMARY_WINDOW_SECONDS
				}
			},
			required: ['enabled', 'integrationId']
		}
	}

	readonly bootstrap = {
		mode: 'skip' as const,
		critical: false
	}

	constructor(
		private readonly dispatchService: DingTalkChatDispatchService,
		private readonly aggregationService: DingTalkTriggerAggregationService,
		private readonly dingtalkChannel: DingTalkChannelStrategy,
		@InjectRepository(DingTalkTriggerBindingEntity)
		private readonly bindingRepository: Repository<DingTalkTriggerBindingEntity>,
		@Inject(DINGTALK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext
	) {}

	private get integrationPermissionService(): IntegrationPermissionService {
		if (!this._integrationPermissionService) {
			this._integrationPermissionService = this.pluginContext.resolve(
				INTEGRATION_PERMISSION_SERVICE_TOKEN
			)
		}
		return this._integrationPermissionService
	}

	private get handoffPermissionService(): HandoffPermissionService {
		if (!this._handoffPermissionService) {
			this._handoffPermissionService = this.pluginContext.resolve(HANDOFF_PERMISSION_SERVICE_TOKEN)
		}
		return this._handoffPermissionService
	}

	async validate(payload: TWorkflowTriggerParams<TDingTalkTriggerConfig>) {
		const { xpertId, node, config } = payload
		const items: ChecklistItem[] = []
		const nodeKey = node?.key

		if (!config?.integrationId) {
			items.push({
				node: nodeKey,
				ruleCode: 'TRIGGER_DINGTALK_INTEGRATION_REQUIRED',
				field: 'integrationId',
				value: '',
				message: {
					en_US: 'DingTalk integration is required',
					zh_Hans: '需要选择钉钉集成'
				},
				level: 'error'
			})
			return items
		}

		try {
			const integration = await this.integrationPermissionService.read(config.integrationId)
			if (!integration) {
				items.push({
					node: nodeKey,
					ruleCode: 'TRIGGER_DINGTALK_INTEGRATION_NOT_FOUND',
					field: 'integrationId',
					value: config.integrationId,
					message: {
						en_US: `DingTalk integration "${config.integrationId}" not found`,
						zh_Hans: `钉钉集成 "${config.integrationId}" 不存在`
					},
					level: 'error'
				})
			}
		} catch (error) {
			this.logger.warn(
				`Validate integration "${config.integrationId}" failed: ${
					error instanceof Error ? error.message : String(error)
				}`
			)
		}

		if (!config.enabled) {
			return items
		}

		const existingXpertId = await this.getBoundXpertId(config.integrationId)
		if (existingXpertId && existingXpertId !== xpertId) {
			items.push({
				node: nodeKey,
				ruleCode: 'TRIGGER_DINGTALK_INTEGRATION_CONFLICT',
				field: 'integrationId',
				value: config.integrationId,
				message: {
					en_US: `Integration "${config.integrationId}" is already bound to another xpert`,
					zh_Hans: `钉钉集成 "${config.integrationId}" 已绑定到其他专家`
				},
				level: 'error'
			})
		}

		return items
	}

	async publish(
		payload: TWorkflowTriggerParams<TDingTalkTriggerConfig>,
		callback: (payload: any) => void
	): Promise<void> {
		const { xpertId, config } = payload
		if (!config?.enabled || !config.integrationId) {
			return
		}

		const integrationId = config.integrationId
		const existingXpertId = await this.getBoundXpertId(integrationId)
		if (existingXpertId && existingXpertId !== xpertId) {
			throw new Error(
				`DingTalk trigger integration "${integrationId}" is already bound to xpert "${existingXpertId}"`
			)
		}

		const context = await this.resolveBindingContext(integrationId)
		await this.bindingRepository.upsert(
			{
				integrationId,
				xpertId,
				sessionTimeoutSeconds: this.normalizePositiveSeconds(
					config.sessionTimeoutSeconds,
					DEFAULT_SESSION_TIMEOUT_SECONDS
				),
				summaryWindowSeconds: this.normalizeNonNegativeSeconds(
					config.summaryWindowSeconds,
					DEFAULT_SUMMARY_WINDOW_SECONDS
				),
				tenantId: context.tenantId ?? null,
				organizationId: context.organizationId ?? null,
				createdById: context.createdById ?? null,
				updatedById: context.updatedById ?? null
			},
			['integrationId']
		)

		// Keep only runtime callback in memory; integration/xpert binding source of truth is DB.
		this.callbacks.set(integrationId, callback)
	}

	async stop(payload: TWorkflowTriggerParams<TDingTalkTriggerConfig>): Promise<void> {
		const { xpertId, config } = payload
		const integrationId = config?.integrationId
		if (integrationId) {
			this.callbacks.delete(integrationId)
			await this.removeBindingFromStore(integrationId, xpertId)
			return
		}

		const persistedBindings = await this.bindingRepository.find({
			where: {
				xpertId
			}
		})
		for (const binding of persistedBindings) {
			this.callbacks.delete(binding.integrationId)
		}
		await this.removeBindingsByXpertId(xpertId)
	}

	async getBoundXpertId(integrationId: string): Promise<string | null> {
		const binding = await this.getBinding(integrationId)
		return binding?.xpertId ?? null
	}

	async getBinding(integrationId: string): Promise<DingTalkTriggerBindingEntity | null> {
		if (!integrationId) {
			return null
		}

		return this.bindingRepository.findOne({
			where: {
				integrationId
			}
		})
	}

	async clearBufferedConversation(conversationUserKey: string): Promise<void> {
		const aggregateKey = this.normalizeAggregateKey(conversationUserKey)
		if (!aggregateKey) {
			return
		}
		await this.aggregationService.clear(aggregateKey)
	}

	async handleInboundMessage(params: {
		integrationId: string
		input?: string
		files?: DingTalkInboundFile[]
		dingtalkMessage: ChatDingTalkMessage
		conversationId?: string
		conversationUserKey?: string
		tenantId?: string
		organizationId?: string
		executorUserId?: string
		endUserId?: string
		options?: {
			confirm?: boolean
			reject?: boolean
		}
	}): Promise<boolean> {
		const binding = await this.getBinding(params.integrationId)
		if (!binding?.xpertId) {
			return false
		}

		const summaryWindowSeconds = this.normalizeNonNegativeSeconds(
			binding.summaryWindowSeconds,
			DEFAULT_SUMMARY_WINDOW_SECONDS
		)
		if (summaryWindowSeconds <= 0 || params.options?.confirm || params.options?.reject) {
			await this.dispatchInboundMessage({
				integrationId: params.integrationId,
				xpertId: binding.xpertId,
				dispatchMode: 'immediate',
				dispatchPayload: {
					xpertId: binding.xpertId,
					input: params.input,
					files: params.files,
					dingtalkMessage: params.dingtalkMessage,
					conversationId: params.conversationId,
					conversationUserKey: params.conversationUserKey,
					options: params.options
				}
			})
			return true
		}

		const aggregateKey = this.normalizeAggregateKey(params.conversationUserKey)
		if (!aggregateKey) {
			this.logger.warn(`[dingtalk-trigger] aggregation key missing integrationId=${params.integrationId}`)
			return false
		}

		const currentState = await this.aggregationService.get(aggregateKey)
		const sameRoutingTarget =
			currentState?.integrationId === params.integrationId && currentState?.xpertId === binding.xpertId
		const nextVersion = (currentState?.version ?? 0) + 1
		const aggregateState: DingTalkTriggerAggregationState = {
			aggregateKey,
			integrationId: params.integrationId,
			conversationUserKey: aggregateKey,
			xpertId: binding.xpertId,
			version: nextVersion,
			inputParts: [...(sameRoutingTarget ? currentState?.inputParts ?? [] : []), params.input || ''],
			files: [...(sameRoutingTarget ? currentState?.files ?? [] : []), ...(params.files ?? [])],
			lastMessageAt: Date.now(),
			conversationId: params.conversationId ?? (sameRoutingTarget ? currentState?.conversationId : undefined),
			tenantId: params.tenantId,
			organizationId: params.organizationId,
			executorUserId: params.executorUserId,
			endUserId: params.endUserId,
			latestMessage: {
				integrationId: params.dingtalkMessage.integrationId,
				organizationId: params.organizationId,
				chatId: params.dingtalkMessage.chatId,
				userId: params.dingtalkMessage.dingtalkUserId,
				senderOpenId: params.dingtalkMessage.senderOpenId,
				sessionWebhook: params.dingtalkMessage.sessionWebhook,
				robotCode: params.dingtalkMessage.robotCode,
				language: params.dingtalkMessage.language
			}
		}

		const ttlSeconds = Math.max(
			DEFAULT_SESSION_TIMEOUT_SECONDS,
			this.normalizePositiveSeconds(binding.sessionTimeoutSeconds, DEFAULT_SESSION_TIMEOUT_SECONDS),
			summaryWindowSeconds * 3
		)
		await this.aggregationService.save(aggregateState, ttlSeconds)
		await this.handoffPermissionService.enqueue(this.buildFlushMessage(aggregateState), {
			delayMs: summaryWindowSeconds * 1000
		})

		this.logger.debug(
			`[dingtalk-trigger] buffered inbound integrationId=${params.integrationId} xpertId=${binding.xpertId} aggregateKey=${aggregateKey} version=${nextVersion}`
		)
		return true
	}

	async flushBufferedConversation(payload: DingTalkTriggerFlushPayload): Promise<boolean> {
		const aggregateKey = this.normalizeAggregateKey(payload.aggregateKey)
		if (!aggregateKey) {
			return false
		}

		const state = await this.aggregationService.get(aggregateKey)
		if (!state || state.version !== payload.version) {
			return false
		}

		await this.dispatchInboundMessage({
			integrationId: state.integrationId,
			xpertId: state.xpertId,
			dispatchMode: `buffered version=${state.version}`,
			dispatchPayload: {
				xpertId: state.xpertId,
				input: state.inputParts.join('\n'),
				files: state.files,
				dingtalkMessage: new ChatDingTalkMessage(
					{
						integrationId: state.latestMessage.integrationId,
						organizationId: state.latestMessage.organizationId,
						preferLanguage: state.latestMessage.language,
						userId: state.latestMessage.userId,
						senderOpenId: state.latestMessage.senderOpenId,
						sessionWebhook: state.latestMessage.sessionWebhook,
						robotCode: state.latestMessage.robotCode,
						chatId: state.latestMessage.chatId,
						dingtalkChannel: this.dingtalkChannel
					},
					{
						text: state.inputParts.join('\n'),
						status: 'thinking',
						language: state.latestMessage.language
					}
				),
				conversationId: state.conversationId,
				conversationUserKey: state.conversationUserKey
			}
		})

		await this.aggregationService.clear(aggregateKey)
		return true
	}

	private buildFlushMessage(
		state: DingTalkTriggerAggregationState
	): HandoffMessage<DingTalkTriggerFlushPayload> {
		return {
			id: `dingtalk-trigger-flush-${randomUUID()}`,
			type: DINGTALK_TRIGGER_FLUSH_MESSAGE_TYPE,
			version: 1,
			tenantId: state.tenantId,
			sessionKey: state.aggregateKey,
			businessKey: state.aggregateKey,
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: Date.now(),
			traceId: `${state.aggregateKey}:${state.version}`,
			payload: {
				aggregateKey: state.aggregateKey,
				version: state.version
			},
			headers: {
				...(state.organizationId ? { organizationId: state.organizationId } : {}),
				...(state.executorUserId ? { userId: state.executorUserId } : {}),
				source: 'api',
				requestedLane: 'main',
				handoffQueue: 'integration',
				...(state.integrationId ? { integrationId: state.integrationId } : {})
			}
		}
	}

	private normalizeAggregateKey(value?: string | null): string | undefined {
		if (typeof value !== 'string') {
			return undefined
		}
		const normalized = value.trim()
		return normalized || undefined
	}

	private normalizePositiveSeconds(value: unknown, defaultValue: number): number {
		if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
			return Math.floor(value)
		}
		return defaultValue
	}

	private normalizeNonNegativeSeconds(value: unknown, defaultValue: number): number {
		if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
			return Math.floor(value)
		}
		return defaultValue
	}

	private async dispatchInboundMessage(params: {
		integrationId: string
		xpertId: string
		dispatchMode: string
		dispatchPayload: TDingTalkChatDispatchInput
	}): Promise<void> {
		const callback = this.callbacks.get(params.integrationId)
		if (!callback) {
			this.logger.debug(
				`[dingtalk-trigger] runtime callback miss, enqueue dispatch integrationId=${params.integrationId} xpertId=${params.xpertId} mode=${params.dispatchMode}`
			)
			await this.dispatchService.enqueueDispatch(params.dispatchPayload)
			return
		}

		this.logger.debug(
			`[dingtalk-trigger] runtime callback hit, forward handoff integrationId=${params.integrationId} xpertId=${params.xpertId} mode=${params.dispatchMode}`
		)
		const handoffMessage = await this.dispatchService.buildDispatchMessage(params.dispatchPayload)
		await Promise.resolve(
			callback({
				from: DingTalkTrigger,
				xpertId: params.xpertId,
				handoffMessage
			})
		)
	}

	private async resolveBindingContext(integrationId: string): Promise<{
		tenantId: string | null
		organizationId: string | null
		createdById: string | null
		updatedById: string | null
	}> {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()

		if (tenantId && organizationId) {
			return {
				tenantId,
				organizationId,
				createdById: userId,
				updatedById: userId
			}
		}

		const integration = await this.integrationPermissionService.read<any>(integrationId)
		return {
			tenantId: tenantId ?? integration?.tenantId ?? null,
			organizationId: organizationId ?? integration?.organizationId ?? null,
			createdById: userId ?? integration?.createdById ?? null,
			updatedById: userId ?? integration?.updatedById ?? userId ?? null
		}
	}

	private async removeBindingFromStore(integrationId: string, expectedXpertId?: string): Promise<void> {
		if (!integrationId) {
			return
		}

		if (expectedXpertId) {
			await this.bindingRepository.delete({
				integrationId,
				xpertId: expectedXpertId
			})
			return
		}

		await this.bindingRepository.delete({
			integrationId
		})
	}

	private async removeBindingsByXpertId(xpertId: string): Promise<void> {
		if (!xpertId) {
			return
		}
		await this.bindingRepository.delete({
			xpertId
		})
	}
}

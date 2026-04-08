import type { ChecklistItem, IIntegration, IUser, TWorkflowTriggerMeta } from '@metad/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	IntegrationPermissionService,
	IWorkflowTriggerStrategy,
	type PluginContext,
	RequestContext,
	TWorkflowTriggerParams,
	WorkflowTriggerStrategy
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { LarkChannelStrategy } from '../lark-channel.strategy.js'
import { LarkChatDispatchService } from '../handoff/lark-chat-dispatch.service.js'
import { ChatLarkMessage } from '../message.js'
import { LARK_PLUGIN_CONTEXT } from '../tokens.js'
import type { LarkGroupWindow, TIntegrationLarkOptions } from '../types.js'
import { iconImage } from '../types.js'
import { LarkTriggerBindingEntity } from '../entities/lark-trigger-binding.entity.js'
import {
	DEFAULT_LARK_TRIGGER_CONFIG,
	LARK_ALLOWED_GROUP_SCOPE_VALUES,
	LARK_GROUP_REPLY_STRATEGY_VALUES,
	LARK_GROUP_USER_SCOPE_VALUES,
	LARK_SINGLE_CHAT_SCOPE_VALUES,
	LarkTrigger,
	TLarkTriggerConfig
} from './lark-trigger.types.js'

type TLarkInboundDispatchOptions = {
	confirm?: boolean
	reject?: boolean
	fromEndUserId?: string
	executorUserId?: string
	streamingEnabled?: boolean
	botMentioned?: boolean
	groupWindow?: LarkGroupWindow
}

type TLarkInboundMatchParams = {
	binding?: Pick<LarkTriggerBindingEntity, 'config' | 'ownerOpenId'> | null
	config?: Partial<TLarkTriggerConfig> | null
	ownerOpenId?: string | null
	integrationId?: string | null
	chatType?: string | null
	chatId?: string | null
	senderOpenId?: string | null
	botMentioned?: boolean
}

type TLarkTriggerBindingConflict = Pick<LarkTriggerBindingEntity, 'integrationId' | 'xpertId'>

@Injectable()
@WorkflowTriggerStrategy(LarkTrigger)
export class LarkTriggerStrategy implements IWorkflowTriggerStrategy<TLarkTriggerConfig> {
	private readonly logger = new Logger(LarkTriggerStrategy.name)
	/**
	 * @deprecated use persisted binding and handoff message queue instead of in-memory callback
	 */
	private readonly callbacks = new Map<string, (payload: any) => void>()
	private _integrationPermissionService: IntegrationPermissionService

	readonly meta: TWorkflowTriggerMeta = {
		name: LarkTrigger,
		label: {
			en_US: 'Lark Trigger',
			zh_Hans: '飞书触发器'
		},
		icon: {
			type: 'image',
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
						en_US: 'Lark Integration',
						zh_Hans: '飞书集成'
					},
					'x-ui': {
						component: 'remoteSelect',
						selectUrl: '/api/integration/select-options?provider=lark'
					} as any
				},
				singleChatScope: {
					type: 'string',
					title: {
						en_US: 'Single Chat Scope',
						zh_Hans: '单聊范围'
					},
					enum: LARK_SINGLE_CHAT_SCOPE_VALUES.filter((value) => value !== 'self'),
					default: DEFAULT_LARK_TRIGGER_CONFIG.singleChatScope,
					'x-ui': {
						span: '1',
						enumLabels: {
							selected_users: {
								en_US: 'Selected Users',
								zh_Hans: '指定用户'
							},
							all_users: {
								en_US: 'All Users',
								zh_Hans: '所有用户'
							}
						}
					} as any
				},
				singleChatUserOpenIds: {
					type: 'array',
					title: {
						en_US: 'Single Chat Users',
						zh_Hans: '单聊指定用户'
					},
					default: [],
					'x-ui': {
						span: '1',
						component: 'remoteSelect',
						selectUrl: '/api/lark/user-select-options',
						multiple: true,
						depends: [
							{
								name: 'integrationId',
								alias: 'integration'
							}
						]
					} as any
				},
				/*
				executeAsMappedUser: {
					type: 'boolean',
					title: {
						en_US: 'Execute As Mapped User',
						zh_Hans: '以用户身份执行'
					},
					default: DEFAULT_LARK_TRIGGER_CONFIG.executeAsMappedUser,
					'x-ui': {
						span: 1,
					}
				},
				streamingEnabled: {
					type: 'boolean',
					title: {
						en_US: 'Streaming Output',
						zh_Hans: '启用流式输出'
					},
					default: DEFAULT_LARK_TRIGGER_CONFIG.streamingEnabled,
					'x-ui': {
						span: 1,
					}
				},
				*/
				allowedGroupScope: {
					type: 'string',
					title: {
						en_US: 'Allowed Group Scope',
						zh_Hans: '允许的群聊范围'
					},
					enum: LARK_ALLOWED_GROUP_SCOPE_VALUES,
					default: DEFAULT_LARK_TRIGGER_CONFIG.allowedGroupScope,
					'x-ui': {
						span: 1,
						enumLabels: {
							all_chats: {
								en_US: 'All Chats',
								zh_Hans: '所有群聊'
							},
							selected_chats: {
								en_US: 'Selected Chats',
								zh_Hans: '指定群聊'
							}
						}
					} as any
				},
				allowedGroupChatIds: {
					type: 'array',
					title: {
						en_US: 'Allowed Group Chats',
						zh_Hans: '允许的群聊'
					},
					default: [],
					'x-ui': {
						span: 1,
						component: 'remoteSelect',
						selectUrl: '/api/lark/chat-select-options',
						multiple: true,
						depends: [
							{
								name: 'integrationId',
								alias: 'integration'
							}
						]
					} as any
				},
				/*
				groupUserScope: {
					type: 'string',
					title: {
						en_US: 'Group User Scope',
						zh_Hans: '群内用户范围'
					},
					enum: LARK_GROUP_USER_SCOPE_VALUES.filter((value) => value !== 'self'),
					default: DEFAULT_LARK_TRIGGER_CONFIG.groupUserScope,
					'x-ui': {
						span: 1,
						enumLabels: {
							selected_users: {
								en_US: 'Selected Users',
								zh_Hans: '指定用户'
							},
							all_users: {
								en_US: 'All Users',
								zh_Hans: '所有用户'
							}
						}
					} as any
				},
				groupUserOpenIds: {
					type: 'array',
					title: {
						en_US: 'Group Users',
						zh_Hans: '群内指定用户'
					},
					default: [],
					'x-ui': {
						span: 1,
						component: 'remoteSelect',
						selectUrl: '/api/lark/user-select-options',
						multiple: true,
						depends: [
							{
								name: 'integrationId',
								alias: 'integration'
							}
						]
					} as any
				},
				*/
				groupReplyStrategy: {
					type: 'string',
					title: {
						en_US: 'Group Reply Strategy',
						zh_Hans: '群内回复策略'
					},
					enum: LARK_GROUP_REPLY_STRATEGY_VALUES,
					default: DEFAULT_LARK_TRIGGER_CONFIG.groupReplyStrategy,
					'x-ui': {
						span: 1,
						enumLabels: {
							mention_only: {
								en_US: 'Mention Only',
								zh_Hans: '仅 @ 机器人'
							},
							all_messages: {
								en_US: 'All Messages',
								zh_Hans: '回复所有消息'
							}
						}
					} as any
				}
			},
			required: ['enabled', 'integrationId'],
			'x-ui': {
				cols: 2
			}
		} as any
	}

	readonly bootstrap = {
		mode: 'skip' as const,
		critical: false
	}

	constructor(
		private readonly dispatchService: LarkChatDispatchService,
		private readonly larkChannel: LarkChannelStrategy,
		@InjectRepository(LarkTriggerBindingEntity)
		private readonly bindingRepository: Repository<LarkTriggerBindingEntity>,
		@Inject(LARK_PLUGIN_CONTEXT)
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

	normalizeConfig(
		config?: Partial<TLarkTriggerConfig> | null,
		integrationId?: string | null
	): TLarkTriggerConfig {
		return {
			...DEFAULT_LARK_TRIGGER_CONFIG,
			...config,
			integrationId: this.normalizeString(config?.integrationId) ?? this.normalizeString(integrationId) ?? '',
			singleChatUserOpenIds: this.normalizeStringArray(config?.singleChatUserOpenIds),
			allowedGroupChatIds: this.normalizeStringArray(config?.allowedGroupChatIds),
			groupUserOpenIds: this.normalizeStringArray(config?.groupUserOpenIds)
		}
	}

	matchesInboundMessage(params: TLarkInboundMatchParams): boolean {
		const config = this.normalizeConfig(
			params.binding?.config ?? params.config,
			params.integrationId
		)
		if (!config.enabled || !config.integrationId) {
			return false
		}

		const chatType = params.chatType === 'group' ? 'group' : 'private'
		const chatId = this.normalizeString(params.chatId)
		const senderOpenId = this.normalizeString(params.senderOpenId)
		const ownerOpenId = this.normalizeString(params.binding?.ownerOpenId ?? params.ownerOpenId)

		if (chatType === 'private') {
			return this.matchesUserScope(config.singleChatScope, {
				senderOpenId,
				ownerOpenId,
				selectedUserOpenIds: config.singleChatUserOpenIds
			})
		}

		if (!this.matchesGroupScope(config.allowedGroupScope, chatId, config.allowedGroupChatIds)) {
			return false
		}
		if (
			!this.matchesUserScope(config.groupUserScope, {
				senderOpenId,
				ownerOpenId,
				selectedUserOpenIds: config.groupUserOpenIds
			})
		) {
			return false
		}

		if (config.groupReplyStrategy === 'mention_only' && !params.botMentioned) {
			return false
		}

		return true
	}

	async validate(payload: TWorkflowTriggerParams<TLarkTriggerConfig>) {
		const { xpertId, node, config } = payload
		const items: ChecklistItem[] = []
		const nodeKey = node?.key

		if (!config?.integrationId) {
			items.push(
				this.createChecklistError(nodeKey, 'TRIGGER_LARK_INTEGRATION_REQUIRED', 'integrationId', '', {
					en_US: 'Lark integration is required',
					zh_Hans: '需要选择飞书集成'
				})
			)
			return items
		}

		let integration: IIntegration<TIntegrationLarkOptions> | null = null
		try {
			integration = await this.integrationPermissionService.read<IIntegration<TIntegrationLarkOptions>>(
				config.integrationId
			)
			if (!integration) {
				items.push(
					this.createChecklistError(
						nodeKey,
						'TRIGGER_LARK_INTEGRATION_NOT_FOUND',
						'integrationId',
						config.integrationId,
						{
							en_US: `Lark integration "${config.integrationId}" not found`,
							zh_Hans: `飞书集成 "${config.integrationId}" 不存在`
						}
					)
				)
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

		const existingBinding = await this.getBoundBinding(config.integrationId)
		if (existingBinding?.xpertId && existingBinding.xpertId !== xpertId) {
			const boundXpertInfo = this.formatBoundXpertInfo(existingBinding)
			items.push(
				this.createChecklistError(
					nodeKey,
					'TRIGGER_LARK_INTEGRATION_CONFLICT',
					'integrationId',
					config.integrationId,
					{
						en_US: `Integration "${config.integrationId}" is already bound to another xpert (${boundXpertInfo})`,
						zh_Hans: `飞书集成 "${config.integrationId}" 已绑定到其他数字专家（${boundXpertInfo}）`
					}
				)
			)
		}

		const normalizedConfig = this.normalizeConfig(config, config.integrationId)
		const invalidEnumItems = this.getInvalidEnumChecklistErrors(nodeKey, normalizedConfig)
		items.push(...invalidEnumItems)
		const disabledSelfScopeItems = this.getDisabledSelfScopeChecklistErrors(
			nodeKey,
			normalizedConfig
		)
		items.push(...disabledSelfScopeItems)
		if (
			normalizedConfig.singleChatScope === 'selected_users' &&
			normalizedConfig.singleChatUserOpenIds.length === 0
		) {
			items.push(
				this.createChecklistError(
					nodeKey,
					'TRIGGER_LARK_SINGLE_CHAT_USERS_REQUIRED',
					'singleChatUserOpenIds',
					'',
					{
						en_US: 'Select at least one single-chat user',
						zh_Hans: '请至少选择一个单聊用户'
					}
				)
			)
		}
		if (
			normalizedConfig.allowedGroupScope === 'selected_chats' &&
			normalizedConfig.allowedGroupChatIds.length === 0
		) {
			items.push(
				this.createChecklistError(
					nodeKey,
					'TRIGGER_LARK_ALLOWED_GROUPS_REQUIRED',
					'allowedGroupChatIds',
					'',
					{
						en_US: 'Select at least one group chat',
						zh_Hans: '请至少选择一个群聊'
					}
				)
			)
		}
		if (
			normalizedConfig.groupUserScope === 'selected_users' &&
			normalizedConfig.groupUserOpenIds.length === 0
		) {
			items.push(
				this.createChecklistError(
					nodeKey,
					'TRIGGER_LARK_GROUP_USERS_REQUIRED',
					'groupUserOpenIds',
					'',
					{
						en_US: 'Select at least one group user',
						zh_Hans: '请至少选择一个群内用户'
					}
				)
			)
		}

		if (disabledSelfScopeItems.length === 0 && this.requiresOwnerOpenId(normalizedConfig)) {
			const ownerOpenId = await this.resolveOwnerOpenId(normalizedConfig.integrationId, integration)
			if (!ownerOpenId) {
				items.push(
					this.createChecklistError(
						nodeKey,
						'TRIGGER_LARK_OWNER_OPEN_ID_REQUIRED',
						'singleChatScope',
						'',
						{
							en_US: 'Unable to resolve the publisher open_id for "Only Me"',
							zh_Hans: '无法解析发布者在飞书中的 open_id，不能使用“仅自己”'
						}
					)
				)
			}
		}

		return items
	}

	async publish(
		payload: TWorkflowTriggerParams<TLarkTriggerConfig>,
		callback: (payload: any) => void
	): Promise<void> {
		const { xpertId, config } = payload
		if (!config?.enabled || !config.integrationId) {
			return
		}

		const integrationId = config.integrationId
		const existingBinding = await this.getBoundBinding(integrationId)
		if (existingBinding?.xpertId && existingBinding.xpertId !== xpertId) {
			throw new Error(
				`Lark trigger integration "${integrationId}" is already bound to ${this.formatBoundXpertInfo(existingBinding)}`
			)
		}

		const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationLarkOptions>>(
			integrationId
		)
		const normalizedConfig = this.normalizeConfig(config, integrationId)
		this.assertEnumSelections(normalizedConfig)
		this.assertSelfScopeDisabled(normalizedConfig)
		this.assertConfigSelections(normalizedConfig)
		const ownerOpenId = this.requiresOwnerOpenId(normalizedConfig)
			? await this.resolveOwnerOpenId(integrationId, integration)
			: null
		if (this.requiresOwnerOpenId(normalizedConfig) && !ownerOpenId) {
			throw new Error('Unable to resolve the publisher open_id for "Only Me" Lark trigger scope')
		}

		const context = await this.resolveBindingContext(integrationId)
		await this.bindingRepository.upsert(
			{
				integrationId,
				xpertId,
				config: normalizedConfig,
				ownerOpenId,
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

	async stop(payload: TWorkflowTriggerParams<TLarkTriggerConfig>): Promise<void> {
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
		const binding = await this.getBoundBinding(integrationId)
		return binding?.xpertId ?? null
	}

	private async getBoundBinding(integrationId: string): Promise<TLarkTriggerBindingConflict | null> {
		if (!integrationId) {
			return null
		}
		const binding = await this.bindingRepository.findOne({
			where: {
				integrationId
			}
		})
		if (!binding?.xpertId) {
			return null
		}
		return {
			integrationId: binding.integrationId,
			xpertId: binding.xpertId
		}
	}

	async handleInboundMessage(params: {
		integrationId: string
		input?: string
		larkMessage: ChatLarkMessage
		options?: TLarkInboundDispatchOptions
	}): Promise<boolean> {
		const binding = await this.bindingRepository.findOne({
			where: {
				integrationId: params.integrationId
			}
		})
		if (!binding?.xpertId) {
			return false
		}

		if (
			!this.matchesInboundMessage({
				binding,
				integrationId: params.integrationId,
				chatType: params.larkMessage.chatType,
				chatId: params.larkMessage.chatId,
				senderOpenId: params.larkMessage.senderOpenId,
				botMentioned: params.options?.botMentioned
			})
		) {
			return false
		}

		this.logger.debug(
			`[lark-dispatch] trigger integration=${params.integrationId} xpert=${binding.xpertId} input=${JSON.stringify(params.input ?? '')}`
		)

		const dispatchOptions = this.resolveDispatchOptions(binding, params.options)
		const callback = this.callbacks.get(params.integrationId)
		if (!callback) {
			// Persisted binding must continue to work after process restart even without in-memory callback.
			await this.dispatchService.enqueueDispatch({
				xpertId: binding.xpertId,
				input: params.input,
				larkMessage: params.larkMessage,
				options: dispatchOptions
			})
			return true
		}

		const handoffMessage = await this.dispatchService.buildDispatchMessage({
			xpertId: binding.xpertId,
			input: params.input,
			larkMessage: params.larkMessage,
			options: dispatchOptions
		})
		await Promise.resolve(
			callback({
				from: LarkTrigger,
				xpertId: binding.xpertId,
				handoffMessage
			})
		)
		return true
	}

	private resolveDispatchOptions(
		binding: Pick<LarkTriggerBindingEntity, 'config'>,
		options?: TLarkInboundDispatchOptions
	): TLarkInboundDispatchOptions | undefined {
		const normalizedConfig = this.normalizeConfig(binding.config)
		const fromEndUserId = this.normalizeString(options?.fromEndUserId)
		return {
			confirm: options?.confirm,
			reject: options?.reject,
			fromEndUserId,
			executorUserId:
				options?.executorUserId ??
				(normalizedConfig.executeAsMappedUser ? fromEndUserId ?? undefined : undefined),
			streamingEnabled: normalizedConfig.streamingEnabled,
			groupWindow: options?.groupWindow
		}
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

	private async resolveOwnerOpenId(
		integrationId: string,
		cachedIntegration?: IIntegration<TIntegrationLarkOptions> | null
	): Promise<string | null> {
		const context = await this.resolveBindingContext(integrationId)
		const ownerUserId = this.normalizeString(context.createdById)
		const tenantId = this.normalizeString(context.tenantId)
		if (!ownerUserId || !tenantId) {
			return null
		}

		const ownerUser = await this.larkChannel.getUserById(tenantId, ownerUserId)
		const unionId = this.normalizeString(ownerUser?.thirdPartyId)
		if (!unionId) {
			return null
		}

		const integration =
			cachedIntegration ??
			(await this.integrationPermissionService.read<IIntegration<TIntegrationLarkOptions>>(integrationId))
		if (!integration) {
			return null
		}

		try {
			const client = this.larkChannel.getOrCreateLarkClient(integration).client
			const response = await client.contact.v3.user.get({
				params: {
					user_id_type: 'union_id'
				},
				path: {
					user_id: unionId
				}
			})
			return this.normalizeString(response?.data?.user?.open_id)
		} catch (error) {
			this.logger.warn(
				`Failed to resolve owner open_id for integration "${integrationId}" and user "${ownerUserId}": ${
					error instanceof Error ? error.message : String(error)
				}`
			)
			return null
		}
	}

	private requiresOwnerOpenId(config: TLarkTriggerConfig): boolean {
		return config.singleChatScope === 'self' || config.groupUserScope === 'self'
	}

	private getDisabledSelfScopeChecklistErrors(
		node: string | undefined,
		config: TLarkTriggerConfig
	): ChecklistItem[] {
		const items: ChecklistItem[] = []
		if (config.singleChatScope === 'self') {
			items.push(
				this.createChecklistError(
					node,
					'TRIGGER_LARK_SINGLE_CHAT_SELF_DISABLED',
					'singleChatScope',
					'self',
					{
						en_US:
							'Single-chat "Only Me" is temporarily unavailable because publisher union_id mapping is unavailable',
						zh_Hans: '当前无法为发布者建立飞书 union_id 映射，单聊“仅自己”已暂时禁用'
					}
				)
			)
		}
		if (config.groupUserScope === 'self') {
			items.push(
				this.createChecklistError(
					node,
					'TRIGGER_LARK_GROUP_USER_SELF_DISABLED',
					'groupUserScope',
					'self',
					{
						en_US:
							'Group-user "Only Me" is temporarily unavailable because publisher union_id mapping is unavailable',
						zh_Hans: '当前无法为发布者建立飞书 union_id 映射，群内“仅自己”已暂时禁用'
					}
				)
			)
		}
		return items
	}

	private assertSelfScopeDisabled(config: TLarkTriggerConfig): void {
		if (config.singleChatScope === 'self') {
			throw new Error(
				'Single-chat "Only Me" is temporarily disabled because publisher union_id mapping is unavailable'
			)
		}
		if (config.groupUserScope === 'self') {
			throw new Error(
				'Group-user "Only Me" is temporarily disabled because publisher union_id mapping is unavailable'
			)
		}
	}

	private assertConfigSelections(config: TLarkTriggerConfig): void {
		if (config.singleChatScope === 'selected_users' && config.singleChatUserOpenIds.length === 0) {
			throw new Error('Single chat selected users cannot be empty')
		}
		if (config.allowedGroupScope === 'selected_chats' && config.allowedGroupChatIds.length === 0) {
			throw new Error('Allowed group chats cannot be empty')
		}
		if (config.groupUserScope === 'selected_users' && config.groupUserOpenIds.length === 0) {
			throw new Error('Group selected users cannot be empty')
		}
	}

	private getInvalidEnumChecklistErrors(
		node: string | undefined,
		config: TLarkTriggerConfig
	): ChecklistItem[] {
		const items: ChecklistItem[] = []

		if (!this.isOneOf(config.singleChatScope, LARK_SINGLE_CHAT_SCOPE_VALUES)) {
			items.push(
				this.createChecklistError(
					node,
					'TRIGGER_LARK_SINGLE_CHAT_SCOPE_INVALID',
					'singleChatScope',
					String(config.singleChatScope ?? ''),
					{
						en_US: 'Single chat scope is invalid',
						zh_Hans: '单聊范围配置无效'
					}
				)
			)
		}

		if (!this.isOneOf(config.allowedGroupScope, LARK_ALLOWED_GROUP_SCOPE_VALUES)) {
			items.push(
				this.createChecklistError(
					node,
					'TRIGGER_LARK_ALLOWED_GROUP_SCOPE_INVALID',
					'allowedGroupScope',
					String(config.allowedGroupScope ?? ''),
					{
						en_US: 'Allowed group scope is invalid',
						zh_Hans: '允许的群聊范围配置无效'
					}
				)
			)
		}

		if (!this.isOneOf(config.groupUserScope, LARK_GROUP_USER_SCOPE_VALUES)) {
			items.push(
				this.createChecklistError(
					node,
					'TRIGGER_LARK_GROUP_USER_SCOPE_INVALID',
					'groupUserScope',
					String(config.groupUserScope ?? ''),
					{
						en_US: 'Group user scope is invalid',
						zh_Hans: '群内用户范围配置无效'
					}
				)
			)
		}

		if (!this.isOneOf(config.groupReplyStrategy, LARK_GROUP_REPLY_STRATEGY_VALUES)) {
			items.push(
				this.createChecklistError(
					node,
					'TRIGGER_LARK_GROUP_REPLY_STRATEGY_INVALID',
					'groupReplyStrategy',
					String(config.groupReplyStrategy ?? ''),
					{
						en_US: 'Group reply strategy is invalid',
						zh_Hans: '群内回复策略配置无效'
					}
				)
			)
		}

		return items
	}

	private assertEnumSelections(config: TLarkTriggerConfig): void {
		if (!this.isOneOf(config.singleChatScope, LARK_SINGLE_CHAT_SCOPE_VALUES)) {
			throw new Error(`Invalid singleChatScope: ${String(config.singleChatScope ?? '')}`)
		}
		if (!this.isOneOf(config.allowedGroupScope, LARK_ALLOWED_GROUP_SCOPE_VALUES)) {
			throw new Error(`Invalid allowedGroupScope: ${String(config.allowedGroupScope ?? '')}`)
		}
		if (!this.isOneOf(config.groupUserScope, LARK_GROUP_USER_SCOPE_VALUES)) {
			throw new Error(`Invalid groupUserScope: ${String(config.groupUserScope ?? '')}`)
		}
		if (!this.isOneOf(config.groupReplyStrategy, LARK_GROUP_REPLY_STRATEGY_VALUES)) {
			throw new Error(`Invalid groupReplyStrategy: ${String(config.groupReplyStrategy ?? '')}`)
		}
	}

	private matchesGroupScope(scope: TLarkTriggerConfig['allowedGroupScope'], chatId: string | null, chatIds: string[]) {
		if (scope === 'all_chats') {
			return true
		}
		return Boolean(chatId && chatIds.includes(chatId))
	}

	private matchesUserScope(
		scope: TLarkTriggerConfig['singleChatScope'] | TLarkTriggerConfig['groupUserScope'],
		params: {
			senderOpenId: string | null
			ownerOpenId: string | null
			selectedUserOpenIds: string[]
		}
	): boolean {
		switch (scope) {
			case 'self':
				return Boolean(
					params.senderOpenId &&
					params.ownerOpenId &&
					params.senderOpenId === params.ownerOpenId
				)
			case 'selected_users':
				return Boolean(
					params.senderOpenId && params.selectedUserOpenIds.includes(params.senderOpenId)
				)
			case 'all_users':
			default:
				return true
		}
	}

	private normalizeString(value: unknown): string | null {
		return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
	}

	private normalizeStringArray(value: unknown): string[] {
		if (!Array.isArray(value)) {
			return []
		}
		return Array.from(
			new Set(
				value
					.map((item) => this.normalizeString(item))
					.filter((item): item is string => Boolean(item))
			)
		)
	}

	private isOneOf<TValue extends string>(
		value: unknown,
		allowedValues: readonly TValue[]
	): value is TValue {
		return typeof value === 'string' && allowedValues.includes(value as TValue)
	}

	private formatBoundXpertInfo(binding: TLarkTriggerBindingConflict): string {
		return `xpertId: ${binding.xpertId}`
	}

	private createChecklistError(
		node: string | undefined,
		ruleCode: string,
		field: string,
		value: string,
		message: ChecklistItem['message']
	): ChecklistItem {
		return {
			node,
			ruleCode,
			field,
			value,
			message,
			level: 'error'
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

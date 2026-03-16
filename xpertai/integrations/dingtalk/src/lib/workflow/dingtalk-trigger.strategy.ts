import type { ChecklistItem, TWorkflowTriggerMeta } from '@metad/contracts'
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
import { DingTalkChatDispatchService } from '../handoff/dingtalk-chat-dispatch.service.js'
import type { ChatDingTalkMessage } from '../message.js'
import { DINGTALK_PLUGIN_CONTEXT } from '../tokens.js'
import { iconImage } from '../types.js'
import { DingTalkTriggerBindingEntity } from '../entities/dingtalk-trigger-binding.entity.js'
import { DingTalkTrigger, TDingTalkTriggerConfig } from './dingtalk-trigger.types.js'

@Injectable()
@WorkflowTriggerStrategy(DingTalkTrigger)
export class DingTalkTriggerStrategy implements IWorkflowTriggerStrategy<TDingTalkTriggerConfig> {
	private readonly logger = new Logger(DingTalkTriggerStrategy.name)
	/**
	 * @deprecated use persisted binding and handoff message queue instead of in-memory callback
	 */
	private readonly callbacks = new Map<string, (payload: any) => void>()
	private _integrationPermissionService: IntegrationPermissionService

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
						selectUrl: '/api/integration/select-options?provider=dingtalk'
					} as any
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
		if (!integrationId) {
			return null
		}
		const binding = await this.bindingRepository.findOne({
			where: {
				integrationId
			}
		})
		return binding?.xpertId ?? null
	}

	async handleInboundMessage(params: {
		integrationId: string
		input?: string
		dingtalkMessage: ChatDingTalkMessage
		options?: {
			confirm?: boolean
			reject?: boolean
		}
	}): Promise<boolean> {
		const binding = await this.bindingRepository.findOne({
			where: {
				integrationId: params.integrationId
			}
		})
		if (!binding?.xpertId) {
			return false
		}

		const callback = this.callbacks.get(params.integrationId)
		if (!callback) {
			// Persisted binding must continue to work after process restart even without in-memory callback.
			await this.dispatchService.enqueueDispatch({
				xpertId: binding.xpertId,
				input: params.input,
				dingtalkMessage: params.dingtalkMessage,
				options: params.options
			})
			return true
		}

		const handoffMessage = await this.dispatchService.buildDispatchMessage({
			xpertId: binding.xpertId,
			input: params.input,
			dingtalkMessage: params.dingtalkMessage,
			options: params.options
		})
		await Promise.resolve(
			callback({
				from: DingTalkTrigger,
				xpertId: binding.xpertId,
				handoffMessage
			})
		)
		return true
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

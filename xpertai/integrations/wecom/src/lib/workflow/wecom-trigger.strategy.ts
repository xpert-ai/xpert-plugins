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
import { ChatWeComMessage } from '../message.js'
import { WECOM_PLUGIN_CONTEXT } from '../tokens.js'
import { iconImage } from '../types.js'
import { WeComTriggerBindingEntity } from '../entities/wecom-trigger-binding.entity.js'
import { WeComChatDispatchService } from '../handoff/wecom-chat-dispatch.service.js'
import { TWeComTriggerConfig, WeComTrigger } from './wecom-trigger.types.js'

@Injectable()
@WorkflowTriggerStrategy(WeComTrigger)
export class WeComTriggerStrategy implements IWorkflowTriggerStrategy<TWeComTriggerConfig> {
  private readonly logger = new Logger(WeComTriggerStrategy.name)
  /**
   * @deprecated use persisted binding and handoff message queue instead of in-memory callback
   */
  private readonly callbacks = new Map<string, (payload: any) => void>()
  private _integrationPermissionService: IntegrationPermissionService

  readonly meta: TWorkflowTriggerMeta = {
    name: WeComTrigger,
    label: {
      en_US: 'WeCom Trigger',
      zh_Hans: '企业微信触发器'
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
            en_US: 'WeCom Integration',
            zh_Hans: '企业微信集成'
          },
          'x-ui': {
            component: 'remoteSelect',
            selectUrl: '/api/wecom/integration-select-options'
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
    private readonly dispatchService: WeComChatDispatchService,
    @InjectRepository(WeComTriggerBindingEntity)
    private readonly bindingRepository: Repository<WeComTriggerBindingEntity>,
    @Inject(WECOM_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  async validate(payload: TWorkflowTriggerParams<TWeComTriggerConfig>) {
    const { xpertId, node, config } = payload
    const items: ChecklistItem[] = []
    const nodeKey = node?.key

    if (!config?.integrationId) {
      items.push({
        node: nodeKey,
        ruleCode: 'TRIGGER_WECOM_INTEGRATION_REQUIRED',
        field: 'integrationId',
        value: '',
        message: {
          en_US: 'WeCom integration is required',
          zh_Hans: '需要选择企业微信集成'
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
          ruleCode: 'TRIGGER_WECOM_INTEGRATION_NOT_FOUND',
          field: 'integrationId',
          value: config.integrationId,
          message: {
            en_US: `WeCom integration "${config.integrationId}" not found`,
            zh_Hans: `企业微信集成 "${config.integrationId}" 不存在`
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
        ruleCode: 'TRIGGER_WECOM_INTEGRATION_CONFLICT',
        field: 'integrationId',
        value: config.integrationId,
        message: {
          en_US: `Integration "${config.integrationId}" is already bound to another xpert`,
          zh_Hans: `企业微信集成 "${config.integrationId}" 已绑定到其他专家`
        },
        level: 'error'
      })
    }

    return items
  }

  async publish(
    payload: TWorkflowTriggerParams<TWeComTriggerConfig>,
    callback: (payload: any) => void
  ): Promise<void> {
    const { xpertId, config } = payload
    if (!config?.enabled || !config.integrationId) {
      return
    }

    const integrationId = config.integrationId
    const existingXpertId = await this.getBoundXpertId(integrationId)
    if (existingXpertId && existingXpertId !== xpertId) {
      throw new Error(`WeCom trigger integration "${integrationId}" is already bound to xpert "${existingXpertId}"`)
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

    this.callbacks.set(integrationId, callback)
  }

  async stop(payload: TWorkflowTriggerParams<TWeComTriggerConfig>): Promise<void> {
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
    wecomMessage: ChatWeComMessage
    conversationId?: string
    conversationUserKey?: string
    tenantId: string
    organizationId?: string
    executorUserId?: string
    endUserId?: string
  }): Promise<boolean> {
    const binding = await this.bindingRepository.findOne({
      where: {
        integrationId: params.integrationId
      }
    })
    if (!binding?.xpertId) {
      this.logger.debug(
        `[wecom-trigger] binding miss integrationId=${params.integrationId}`
      )
      return false
    }
    this.logger.debug(
      `[wecom-trigger] binding hit integrationId=${params.integrationId} xpertId=${binding.xpertId}`
    )

    const dispatchPayload = {
      xpertId: binding.xpertId,
      input: params.input || '',
      wecomMessage: params.wecomMessage,
      conversationId: params.conversationId,
      conversationUserKey: params.conversationUserKey,
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      executorUserId: params.executorUserId,
      endUserId: params.endUserId
    }

    const callback = this.callbacks.get(params.integrationId)
    if (!callback) {
      // Persisted binding must continue to work after process restart even without in-memory callback.
      this.logger.debug(
        `[wecom-trigger] runtime callback miss, enqueue dispatch integrationId=${params.integrationId} xpertId=${binding.xpertId}`
      )
      await this.dispatchService.enqueueDispatch(dispatchPayload)
      return true
    }

    this.logger.debug(
      `[wecom-trigger] runtime callback hit, forward handoff integrationId=${params.integrationId} xpertId=${binding.xpertId}`
    )
    const handoffMessage = await this.dispatchService.buildDispatchMessage(dispatchPayload)
    await Promise.resolve(
      callback({
        from: WeComTrigger,
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

import type { ChecklistItem, IIntegration, TWorkflowTriggerMeta } from '@metad/contracts'
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
import { ChatWeComMessage } from '../message.js'
import { WECOM_LONG_CONNECTION_SERVICE, WECOM_PLUGIN_CONTEXT } from '../tokens.js'
import { iconImage, INTEGRATION_WECOM_LONG, TIntegrationWeComLongOptions } from '../types.js'
import { WeComChannelStrategy } from '../wecom-channel.strategy.js'
import { WeComTriggerBindingEntity } from '../entities/wecom-trigger-binding.entity.js'
import { TWeComChatDispatchInput, WeComChatDispatchService } from '../handoff/wecom-chat-dispatch.service.js'
import { TWeComTriggerConfig, WeComTrigger } from './wecom-trigger.types.js'
import { WeComTriggerAggregationService } from './wecom-trigger-aggregation.service.js'
import {
  WeComTriggerAggregationState,
  WeComTriggerFlushPayload,
  WECOM_TRIGGER_FLUSH_MESSAGE_TYPE
} from './wecom-trigger-aggregation.types.js'

type WeComLongConnectionClient = {
  connect: (integrationId: string) => Promise<unknown>
}

const DEFAULT_SESSION_TIMEOUT_SECONDS = 3600
const DEFAULT_SUMMARY_WINDOW_SECONDS = 0
@Injectable()
@WorkflowTriggerStrategy(WeComTrigger)
export class WeComTriggerStrategy implements IWorkflowTriggerStrategy<TWeComTriggerConfig> {
  private readonly logger = new Logger(WeComTriggerStrategy.name)
  private readonly callbacks = new Map<string, (payload: any) => void>()
  private _integrationPermissionService: IntegrationPermissionService
  private _handoffPermissionService: HandoffPermissionService
  private _longConnectionService: WeComLongConnectionClient | null | undefined

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
    private readonly dispatchService: WeComChatDispatchService,
    private readonly aggregationService: WeComTriggerAggregationService,
    private readonly wecomChannel: WeComChannelStrategy,
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

  private get handoffPermissionService(): HandoffPermissionService {
    if (!this._handoffPermissionService) {
      this._handoffPermissionService = this.pluginContext.resolve(HANDOFF_PERMISSION_SERVICE_TOKEN)
    }
    return this._handoffPermissionService
  }

  private get longConnectionService(): WeComLongConnectionClient | null {
    if (this._longConnectionService === undefined) {
      try {
        this._longConnectionService = this.pluginContext.resolve(
          WECOM_LONG_CONNECTION_SERVICE
        ) as WeComLongConnectionClient
      } catch {
        this._longConnectionService = null
      }
    }
    return this._longConnectionService
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

    this.callbacks.set(integrationId, callback)
    await this.syncLongConnectionIfNeeded(integrationId)
  }

  async stop(payload: TWorkflowTriggerParams<TWeComTriggerConfig>): Promise<void> {
    const { xpertId, config } = payload
    const integrationId = config?.integrationId
    if (integrationId) {
      this.callbacks.delete(integrationId)
      await this.removeBindingFromStore(integrationId, xpertId)
      await this.syncLongConnectionIfNeeded(integrationId)
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
    await Promise.allSettled(
      persistedBindings.map((binding) => this.syncLongConnectionIfNeeded(binding.integrationId))
    )
  }

  async getBinding(integrationId: string): Promise<WeComTriggerBindingEntity | null> {
    if (!integrationId) {
      return null
    }

    return this.bindingRepository.findOne({
      where: {
        integrationId
      }
    })
  }

  async getBoundXpertId(integrationId: string): Promise<string | null> {
    const binding = await this.getBinding(integrationId)
    return binding?.xpertId ?? null
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
    wecomMessage: ChatWeComMessage
    conversationId?: string
    conversationUserKey?: string
    tenantId: string
    organizationId?: string
    executorUserId?: string
    endUserId?: string
  }): Promise<boolean> {
    const binding = await this.getBinding(params.integrationId)
    if (!binding?.xpertId) {
      this.logger.debug(`[wecom-trigger] binding miss integrationId=${params.integrationId}`)
      return false
    }

    const aggregateKey = this.normalizeAggregateKey(params.conversationUserKey)
    if (!aggregateKey) {
      this.logger.warn(`[wecom-trigger] aggregation key missing integrationId=${params.integrationId}`)
      return false
    }

    const summaryWindowSeconds = this.normalizeNonNegativeSeconds(
      binding.summaryWindowSeconds,
      DEFAULT_SUMMARY_WINDOW_SECONDS
    )
    if (summaryWindowSeconds <= 0) {
      await this.dispatchInboundMessage({
        integrationId: params.integrationId,
        xpertId: binding.xpertId,
        dispatchMode: 'immediate',
        dispatchPayload: {
          xpertId: binding.xpertId,
          input: params.input || '',
          wecomMessage: params.wecomMessage,
          conversationId: params.conversationId,
          conversationUserKey: aggregateKey,
          tenantId: params.tenantId,
          organizationId: params.organizationId,
          executorUserId: params.executorUserId,
          endUserId: params.endUserId
        }
      })
      return true
    }

    const currentState = await this.aggregationService.get(aggregateKey)
    const sameRoutingTarget =
      currentState?.integrationId === params.integrationId && currentState?.xpertId === binding.xpertId
    const nextVersion = (currentState?.version ?? 0) + 1
    const aggregateState: WeComTriggerAggregationState = {
      aggregateKey,
      integrationId: params.integrationId,
      conversationUserKey: aggregateKey,
      xpertId: binding.xpertId,
      version: nextVersion,
      inputParts: [...(sameRoutingTarget ? currentState?.inputParts ?? [] : []), params.input || ''],
      lastMessageAt: Date.now(),
      conversationId: params.conversationId ?? (sameRoutingTarget ? currentState?.conversationId : undefined),
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      executorUserId: params.executorUserId,
      endUserId: params.endUserId,
      latestMessage: {
        integrationId: params.wecomMessage.integrationId,
        chatId: params.wecomMessage.chatId,
        chatType: params.wecomMessage.chatType,
        senderId: params.wecomMessage.senderId,
        responseUrl: params.wecomMessage.responseUrl,
        reqId: params.wecomMessage.reqId,
        language: params.wecomMessage.language
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
      `[wecom-trigger] buffered inbound integrationId=${params.integrationId} xpertId=${binding.xpertId} aggregateKey=${aggregateKey} version=${nextVersion}`
    )
    return true
  }

  async flushBufferedConversation(payload: WeComTriggerFlushPayload): Promise<boolean> {
    const aggregateKey = this.normalizeAggregateKey(payload.aggregateKey)
    if (!aggregateKey) {
      return false
    }

    const state = await this.aggregationService.get(aggregateKey)
    if (!state || state.version !== payload.version) {
      return false
    }

    const dispatchPayload = {
      xpertId: state.xpertId,
      input: state.inputParts.join('\n'),
      wecomMessage: new ChatWeComMessage(
        {
          integrationId: state.latestMessage.integrationId,
          chatId: state.latestMessage.chatId,
          chatType: state.latestMessage.chatType,
          senderId: state.latestMessage.senderId,
          responseUrl: state.latestMessage.responseUrl,
          reqId: state.latestMessage.reqId,
          wecomChannel: this.wecomChannel
        },
        {
          status: 'thinking',
          language: state.latestMessage.language
        }
      ),
      conversationId: state.conversationId,
      conversationUserKey: state.conversationUserKey,
      tenantId: state.tenantId,
      organizationId: state.organizationId,
      executorUserId: state.executorUserId,
      endUserId: state.endUserId
    }

    await this.dispatchInboundMessage({
      integrationId: state.integrationId,
      xpertId: state.xpertId,
      dispatchMode: `buffered version=${state.version}`,
      dispatchPayload
    })

    await this.aggregationService.clear(aggregateKey)
    return true
  }

  private buildFlushMessage(
    state: WeComTriggerAggregationState
  ): HandoffMessage<WeComTriggerFlushPayload> {
    return {
      id: `wecom-trigger-flush-${randomUUID()}`,
      type: WECOM_TRIGGER_FLUSH_MESSAGE_TYPE,
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
    dispatchPayload: TWeComChatDispatchInput
  }): Promise<void> {
    const callback = this.callbacks.get(params.integrationId)
    if (!callback) {
      this.logger.debug(
        `[wecom-trigger] runtime callback miss, enqueue dispatch integrationId=${params.integrationId} xpertId=${params.xpertId} mode=${params.dispatchMode}`
      )
      await this.dispatchService.enqueueDispatch(params.dispatchPayload)
      return
    }

    this.logger.debug(
      `[wecom-trigger] runtime callback hit, forward handoff integrationId=${params.integrationId} xpertId=${params.xpertId} mode=${params.dispatchMode}`
    )
    const handoffMessage = await this.dispatchService.buildDispatchMessage(params.dispatchPayload)
    await Promise.resolve(
      callback({
        from: WeComTrigger,
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

  private async syncLongConnectionIfNeeded(integrationId: string): Promise<void> {
    const longConnectionService = this.longConnectionService
    if (!longConnectionService) {
      return
    }

    try {
      const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWeComLongOptions>>(
        integrationId,
        {
          relations: ['tenant']
        }
      )
      if (!integration || integration.provider !== INTEGRATION_WECOM_LONG) {
        return
      }

      await longConnectionService.connect(integrationId)
    } catch (error) {
      this.logger.warn(
        `[wecom-trigger] sync long connection failed integrationId=${integrationId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
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

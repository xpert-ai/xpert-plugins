import type { ChecklistItem, IIntegration, TWorkflowTriggerMeta } from '@xpert-ai/contracts'
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
import { WECHAT_PERSONAL_ICON, WECHAT_PERSONAL_PROVIDER_KEY } from '../constants.js'
import { WechatPersonalTriggerBindingEntity } from '../entities/wechat-personal-trigger-binding.entity.js'
import { WechatPersonalChatDispatchInput, WechatPersonalChatDispatchService } from '../handoff/wechat-personal-chat-dispatch.service.js'
import { WechatPersonalMessage } from '../message.js'
import { WECHAT_PERSONAL_PLUGIN_CONTEXT } from '../tokens.js'
import { normalizeGroupTriggerMode, normalizeKeywords, TIntegrationWechatPersonalOptions } from '../types.js'
import { WechatPersonalChannelStrategy } from '../wechat-personal-channel.strategy.js'
import {
  WECHAT_PERSONAL_TRIGGER_FLUSH_MESSAGE_TYPE,
  WechatPersonalTriggerAggregationState,
  WechatPersonalTriggerFlushPayload
} from './wechat-personal-trigger-aggregation.types.js'
import { WechatPersonalTriggerAggregationService } from './wechat-personal-trigger-aggregation.service.js'
import { TWechatPersonalTriggerConfig, WechatPersonalTrigger } from './wechat-personal-trigger.types.js'

const DEFAULT_SESSION_TIMEOUT_SECONDS = 3600
const DEFAULT_SUMMARY_WINDOW_SECONDS = 0

type WechatPersonalTenantScope = {
  tenantId?: string | null
  organizationId?: string | null
}

@Injectable()
@WorkflowTriggerStrategy(WechatPersonalTrigger)
export class WechatPersonalTriggerStrategy implements IWorkflowTriggerStrategy<TWechatPersonalTriggerConfig> {
  private readonly logger = new Logger(WechatPersonalTriggerStrategy.name)
  private readonly callbacks = new Map<string, (payload: any) => void>()
  private _integrationPermissionService: IntegrationPermissionService
  private _handoffPermissionService: HandoffPermissionService

  readonly meta: TWorkflowTriggerMeta = {
    name: WechatPersonalTrigger,
    label: {
      en_US: 'Personal WeChat Trigger',
      zh_Hans: '个人微信触发器'
    },
    icon: {
      type: 'svg',
      value: WECHAT_PERSONAL_ICON
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
            en_US: 'Personal WeChat Integration',
            zh_Hans: '个人微信集成'
          },
          'x-ui': {
            component: 'remoteSelect',
            selectUrl: '/api/wechat-personal/integration-select-options'
          } as any
        },
        sessionTimeoutSeconds: {
          type: 'number',
          title: {
            en_US: 'Session Timeout (seconds)',
            zh_Hans: '会话超时时间（秒）'
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
            en_US: 'Messages received in this window are merged before dispatching to the agent.',
            zh_Hans: '窗口内收到的连续文本会合并后再发送给 Agent。'
          },
          default: DEFAULT_SUMMARY_WINDOW_SECONDS
        },
        groupTriggerMode: {
          type: 'string',
          title: {
            en_US: 'Group Trigger Mode',
            zh_Hans: '群聊触发方式'
          },
          enum: ['mention_or_keywords', 'all', 'mentions', 'keywords', 'off'],
          default: 'mention_or_keywords'
        },
        groupKeywords: {
          type: 'array',
          title: {
            en_US: 'Group Keywords',
            zh_Hans: '群聊关键词'
          },
          items: {
            type: 'string'
          }
        }
      },
      required: ['enabled', 'integrationId']
    }
  }

  readonly bootstrap = {
    mode: 'replay_publish' as const,
    critical: false
  }

  constructor(
    private readonly dispatchService: WechatPersonalChatDispatchService,
    private readonly aggregationService: WechatPersonalTriggerAggregationService,
    private readonly wechatChannel: WechatPersonalChannelStrategy,
    @InjectRepository(WechatPersonalTriggerBindingEntity)
    private readonly bindingRepository: Repository<WechatPersonalTriggerBindingEntity>,
    @Inject(WECHAT_PERSONAL_PLUGIN_CONTEXT)
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

  async validate(payload: TWorkflowTriggerParams<TWechatPersonalTriggerConfig>) {
    const { xpertId, node, config } = payload
    const items: ChecklistItem[] = []
    const nodeKey = node?.key

    if (!config?.integrationId) {
      items.push({
        node: nodeKey,
        ruleCode: 'TRIGGER_WECHAT_PERSONAL_INTEGRATION_REQUIRED',
        field: 'integrationId',
        value: '',
        message: {
          en_US: 'Personal WeChat integration is required',
          zh_Hans: '需要选择个人微信集成'
        },
        level: 'error'
      })
      return items
    }

    try {
      const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatPersonalOptions>>(
        config.integrationId
      )
      if (!integration || integration.provider !== WECHAT_PERSONAL_PROVIDER_KEY) {
        items.push({
          node: nodeKey,
          ruleCode: 'TRIGGER_WECHAT_PERSONAL_INTEGRATION_NOT_FOUND',
          field: 'integrationId',
          value: config.integrationId,
          message: {
            en_US: `Personal WeChat integration "${config.integrationId}" not found`,
            zh_Hans: `个人微信集成 "${config.integrationId}" 不存在`
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
        ruleCode: 'TRIGGER_WECHAT_PERSONAL_INTEGRATION_CONFLICT',
        field: 'integrationId',
        value: config.integrationId,
        message: {
          en_US: `Integration "${config.integrationId}" is already bound to another xpert`,
          zh_Hans: `个人微信集成 "${config.integrationId}" 已绑定到其他专家`
        },
        level: 'error'
      })
    }

    return items
  }

  async publish(
    payload: TWorkflowTriggerParams<TWechatPersonalTriggerConfig>,
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
        `Personal WeChat trigger integration "${integrationId}" is already bound to xpert "${existingXpertId}"`
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
        groupTriggerMode: normalizeGroupTriggerMode(config.groupTriggerMode),
        groupKeywords: normalizeKeywords(config.groupKeywords),
        tenantId: context.tenantId ?? null,
        organizationId: context.organizationId ?? null,
        createdById: context.createdById ?? null,
        updatedById: context.updatedById ?? null
      },
      ['integrationId']
    )

    this.callbacks.set(integrationId, callback)
  }

  async stop(payload: TWorkflowTriggerParams<TWechatPersonalTriggerConfig>): Promise<void> {
    const { xpertId, config } = payload
    const integrationId = config?.integrationId
    if (integrationId) {
      this.callbacks.delete(integrationId)
      await this.removeBindingFromStore(integrationId, xpertId)
      return
    }

    const scope = this.resolveRequestTenantScope()
    const persistedBindings = await this.bindingRepository.find({
      where: this.scopedWhere({ xpertId }, scope)
    })
    for (const binding of persistedBindings) {
      this.callbacks.delete(binding.integrationId)
    }
    await this.removeBindingsByXpertId(xpertId)
  }

  async getBinding(
    integrationId: string,
    scope?: WechatPersonalTenantScope | null
  ): Promise<WechatPersonalTriggerBindingEntity | null> {
    if (!integrationId) {
      return null
    }
    const resolvedScope = scope ?? (await this.resolveQueryTenantScope(integrationId))
    return this.bindingRepository.findOne({
      where: this.scopedWhere({ integrationId }, resolvedScope)
    })
  }

  async getBoundXpertId(integrationId: string): Promise<string | null> {
    const binding = await this.getBinding(integrationId)
    return binding?.xpertId ?? null
  }

  async getBindingByXpertId(xpertId: string): Promise<WechatPersonalTriggerBindingEntity | null> {
    if (!xpertId) {
      return null
    }
    const scope = this.resolveRequestTenantScope()
    return this.bindingRepository.findOne({
      where: this.scopedWhere({ xpertId }, scope),
      order: {
        updatedAt: 'DESC'
      }
    })
  }

  async getBoundIntegrationId(xpertId: string): Promise<string | null> {
    const binding = await this.getBindingByXpertId(xpertId)
    return binding?.integrationId ?? null
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
    wechatMessage: WechatPersonalMessage
    conversationId?: string
    conversationUserKey?: string
    tenantId: string
    organizationId?: string
    executorUserId?: string
    endUserId?: string
  }): Promise<boolean> {
    const binding = await this.getBinding(params.integrationId, params)
    if (!binding?.xpertId) {
      this.logger.debug(`[wechat-personal-trigger] binding miss integrationId=${params.integrationId}`)
      return false
    }

    const aggregateKey = this.normalizeAggregateKey(params.conversationUserKey)
    if (!aggregateKey) {
      this.logger.warn(`[wechat-personal-trigger] aggregation key missing integrationId=${params.integrationId}`)
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
          wechatMessage: params.wechatMessage,
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
    const aggregateState: WechatPersonalTriggerAggregationState = {
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
        integrationId: params.wechatMessage.integrationId,
        uuid: params.wechatMessage.uuid,
        ownerWxid: params.wechatMessage.ownerWxid,
        contactId: params.wechatMessage.contactId,
        chatType: params.wechatMessage.chatType,
        senderId: params.wechatMessage.senderId,
        language: params.wechatMessage.language,
        messageId: params.wechatMessage.messageId
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

    return true
  }

  async flushBufferedConversation(payload: WechatPersonalTriggerFlushPayload): Promise<boolean> {
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
        wechatMessage: new WechatPersonalMessage(
          {
            integrationId: state.latestMessage.integrationId,
            uuid: state.latestMessage.uuid,
            ownerWxid: state.latestMessage.ownerWxid,
            contactId: state.latestMessage.contactId,
            chatType: state.latestMessage.chatType,
            senderId: state.latestMessage.senderId,
            wechatChannel: this.wechatChannel
          },
          {
            status: 'thinking',
            language: state.latestMessage.language,
            messageId: state.latestMessage.messageId
          }
        ),
        conversationId: state.conversationId,
        conversationUserKey: state.conversationUserKey,
        tenantId: state.tenantId,
        organizationId: state.organizationId,
        executorUserId: state.executorUserId,
        endUserId: state.endUserId
      }
    })

    await this.aggregationService.clear(aggregateKey)
    return true
  }

  private buildFlushMessage(
    state: WechatPersonalTriggerAggregationState
  ): HandoffMessage<WechatPersonalTriggerFlushPayload> {
    return {
      id: `wechat-personal-trigger-flush-${randomUUID()}`,
      type: WECHAT_PERSONAL_TRIGGER_FLUSH_MESSAGE_TYPE,
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

  private async dispatchInboundMessage(params: {
    integrationId: string
    xpertId: string
    dispatchMode: string
    dispatchPayload: WechatPersonalChatDispatchInput
  }): Promise<void> {
    const callback = this.callbacks.get(params.integrationId)
    if (!callback) {
      this.logger.debug(
        `[wechat-personal-trigger] runtime callback miss, enqueue dispatch integrationId=${params.integrationId} xpertId=${params.xpertId} mode=${params.dispatchMode}`
      )
      await this.dispatchService.enqueueDispatch(params.dispatchPayload)
      return
    }

    const handoffMessage = await this.dispatchService.buildDispatchMessage(params.dispatchPayload)
    await Promise.resolve(
      callback({
        from: WechatPersonalTrigger,
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

  private async removeBindingFromStore(integrationId: string, expectedXpertId?: string): Promise<void> {
    if (!integrationId) {
      return
    }
    const scope = await this.resolveQueryTenantScope(integrationId)
    if (expectedXpertId) {
      await this.bindingRepository.delete(this.scopedWhere({ integrationId, xpertId: expectedXpertId }, scope))
      return
    }
    await this.bindingRepository.delete(this.scopedWhere({ integrationId }, scope))
  }

  private async removeBindingsByXpertId(xpertId: string): Promise<void> {
    if (!xpertId) {
      return
    }
    await this.bindingRepository.delete(this.scopedWhere({ xpertId }, this.resolveRequestTenantScope()))
  }

  private resolveRequestTenantScope(): WechatPersonalTenantScope {
    return {
      tenantId: RequestContext.currentTenantId() ?? null,
      organizationId: RequestContext.getOrganizationId() ?? null
    }
  }

  private async resolveQueryTenantScope(
    integrationId?: string | null,
    fallback?: WechatPersonalTenantScope | null
  ): Promise<WechatPersonalTenantScope> {
    const requestScope = this.resolveRequestTenantScope()
    if (requestScope.tenantId || requestScope.organizationId || fallback?.tenantId || fallback?.organizationId) {
      return {
        tenantId: fallback?.tenantId ?? requestScope.tenantId ?? null,
        organizationId: fallback?.organizationId ?? requestScope.organizationId ?? null
      }
    }

    if (!integrationId) {
      return requestScope
    }

    const bindingContext = await this.resolveBindingContext(integrationId)
    return {
      tenantId: bindingContext.tenantId,
      organizationId: bindingContext.organizationId
    }
  }

  private scopedWhere<T extends Record<string, unknown>>(
    where: T,
    scope?: WechatPersonalTenantScope | null
  ): T & WechatPersonalTenantScope {
    const scoped = { ...where } as T & WechatPersonalTenantScope
    if (scope?.tenantId) {
      scoped.tenantId = scope.tenantId
    }
    if (scope?.organizationId) {
      scoped.organizationId = scope.organizationId
    }
    return scoped
  }
}

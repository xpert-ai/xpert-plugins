import type { ChecklistItem, IIntegration, TWorkflowTriggerMeta } from '@xpert-ai/contracts'
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
import { WECHAT_PERSONAL_ICON, WECHAT_PERSONAL_PROVIDER_KEY } from '../constants.js'
import { WechatPersonalTriggerBindingEntity } from '../entities/wechat-personal-trigger-binding.entity.js'
import { WechatPersonalChatDispatchInput, WechatPersonalChatDispatchService } from '../handoff/wechat-personal-chat-dispatch.service.js'
import { WechatPersonalMessage } from '../message.js'
import { WECHAT_PERSONAL_PLUGIN_CONTEXT } from '../tokens.js'
import {
  normalizeChatFilterMode,
  normalizeGroupTriggerMode,
  normalizeIdList,
  normalizeKeywords,
  TIntegrationWechatPersonalOptions,
  type WechatPersonalInboundFile
} from '../types.js'
import { WechatPersonalChannelStrategy } from '../wechat-personal-channel.strategy.js'
import {
  WechatPersonalTriggerAggregatePayload,
  WechatPersonalTriggerAggregationState,
  WechatPersonalTriggerFlushPayload
} from './wechat-personal-trigger-aggregation.types.js'
import { WechatPersonalTriggerAggregationService } from './wechat-personal-trigger-aggregation.service.js'
import { TWechatPersonalTriggerConfig, WechatPersonalTrigger } from './wechat-personal-trigger.types.js'

const DEFAULT_SESSION_TIMEOUT_SECONDS = 3600
const DEFAULT_SUMMARY_WINDOW_SECONDS = 0
const DEFAULT_HISTORY_CONTEXT_LIMIT = 20
const MAX_HISTORY_CONTEXT_LIMIT = 100
const IMAGE_ONLY_AGGREGATE_INPUT = '[理解图片]'

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
            en_US: 'Message Debounce Window (seconds)',
            zh_Hans: '消息聚合/防抖时间（秒）'
          },
          description: {
            en_US: 'Messages received in this window are merged before dispatching to the agent.',
            zh_Hans: '窗口内收到的连续文本会合并后再发送给 Agent。'
          },
          default: DEFAULT_SUMMARY_WINDOW_SECONDS
        },
        historyContextLimit: {
          type: 'number',
          title: {
            en_US: 'History Context Limit',
            zh_Hans: '历史上下文条数'
          },
          description: {
            en_US: 'Recent inbound messages and sent agent replies to prepend as context. Set to 0 to disable.',
            zh_Hans: '作为上下文附加的最近入站消息和已发送 Agent 回复条数。设为 0 表示关闭。'
          },
          default: DEFAULT_HISTORY_CONTEXT_LIMIT,
          minimum: 0,
          maximum: MAX_HISTORY_CONTEXT_LIMIT
        },
        ignoreSelfMessages: {
          type: 'boolean',
          title: {
            en_US: 'Ignore Self Messages',
            zh_Hans: '忽略自己发出的消息'
          },
          description: {
            en_US: 'Skip messages sent by the same wx2.0 account.',
            zh_Hans: '跳过由同一个 wx2.0 账号自己发出的消息。'
          },
          default: true
        },
        chatFilterMode: {
          type: 'string',
          title: {
            en_US: 'Chat Filter Mode',
            zh_Hans: '会话过滤方式'
          },
          enum: ['all', 'private_only', 'group_only'],
          default: 'all'
        },
        allowedContactIds: {
          type: 'array',
          title: {
            en_US: 'Allowed Contact IDs',
            zh_Hans: '允许的联系人/群 ID'
          },
          description: {
            en_US: 'Optional allowlist for contactId. Applies to private contact ids and group room ids.',
            zh_Hans: '可选 contactId 白名单，适用于私聊联系人 ID 和群 roomId。'
          },
          items: {
            type: 'string'
          }
        },
        blockedContactIds: {
          type: 'array',
          title: {
            en_US: 'Blocked Contact IDs',
            zh_Hans: '排除的联系人/群 ID'
          },
          items: {
            type: 'string'
          }
        },
        allowedGroupIds: {
          type: 'array',
          title: {
            en_US: 'Allowed Group IDs',
            zh_Hans: '允许的群 ID'
          },
          description: {
            en_US: 'Optional group room id allowlist. Example: 12345@chatroom.',
            zh_Hans: '可选群 roomId 白名单。例如：12345@chatroom。'
          },
          items: {
            type: 'string'
          }
        },
        blockedGroupIds: {
          type: 'array',
          title: {
            en_US: 'Blocked Group IDs',
            zh_Hans: '排除的群 ID'
          },
          items: {
            type: 'string'
          }
        },
        allowedSenderIds: {
          type: 'array',
          title: {
            en_US: 'Allowed Sender IDs',
            zh_Hans: '允许的发送人 ID'
          },
          items: {
            type: 'string'
          }
        },
        blockedSenderIds: {
          type: 'array',
          title: {
            en_US: 'Blocked Sender IDs',
            zh_Hans: '排除的发送人 ID'
          },
          items: {
            type: 'string'
          }
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
        },
        mentionFallbackNames: {
          type: 'array',
          title: {
            en_US: 'Mention Fallback Names',
            zh_Hans: '@ 昵称兜底名称'
          },
          description: {
            en_US:
              'Optional display names used only when wx2.0 does not provide atuserlist. Example: bot nickname in the group.',
            zh_Hans: '可选，仅在 wx2.0 未提供 atuserlist 时用于匹配 @ 昵称，例如机器人在群里的显示名。'
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
        historyContextLimit: this.normalizeHistoryContextLimit(config.historyContextLimit),
        ignoreSelfMessages: config.ignoreSelfMessages !== false,
        chatFilterMode: normalizeChatFilterMode(config.chatFilterMode),
        allowedContactIds: normalizeIdList(config.allowedContactIds),
        blockedContactIds: normalizeIdList(config.blockedContactIds),
        allowedGroupIds: normalizeIdList(config.allowedGroupIds),
        blockedGroupIds: normalizeIdList(config.blockedGroupIds),
        allowedSenderIds: normalizeIdList(config.allowedSenderIds),
        blockedSenderIds: normalizeIdList(config.blockedSenderIds),
        groupTriggerMode: normalizeGroupTriggerMode(config.groupTriggerMode),
        groupKeywords: normalizeKeywords(config.groupKeywords),
        mentionFallbackNames: normalizeKeywords(config.mentionFallbackNames),
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
    files?: WechatPersonalInboundFile[]
    wechatMessage: WechatPersonalMessage
    conversationUserKey?: string
    historyContext?: string
    currentInboundLogIds?: string[]
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
          input: this.composeDispatchInput(params.input || '', params.historyContext),
          files: params.files,
          wechatMessage: params.wechatMessage,
          conversationUserKey: aggregateKey,
          tenantId: params.tenantId,
          organizationId: params.organizationId,
          executorUserId: params.executorUserId,
          endUserId: params.endUserId
        }
      })
      return true
    }

    await this.aggregationService.enqueueAggregate({
      aggregateKey,
      integrationId: params.integrationId,
      xpertId: binding.xpertId,
      input: params.input || '',
      files: params.files,
      historyContext: params.historyContext,
      currentInboundLogIds: params.currentInboundLogIds,
      summaryWindowSeconds,
      sessionTimeoutSeconds: this.normalizePositiveSeconds(
        binding.sessionTimeoutSeconds,
        DEFAULT_SESSION_TIMEOUT_SECONDS
      ),
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
    })

    return true
  }

  async processInboundAggregateJob(payload: WechatPersonalTriggerAggregatePayload): Promise<void> {
    const aggregateKey = this.normalizeAggregateKey(payload.aggregateKey)
    if (!aggregateKey) {
      throw new Error('Missing aggregateKey in WeChat personal inbound aggregate payload')
    }

    const summaryWindowSeconds = this.normalizeNonNegativeSeconds(
      payload.summaryWindowSeconds,
      DEFAULT_SUMMARY_WINDOW_SECONDS
    )
    if (summaryWindowSeconds <= 0) {
      return
    }

    await this.aggregationService.withAggregateLock(aggregateKey, async () => {
      const currentState = await this.aggregationService.get(aggregateKey)
      const sameRoutingTarget =
        currentState?.integrationId === payload.integrationId && currentState?.xpertId === payload.xpertId
      const nextVersion = (currentState?.version ?? 0) + 1
      const aggregateState: WechatPersonalTriggerAggregationState = {
        aggregateKey,
        integrationId: payload.integrationId,
        conversationUserKey: aggregateKey,
        xpertId: payload.xpertId,
        version: nextVersion,
        inputParts: [...(sameRoutingTarget ? currentState?.inputParts ?? [] : []), payload.input || ''],
        files: [...(sameRoutingTarget ? currentState?.files ?? [] : []), ...(payload.files ?? [])],
        currentInboundLogIds: [
          ...(sameRoutingTarget ? currentState?.currentInboundLogIds ?? [] : []),
          ...(payload.currentInboundLogIds ?? [])
        ],
        historyContext: sameRoutingTarget ? currentState?.historyContext ?? payload.historyContext : payload.historyContext,
        lastMessageAt: Date.now(),
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
        executorUserId: payload.executorUserId,
        endUserId: payload.endUserId,
        latestMessage: payload.latestMessage
      }

      const ttlSeconds = Math.max(
        DEFAULT_SESSION_TIMEOUT_SECONDS,
        this.normalizePositiveSeconds(payload.sessionTimeoutSeconds, DEFAULT_SESSION_TIMEOUT_SECONDS),
        summaryWindowSeconds * 3
      )
      await this.aggregationService.save(aggregateState, ttlSeconds)
      await this.aggregationService.enqueueFlush(aggregateState, summaryWindowSeconds * 1000)
    })
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

    const aggregatedInput = this.composeAggregatedInput(state.inputParts, state.files)
    const dispatchInput = this.composeDispatchInput(aggregatedInput, state.historyContext)
    this.logger.log(
      `[wechat-personal-trigger] flush aggregate key=${aggregateKey} version=${state.version} aggregateInputPreview=${JSON.stringify(
        this.previewText(aggregatedInput)
      )} defaultImageInput=${aggregatedInput === IMAGE_ONLY_AGGREGATE_INPUT} files=${state.files?.length ?? 0}`
    )

    await this.dispatchInboundMessage({
      integrationId: state.integrationId,
      xpertId: state.xpertId,
      dispatchMode: `buffered version=${state.version}`,
      dispatchPayload: {
        xpertId: state.xpertId,
        input: dispatchInput,
        files: state.files,
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

  private async dispatchInboundMessage(params: {
    integrationId: string
    xpertId: string
    dispatchMode: string
    dispatchPayload: WechatPersonalChatDispatchInput
  }): Promise<void> {
    this.logger.log(
      `[wechat-personal-trigger] dispatch integrationId=${params.integrationId} xpertId=${params.xpertId} mode=${params.dispatchMode} inputLength=${
        params.dispatchPayload.input?.length ?? 0
      } inputPreview=${JSON.stringify(this.previewText(params.dispatchPayload.input ?? ''))} files=${
        params.dispatchPayload.files?.length ?? 0
      }`
    )
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

  private previewText(input: string): string {
    const normalized = input.replace(/\s+/g, ' ').trim()
    return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized
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

  private normalizeHistoryContextLimit(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.min(Math.floor(value), MAX_HISTORY_CONTEXT_LIMIT)
    }
    return DEFAULT_HISTORY_CONTEXT_LIMIT
  }

  private composeDispatchInput(input: string, historyContext?: string): string {
    const history = typeof historyContext === 'string' ? historyContext.trim() : ''
    if (!history) {
      return input
    }
    return `${history}\n\n[本次用户消息]\n${input}`
  }

  private composeAggregatedInput(inputParts: string[], files?: WechatPersonalInboundFile[]): string {
    const input = (Array.isArray(inputParts) ? inputParts : [])
      .map((part) => (typeof part === 'string' ? part : ''))
      .join('\n')
    if (input.trim()) {
      return input
    }
    return Array.isArray(files) && files.length > 0 ? IMAGE_ONLY_AGGREGATE_INPUT : ''
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

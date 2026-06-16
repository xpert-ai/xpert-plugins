import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  RequestContext,
  TChatEventContext,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { type Cache } from 'cache-manager'
import { IIntegration } from '@xpert-ai/contracts'
import { LessThan, MoreThan, Repository } from 'typeorm'
import {
  normalizeConversationKey,
  parseWechatPersonalConversationUserKey,
  resolveWechatPersonalConversationUserKey
} from './conversation-user-key.js'
import {
  summarizePayload,
  shouldDispatchWechatPersonalMessage,
  TIntegrationWechatPersonalOptions,
  WechatPersonalInboundEvent
} from './types.js'
import {
  WechatPersonalTunnelBrokerService,
  WechatPersonalTunnelStatus
} from './wechat-personal-tunnel-broker.service.js'
import { WECHAT_PERSONAL_PLUGIN_CONTEXT } from './tokens.js'
import { WECHAT_PERSONAL_PROVIDER_KEY } from './constants.js'
import { WechatPersonalMessage } from './message.js'
import { WechatPersonalChannelStrategy } from './wechat-personal-channel.strategy.js'
import {
  WechatPersonalAccountEntity,
  WechatPersonalConversationBindingEntity,
  WechatPersonalMessageDirection,
  WechatPersonalMessageLogEntity,
  WechatPersonalMessageLogStatus
} from './entities/index.js'
import { WechatPersonalTriggerStrategy } from './workflow/wechat-personal-trigger.strategy.js'
import { WechatPersonalChatCallbackContext } from './handoff/wechat-personal-chat.types.js'

const CACHE_TTL_MS = 10 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_HISTORY_CONTEXT_LIMIT = 20
const MAX_HISTORY_CONTEXT_LIMIT = 100
const HISTORY_CONTEXT_ITEM_MAX_CHARS = 1000
const HISTORY_CONTEXT_TOTAL_MAX_CHARS = 12000
const HISTORY_CONTEXT_RESET_CONTENT = 'history_context_reset'

type WechatPersonalTenantScope = {
  tenantId?: string | null
  organizationId?: string | null
}

type WechatPersonalConversationState = {
  conversationId: string
  lastActiveAt?: Date
}

export type WechatPersonalConversationListItem = {
  id: string
  integrationId: string
  uuid: string
  contactId: string
  senderId: string
  chatType: 'private' | 'group'
  xpertId: string
  conversationId: string
  updatedAt: Date | null
}

export type WechatPersonalIntegrationWorkbenchItem = {
  id: string
  name?: string
  description?: string
  slug?: string
  callbackConfig: ReturnType<WechatPersonalConversationService['buildCallbackConfig']>
  accountCount: number
  conversationCount: number
  recentMessageCount: number
  errorCount: number
  config: Partial<TIntegrationWechatPersonalOptions>
  tunnel?: WechatPersonalTunnelStatus
}

export type WechatPersonalWorkbenchData = {
  scope?: 'integration' | 'organization'
  integrationId?: string | null
  integrations?: WechatPersonalIntegrationWorkbenchItem[]
  callbackConfig: {
    webhookUrl: string
    globalWebhookUrl: string
    setCallbackUrlTemplate: string
    setCallbackCurlTemplate: string
  }
  summary: {
    integrationCount?: number
    accountCount: number
    conversationCount: number
    recentMessageCount: number
    errorCount: number
  }
  accounts: WechatPersonalAccountEntity[]
  conversations: WechatPersonalConversationListItem[]
  messages: WechatPersonalMessageLogEntity[]
  queue: WechatPersonalMessageLogEntity[]
  logs: WechatPersonalMessageLogEntity[]
  tables?: Partial<Record<WechatPersonalWorkbenchTableKey, WechatPersonalWorkbenchTableResult>>
  config: Partial<TIntegrationWechatPersonalOptions>
  tunnel?: WechatPersonalTunnelStatus
}

export type WechatPersonalPagedResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type WechatPersonalWorkbenchTableKey = 'accounts' | 'conversations' | 'messages' | 'queue' | 'logs'

export type WechatPersonalWorkbenchTableQuery = {
  search?: string
  page?: number
  pageSize?: number
  filters?: Record<string, unknown> | null
}

export type WechatPersonalWorkbenchTableResult =
  | (WechatPersonalPagedResult<WechatPersonalAccountEntity> & { key: 'accounts' })
  | (WechatPersonalPagedResult<WechatPersonalConversationListItem> & { key: 'conversations' })
  | (WechatPersonalPagedResult<WechatPersonalMessageLogEntity> & { key: 'messages' | 'queue' | 'logs' })

export type WechatPersonalRuntimeStatus = {
  callbackConfig: WechatPersonalWorkbenchData['callbackConfig']
  summary: WechatPersonalWorkbenchData['summary']
  triggerBinding: {
    integrationId: string
    xpertId: string
    sessionTimeoutSeconds: number
    summaryWindowSeconds: number
    historyContextLimit: number
    ignoreSelfMessages: boolean
    groupTriggerMode: string
    groupKeywords: string[]
    updatedAt: Date | null
  } | null
  accounts: WechatPersonalAccountEntity[]
  recentErrors: WechatPersonalMessageLogEntity[]
  config: Partial<TIntegrationWechatPersonalOptions>
  tunnel?: WechatPersonalTunnelStatus
  integrations?: WechatPersonalIntegrationWorkbenchItem[]
  scope?: 'integration' | 'organization'
}

@Injectable()
export class WechatPersonalConversationService {
  private readonly logger = new Logger(WechatPersonalConversationService.name)
  private _integrationPermissionService: IntegrationPermissionService
  private readonly inboundDedupeLocks = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly wechatChannel: WechatPersonalChannelStrategy,
    private readonly triggerStrategy: WechatPersonalTriggerStrategy,
    private readonly tunnelBroker: WechatPersonalTunnelBrokerService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @InjectRepository(WechatPersonalConversationBindingEntity)
    private readonly conversationBindingRepository: Repository<WechatPersonalConversationBindingEntity>,
    @InjectRepository(WechatPersonalAccountEntity)
    private readonly accountRepository: Repository<WechatPersonalAccountEntity>,
    @InjectRepository(WechatPersonalMessageLogEntity)
    private readonly messageLogRepository: Repository<WechatPersonalMessageLogEntity>,
    @Inject(WECHAT_PERSONAL_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  async getConversationState(
    conversationUserKey: string,
    xpertId: string,
    scopeOverride?: WechatPersonalTenantScope | null
  ): Promise<WechatPersonalConversationState | undefined> {
    const normalizedUserKey = normalizeConversationKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return undefined
    }

    const scope = this.resolveTenantScope(scopeOverride)
    const cached = await this.cacheManager.get<{ conversationId?: unknown; lastActiveAt?: unknown }>(
      this.getConversationCacheKey(normalizedUserKey, normalizedXpertId, scope)
    )
    if (cached && typeof cached === 'object') {
      const conversationId = normalizeConversationKey(cached.conversationId)
      if (conversationId) {
        return {
          conversationId,
          lastActiveAt: this.normalizeDate(cached.lastActiveAt)
        }
      }
    }

    const binding = await this.conversationBindingRepository.findOne({
      where: this.scopedWhere(
        {
          conversationUserKey: normalizedUserKey,
          xpertId: normalizedXpertId
        },
        scope
      )
    })
    const conversationId = normalizeConversationKey(binding?.conversationId)
    if (!conversationId) {
      return undefined
    }

    const lastActiveAt = this.normalizeDate(binding?.lastActiveAt) ?? this.normalizeDate(binding?.updatedAt)
    await this.cacheConversation(normalizedUserKey, normalizedXpertId, conversationId, lastActiveAt, scope)
    return {
      conversationId,
      lastActiveAt
    }
  }

  async setConversation(
    conversationUserKey: string,
    xpertId: string,
    conversationId: string,
    lastActiveAt: Date | undefined = new Date(),
    scopeOverride?: WechatPersonalTenantScope | null
  ): Promise<void> {
    const normalizedUserKey = normalizeConversationKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationKey(xpertId)
    const normalizedConversationId = normalizeConversationKey(conversationId)
    if (!normalizedUserKey || !normalizedXpertId || !normalizedConversationId) {
      return
    }

    const resolvedLastActiveAt = this.normalizeDate(lastActiveAt) ?? new Date()
    const bindingContext = this.resolveBindingContext()
    const scope = this.resolveTenantScope(scopeOverride, bindingContext)
    await this.cacheConversation(normalizedUserKey, normalizedXpertId, normalizedConversationId, resolvedLastActiveAt, scope)

    await this.conversationBindingRepository.upsert(
      {
        conversationUserKey: normalizedUserKey,
        xpertId: normalizedXpertId,
        conversationId: normalizedConversationId,
        lastActiveAt: resolvedLastActiveAt,
        tenantId: scope.tenantId ?? null,
        organizationId: scope.organizationId ?? null,
        createdById: bindingContext.createdById ?? null,
        updatedById: bindingContext.updatedById ?? null
      },
      ['conversationUserKey', 'xpertId']
    )
  }

  async touchConversation(
    conversationUserKey: string,
    xpertId: string,
    lastActiveAt: Date = new Date(),
    scopeOverride?: WechatPersonalTenantScope | null
  ): Promise<void> {
    const current = await this.getConversationState(conversationUserKey, xpertId, scopeOverride)
    if (!current?.conversationId) {
      return
    }
    await this.setConversation(conversationUserKey, xpertId, current.conversationId, lastActiveAt, scopeOverride)
  }

  async clearConversation(
    conversationUserKey: string,
    xpertId: string,
    scopeOverride?: WechatPersonalTenantScope | null
  ): Promise<void> {
    const normalizedUserKey = normalizeConversationKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return
    }

    const scope = this.resolveTenantScope(scopeOverride)
    await this.cacheManager.del(this.getConversationCacheKey(normalizedUserKey, normalizedXpertId, scope))
    await this.conversationBindingRepository.delete(
      this.scopedWhere(
        {
          conversationUserKey: normalizedUserKey,
          xpertId: normalizedXpertId
        },
        scope
      )
    )
  }

  async restartConversationBinding(integrationId: string, bindingId: string): Promise<void> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    const scope = await this.readIntegrationTenantScope(normalizedIntegrationId)
    const binding = await this.conversationBindingRepository.findOne({
      where: this.scopedWhere(
        {
          id: normalizeConversationKey(bindingId)
        },
        scope
      )
    })
    if (!binding) {
      throw new Error('该微信会话不存在或已被重置。')
    }

    const parsed = parseWechatPersonalConversationUserKey(binding.conversationUserKey)
    if (!parsed || parsed.integrationId !== normalizedIntegrationId) {
      throw new Error('该微信会话不属于当前个人微信集成。')
    }
    await this.clearConversation(binding.conversationUserKey, binding.xpertId, scope)
  }

  async handleInboundEvent(
    event: WechatPersonalInboundEvent,
    ctx: TChatEventContext<TIntegrationWechatPersonalOptions>
  ): Promise<{ handled: boolean; reason?: string }> {
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatPersonalOptions>>(
      ctx.integration.id,
      {
        relations: ['tenant']
      }
    )

    if (!integration) {
      this.logger.error(`Integration ${ctx.integration.id} not found`)
      return { handled: false, reason: 'integration_not_found' }
    }

    const eventScope = this.resolveTenantScope(integration, ctx)
    const accountState = await this.upsertAccount(integration, event, ctx)

    if (accountState.enabled === false) {
      await this.logInbound(integration, event, 'skipped', {
        error: 'account_disabled'
      })
      return { handled: false, reason: 'account_disabled' }
    }

    const dedupeKeys = this.buildInboundDedupeKeys(integration.id, event, eventScope)
    if (!this.acquireInboundDedupeLock(dedupeKeys)) {
      return { handled: false, reason: 'duplicate' }
    }

    try {
      const duplicate = await this.isDuplicateInbound(integration.id, event, eventScope)
      if (duplicate) {
        return { handled: false, reason: 'duplicate' }
      }

      const inboundLog = await this.logInbound(integration, event, 'received')

      const binding = await this.triggerStrategy.getBinding(integration.id, eventScope)
      if (!binding?.xpertId) {
        await this.updateLog(inboundLog.id, {
          status: 'skipped',
          error: 'trigger_binding_missing'
        }, eventScope)
        return { handled: false, reason: 'trigger_binding_missing' }
      }

      const dispatchable = shouldDispatchWechatPersonalMessage(event, {
        ignoreSelfMessages: binding.ignoreSelfMessages !== false,
        chatFilterMode: binding.chatFilterMode,
        allowedContactIds: binding.allowedContactIds,
        blockedContactIds: binding.blockedContactIds,
        allowedGroupIds: binding.allowedGroupIds,
        blockedGroupIds: binding.blockedGroupIds,
        allowedSenderIds: binding.allowedSenderIds,
        blockedSenderIds: binding.blockedSenderIds,
        groupTriggerMode: binding.groupTriggerMode,
        groupKeywords: binding.groupKeywords ?? []
      })
      if (!dispatchable) {
        await this.updateLog(inboundLog.id, {
          status: 'skipped',
          xpertId: binding.xpertId,
          error: 'filtered_by_trigger_policy'
        }, eventScope)
        return { handled: false, reason: 'filtered' }
      }

      const executorUserId = this.resolveExecutionUserId(integration)
      const conversationUserKey = resolveWechatPersonalConversationUserKey({
        integrationId: integration.id,
        uuid: event.uuid,
        contactId: event.contactId,
        senderId: event.senderId || event.contactId
      })

      const wechatMessage = new WechatPersonalMessage(
        {
          integrationId: integration.id,
          uuid: event.uuid,
          ownerWxid: event.ownerWxid,
          contactId: event.contactId,
          chatType: event.chatType,
          senderId: event.senderId,
          wechatChannel: this.wechatChannel
        },
        {
          messageId: event.messageId,
          status: 'thinking',
          language: integration.options?.preferLanguage
        }
      )

      const newSessionCommand = this.parseNewSessionCommand(dispatchable.input)
      if (newSessionCommand.matched && conversationUserKey) {
        await this.clearConversation(conversationUserKey, binding.xpertId, eventScope)
        await this.triggerStrategy.clearBufferedConversation(conversationUserKey)
        await this.markHistoryContextReset(integration, event, conversationUserKey, binding.xpertId, eventScope)
        if (!newSessionCommand.input) {
          await wechatMessage.reply(this.getNewConversationStartedText(integration.options?.preferLanguage))
          await this.updateLog(inboundLog.id, {
            status: 'dispatched',
            xpertId: binding.xpertId,
            conversationUserKey
          }, eventScope)
          return { handled: true, reason: 'new_session_only' }
        }
      }

      const historyContext = newSessionCommand.matched
        ? undefined
        : await this.buildHistoryContext({
            integrationId: integration.id,
            conversationUserKey,
            xpertId: binding.xpertId,
            limit: binding.historyContextLimit,
            timeoutSeconds: binding.sessionTimeoutSeconds,
            before: this.normalizeDate(inboundLog.createdAt) ?? new Date(),
            excludedLogIds: [inboundLog.id],
            scope: eventScope
          })

      const handled = await this.triggerStrategy.handleInboundMessage({
        integrationId: integration.id,
        input: newSessionCommand.matched ? newSessionCommand.input : dispatchable.input,
        wechatMessage,
        conversationUserKey,
        historyContext,
        currentInboundLogIds: [inboundLog.id],
        tenantId: integration.tenantId || ctx.tenantId,
        organizationId: integration.organizationId || ctx.organizationId,
        executorUserId,
        endUserId: event.senderId
      })

      await this.updateLog(inboundLog.id, {
        status: handled ? 'dispatched' : 'failed',
        xpertId: binding.xpertId,
        conversationUserKey,
        error: handled ? undefined : 'handoff_dispatch_failed'
      }, eventScope)

      return { handled, reason: handled ? 'dispatched' : 'dispatch_failed' }
    } finally {
      this.releaseInboundDedupeLock(dedupeKeys)
    }
  }

  async logOutbound(params: {
    context: WechatPersonalChatCallbackContext
    content: string
    status: WechatPersonalMessageLogStatus
    messageId?: string
    error?: string
  }): Promise<void> {
    const context = params.context
    const bindingContext = this.resolveBindingContext()
    const scope = this.resolveTenantScope(context, bindingContext)
    await this.messageLogRepository.save({
      integrationId: context.integrationId,
      uuid: context.uuid,
      ownerWxid: context.ownerWxid,
      contactId: context.contactId,
      senderId: context.senderId,
      chatType: context.chatType,
      messageId: params.messageId,
      direction: 'outbound',
      status: params.status,
      content: params.content,
      error: params.error,
      sentAt: params.status === 'sent' ? new Date() : undefined,
      xpertId: context.xpertId,
      conversationId: context.conversationId,
      conversationUserKey: context.conversationUserKey,
      tenantId: scope.tenantId ?? null,
      organizationId: scope.organizationId ?? null,
      createdById: bindingContext.createdById ?? null,
      updatedById: bindingContext.updatedById ?? null
    })

    await this.accountRepository.update(
      this.scopedWhere(
        {
          integrationId: context.integrationId,
          uuid: context.uuid
        },
        scope
      ),
      {
        lastSendAt: new Date(),
        status: params.status === 'failed' ? 'error' : 'online',
        lastError: params.error ?? null
      }
    )
  }

  async setAccountEnabled(integrationId: string, uuid: string, enabled: boolean): Promise<void> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    const normalizedUuid = normalizeConversationKey(uuid)
    if (!normalizedIntegrationId || !normalizedUuid) {
      throw new Error('缺少个人微信账号标识。')
    }

    const scope = await this.readIntegrationTenantScope(normalizedIntegrationId)
    await this.accountRepository.update(
      this.scopedWhere(
        {
          integrationId: normalizedIntegrationId,
          uuid: normalizedUuid
        },
        scope
      ),
      {
        enabled,
        status: enabled ? 'unknown' : 'disabled',
        lastError: null
      }
    )
  }

  async resendOutboundMessage(integrationId: string, logId?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new Error('缺少个人微信集成标识。')
    }

    const scope = await this.readIntegrationTenantScope(normalizedIntegrationId)
    const target = logId
      ? await this.messageLogRepository.findOne({
          where: this.scopedWhere(
            {
              id: normalizeConversationKey(logId),
              integrationId: normalizedIntegrationId,
              direction: 'outbound' as WechatPersonalMessageDirection
            },
            scope
          )
        })
      : await this.messageLogRepository.findOne({
          where: this.scopedWhere(
            {
              integrationId: normalizedIntegrationId,
              direction: 'outbound' as WechatPersonalMessageDirection
            },
            scope
          ),
          order: {
            createdAt: 'DESC'
          }
        })

    if (!target?.uuid || !target.contactId || !target.content) {
      throw new Error('没有可重发的 AI 文本回复。')
    }

    const result = await this.wechatChannel.sendTextByIntegrationId(normalizedIntegrationId, {
      uuid: target.uuid,
      contactId: target.contactId,
      content: target.content,
      source: 'resend'
    })
    if (!result.queued) {
      await this.messageLogRepository.save({
        integrationId: normalizedIntegrationId,
        uuid: target.uuid,
        ownerWxid: target.ownerWxid,
        contactId: target.contactId,
        senderId: target.senderId,
        messageId: result.messageId,
        chatType: target.chatType,
        direction: 'outbound',
        status: result.success ? 'sent' : 'failed',
        content: target.content,
        error: result.error,
        xpertId: target.xpertId,
        conversationId: target.conversationId,
        conversationUserKey: target.conversationUserKey,
        tenantId: target.tenantId ?? scope.tenantId ?? null,
        organizationId: target.organizationId ?? scope.organizationId ?? null,
        sentAt: result.success ? new Date() : undefined
      })
    }
    return result
  }

  async getWorkbenchData(
    integrationId: string,
    query: { search?: string; page?: number; pageSize?: number } = {}
  ): Promise<WechatPersonalWorkbenchData> {
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatPersonalOptions>>(
      integrationId,
      {
        relations: ['tenant']
      }
    )
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!integration || !normalizedIntegrationId) {
      throw new Error('个人微信集成不存在或无权访问。')
    }
    const pageSize = this.normalizePositiveInt(query.pageSize) ?? 30
    const search = this.normalizeListSearch(query.search)
    const scope = this.resolveTenantScope(integration)

    const [accounts, logs, bindings] = await Promise.all([
      this.accountRepository.find({
        where: this.scopedWhere({ integrationId: normalizedIntegrationId }, scope),
        order: { updatedAt: 'DESC' },
        take: 100
      }),
      this.messageLogRepository.find({
        where: this.scopedWhere({ integrationId: normalizedIntegrationId }, scope),
        order: { createdAt: 'DESC' },
        take: 200
      }),
      this.conversationBindingRepository.find({
        where: this.scopedWhere({}, scope),
        order: { updatedAt: 'DESC' }
      })
    ])

    const conversations = bindings
      .map((binding) => this.toConversationListItem(binding, normalizedIntegrationId))
      .filter((item): item is WechatPersonalConversationListItem => Boolean(item))
      .filter((item) => {
        if (!search) {
          return true
        }
        return [item.uuid, item.contactId, item.senderId, item.xpertId, item.conversationId].some((value) =>
          this.normalizeListSearch(value)?.includes(search)
        )
      })
      .slice(0, pageSize)
    const filteredLogs = logs
      .filter((log) => {
        if (!search) {
          return true
        }
        return [log.uuid, log.contactId, log.senderId, log.content, log.error, log.status].some((value) =>
          this.normalizeListSearch(value)?.includes(search)
        )
      })
      .slice(0, pageSize)
    const tunnel = this.getTunnelStatus(integration)

    return {
      scope: 'integration',
      integrationId: normalizedIntegrationId,
      integrations: [
        this.toIntegrationWorkbenchItem(integration, {
          accounts,
          conversations,
          logs
        })
      ],
      callbackConfig: this.buildCallbackConfig(integrationId, integration?.options?.callbackSecret),
      summary: {
        integrationCount: 1,
        accountCount: accounts.length,
        conversationCount: conversations.length,
        recentMessageCount: logs.length,
        errorCount: logs.filter((log) => log.status === 'failed' || log.error).length
      },
      accounts,
      conversations,
      messages: filteredLogs,
      queue: filteredLogs.filter((log) => log.direction === 'outbound' && this.isQueueStatus(log.status)),
      logs: filteredLogs,
      tunnel,
      config: {
        connectionMode: integration?.options?.connectionMode ?? 'direct_http',
        baseUrl: integration?.options?.baseUrl,
        tunnelClientId: integration?.options?.tunnelClientId,
        apiVersion: integration?.options?.apiVersion ?? '/v1/',
        timeoutMs: integration?.options?.timeoutMs ?? 10000,
        preferLanguage: integration?.options?.preferLanguage,
        fallbackToLegacySendText: integration?.options?.fallbackToLegacySendText !== false,
        outboundQueue: integration?.options?.outboundQueue ?? { enabled: true },
        callbackSecret: integration?.options?.callbackSecret ? '******' : ''
      }
    }
  }

  async getOrganizationWorkbenchData(
    query: { search?: string; page?: number; pageSize?: number } = {}
  ): Promise<WechatPersonalWorkbenchData> {
    const integrations = await this.listWechatPersonalIntegrations()
    const integrationIds = integrations.map((integration) => normalizeConversationKey(integration.id)).filter(Boolean) as string[]
    const pageSize = this.normalizePositiveInt(query.pageSize) ?? 30
    const search = this.normalizeListSearch(query.search)
    const scope = this.resolveTenantScope(integrations[0])

    if (!integrationIds.length) {
      return {
        scope: 'organization',
        integrationId: null,
        integrations: [],
        callbackConfig: this.emptyCallbackConfig(),
        summary: {
          integrationCount: 0,
          accountCount: 0,
          conversationCount: 0,
          recentMessageCount: 0,
          errorCount: 0
        },
        accounts: [],
        conversations: [],
        messages: [],
        queue: [],
        logs: [],
        tunnel: this.tunnelBroker.getStatus(),
        config: {
          organizationScope: true,
          integrationCount: 0
        } as Partial<TIntegrationWechatPersonalOptions>
      }
    }

    const [accounts, logs, bindings] = await Promise.all([
      this.accountRepository.find({
        where: integrationIds.map((integrationId) => this.scopedWhere({ integrationId }, scope)),
        order: { updatedAt: 'DESC' },
        take: 500
      }),
      this.messageLogRepository.find({
        where: integrationIds.map((integrationId) => this.scopedWhere({ integrationId }, scope)),
        order: { createdAt: 'DESC' },
        take: 1000
      }),
      this.conversationBindingRepository.find({
        where: this.scopedWhere({}, scope),
        order: { updatedAt: 'DESC' },
        take: 1500
      })
    ])

    const integrationIdSet = new Set(integrationIds)
    const allConversations = bindings
      .map((binding) => {
        const parsed = parseWechatPersonalConversationUserKey(binding.conversationUserKey)
        if (!parsed || !integrationIdSet.has(parsed.integrationId)) {
          return null
        }
        return this.toConversationListItem(binding, parsed.integrationId)
      })
      .filter((item): item is WechatPersonalConversationListItem => Boolean(item))

    const conversations = allConversations
      .filter((item) => this.matchesConversationSearch(item, search))
      .slice(0, pageSize)
    const filteredLogs = logs
      .filter((log) => this.matchesLogSearch(log, search))
      .slice(0, pageSize)

    return {
      scope: 'organization',
      integrationId: null,
      integrations: integrations.map((integration) =>
        this.toIntegrationWorkbenchItem(integration, {
          accounts: accounts.filter((account) => account.integrationId === integration.id),
          conversations: allConversations.filter((conversation) => conversation.integrationId === integration.id),
          logs: logs.filter((log) => log.integrationId === integration.id)
        })
      ),
      callbackConfig: this.emptyCallbackConfig(),
      summary: {
        integrationCount: integrations.length,
        accountCount: accounts.length,
        conversationCount: allConversations.length,
        recentMessageCount: logs.length,
        errorCount: logs.filter((log) => log.status === 'failed' || log.error).length
      },
      accounts,
      conversations,
      messages: filteredLogs,
      queue: filteredLogs.filter((log) => log.direction === 'outbound' && this.isQueueStatus(log.status)),
      logs: filteredLogs,
      tunnel: this.tunnelBroker.getStatus(),
      config: {
        organizationScope: true,
        integrationCount: integrations.length
      } as Partial<TIntegrationWechatPersonalOptions>
    }
  }

  async getRuntimeStatus(integrationId: string): Promise<WechatPersonalRuntimeStatus> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new Error('缺少个人微信集成标识。')
    }

    const [workbenchData, triggerBinding] = await Promise.all([
      this.getWorkbenchData(normalizedIntegrationId, { pageSize: 20 }),
      this.triggerStrategy.getBinding(normalizedIntegrationId)
    ])

    return {
      callbackConfig: workbenchData.callbackConfig,
      summary: workbenchData.summary,
      triggerBinding: triggerBinding
        ? {
            integrationId: triggerBinding.integrationId,
            xpertId: triggerBinding.xpertId,
            sessionTimeoutSeconds: triggerBinding.sessionTimeoutSeconds,
            summaryWindowSeconds: triggerBinding.summaryWindowSeconds,
            historyContextLimit: triggerBinding.historyContextLimit ?? DEFAULT_HISTORY_CONTEXT_LIMIT,
            ignoreSelfMessages: triggerBinding.ignoreSelfMessages !== false,
            groupTriggerMode: triggerBinding.groupTriggerMode,
            groupKeywords: triggerBinding.groupKeywords ?? [],
            updatedAt: this.normalizeDate(triggerBinding.updatedAt) ?? null
          }
        : null,
      accounts: workbenchData.accounts.slice(0, 10),
      recentErrors: workbenchData.logs
        .filter((log) => log.status === 'failed' || Boolean(log.error))
        .slice(0, 10),
      config: workbenchData.config,
      tunnel: workbenchData.tunnel
    }
  }

  async getOrganizationRuntimeStatus(): Promise<WechatPersonalRuntimeStatus> {
    const workbenchData = await this.getOrganizationWorkbenchData({ pageSize: 20 })
    return {
      scope: 'organization',
      integrations: workbenchData.integrations,
      callbackConfig: workbenchData.callbackConfig,
      summary: workbenchData.summary,
      triggerBinding: null,
      accounts: workbenchData.accounts.slice(0, 10),
      recentErrors: workbenchData.logs
        .filter((log) => log.status === 'failed' || Boolean(log.error))
        .slice(0, 10),
      config: workbenchData.config,
      tunnel: workbenchData.tunnel
    }
  }

  async getBoundIntegrationIdForXpert(xpertId: string): Promise<string | null> {
    const normalizedXpertId = normalizeConversationKey(xpertId)
    if (!normalizedXpertId) {
      return null
    }
    return this.triggerStrategy.getBoundIntegrationId(normalizedXpertId)
  }

  async getWorkbenchTableData(
    integrationId: string,
    table: WechatPersonalWorkbenchTableKey,
    query: WechatPersonalWorkbenchTableQuery = {}
  ): Promise<WechatPersonalWorkbenchTableResult> {
    if (table === 'accounts') {
      return { key: table, ...(await this.listAccounts(integrationId, query)) }
    }
    if (table === 'conversations') {
      return { key: table, ...(await this.listConversations(integrationId, query)) }
    }
    if (table === 'queue') {
      return {
        key: table,
        ...(await this.searchMessageLogs(integrationId, {
          ...query,
          direction: 'outbound',
          filters: {
            ...(query.filters || {}),
            queueOnly: true
          }
        }))
      }
    }
    return { key: table, ...(await this.searchMessageLogs(integrationId, query)) }
  }

  async getOrganizationWorkbenchTableData(
    table: WechatPersonalWorkbenchTableKey,
    query: WechatPersonalWorkbenchTableQuery = {}
  ): Promise<WechatPersonalWorkbenchTableResult> {
    if (table === 'accounts') {
      return { key: table, ...(await this.listOrganizationAccounts(query)) }
    }
    if (table === 'conversations') {
      return { key: table, ...(await this.listOrganizationConversations(query)) }
    }
    if (table === 'queue') {
      return {
        key: table,
        ...(await this.searchOrganizationMessageLogs({
          ...query,
          direction: 'outbound',
          filters: {
            ...(query.filters || {}),
            queueOnly: true
          }
        }))
      }
    }
    return { key: table, ...(await this.searchOrganizationMessageLogs(query)) }
  }

  async listAccounts(
    integrationId: string,
    query: WechatPersonalWorkbenchTableQuery = {}
  ): Promise<WechatPersonalPagedResult<WechatPersonalAccountEntity>> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new Error('缺少个人微信集成标识。')
    }

    const page = this.normalizePage(query.page)
    const pageSize = this.normalizePageSize(query.pageSize, 50)
    const search = this.normalizeListSearch(query.search)
    const filters = this.normalizeFilters(query.filters)
    const scope = await this.readIntegrationTenantScope(normalizedIntegrationId)
    const accounts = await this.accountRepository.find({
      where: this.scopedWhere({ integrationId: normalizedIntegrationId }, scope),
      order: { updatedAt: 'DESC' },
      take: 500
    })
    const filtered = accounts.filter((account) => {
      if (!this.matchesAccountFilters(account, filters)) {
        return false
      }
      if (!search) {
        return true
      }
      return [
        account.uuid,
        account.ownerWxid,
        account.displayName,
        account.status,
        account.lastError
      ].some((value) => this.normalizeListSearch(value)?.includes(search))
    })

    return this.paginateItems(filtered, page, pageSize)
  }

  async listOrganizationAccounts(
    query: WechatPersonalWorkbenchTableQuery = {}
  ): Promise<WechatPersonalPagedResult<WechatPersonalAccountEntity>> {
    const data = await this.getOrganizationWorkbenchData({ pageSize: 500 })
    const page = this.normalizePage(query.page)
    const pageSize = this.normalizePageSize(query.pageSize, 50)
    const search = this.normalizeListSearch(query.search)
    const filters = this.normalizeFilters(query.filters)
    const filtered = data.accounts.filter((account) => {
      if (!this.matchesAccountFilters(account, filters)) {
        return false
      }
      if (!search) {
        return true
      }
      return [
        account.integrationId,
        account.uuid,
        account.ownerWxid,
        account.displayName,
        account.status,
        account.lastError
      ].some((value) => this.normalizeListSearch(value)?.includes(search))
    })

    return this.paginateItems(filtered, page, pageSize)
  }

  async listConversations(
    integrationId: string,
    query: WechatPersonalWorkbenchTableQuery = {}
  ): Promise<WechatPersonalPagedResult<WechatPersonalConversationListItem>> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new Error('缺少个人微信集成标识。')
    }

    const page = this.normalizePage(query.page)
    const pageSize = this.normalizePageSize(query.pageSize, 50)
    const search = this.normalizeListSearch(query.search)
    const filters = this.normalizeFilters(query.filters)
    const scope = await this.readIntegrationTenantScope(normalizedIntegrationId)
    const bindings = await this.conversationBindingRepository.find({
      where: this.scopedWhere({}, scope),
      order: { updatedAt: 'DESC' },
      take: 1000
    })
    const conversations = bindings
      .map((binding) => this.toConversationListItem(binding, normalizedIntegrationId))
      .filter((item): item is WechatPersonalConversationListItem => Boolean(item))
      .filter((item) => this.matchesConversationFilters(item, filters))
      .filter((item) => {
        if (!search) {
          return true
        }
        return [
          item.id,
          item.uuid,
          item.contactId,
          item.senderId,
          item.xpertId,
          item.conversationId
        ].some((value) => this.normalizeListSearch(value)?.includes(search))
      })

    return this.paginateItems(conversations, page, pageSize)
  }

  async listOrganizationConversations(
    query: WechatPersonalWorkbenchTableQuery = {}
  ): Promise<WechatPersonalPagedResult<WechatPersonalConversationListItem>> {
    const data = await this.getOrganizationWorkbenchData({ pageSize: 1000 })
    const page = this.normalizePage(query.page)
    const pageSize = this.normalizePageSize(query.pageSize, 50)
    const search = this.normalizeListSearch(query.search)
    const filters = this.normalizeFilters(query.filters)
    const filtered = data.conversations
      .filter((item) => this.matchesConversationFilters(item, filters))
      .filter((item) => this.matchesConversationSearch(item, search))

    return this.paginateItems(filtered, page, pageSize)
  }

  async searchMessageLogs(
    integrationId: string,
    query: {
      direction?: WechatPersonalMessageDirection
      status?: WechatPersonalMessageLogStatus
      search?: string
      page?: number
      pageSize?: number
      filters?: Record<string, unknown> | null
    } = {}
  ): Promise<WechatPersonalPagedResult<WechatPersonalMessageLogEntity>> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new Error('缺少个人微信集成标识。')
    }

    const page = this.normalizePage(query.page)
    const pageSize = this.normalizePageSize(query.pageSize, 50)
    const search = this.normalizeListSearch(query.search)
    const filters = this.normalizeFilters(query.filters)
    const direction = this.normalizeDirection(query.direction ?? filters.direction)
    const status = this.normalizeLogStatus(query.status ?? filters.status)
    const scope = await this.readIntegrationTenantScope(normalizedIntegrationId)
    const logs = await this.messageLogRepository.find({
      where: this.scopedWhere({ integrationId: normalizedIntegrationId }, scope),
      order: { createdAt: 'DESC' },
      take: 1000
    })
    const filtered = logs.filter((log) => {
      if (!this.matchesLogFilters(log, filters)) {
        return false
      }
      if (direction && log.direction !== direction) {
        return false
      }
      if (status && log.status !== status) {
        return false
      }
      if (!search) {
        return true
      }
      return [
        log.uuid,
        log.ownerWxid,
        log.contactId,
        log.senderId,
        log.messageId,
        log.content,
        log.error,
        log.xpertId,
        log.conversationId,
        log.conversationUserKey
      ].some((value) => this.normalizeListSearch(value)?.includes(search))
    })

    return this.paginateItems(filtered, page, pageSize)
  }

  async searchOrganizationMessageLogs(
    query: {
      direction?: WechatPersonalMessageDirection
      status?: WechatPersonalMessageLogStatus
      search?: string
      page?: number
      pageSize?: number
      filters?: Record<string, unknown> | null
    } = {}
  ): Promise<WechatPersonalPagedResult<WechatPersonalMessageLogEntity>> {
    const data = await this.getOrganizationWorkbenchData({ pageSize: 1000 })
    const page = this.normalizePage(query.page)
    const pageSize = this.normalizePageSize(query.pageSize, 50)
    const search = this.normalizeListSearch(query.search)
    const filters = this.normalizeFilters(query.filters)
    const direction = this.normalizeDirection(query.direction ?? filters.direction)
    const status = this.normalizeLogStatus(query.status ?? filters.status)
    const filtered = data.logs.filter((log) => {
      if (!this.matchesLogFilters(log, filters)) {
        return false
      }
      if (direction && log.direction !== direction) {
        return false
      }
      if (status && log.status !== status) {
        return false
      }
      return this.matchesLogSearch(log, search)
    })

    return this.paginateItems(filtered, page, pageSize)
  }

  buildCallbackConfig(integrationId: string, callbackSecret?: string) {
    const apiBaseUrl = (process.env.API_BASE_URL || '').replace(/\/+$/, '')
    const id = normalizeConversationKey(integrationId) || '<integrationId>'
    const webhookUrl = `${apiBaseUrl}/api/wechat-personal/webhook/${id}${
      callbackSecret ? `?secret=${encodeURIComponent(callbackSecret)}` : ''
    }`
    const setCallbackUrlTemplate = `${apiBaseUrl}/api/wechat-personal/webhook/${id}${
      callbackSecret ? '?secret=***' : ''
    }`
    return {
      webhookUrl,
      globalWebhookUrl: webhookUrl,
      setCallbackUrlTemplate,
      setCallbackCurlTemplate:
        `curl -X POST "$WX2_BASE_URL/message/SetCallback?key=<uuid>" ` +
        `-H "Content-Type: application/json" ` +
        `-d '{"CallbackURL":"${setCallbackUrlTemplate}","Enabled":true}'`
    }
  }

  private async upsertAccount(
    integration: IIntegration<TIntegrationWechatPersonalOptions>,
    event: WechatPersonalInboundEvent,
    ctx: TChatEventContext<TIntegrationWechatPersonalOptions>
  ): Promise<{ enabled: boolean }> {
    const bindingContext = this.resolveBindingContext()
    const scope = this.resolveTenantScope(integration, ctx)
    const existing = await this.accountRepository.findOne({
      where: this.scopedWhere(
        {
          integrationId: integration.id,
          uuid: event.uuid
        },
        scope
      )
    })
    const enabled = existing?.enabled !== false
    await this.accountRepository.upsert(
      {
        integrationId: integration.id,
        uuid: event.uuid,
        ownerWxid: event.ownerWxid || null,
        displayName: event.ownerName || event.ownerWxid || null,
        status: enabled ? 'online' : 'disabled',
        enabled,
        lastCallbackAt: new Date(),
        lastError: null,
        tenantId: scope.tenantId ?? null,
        organizationId: scope.organizationId ?? null,
        createdById: bindingContext.createdById ?? null,
        updatedById: bindingContext.updatedById ?? null
      },
      ['integrationId', 'uuid']
    )
    return { enabled }
  }

  private buildInboundDedupeKeys(
    integrationId: string,
    event: WechatPersonalInboundEvent,
    scope?: WechatPersonalTenantScope | null
  ): string[] {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      return []
    }

    const scopePrefix = [
      `tenant:${scope?.tenantId ?? ''}`,
      `org:${scope?.organizationId ?? ''}`,
      `integration:${normalizedIntegrationId}`
    ].join('|')
    const keys: string[] = []
    const messageId = normalizeConversationKey(event.messageId)
    if (messageId) {
      keys.push(`${scopePrefix}|message:${messageId}`)
    }

    const uuid = normalizeConversationKey(event.uuid)
    const contactId = normalizeConversationKey(event.contactId)
    const senderId = normalizeConversationKey(event.senderId) || contactId
    const content = normalizeConversationKey(event.content)
    if (uuid && contactId && senderId && content) {
      keys.push(
        `${scopePrefix}|signature:${uuid}|${contactId}|${senderId}|${event.timestamp}|${content.slice(0, 512)}`
      )
    }

    return Array.from(new Set(keys))
  }

  private acquireInboundDedupeLock(keys: string[]): boolean {
    if (!keys.length) {
      return true
    }
    if (keys.some((key) => this.inboundDedupeLocks.has(key))) {
      return false
    }

    const timer = setTimeout(() => {
      for (const key of keys) {
        this.inboundDedupeLocks.delete(key)
      }
    }, 30_000)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
    for (const key of keys) {
      this.inboundDedupeLocks.set(key, timer)
    }
    return true
  }

  private releaseInboundDedupeLock(keys: string[]): void {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    for (const key of keys) {
      const timer = this.inboundDedupeLocks.get(key)
      if (timer) {
        timers.add(timer)
      }
      this.inboundDedupeLocks.delete(key)
    }
    for (const timer of timers) {
      clearTimeout(timer)
    }
  }

  private async isDuplicateInbound(
    integrationId: string,
    event: WechatPersonalInboundEvent,
    scope?: WechatPersonalTenantScope | null
  ): Promise<boolean> {
    const messageId = event.messageId
    if (!normalizeConversationKey(messageId)) {
      return false
    }
    const exactCount = await this.messageLogRepository.count({
      where: this.scopedWhere(
        {
          integrationId,
          messageId,
          direction: 'inbound' as WechatPersonalMessageDirection
        },
        scope
      )
    })
    if (exactCount > 0) {
      return true
    }

    const content = normalizeConversationKey(event.content)
    if (!content) {
      return false
    }

    const recentEquivalentCount = await this.messageLogRepository.count({
      where: this.scopedWhere(
        {
          integrationId,
          uuid: event.uuid,
          contactId: event.contactId,
          senderId: event.senderId,
          direction: 'inbound' as WechatPersonalMessageDirection,
          content,
          createdAt: MoreThan(new Date(Date.now() - 5_000))
        },
        scope
      )
    })
    return recentEquivalentCount > 0
  }

  private async logInbound(
    integration: IIntegration<TIntegrationWechatPersonalOptions>,
    event: WechatPersonalInboundEvent,
    status: WechatPersonalMessageLogStatus,
    params: { error?: string } = {}
  ): Promise<WechatPersonalMessageLogEntity> {
    const bindingContext = this.resolveBindingContext()
    const scope = this.resolveTenantScope(integration, bindingContext)
    return this.messageLogRepository.save({
      integrationId: integration.id,
      uuid: event.uuid,
      ownerWxid: event.ownerWxid,
      contactId: event.contactId,
      senderId: event.senderId,
      messageId: event.messageId,
      chatType: event.chatType,
      direction: 'inbound',
      status,
      content: event.content,
      payloadSummary: summarizePayload(event.rawPayload),
      error: params.error,
      tenantId: scope.tenantId ?? null,
      organizationId: scope.organizationId ?? null,
      createdById: bindingContext.createdById ?? null,
      updatedById: bindingContext.updatedById ?? null
    })
  }

  private async markHistoryContextReset(
    integration: IIntegration<TIntegrationWechatPersonalOptions>,
    event: WechatPersonalInboundEvent,
    conversationUserKey: string,
    xpertId: string,
    scope?: WechatPersonalTenantScope | null
  ): Promise<void> {
    const normalizedUserKey = normalizeConversationKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return
    }

    const bindingContext = this.resolveBindingContext()
    const resolvedScope = this.resolveTenantScope(scope, bindingContext)
    await this.messageLogRepository.save({
      integrationId: integration.id,
      uuid: event.uuid,
      ownerWxid: event.ownerWxid,
      contactId: event.contactId,
      senderId: event.senderId,
      messageId: event.messageId,
      chatType: event.chatType,
      direction: 'system',
      status: 'context_reset',
      content: HISTORY_CONTEXT_RESET_CONTENT,
      payloadSummary: JSON.stringify({
        type: HISTORY_CONTEXT_RESET_CONTENT,
        conversationUserKey: normalizedUserKey,
        xpertId: normalizedXpertId
      }),
      xpertId: normalizedXpertId,
      conversationUserKey: normalizedUserKey,
      tenantId: resolvedScope.tenantId ?? null,
      organizationId: resolvedScope.organizationId ?? null,
      createdById: bindingContext.createdById ?? null,
      updatedById: bindingContext.updatedById ?? null
    })
  }

  private async buildHistoryContext(params: {
    integrationId: string
    conversationUserKey: string
    xpertId: string
    limit?: number | null
    timeoutSeconds?: number | null
    before?: Date | null
    excludedLogIds?: string[]
    scope?: WechatPersonalTenantScope | null
  }): Promise<string | undefined> {
    const limit = this.normalizeHistoryContextLimit(params.limit)
    const conversationUserKey = normalizeConversationKey(params.conversationUserKey)
    const xpertId = normalizeConversationKey(params.xpertId)
    const before = this.normalizeDate(params.before) ?? new Date()
    if (!limit || !params.integrationId || !conversationUserKey || !xpertId) {
      return undefined
    }

    const scope = this.resolveTenantScope(params.scope)
    const resetMarker = await this.messageLogRepository.findOne({
      where: this.scopedWhere(
        {
          integrationId: params.integrationId,
          conversationUserKey,
          xpertId,
          direction: 'system' as WechatPersonalMessageDirection,
          status: 'context_reset' as WechatPersonalMessageLogStatus,
          createdAt: LessThan(before)
        },
        scope
      ),
      order: {
        createdAt: 'DESC'
      }
    })

    const query = this.messageLogRepository
      .createQueryBuilder('log')
      .where('log.integrationId = :integrationId', { integrationId: params.integrationId })
      .andWhere('log.conversationUserKey = :conversationUserKey', { conversationUserKey })
      .andWhere('log.xpertId = :xpertId', { xpertId })
      .andWhere('log.createdAt < :before', { before })
      .andWhere(
        '((log.direction = :inboundDirection AND log.status = :inboundStatus) OR (log.direction = :outboundDirection AND log.status = :outboundStatus))',
        {
          inboundDirection: 'inbound',
          inboundStatus: 'dispatched',
          outboundDirection: 'outbound',
          outboundStatus: 'sent'
        }
      )

    if (scope.tenantId) {
      query.andWhere('log.tenantId = :tenantId', { tenantId: scope.tenantId })
    }
    if (scope.organizationId) {
      query.andWhere('log.organizationId = :organizationId', { organizationId: scope.organizationId })
    }

    const excludedLogIds = (params.excludedLogIds ?? []).map((id) => normalizeConversationKey(id)).filter(Boolean)
    if (excludedLogIds.length) {
      query.andWhere('log.id NOT IN (:...excludedLogIds)', { excludedLogIds })
    }

    const resetAt = this.normalizeDate(resetMarker?.createdAt)
    if (resetAt) {
      query.andWhere('log.createdAt > :resetAt', { resetAt })
    }

    const timeoutSeconds = this.normalizePositiveNumber(params.timeoutSeconds)
    if (timeoutSeconds) {
      query.andWhere('log.createdAt > :historySince', {
        historySince: new Date(before.getTime() - timeoutSeconds * 1000)
      })
    }

    const logs = await query.orderBy('log.createdAt', 'DESC').addOrderBy('log.id', 'DESC').limit(limit).getMany()
    return this.formatHistoryContext(logs.reverse())
  }

  private formatHistoryContext(logs: WechatPersonalMessageLogEntity[]): string | undefined {
    const lines: string[] = []
    for (const log of logs) {
      const content = this.truncateContextText(log.content, HISTORY_CONTEXT_ITEM_MAX_CHARS)
      if (!content) {
        continue
      }
      const timestamp = (this.normalizeDate(log.sentAt) ?? this.normalizeDate(log.createdAt) ?? new Date()).toISOString()
      const actor = log.direction === 'outbound' ? 'Agent' : `用户${log.senderId ? `(${log.senderId})` : ''}`
      lines.push(`[${timestamp}] ${actor}: ${content}`)
    }
    if (!lines.length) {
      return undefined
    }
    return this.truncateContextText(
      ['[历史上下文，仅供背景参考，勿当作本次用户新消息]', ...lines].join('\n'),
      HISTORY_CONTEXT_TOTAL_MAX_CHARS
    )
  }

  private truncateContextText(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') {
      return ''
    }
    const text = value.trim().replace(/\r\n/g, '\n')
    if (text.length <= maxLength) {
      return text
    }
    return `${text.slice(0, Math.max(0, maxLength - 8)).trimEnd()}...[截断]`
  }

  private normalizeHistoryContextLimit(value: unknown): number {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Math.min(Math.floor(numeric), MAX_HISTORY_CONTEXT_LIMIT)
    }
    return DEFAULT_HISTORY_CONTEXT_LIMIT
  }

  private normalizePositiveNumber(value: unknown): number | undefined {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric)
    }
    return undefined
  }

  private async updateLog(
    id: string,
    patch: Partial<Pick<WechatPersonalMessageLogEntity, 'status' | 'error' | 'xpertId' | 'conversationId' | 'conversationUserKey'>>,
    scope?: WechatPersonalTenantScope | null
  ): Promise<void> {
    if (!id) {
      return
    }
    await this.messageLogRepository.update(this.scopedWhere({ id }, scope), patch)
  }

  private getConversationCacheKey(
    conversationUserKey: string,
    xpertId: string,
    scope?: WechatPersonalTenantScope | null
  ): string {
    const tenantKey = scope?.tenantId ? `tenant:${scope.tenantId}` : 'tenant:any'
    const organizationKey = scope?.organizationId ? `org:${scope.organizationId}` : 'org:any'
    return `plugin_wechat_personal:chat:${tenantKey}:${organizationKey}:${conversationUserKey}:${xpertId}`
  }

  private async cacheConversation(
    conversationUserKey: string,
    xpertId: string,
    conversationId: string,
    lastActiveAt?: Date | null,
    scope?: WechatPersonalTenantScope | null
  ): Promise<void> {
    await this.cacheManager.set(
      this.getConversationCacheKey(conversationUserKey, xpertId, scope),
      {
        conversationId,
        lastActiveAt: lastActiveAt?.toISOString()
      },
      CACHE_TTL_MS
    )
  }

  private resolveTenantScope(
    primary?: WechatPersonalTenantScope | null,
    fallback?: WechatPersonalTenantScope | null
  ): WechatPersonalTenantScope {
    const bindingContext = this.resolveBindingContext()
    return {
      tenantId: primary?.tenantId ?? fallback?.tenantId ?? bindingContext.tenantId ?? null,
      organizationId: primary?.organizationId ?? fallback?.organizationId ?? bindingContext.organizationId ?? null
    }
  }

  private async readIntegrationTenantScope(integrationId?: string | null): Promise<WechatPersonalTenantScope> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new Error('缺少个人微信集成标识。')
    }

    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatPersonalOptions>>(
      normalizedIntegrationId,
      {
        relations: ['tenant']
      }
    )
    if (!integration) {
      throw new Error('个人微信集成不存在或无权访问。')
    }

    return this.resolveTenantScope(integration)
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

  private resolveBindingContext(): {
    tenantId: string | null
    organizationId: string | null
    createdById: string | null
    updatedById: string | null
  } {
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId()
    const userId = normalizeConversationKey(RequestContext.currentUserId())
    const executionUserId = userId && UUID_PATTERN.test(userId) ? userId : null
    return {
      tenantId: tenantId ?? null,
      organizationId: organizationId ?? null,
      createdById: executionUserId,
      updatedById: executionUserId
    }
  }

  private resolveExecutionUserId(integration?: { createdById?: string; updatedById?: string }): string | undefined {
    const candidates = [RequestContext.currentUserId(), integration?.createdById, integration?.updatedById]
      .map((value) => normalizeConversationKey(value))
      .filter((value): value is string => Boolean(value))
    const uuidMatched = candidates.find((value) => UUID_PATTERN.test(value))
    return uuidMatched ?? candidates[0]
  }

  private async listWechatPersonalIntegrations(): Promise<IIntegration<TIntegrationWechatPersonalOptions>[]> {
    const result = await this.integrationPermissionService.findAll<IIntegration<TIntegrationWechatPersonalOptions>>({
      where: {
        provider: WECHAT_PERSONAL_PROVIDER_KEY
      },
      relations: ['tenant'],
      order: {
        updatedAt: 'DESC'
      },
      take: 100
    })
    return (result.items ?? []).filter((integration) => integration?.provider === WECHAT_PERSONAL_PROVIDER_KEY)
  }

  private toIntegrationWorkbenchItem(
    integration: IIntegration<TIntegrationWechatPersonalOptions>,
    stats: {
      accounts: WechatPersonalAccountEntity[]
      conversations: WechatPersonalConversationListItem[]
      logs: WechatPersonalMessageLogEntity[]
    }
  ): WechatPersonalIntegrationWorkbenchItem {
    return {
      id: integration.id,
      name: integration.name,
      description: integration.description,
      slug: integration.slug,
      callbackConfig: this.buildCallbackConfig(integration.id, integration.options?.callbackSecret),
      accountCount: stats.accounts.length,
      conversationCount: stats.conversations.length,
      recentMessageCount: stats.logs.length,
      errorCount: stats.logs.filter((log) => log.status === 'failed' || log.error).length,
      config: this.sanitizeIntegrationConfig(integration.options),
      tunnel: this.getTunnelStatus(integration)
    }
  }

  private sanitizeIntegrationConfig(
    options?: TIntegrationWechatPersonalOptions | null
  ): Partial<TIntegrationWechatPersonalOptions> {
    return {
      connectionMode: options?.connectionMode ?? 'direct_http',
      baseUrl: options?.baseUrl,
      tunnelClientId: options?.tunnelClientId,
      apiVersion: options?.apiVersion ?? '/v1/',
      timeoutMs: options?.timeoutMs ?? 10000,
      preferLanguage: options?.preferLanguage,
      fallbackToLegacySendText: options?.fallbackToLegacySendText !== false,
      callbackSecret: options?.callbackSecret ? '******' : ''
    }
  }

  private getTunnelStatus(integration?: IIntegration<TIntegrationWechatPersonalOptions> | null): WechatPersonalTunnelStatus {
    return this.tunnelBroker.getStatus(integration?.options?.tunnelClientId, {
      clientName: integration?.name || integration?.id || null
    })
  }

  private emptyCallbackConfig(): WechatPersonalWorkbenchData['callbackConfig'] {
    return {
      webhookUrl: '',
      globalWebhookUrl: '',
      setCallbackUrlTemplate: '',
      setCallbackCurlTemplate: ''
    }
  }

  private matchesAccountFilters(account: WechatPersonalAccountEntity, filters: Record<string, unknown>): boolean {
    const status = this.normalizeListSearch(filters.status)
    const enabled = this.normalizeBooleanFilter(filters.enabled)
    if (status && this.normalizeListSearch(account.status) !== status) {
      return false
    }
    if (enabled !== null && account.enabled !== enabled) {
      return false
    }
    return (
      this.matchesFilter(account.integrationId, filters.integrationId) &&
      this.matchesFilter(account.uuid, filters.uuid) &&
      this.matchesFilter(account.ownerWxid, filters.ownerWxid)
    )
  }

  private matchesConversationFilters(
    item: WechatPersonalConversationListItem,
    filters: Record<string, unknown>
  ): boolean {
    const chatType = this.normalizeChatType(filters.chatType)
    if (chatType && item.chatType !== chatType) {
      return false
    }
    return (
      this.matchesFilter(item.integrationId, filters.integrationId) &&
      this.matchesFilter(item.uuid, filters.uuid) &&
      this.matchesFilter(item.contactId, filters.contactId) &&
      this.matchesFilter(item.senderId, filters.senderId) &&
      this.matchesFilter(item.xpertId, filters.xpertId)
    )
  }

  private matchesLogFilters(log: WechatPersonalMessageLogEntity, filters: Record<string, unknown>): boolean {
    const chatType = this.normalizeChatType(filters.chatType)
    const level = this.normalizeListSearch(filters.level)
    if (this.normalizeBooleanFilter(filters.queueOnly) === true && !this.isQueueStatus(log.status)) {
      return false
    }
    if (chatType && log.chatType !== chatType) {
      return false
    }
    if (level === 'error' && !(log.status === 'failed' || log.error)) {
      return false
    }
    if (level === 'info' && (log.status === 'failed' || log.error)) {
      return false
    }
    return (
      this.matchesFilter(log.integrationId, filters.integrationId) &&
      this.matchesFilter(log.uuid, filters.uuid) &&
      this.matchesFilter(log.ownerWxid, filters.ownerWxid) &&
      this.matchesFilter(log.contactId, filters.contactId) &&
      this.matchesFilter(log.senderId, filters.senderId) &&
      this.matchesFilter(log.xpertId, filters.xpertId) &&
      this.matchesFilter(log.conversationId, filters.conversationId)
    )
  }

  private normalizeFilters(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  }

  private matchesFilter(value: unknown, filter: unknown): boolean {
    const normalizedFilter = this.normalizeListSearch(filter)
    if (!normalizedFilter || normalizedFilter === 'all') {
      return true
    }
    return Boolean(this.normalizeListSearch(value)?.includes(normalizedFilter))
  }

  private normalizeBooleanFilter(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value
    }
    const normalized = this.normalizeListSearch(value)
    if (!normalized || normalized === 'all') {
      return null
    }
    if (['true', '1', 'yes', 'enabled'].includes(normalized)) {
      return true
    }
    if (['false', '0', 'no', 'disabled'].includes(normalized)) {
      return false
    }
    return null
  }

  private normalizeDirection(value: unknown): WechatPersonalMessageDirection | null {
    const normalized = this.normalizeListSearch(value)
    return normalized === 'inbound' || normalized === 'outbound' || normalized === 'system' ? normalized : null
  }

  private normalizeLogStatus(value: unknown): WechatPersonalMessageLogStatus | null {
    const normalized = this.normalizeListSearch(value)
    return [
      'received',
      'dispatched',
      'queued',
      'deferred',
      'sending',
      'sent',
      'skipped',
      'failed',
      'paused',
      'cancelled',
      'context_reset'
    ].includes(normalized || '')
      ? (normalized as WechatPersonalMessageLogStatus)
      : null
  }

  private isQueueStatus(status: WechatPersonalMessageLogStatus): boolean {
    return ['queued', 'deferred', 'sending', 'paused'].includes(status)
  }

  private normalizeChatType(value: unknown): 'private' | 'group' | null {
    const normalized = this.normalizeListSearch(value)
    return normalized === 'private' || normalized === 'group' ? normalized : null
  }

  private matchesConversationSearch(item: WechatPersonalConversationListItem, search: string | null): boolean {
    if (!search) {
      return true
    }
    return [item.integrationId, item.uuid, item.contactId, item.senderId, item.xpertId, item.conversationId].some(
      (value) => this.normalizeListSearch(value)?.includes(search)
    )
  }

  private matchesLogSearch(log: WechatPersonalMessageLogEntity, search: string | null): boolean {
    if (!search) {
      return true
    }
    return [
      log.integrationId,
      log.uuid,
      log.contactId,
      log.senderId,
      log.content,
      log.error,
      log.status,
      log.queueJobId
    ].some((value) => this.normalizeListSearch(value)?.includes(search))
  }

  private toConversationListItem(
    binding: WechatPersonalConversationBindingEntity,
    integrationId: string
  ): WechatPersonalConversationListItem | null {
    const parsed = parseWechatPersonalConversationUserKey(binding.conversationUserKey)
    if (!parsed || parsed.integrationId !== integrationId) {
      return null
    }
    return {
      id: binding.id,
      integrationId: parsed.integrationId,
      uuid: parsed.uuid,
      contactId: parsed.contactId,
      senderId: parsed.senderId,
      chatType: parsed.contactId.endsWith('@chatroom') ? 'group' : 'private',
      xpertId: binding.xpertId,
      conversationId: binding.conversationId,
      updatedAt: this.normalizeDate(binding.lastActiveAt) ?? this.normalizeDate(binding.updatedAt) ?? null
    }
  }

  private normalizePositiveInt(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value
    }
    return null
  }

  private normalizePage(value: unknown): number {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value
    }
    return 1
  }

  private normalizePageSize(value: unknown, fallback = 30): number {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return Math.min(value, 100)
    }
    return fallback
  }

  private paginateItems<T>(items: T[], page: number, pageSize: number): WechatPersonalPagedResult<T> {
    const start = (page - 1) * pageSize
    return {
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      pageSize
    }
  }

  private normalizeListSearch(value: unknown): string | null {
    const normalized = normalizeConversationKey(value)
    return normalized ? normalized.toLocaleLowerCase() : null
  }

  private normalizeDate(value: unknown): Date | undefined {
    if (!value) {
      return undefined
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? undefined : value
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? undefined : date
    }
    return undefined
  }

  private resolveSessionTimeoutMs(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value) * 1000
    }
    return 3600 * 1000
  }

  private isConversationExpired(lastActiveAt: Date | undefined, sessionTimeoutMs: number): boolean {
    if (!lastActiveAt) {
      return false
    }
    return Date.now() - lastActiveAt.getTime() > sessionTimeoutMs
  }

  private parseNewSessionCommand(input: string): { matched: boolean; input: string } {
    const trimmedInput = input.trim()
    if (!trimmedInput.startsWith('/new')) {
      return {
        matched: false,
        input
      }
    }
    const nextCharacter = trimmedInput.charAt('/new'.length)
    if (nextCharacter && !/\s/.test(nextCharacter)) {
      return {
        matched: false,
        input
      }
    }
    return {
      matched: true,
      input: trimmedInput.slice('/new'.length).trim()
    }
  }

  private getNewConversationStartedText(language: unknown): string {
    return language === 'en'
      ? 'A new conversation has started. Please continue sending your message.'
      : '已开启新会话，请继续发送消息。'
  }
}

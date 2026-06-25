import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  RequestContext,
  SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN,
  SpeechToTextPermissionService,
  TChatEventContext,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { type Cache } from 'cache-manager'
import { IIntegration, type IPagination } from '@xpert-ai/contracts'
import { LessThan, Like, MoreThan, Repository } from 'typeorm'
import {
  normalizeConversationKey,
  parseWechatConversationUserKey,
  resolveWechatConversationIdentity,
  type WechatConversationIdentity
} from './conversation-user-key.js'
import {
  isWechatDispatchableMessageKind,
  matchesWechatAllowedKeywords,
  matchesWechatMessageFilter,
  normalizeSelfMessagePolicy,
  normalizeString,
  normalizeWechatAgentInput,
  summarizePayload,
  shouldAttemptWechatVoiceTranscription,
  shouldDispatchWechatMessage,
  TIntegrationWechatOptions,
  WechatInboundEvent,
  WechatInboundFile,
  WechatInboundTriggerOptions
} from './types.js'
import {
  WechatTunnelBrokerService,
  WechatTunnelClientInfo,
  WechatTunnelStatus
} from './wechat-tunnel-broker.service.js'
import { WECHAT_PLUGIN_CONTEXT } from './tokens.js'
import { WECHAT_PROVIDER_KEY } from './constants.js'
import { WechatMessage } from './message.js'
import { WechatChannelStrategy } from './wechat-channel.strategy.js'
import { WechatClient } from './wechat.client.js'
import {
  WechatAccountEntity,
  WechatConversationBindingEntity,
  WechatMessageDirection,
  WechatMessageLogEntity,
  WechatMessageLogStatus
} from './entities/index.js'
import { WechatTriggerStrategy } from './workflow/wechat-trigger.strategy.js'
import { WechatChatCallbackContext } from './handoff/wechat-chat.types.js'

const CACHE_TTL_MS = 10 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_HISTORY_CONTEXT_LIMIT = 20
const DEFAULT_HISTORY_CONTEXT_WINDOW_SECONDS = 3600
const MAX_HISTORY_CONTEXT_LIMIT = 100
const HISTORY_CONTEXT_ITEM_MAX_CHARS = 1000
const HISTORY_CONTEXT_TOTAL_MAX_CHARS = 12000
const HISTORY_CONTEXT_RESET_CONTENT = 'history_context_reset'

type WechatTenantScope = {
  tenantId?: string | null
  organizationId?: string | null
}

type WechatConversationState = {
  conversationId: string
  lastActiveAt?: Date
}

export type WechatCallbackConfig = {
  webhookUrl: string
  globalWebhookUrl: string
  setCallbackUrlTemplate: string
  setCallbackCurlTemplate: string
  credentialActive?: boolean
}

type WechatWebhookCredentialResult = {
  token: string
  credential?: unknown
}

type WechatIntegrationPermissionServiceWithWebhookCredential = IntegrationPermissionService & {
  ensureWebhookCredential?: (
    id: string,
    options?: {
      provider?: string | null
      rotateIfRevoked?: boolean
    }
  ) => Promise<WechatWebhookCredentialResult | null>
  rotateWebhookCredential?: (
    id: string,
    options?: {
      provider?: string | null
    }
  ) => Promise<WechatWebhookCredentialResult | null>
  revokeWebhookCredential?: (
    id: string,
    options?: {
      provider?: string | null
    }
  ) => Promise<boolean>
}

export type WechatConversationListItem = {
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

export type WechatIntegrationWorkbenchItem = {
  id: string
  name?: string
  description?: string
  slug?: string
  callbackConfig: WechatCallbackConfig
  accountCount: number
  conversationCount: number
  recentMessageCount: number
  errorCount: number
  config: Partial<TIntegrationWechatOptions>
  tunnel?: WechatTunnelStatus
}

export type WechatAccountTunnelBinding = {
  status: 'bound_connected' | 'connected_unbound' | 'disconnected' | 'not_applicable'
  connected: boolean
  clientId?: string | null
  clientName?: string | null
  lastSeenAt?: string | null
  lastSyncAt?: string | null
  lastError?: string | null
  bindingCount?: number
}

export type WechatAccountWorkbenchItem = WechatAccountEntity & {
  tunnelBinding?: WechatAccountTunnelBinding
}

export type WechatTunnelClientWorkbenchItem = WechatTunnelClientInfo & {
  integrationId?: string | null
  integrationName?: string | null
  expected?: boolean
}

export type WechatWorkbenchData = {
  scope?: 'integration' | 'organization'
  integrationId?: string | null
  integrations?: WechatIntegrationWorkbenchItem[]
  callbackConfig: WechatCallbackConfig
  summary: {
    integrationCount?: number
    accountCount: number
    conversationCount: number
    recentMessageCount: number
    errorCount: number
  }
  accounts: WechatAccountWorkbenchItem[]
  conversations: WechatConversationListItem[]
  messages: WechatMessageLogEntity[]
  queue: WechatMessageLogEntity[]
  logs: WechatMessageLogEntity[]
  tables?: Partial<Record<WechatWorkbenchTableKey, WechatWorkbenchTableResult>>
  config: Partial<TIntegrationWechatOptions>
  tunnel?: WechatTunnelStatus
  tunnelClients?: WechatTunnelClientWorkbenchItem[]
}

export type WechatPagedResult<T> = IPagination<T> & {
  page: number
  pageSize: number
}

export type WechatWorkbenchTableKey = 'accounts' | 'conversations' | 'messages' | 'queue' | 'logs' | 'tunnelClients'

export type WechatWorkbenchTableQuery = {
  search?: string
  page?: number
  pageSize?: number
  filters?: Record<string, unknown> | null
}

export type WechatWorkbenchTableResult =
  | (WechatPagedResult<WechatAccountWorkbenchItem> & { key: 'accounts' })
  | (WechatPagedResult<WechatConversationListItem> & { key: 'conversations' })
  | (WechatPagedResult<WechatMessageLogEntity> & { key: 'messages' | 'queue' | 'logs' })
  | (WechatPagedResult<WechatTunnelClientWorkbenchItem> & { key: 'tunnelClients' })

export type WechatRuntimeStatus = {
  callbackConfig: WechatWorkbenchData['callbackConfig']
  summary: WechatWorkbenchData['summary']
  triggerBinding: {
    integrationId: string
    xpertId: string
    sessionTimeoutSeconds: number
    summaryWindowSeconds: number
    historyContextLimit: number
    historyContextWindowSeconds: number
    ignoreSelfMessages: boolean
    selfMessagePolicy: string
    allowedKeywords: string[]
    groupTriggerMode: string
    groupKeywords: string[]
    mentionFallbackNames: string[]
    updatedAt: Date | null
  } | null
  accounts: WechatAccountWorkbenchItem[]
  recentErrors: WechatMessageLogEntity[]
  config: Partial<TIntegrationWechatOptions>
  tunnel?: WechatTunnelStatus
  integrations?: WechatIntegrationWorkbenchItem[]
  scope?: 'integration' | 'organization'
}

@Injectable()
export class WechatConversationService {
  private readonly logger = new Logger(WechatConversationService.name)
  private _integrationPermissionService: IntegrationPermissionService
  private _speechToTextPermissionService: SpeechToTextPermissionService
  private readonly inboundDedupeLocks = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly wechatChannel: WechatChannelStrategy,
    private readonly wechatClient: WechatClient,
    private readonly triggerStrategy: WechatTriggerStrategy,
    private readonly tunnelBroker: WechatTunnelBrokerService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @InjectRepository(WechatConversationBindingEntity)
    private readonly conversationBindingRepository: Repository<WechatConversationBindingEntity>,
    @InjectRepository(WechatAccountEntity)
    private readonly accountRepository: Repository<WechatAccountEntity>,
    @InjectRepository(WechatMessageLogEntity)
    private readonly messageLogRepository: Repository<WechatMessageLogEntity>,
    @Inject(WECHAT_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  private get speechToTextPermissionService(): SpeechToTextPermissionService {
    if (!this._speechToTextPermissionService) {
      this._speechToTextPermissionService = this.pluginContext.resolve(SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN)
    }
    return this._speechToTextPermissionService
  }

  async getConversationState(
    conversationUserKey: string,
    xpertId: string,
    scopeOverride?: WechatTenantScope | null
  ): Promise<WechatConversationState | undefined> {
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
    scopeOverride?: WechatTenantScope | null
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
    scopeOverride?: WechatTenantScope | null
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
    scopeOverride?: WechatTenantScope | null
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

    const parsed = parseWechatConversationUserKey(binding.conversationUserKey)
    if (!parsed || parsed.integrationId !== normalizedIntegrationId) {
      throw new Error('该微信会话不属于当前微信集成。')
    }
    await this.clearConversation(binding.conversationUserKey, binding.xpertId, scope)
  }

  async handleInboundEvent(
    event: WechatInboundEvent,
    ctx: TChatEventContext<TIntegrationWechatOptions>
  ): Promise<{ handled: boolean; reason?: string }> {
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatOptions>>(
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

    let inboundLog: WechatMessageLogEntity | null = null
    try {
      const duplicate = await this.isDuplicateInbound(integration.id, event, eventScope)
      if (duplicate) {
        return { handled: false, reason: 'duplicate' }
      }

      inboundLog = await this.logInbound(integration, event, 'received')

      const binding = await this.triggerStrategy.getBinding(integration.id, eventScope)
      if (!binding?.xpertId) {
        await this.updateLog(inboundLog.id, {
          status: 'skipped',
          error: 'trigger_binding_missing'
        }, eventScope)
        return { handled: false, reason: 'trigger_binding_missing' }
      }

      const triggerOptions: WechatInboundTriggerOptions = {
        ignoreSelfMessages: binding.ignoreSelfMessages !== false,
        selfMessagePolicy: normalizeSelfMessagePolicy(binding.selfMessagePolicy, binding.ignoreSelfMessages),
        chatFilterMode: binding.chatFilterMode,
        allowedContactIds: binding.allowedContactIds,
        blockedContactIds: binding.blockedContactIds,
        allowedGroupIds: binding.allowedGroupIds,
        blockedGroupIds: binding.blockedGroupIds,
        allowedSenderIds: binding.allowedSenderIds,
        blockedSenderIds: binding.blockedSenderIds,
        allowedKeywords: binding.allowedKeywords ?? [],
        groupTriggerMode: binding.groupTriggerMode,
        groupKeywords: binding.groupKeywords ?? [],
        mentionFallbackNames: binding.mentionFallbackNames ?? []
      }

      let dispatchEvent = event
      let conversationIdentity = this.resolveEventConversationIdentity(integration.id, dispatchEvent)
      if (!conversationIdentity) {
        await this.updateLog(inboundLog.id, {
          status: 'skipped',
          xpertId: binding.xpertId,
          error: 'conversation_identity_missing'
        }, eventScope)
        return { handled: false, reason: 'conversation_identity_missing' }
      }

      await this.updateLog(inboundLog.id, {
        xpertId: binding.xpertId,
        contactId: conversationIdentity.contactId,
        senderId: conversationIdentity.senderId,
        chatType: conversationIdentity.chatType,
        isSelf: dispatchEvent.isSelf,
        conversationUserKey: conversationIdentity.conversationUserKey
      }, eventScope)

      const selfMessagePolicy = normalizeSelfMessagePolicy(binding.selfMessagePolicy, binding.ignoreSelfMessages)
      if (dispatchEvent.isSelf && selfMessagePolicy === 'ignore') {
        await this.updateLog(inboundLog.id, {
          status: 'skipped',
          error: 'self_message_ignored'
        }, eventScope)
        return { handled: false, reason: 'self_message_ignored' }
      }

      if (dispatchEvent.isSelf && selfMessagePolicy === 'history_only') {
        if (!this.shouldStoreSelfHistory(dispatchEvent, triggerOptions)) {
          await this.updateLog(inboundLog.id, {
            status: 'skipped',
            content: this.inboundLogContent(dispatchEvent),
            error: 'filtered_by_trigger_policy'
          }, eventScope)
          return { handled: false, reason: 'filtered' }
        }

        await this.updateLog(inboundLog.id, {
          status: 'history_only',
          content: this.inboundLogContent(dispatchEvent),
          error: undefined
        }, eventScope)
        return { handled: true, reason: 'history_only' }
      }

      if (event.messageKind === 'voice') {
        const voiceDecision = shouldAttemptWechatVoiceTranscription(event, triggerOptions)
        if (!voiceDecision) {
          await this.updateLog(inboundLog.id, {
            status: 'skipped',
            xpertId: binding.xpertId,
            error: 'filtered_by_trigger_policy'
          }, eventScope)
          return { handled: false, reason: 'filtered' }
        }

        const voiceInputResult = await this.resolveInboundVoiceInput(
          integration,
          event,
          binding.xpertId,
          eventScope
        )
        if (voiceInputResult.success === false) {
          await this.updateLog(inboundLog.id, {
            status: 'failed',
            xpertId: binding.xpertId,
            error: voiceInputResult.error
          }, eventScope)
          return { handled: false, reason: 'voice_transcription_failed' }
        }

        dispatchEvent = {
          ...event,
          content: voiceInputResult.input
        }
        conversationIdentity = this.resolveEventConversationIdentity(integration.id, dispatchEvent)
        if (!conversationIdentity) {
          await this.updateLog(inboundLog.id, {
            status: 'skipped',
            error: 'conversation_identity_missing'
          }, eventScope)
          return { handled: false, reason: 'conversation_identity_missing' }
        }
        await this.updateLog(inboundLog.id, {
          contactId: conversationIdentity.contactId,
          senderId: conversationIdentity.senderId,
          chatType: conversationIdentity.chatType,
          conversationUserKey: conversationIdentity.conversationUserKey,
          content: this.inboundLogContent(dispatchEvent),
          payloadSummary: summarizePayload({
            payload: event.rawPayload,
            mediaSignature: event.mediaSignature,
            voiceTranscription: voiceInputResult.input
          })
        }, eventScope)
      }

      const dispatchable = shouldDispatchWechatMessage(dispatchEvent, triggerOptions)
      if (!dispatchable) {
        await this.updateLog(inboundLog.id, {
          status: 'skipped',
          xpertId: binding.xpertId,
          content: this.inboundLogContent(dispatchEvent),
          error: 'filtered_by_trigger_policy'
        }, eventScope)
        return { handled: false, reason: 'filtered' }
      }

      const inboundFilesResult = await this.resolveInboundFiles(integration, dispatchEvent)
      if (inboundFilesResult.success === false) {
        await this.updateLog(inboundLog.id, {
          status: 'failed',
          xpertId: binding.xpertId,
          error: inboundFilesResult.error || 'inbound_image_download_failed'
        }, eventScope)
        return { handled: false, reason: 'image_download_failed' }
      }
      const inboundFiles = inboundFilesResult.files

      const conversationUserKey = conversationIdentity.conversationUserKey

      const wechatMessage = new WechatMessage(
        {
          integrationId: integration.id,
          uuid: dispatchEvent.uuid,
          ownerWxid: dispatchEvent.ownerWxid,
          contactId: conversationIdentity.contactId,
          chatType: conversationIdentity.chatType,
          senderId: conversationIdentity.senderId,
          wechatChannel: this.wechatChannel
        },
        {
          messageId: dispatchEvent.messageId,
          status: 'thinking',
          language: integration.options?.preferLanguage
        }
      )

      const newSessionCommand = this.parseNewSessionCommand(dispatchable.input)
      if (newSessionCommand.matched && conversationUserKey) {
        await this.clearConversation(conversationUserKey, binding.xpertId, eventScope)
        await this.triggerStrategy.clearBufferedConversation(conversationUserKey)
        await this.markHistoryContextReset(integration, dispatchEvent, conversationUserKey, binding.xpertId, eventScope)
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
            timeoutSeconds: this.normalizeHistoryContextWindowSeconds(
              binding.historyContextWindowSeconds,
              binding.sessionTimeoutSeconds
            ),
            before: this.normalizeDate(inboundLog.createdAt) ?? new Date(),
            excludedLogIds: [inboundLog.id],
            scope: eventScope
          })

      const handled = await this.triggerStrategy.handleInboundMessage({
        integrationId: integration.id,
        input: newSessionCommand.matched ? newSessionCommand.input : dispatchable.input,
        files: inboundFiles,
        wechatMessage,
        conversationUserKey,
        historyContext,
        currentInboundLogIds: [inboundLog.id],
        tenantId: integration.tenantId || ctx.tenantId,
        organizationId: integration.organizationId || ctx.organizationId,
        endUserId: conversationIdentity.senderId
      })

      await this.updateLog(inboundLog.id, {
        status: handled ? 'dispatched' : 'failed',
        xpertId: binding.xpertId,
        conversationUserKey,
        error: handled ? undefined : 'handoff_dispatch_failed'
      }, eventScope)

      return { handled, reason: handled ? 'dispatched' : 'dispatch_failed' }
    } catch (error) {
      if (!inboundLog?.id) {
        throw error
      }
      const message = this.describeError(error) || 'inbound_processing_failed'
      await this.updateLog(inboundLog.id, {
        status: 'failed',
        error: message.slice(0, 512)
      }, eventScope).catch((updateError) => {
        this.logger.error(
          `Failed to mark inbound WeChat message ${inboundLog?.id} as failed: ${this.describeError(updateError)}`
        )
      })
      this.logger.error(`Inbound WeChat message ${inboundLog.id} failed: ${message}`)
      return { handled: false, reason: 'processing_failed' }
    } finally {
      this.releaseInboundDedupeLock(dedupeKeys)
    }
  }

  async logOutbound(params: {
    context: WechatChatCallbackContext
    content: string
    status: WechatMessageLogStatus
    messageId?: string
    error?: string
    payloadSummary?: string
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
      isSelf: false,
      direction: 'outbound',
      status: params.status,
      content: params.content,
      payloadSummary: params.payloadSummary,
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

  async markInboundCallbackFailed(context: WechatChatCallbackContext, error: unknown): Promise<void> {
    const message = this.describeError(error) || 'Agent execution failed'
    const bindingContext = this.resolveBindingContext()
    const scope = this.resolveTenantScope(context, bindingContext)
    const ids = Array.from(
      new Set([
        ...(Array.isArray(context.currentInboundLogIds) ? context.currentInboundLogIds : []),
        context.message?.id
      ].filter((id): id is string => typeof id === 'string' && Boolean(id)))
    )

    for (const id of ids) {
      await this.updateLog(
        id,
        {
          status: 'failed',
          error: message.slice(0, 512)
        },
        scope
      )
    }
  }

  async setAccountEnabled(integrationId: string, uuid: string, enabled: boolean): Promise<void> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    const normalizedUuid = normalizeConversationKey(uuid)
    if (!normalizedIntegrationId || !normalizedUuid) {
      throw new Error('缺少微信账号标识。')
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
      throw new Error('缺少微信集成标识。')
    }

    const scope = await this.readIntegrationTenantScope(normalizedIntegrationId)
    const target = logId
      ? await this.messageLogRepository.findOne({
          where: this.scopedWhere(
            {
              id: normalizeConversationKey(logId),
              integrationId: normalizedIntegrationId,
              direction: 'outbound' as WechatMessageDirection
            },
            scope
          )
        })
      : await this.messageLogRepository.findOne({
          where: this.scopedWhere(
            {
              integrationId: normalizedIntegrationId,
              direction: 'outbound' as WechatMessageDirection
            },
            scope
          ),
          order: {
            createdAt: 'DESC'
          }
        })

    if (!target?.uuid || !target.contactId || !target.content) {
      throw new Error('没有可重发的 AI 出站回复。')
    }

    const payload = this.parseOutboundPayloadSummary(target.payloadSummary)
    const result =
      payload?.type === 'image'
        ? await this.wechatChannel.sendImageByIntegrationId(normalizedIntegrationId, {
            uuid: target.uuid,
            contactId: target.contactId,
            imageUrl: normalizeString(payload.imageUrl) || target.content,
            source: 'resend'
          })
        : await this.wechatChannel.sendTextByIntegrationId(normalizedIntegrationId, {
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
        isSelf: false,
        direction: 'outbound',
        status: result.success ? 'sent' : 'failed',
        content: target.content,
        payloadSummary: target.payloadSummary,
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
  ): Promise<WechatWorkbenchData> {
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatOptions>>(
      integrationId,
      {
        relations: ['tenant']
      }
    )
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!integration || !normalizedIntegrationId) {
      throw new Error('微信集成不存在或无权访问。')
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
      .filter((item): item is WechatConversationListItem => Boolean(item))
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
    const tunnel = await this.getTunnelStatus(integration)
    const accountsWithTunnel = await this.attachAccountTunnelBindings(accounts, [integration])
    const tunnelClients = await this.buildTunnelClientItems([integration])

    const integrationWorkbenchItem = await this.toIntegrationWorkbenchItem(integration, {
      accounts,
      conversations,
      logs
    })

    return {
      scope: 'integration',
      integrationId: normalizedIntegrationId,
      integrations: [integrationWorkbenchItem],
      callbackConfig: await this.buildCallbackConfig(integrationId),
      summary: {
        integrationCount: 1,
        accountCount: accounts.length,
        conversationCount: conversations.length,
        recentMessageCount: logs.length,
        errorCount: logs.filter((log) => log.status === 'failed' || log.error).length
      },
      accounts: accountsWithTunnel,
      conversations,
      messages: filteredLogs,
      queue: filteredLogs.filter((log) => log.direction === 'outbound' && this.isQueueStatus(log.status)),
      logs: filteredLogs,
      tunnel,
      tunnelClients,
      config: {
        connectionMode: integration?.options?.connectionMode ?? 'direct_http',
        baseUrl: integration?.options?.baseUrl,
        tunnelClientId: integration?.options?.tunnelClientId,
        apiVersion: integration?.options?.apiVersion ?? '/v1/',
        timeoutMs: integration?.options?.timeoutMs ?? 10000,
        preferLanguage: integration?.options?.preferLanguage,
        fallbackToLegacySendText: integration?.options?.fallbackToLegacySendText !== false,
        outboundQueue: integration?.options?.outboundQueue ?? { enabled: true },
        webhookCredential: integration?.options?.webhookCredential
          ? {
              ...integration.options.webhookCredential,
              tokenHash: '******'
            }
          : undefined
      }
    }
  }

  async getOrganizationWorkbenchData(
    query: { search?: string; page?: number; pageSize?: number } = {}
  ): Promise<WechatWorkbenchData> {
    const integrations = await this.listWechatIntegrations()
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
        tunnel: await this.getTunnelStatus(null),
        tunnelClients: await this.buildTunnelClientItems([], { includeOrphans: true }),
        config: {
          organizationScope: true,
          integrationCount: 0
        } as Partial<TIntegrationWechatOptions>
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
        const parsed = parseWechatConversationUserKey(binding.conversationUserKey)
        if (!parsed || !integrationIdSet.has(parsed.integrationId)) {
          return null
        }
        return this.toConversationListItem(binding, parsed.integrationId)
      })
      .filter((item): item is WechatConversationListItem => Boolean(item))

    const conversations = allConversations
      .filter((item) => this.matchesConversationSearch(item, search))
      .slice(0, pageSize)
    const filteredLogs = logs
      .filter((log) => this.matchesLogSearch(log, search))
      .slice(0, pageSize)
    const accountsWithTunnel = await this.attachAccountTunnelBindings(accounts, integrations)

    const integrationItems = await Promise.all(
      integrations.map((integration) =>
        this.toIntegrationWorkbenchItem(integration, {
          accounts: accounts.filter((account) => account.integrationId === integration.id),
          conversations: allConversations.filter((conversation) => conversation.integrationId === integration.id),
          logs: logs.filter((log) => log.integrationId === integration.id)
        })
      )
    )

    return {
      scope: 'organization',
      integrationId: null,
      integrations: integrationItems,
      callbackConfig: this.emptyCallbackConfig(),
      summary: {
        integrationCount: integrations.length,
        accountCount: accounts.length,
        conversationCount: allConversations.length,
        recentMessageCount: logs.length,
        errorCount: logs.filter((log) => log.status === 'failed' || log.error).length
      },
      accounts: accountsWithTunnel,
      conversations,
      messages: filteredLogs,
      queue: filteredLogs.filter((log) => log.direction === 'outbound' && this.isQueueStatus(log.status)),
      logs: filteredLogs,
      tunnel: await this.getTunnelStatus(null),
      tunnelClients: await this.buildTunnelClientItems(integrations, { includeOrphans: true }),
      config: {
        organizationScope: true,
        integrationCount: integrations.length
      } as Partial<TIntegrationWechatOptions>
    }
  }

  async getRuntimeStatus(integrationId: string): Promise<WechatRuntimeStatus> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new Error('缺少微信集成标识。')
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
            historyContextWindowSeconds: this.normalizeHistoryContextWindowSeconds(
              triggerBinding.historyContextWindowSeconds,
              triggerBinding.sessionTimeoutSeconds
            ),
            ignoreSelfMessages: triggerBinding.ignoreSelfMessages !== false,
            selfMessagePolicy: normalizeSelfMessagePolicy(
              triggerBinding.selfMessagePolicy,
              triggerBinding.ignoreSelfMessages
            ),
            allowedKeywords: triggerBinding.allowedKeywords ?? [],
            groupTriggerMode: triggerBinding.groupTriggerMode,
            groupKeywords: triggerBinding.groupKeywords ?? [],
            mentionFallbackNames: triggerBinding.mentionFallbackNames ?? [],
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

  async getOrganizationRuntimeStatus(): Promise<WechatRuntimeStatus> {
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
    table: WechatWorkbenchTableKey,
    query: WechatWorkbenchTableQuery = {}
  ): Promise<WechatWorkbenchTableResult> {
    if (table === 'accounts') {
      return { key: table, ...(await this.listAccounts(integrationId, query)) }
    }
    if (table === 'tunnelClients') {
      return { key: table, ...(await this.listTunnelClients(integrationId, query)) }
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
    table: WechatWorkbenchTableKey,
    query: WechatWorkbenchTableQuery = {}
  ): Promise<WechatWorkbenchTableResult> {
    if (table === 'accounts') {
      return { key: table, ...(await this.listOrganizationAccounts(query)) }
    }
    if (table === 'tunnelClients') {
      return { key: table, ...(await this.listOrganizationTunnelClients(query)) }
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
    query: WechatWorkbenchTableQuery = {}
  ): Promise<WechatPagedResult<WechatAccountWorkbenchItem>> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new Error('缺少微信集成标识。')
    }

    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatOptions>>(
      normalizedIntegrationId,
      {
        relations: ['tenant']
      }
    )
    if (!integration) {
      throw new Error('微信集成不存在或无权访问。')
    }
    const page = this.normalizePage(query.page)
    const pageSize = this.normalizePageSize(query.pageSize, 50)
    const search = this.normalizeListSearch(query.search)
    const filters = this.normalizeFilters(query.filters)
    const scope = this.resolveTenantScope(integration)
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

    return this.paginateItems(await this.attachAccountTunnelBindings(filtered, [integration]), page, pageSize)
  }

  async listOrganizationAccounts(
    query: WechatWorkbenchTableQuery = {}
  ): Promise<WechatPagedResult<WechatAccountWorkbenchItem>> {
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

  async listTunnelClients(
    integrationId: string,
    query: WechatWorkbenchTableQuery = {}
  ): Promise<WechatPagedResult<WechatTunnelClientWorkbenchItem>> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new Error('缺少微信集成标识。')
    }
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatOptions>>(
      normalizedIntegrationId,
      {
        relations: ['tenant']
      }
    )
    if (!integration) {
      throw new Error('微信集成不存在或无权访问。')
    }
    return this.paginateTunnelClients(await this.buildTunnelClientItems([integration]), query)
  }

  async listOrganizationTunnelClients(
    query: WechatWorkbenchTableQuery = {}
  ): Promise<WechatPagedResult<WechatTunnelClientWorkbenchItem>> {
    return this.paginateTunnelClients(await this.buildTunnelClientItems(await this.listWechatIntegrations(), { includeOrphans: true }), query)
  }

  async disconnectTunnelClient(clientId?: string | null): Promise<boolean> {
    const broker = this.tunnelBroker as WechatTunnelBrokerService & {
      disconnectManagedClient?: WechatTunnelBrokerService['disconnectManagedClient']
    }
    if (typeof broker.disconnectManagedClient !== 'function') {
      return this.tunnelBroker.disconnectClient(clientId, 'disconnected by WeChat workbench administrator')
    }
    return broker.disconnectManagedClient(clientId, 'disconnected by WeChat workbench administrator')
  }

  async listConversations(
    integrationId: string,
    query: WechatWorkbenchTableQuery = {}
  ): Promise<WechatPagedResult<WechatConversationListItem>> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new Error('缺少微信集成标识。')
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
      .filter((item): item is WechatConversationListItem => Boolean(item))
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
    query: WechatWorkbenchTableQuery = {}
  ): Promise<WechatPagedResult<WechatConversationListItem>> {
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
      direction?: WechatMessageDirection
      status?: WechatMessageLogStatus
      search?: string
      page?: number
      pageSize?: number
      filters?: Record<string, unknown> | null
    } = {}
  ): Promise<WechatPagedResult<WechatMessageLogEntity>> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new Error('缺少微信集成标识。')
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

  async findOutboundByIdempotencyKey(
    integrationId: string,
    idempotencyKey: string
  ): Promise<WechatMessageLogEntity | null> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    const normalizedKey = normalizeString(idempotencyKey)
    if (!normalizedIntegrationId || !normalizedKey) {
      return null
    }

    const scope = await this.readIntegrationTenantScope(normalizedIntegrationId)
    const logs = await this.messageLogRepository.find({
      where: this.scopedWhere({ integrationId: normalizedIntegrationId, direction: 'outbound' as const }, scope),
      order: { createdAt: 'DESC' },
      take: 5000
    })

    return (
      logs.find((log) => this.parseOutboundPayloadSummary(log.payloadSummary)?.idempotencyKey === normalizedKey) ?? null
    )
  }

  async searchOrganizationMessageLogs(
    query: {
      direction?: WechatMessageDirection
      status?: WechatMessageLogStatus
      search?: string
      page?: number
      pageSize?: number
      filters?: Record<string, unknown> | null
    } = {}
  ): Promise<WechatPagedResult<WechatMessageLogEntity>> {
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

  async buildCallbackConfig(
    integrationId: string,
    options: {
      requireActiveCredential?: boolean
    } = {}
  ): Promise<WechatCallbackConfig> {
    const apiBaseUrl = (process.env.API_BASE_URL || '').replace(/\/+$/, '')
    const id = normalizeConversationKey(integrationId) || '<integrationId>'
    const webhookSecret = await this.resolveWebhookCredentialSecret(id)
    if (!webhookSecret && options.requireActiveCredential) {
      throw new Error('WeChat webhook credential is unavailable; rotate the credential before registering callback')
    }
    const secretForUrl = webhookSecret || '<webhook-secret-unavailable>'
    const webhookUrl = `${apiBaseUrl}/api/wechat/webhook/${id}?secret=${encodeURIComponent(secretForUrl)}`
    const setCallbackUrlTemplate = `${apiBaseUrl}/api/wechat/webhook/${id}?secret=***`
    return {
      webhookUrl,
      globalWebhookUrl: webhookUrl,
      setCallbackUrlTemplate,
      setCallbackCurlTemplate:
        `curl -X POST "$WX2_BASE_URL/message/SetCallback?key=<uuid>" ` +
        `-H "Content-Type: application/json" ` +
        `-d '{"CallbackURL":"${setCallbackUrlTemplate}","Enabled":true}'`,
      credentialActive: Boolean(webhookSecret)
    }
  }

  async rotateWebhookCredential(integrationId: string): Promise<WechatCallbackConfig> {
    const service = this
      .integrationPermissionService as WechatIntegrationPermissionServiceWithWebhookCredential
    const rotateWebhookCredential = service.rotateWebhookCredential
    if (typeof rotateWebhookCredential !== 'function') {
      throw new Error('WeChat webhook credential rotation service is unavailable')
    }

    const result = await rotateWebhookCredential.call(service, integrationId, {
      provider: WECHAT_PROVIDER_KEY
    })
    if (!normalizeString(result?.token)) {
      throw new Error('WeChat webhook credential could not be rotated')
    }
    return this.buildCallbackConfig(integrationId, {
      requireActiveCredential: true
    })
  }

  async revokeWebhookCredential(integrationId: string): Promise<boolean> {
    const service = this
      .integrationPermissionService as WechatIntegrationPermissionServiceWithWebhookCredential
    const revokeWebhookCredential = service.revokeWebhookCredential
    if (typeof revokeWebhookCredential !== 'function') {
      throw new Error('WeChat webhook credential revocation service is unavailable')
    }

    const revoked = await revokeWebhookCredential.call(service, integrationId, {
      provider: WECHAT_PROVIDER_KEY
    })
    if (!revoked) {
      throw new Error('WeChat webhook credential could not be revoked')
    }
    return true
  }

  private async resolveWebhookCredentialSecret(integrationId: string): Promise<string | null> {
    const service = this
      .integrationPermissionService as WechatIntegrationPermissionServiceWithWebhookCredential
    const ensureWebhookCredential = service.ensureWebhookCredential
    if (typeof ensureWebhookCredential !== 'function') {
      throw new Error('WeChat webhook credential service is unavailable')
    }

    const result = await ensureWebhookCredential.call(service, integrationId, {
      provider: WECHAT_PROVIDER_KEY
    })
    const token = normalizeString(result?.token)
    return token || null
  }

  private async upsertAccount(
    integration: IIntegration<TIntegrationWechatOptions>,
    event: WechatInboundEvent,
    ctx: TChatEventContext<TIntegrationWechatOptions>
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
    event: WechatInboundEvent,
    scope?: WechatTenantScope | null
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
    const content =
      event.messageKind === 'image' || event.messageKind === 'voice' ? '' : normalizeConversationKey(event.content)
    if (uuid && contactId && senderId && content) {
      keys.push(
        `${scopePrefix}|signature:${uuid}|${contactId}|${senderId}|${event.timestamp}|${content.slice(0, 512)}`
      )
    }
    const mediaSignature = normalizeConversationKey(event.mediaSignature)
    if (uuid && contactId && senderId && mediaSignature) {
      keys.push(`${scopePrefix}|media:${uuid}|${contactId}|${senderId}|${event.timestamp}|${mediaSignature.slice(0, 512)}`)
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
    event: WechatInboundEvent,
    scope?: WechatTenantScope | null
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
          direction: 'inbound' as WechatMessageDirection
        },
        scope
      )
    })
    if (exactCount > 0) {
      return true
    }

    const content =
      event.messageKind === 'image' || event.messageKind === 'voice' ? '' : normalizeConversationKey(event.content)
    const mediaSignature = normalizeConversationKey(event.mediaSignature)
    if (!content && !mediaSignature) {
      return false
    }

    const recentEquivalentCount = await this.messageLogRepository.count({
      where: this.scopedWhere(
        {
          integrationId,
          uuid: event.uuid,
          contactId: event.contactId,
          senderId: event.senderId,
          direction: 'inbound' as WechatMessageDirection,
          ...(content ? { content } : { payloadSummary: Like(`%${mediaSignature}%`) }),
          createdAt: MoreThan(new Date(Date.now() - 5_000))
        },
        scope
      )
    })
    return recentEquivalentCount > 0
  }

  private async logInbound(
    integration: IIntegration<TIntegrationWechatOptions>,
    event: WechatInboundEvent,
    status: WechatMessageLogStatus,
    params: { error?: string } = {}
  ): Promise<WechatMessageLogEntity> {
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
      isSelf: event.isSelf,
      direction: 'inbound',
      status,
      content: this.inboundLogContent(event),
      payloadSummary: summarizePayload({
        payload: event.rawPayload,
        mediaSignature: event.mediaSignature
      }),
      error: params.error,
      tenantId: scope.tenantId ?? null,
      organizationId: scope.organizationId ?? null,
      createdById: bindingContext.createdById ?? null,
      updatedById: bindingContext.updatedById ?? null
    })
  }

  private async resolveInboundFiles(
    integration: IIntegration<TIntegrationWechatOptions>,
    event: WechatInboundEvent
  ): Promise<{ success: true; files?: WechatInboundFile[] } | { success: false; error: string }> {
    if (event.messageKind !== 'image') {
      return { success: true, files: event.files }
    }
    if (!event.imageRef) {
      return {
        success: false,
        error: 'inbound_image_ref_missing'
      }
    }

    const result = await this.wechatClient.downloadImage(integration, event.imageRef)
    if (!result.success || !result.file) {
      return {
        success: false,
        error: `inbound_image_download_failed${result.error ? `: ${result.error}` : ''}`
      }
    }

    return {
      success: true,
      files: [
        {
          id: result.file.id,
          fileUrl: result.file.fileUrl,
          url: result.file.url,
          mimeType: result.file.mimeType,
          mimetype: result.file.mimetype,
          originalName: result.file.originalName,
          name: result.file.name,
          fileKey: result.file.fileKey,
          size: result.file.size,
          extension: result.file.extension
        }
      ]
    }
  }

  private async resolveInboundVoiceInput(
    integration: IIntegration<TIntegrationWechatOptions>,
    event: WechatInboundEvent,
    xpertId: string,
    scope?: WechatTenantScope | null
  ): Promise<{ success: true; input: string } | { success: false; error: string }> {
    if (!event.voiceRef) {
      return {
        success: false,
        error: 'inbound_voice_ref_missing'
      }
    }

    const voiceResult = await this.wechatClient.downloadVoice(integration, event.voiceRef)
    if (!voiceResult.success || !voiceResult.audio) {
      return {
        success: false,
        error: `inbound_voice_download_failed${voiceResult.error ? `: ${voiceResult.error}` : ''}`
      }
    }

    try {
      const transcribed = await this.speechToTextPermissionService.transcribe({
        xpertId,
        tenantId: integration.tenantId || scope?.tenantId || null,
        organizationId: integration.organizationId || scope?.organizationId || null,
        file: {
          data: voiceResult.audio.data,
          originalName: voiceResult.audio.originalName,
          mimeType: voiceResult.audio.mimeType,
          size: voiceResult.audio.size
        }
      })
      const input = normalizeString(transcribed.text)
      if (!input) {
        return {
          success: false,
          error: 'inbound_voice_transcription_empty'
        }
      }
      return {
        success: true,
        input
      }
    } catch (error) {
      return {
        success: false,
        error: `inbound_voice_transcription_failed: ${this.describeError(error)}`
      }
    }
  }

  private inboundLogContent(event: WechatInboundEvent): string {
    if (event.messageKind === 'image') {
      return normalizeString(event.displayText)
    }
    if (event.messageKind === 'voice') {
      const content = normalizeString(event.content)
      if (content && !/<voicemsg\b/i.test(content)) {
        return content
      }
      return normalizeString(event.displayText)
    }
    return event.content
  }

  private resolveEventConversationIdentity(
    integrationId: string,
    event: WechatInboundEvent
  ): WechatConversationIdentity | undefined {
    return resolveWechatConversationIdentity({
      integrationId,
      uuid: event.uuid,
      ownerWxid: event.ownerWxid,
      contactId: event.contactId,
      senderId: event.senderId,
      fromUser: event.fromUser,
      toUser: event.toUser,
      chatType: event.chatType,
      isSelf: event.isSelf
    })
  }

  private shouldStoreSelfHistory(
    event: WechatInboundEvent,
    options: WechatInboundTriggerOptions
  ): boolean {
    if (!matchesWechatMessageFilter(event, options)) {
      return false
    }
    if (!isWechatDispatchableMessageKind(event)) {
      return false
    }
    const input = normalizeWechatAgentInput(event)
    if (!matchesWechatAllowedKeywords(input, options)) {
      return false
    }
    return !!input || event.messageKind === 'image'
  }

  private async markHistoryContextReset(
    integration: IIntegration<TIntegrationWechatOptions>,
    event: WechatInboundEvent,
    conversationUserKey: string,
    xpertId: string,
    scope?: WechatTenantScope | null
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
      isSelf: event.isSelf,
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
    scope?: WechatTenantScope | null
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
          direction: 'system' as WechatMessageDirection,
          status: 'context_reset' as WechatMessageLogStatus,
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
        '((log.direction = :inboundDirection AND log.status IN (:...inboundStatuses)) OR (log.direction = :outboundDirection AND log.status = :outboundStatus))',
        {
          inboundDirection: 'inbound',
          inboundStatuses: ['dispatched', 'history_only'],
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

    const timeoutSeconds = this.normalizeHistoryContextWindowSeconds(params.timeoutSeconds, undefined)
    if (timeoutSeconds > 0) {
      query.andWhere('log.createdAt > :historySince', {
        historySince: new Date(before.getTime() - timeoutSeconds * 1000)
      })
    }

    const logs = await query.orderBy('log.createdAt', 'DESC').addOrderBy('log.id', 'DESC').limit(limit).getMany()
    return this.formatHistoryContext(logs.reverse())
  }

  private formatHistoryContext(logs: WechatMessageLogEntity[]): string | undefined {
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

  private normalizeHistoryContextWindowSeconds(value: unknown, legacySessionTimeoutSeconds?: unknown): number {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Math.floor(numeric)
    }
    return this.normalizePositiveNumber(legacySessionTimeoutSeconds) ?? DEFAULT_HISTORY_CONTEXT_WINDOW_SECONDS
  }

  private async updateLog(
    id: string,
    patch: Partial<
      Pick<
        WechatMessageLogEntity,
        | 'status'
        | 'error'
        | 'xpertId'
        | 'conversationId'
        | 'conversationUserKey'
        | 'content'
        | 'payloadSummary'
        | 'contactId'
        | 'senderId'
        | 'chatType'
        | 'isSelf'
      >
    >,
    scope?: WechatTenantScope | null
  ): Promise<void> {
    if (!id) {
      return
    }
    await this.messageLogRepository.update(this.scopedWhere({ id }, scope), patch)
  }

  private getConversationCacheKey(
    conversationUserKey: string,
    xpertId: string,
    scope?: WechatTenantScope | null
  ): string {
    const tenantKey = scope?.tenantId ? `tenant:${scope.tenantId}` : 'tenant:any'
    const organizationKey = scope?.organizationId ? `org:${scope.organizationId}` : 'org:any'
    return `plugin_wechat:chat:${tenantKey}:${organizationKey}:${conversationUserKey}:${xpertId}`
  }

  private async cacheConversation(
    conversationUserKey: string,
    xpertId: string,
    conversationId: string,
    lastActiveAt?: Date | null,
    scope?: WechatTenantScope | null
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
    primary?: WechatTenantScope | null,
    fallback?: WechatTenantScope | null
  ): WechatTenantScope {
    const bindingContext = this.resolveBindingContext()
    return {
      tenantId: primary?.tenantId ?? fallback?.tenantId ?? bindingContext.tenantId ?? null,
      organizationId: primary?.organizationId ?? fallback?.organizationId ?? bindingContext.organizationId ?? null
    }
  }

  private async readIntegrationTenantScope(integrationId?: string | null): Promise<WechatTenantScope> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new Error('缺少微信集成标识。')
    }

    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatOptions>>(
      normalizedIntegrationId,
      {
        relations: ['tenant']
      }
    )
    if (!integration) {
      throw new Error('微信集成不存在或无权访问。')
    }

    return this.resolveTenantScope(integration)
  }

  private scopedWhere<T extends Record<string, unknown>>(
    where: T,
    scope?: WechatTenantScope | null
  ): T & WechatTenantScope {
    const scoped = { ...where } as T & WechatTenantScope
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

  private async listWechatIntegrations(): Promise<IIntegration<TIntegrationWechatOptions>[]> {
    const result = await this.integrationPermissionService.findAll<IIntegration<TIntegrationWechatOptions>>({
      where: {
        provider: WECHAT_PROVIDER_KEY
      },
      relations: ['tenant'],
      order: {
        updatedAt: 'DESC'
      },
      take: 100
    })
    return (result.items ?? []).filter((integration) => integration?.provider === WECHAT_PROVIDER_KEY)
  }

  private async toIntegrationWorkbenchItem(
    integration: IIntegration<TIntegrationWechatOptions>,
    stats: {
      accounts: WechatAccountEntity[]
      conversations: WechatConversationListItem[]
      logs: WechatMessageLogEntity[]
    }
  ): Promise<WechatIntegrationWorkbenchItem> {
    return {
      id: integration.id,
      name: integration.name,
      description: integration.description,
      slug: integration.slug,
      callbackConfig: await this.buildCallbackConfig(integration.id),
      accountCount: stats.accounts.length,
      conversationCount: stats.conversations.length,
      recentMessageCount: stats.logs.length,
      errorCount: stats.logs.filter((log) => log.status === 'failed' || log.error).length,
      config: this.sanitizeIntegrationConfig(integration.options),
      tunnel: await this.getTunnelStatus(integration)
    }
  }

  private sanitizeIntegrationConfig(
    options?: TIntegrationWechatOptions | null
  ): Partial<TIntegrationWechatOptions> {
    return {
      connectionMode: options?.connectionMode ?? 'direct_http',
      baseUrl: options?.baseUrl,
      tunnelClientId: options?.tunnelClientId,
      apiVersion: options?.apiVersion ?? '/v1/',
      timeoutMs: options?.timeoutMs ?? 10000,
      preferLanguage: options?.preferLanguage,
      fallbackToLegacySendText: options?.fallbackToLegacySendText !== false,
      webhookCredential: options?.webhookCredential
        ? {
            ...options.webhookCredential,
            tokenHash: '******'
          }
        : undefined
    }
  }

  private async getTunnelStatus(integration?: IIntegration<TIntegrationWechatOptions> | null): Promise<WechatTunnelStatus> {
    const broker = this.tunnelBroker as WechatTunnelBrokerService & {
      getManagedStatus?: WechatTunnelBrokerService['getManagedStatus']
    }
    if (typeof broker.getManagedStatus !== 'function') {
      return this.tunnelBroker.getStatus(integration?.options?.tunnelClientId, {
        clientName: integration?.name || integration?.id || null
      })
    }
    return broker.getManagedStatus(integration?.options?.tunnelClientId, {
      clientName: integration?.name || integration?.id || null
    })
  }

  private async syncTunnelClientScope(integration?: IIntegration<TIntegrationWechatOptions> | null): Promise<void> {
    if (!integration || (integration.options?.connectionMode ?? 'direct_http') !== 'reverse_tunnel') {
      return
    }
    const clientId = normalizeString(integration.options?.tunnelClientId)
    if (!clientId) {
      return
    }
    const broker = this.tunnelBroker as WechatTunnelBrokerService & {
      syncManagedClientScope?: WechatTunnelBrokerService['syncManagedClientScope']
    }
    if (typeof broker.syncManagedClientScope !== 'function') {
      return
    }
    await broker.syncManagedClientScope(clientId, {
      tenantId: integration.tenantId ?? null,
      organizationId: integration.organizationId ?? null,
      integrationId: integration.id,
      integrationName: integration.name || integration.id
    })
  }

  private emptyCallbackConfig(): WechatWorkbenchData['callbackConfig'] {
    return {
      webhookUrl: '',
      globalWebhookUrl: '',
      setCallbackUrlTemplate: '',
      setCallbackCurlTemplate: ''
    }
  }

  private async attachAccountTunnelBindings(
    accounts: WechatAccountEntity[],
    integrations: IIntegration<TIntegrationWechatOptions>[]
  ): Promise<WechatAccountWorkbenchItem[]> {
    const integrationById = new Map(integrations.map((integration) => [integration.id, integration]))
    const tunnelByIntegrationId = new Map<string, WechatTunnelStatus>()
    await Promise.all(
      integrations
        .filter((integration) => (integration.options?.connectionMode ?? 'direct_http') === 'reverse_tunnel')
        .map(async (integration) => {
          await this.syncTunnelClientScope(integration)
          tunnelByIntegrationId.set(integration.id, await this.getTunnelStatus(integration))
        })
    )
    return accounts.map((account) => {
      const integration = integrationById.get(account.integrationId)
      return {
        ...account,
        tunnelBinding: this.getAccountTunnelBinding(account, integration, tunnelByIntegrationId)
      }
    })
  }

  private getAccountTunnelBinding(
    account: WechatAccountEntity,
    integration?: IIntegration<TIntegrationWechatOptions>,
    tunnelByIntegrationId?: Map<string, WechatTunnelStatus>
  ): WechatAccountTunnelBinding {
    if ((integration?.options?.connectionMode ?? 'direct_http') !== 'reverse_tunnel') {
      return {
        status: 'not_applicable',
        connected: false
      }
    }

    let tunnel = tunnelByIntegrationId?.get(account.integrationId)
    if (!tunnel) {
      tunnel = this.tunnelBroker.getStatus(integration?.options?.tunnelClientId, {
        clientName: integration?.name || integration?.id || null
      })
      tunnelByIntegrationId?.set(account.integrationId, tunnel)
    }

    const base: Omit<WechatAccountTunnelBinding, 'status'> = {
      connected: tunnel.connected,
      clientId: tunnel.clientId ?? integration?.options?.tunnelClientId ?? null,
      clientName: tunnel.clientName ?? integration?.name ?? integration?.id ?? null,
      lastSeenAt: tunnel.lastSeenAt ?? null,
      lastSyncAt: tunnel.lastSyncAt ?? null,
      lastError: tunnel.lastError ?? null,
      bindingCount: tunnel.bindingCount
    }

    if (!tunnel.connected) {
      return {
        ...base,
        status: 'disconnected'
      }
    }

    const accountUuid = normalizeString(account.uuid)
    const bound = Boolean(accountUuid && tunnel.bindings.some((binding) => normalizeString(binding.uuid) === accountUuid))
    return {
      ...base,
      status: bound ? 'bound_connected' : 'connected_unbound'
    }
  }

  private async buildTunnelClientItems(
    integrations: IIntegration<TIntegrationWechatOptions>[],
    options: { includeOrphans?: boolean } = {}
  ): Promise<WechatTunnelClientWorkbenchItem[]> {
    const integrationByClientId = new Map<string, IIntegration<TIntegrationWechatOptions>>()
    const configuredClientIds = new Set<string>()
    for (const integration of integrations) {
      if ((integration.options?.connectionMode ?? 'direct_http') !== 'reverse_tunnel') {
        continue
      }
      const clientId = normalizeString(integration.options?.tunnelClientId)
      if (!clientId) {
        continue
      }
      configuredClientIds.add(clientId)
      if (!integrationByClientId.has(clientId)) {
        integrationByClientId.set(clientId, integration)
      }
    }

    await Promise.all([...integrationByClientId.values()].map((integration) => this.syncTunnelClientScope(integration)))

    const broker = this.tunnelBroker as WechatTunnelBrokerService & {
      listManagedClients?: WechatTunnelBrokerService['listManagedClients']
    }
    const brokerClients =
      typeof broker.listManagedClients === 'function'
        ? await broker.listManagedClients()
        : this.tunnelBroker.listClients()
    const byClientId = new Map(brokerClients.map((client) => [client.clientId, client]))
    for (const clientId of configuredClientIds) {
      if (byClientId.has(clientId)) {
        continue
      }
      const integration = integrationByClientId.get(clientId)
      const client = this.tunnelStatusToClientInfo(await this.getTunnelStatus(integration))
      if (client) {
        byClientId.set(client.clientId, client)
      }
    }

    return [...byClientId.values()]
      .filter((client) => options.includeOrphans || configuredClientIds.has(client.clientId))
      .map((client) => {
        const integration = integrationByClientId.get(client.clientId)
        return {
          ...client,
          clientName: client.clientName || integration?.name || client.clientId,
          integrationId: integration?.id ?? null,
          integrationName: integration?.name || integration?.id || null,
          expected: Boolean(integration)
        }
      })
      .sort((left, right) => {
        if (left.connected !== right.connected) {
          return left.connected ? -1 : 1
        }
        if (left.expected !== right.expected) {
          return left.expected ? -1 : 1
        }
        return this.tunnelClientActivityTime(right) - this.tunnelClientActivityTime(left)
      })
  }

  private tunnelStatusToClientInfo(status: WechatTunnelStatus): WechatTunnelClientInfo | null {
    const clientId = normalizeString(status.clientId)
    if (!clientId) {
      return null
    }
    return {
      clientId,
      clientName: status.clientName ?? null,
      state: status.state,
      connected: status.connected,
      instanceId: status.instanceId,
      remoteAddress: status.remoteAddress ?? null,
      connectedAt: status.lastConnectedAt ?? null,
      disconnectedAt: status.lastDisconnectedAt ?? null,
      lastSeenAt: status.lastSeenAt ?? null,
      lastPingAt: status.lastPingAt ?? null,
      lastSyncAt: status.lastSyncAt ?? null,
      lastError: status.lastError ?? null,
      bindingCount: status.bindingCount,
      bindings: status.bindings
    }
  }

  private paginateTunnelClients(
    clients: WechatTunnelClientWorkbenchItem[],
    query: WechatWorkbenchTableQuery = {}
  ): WechatPagedResult<WechatTunnelClientWorkbenchItem> {
    const page = this.normalizePage(query.page)
    const pageSize = this.normalizePageSize(query.pageSize, 50)
    const search = this.normalizeListSearch(query.search)
    const filters = this.normalizeFilters(query.filters)
    const filtered = clients.filter((client) => {
      if (!this.matchesTunnelClientFilters(client, filters)) {
        return false
      }
      if (!search) {
        return true
      }
      return [
        client.integrationId,
        client.integrationName,
        client.clientId,
        client.clientName,
        client.state,
        client.remoteAddress,
        client.instanceId,
        client.lastError,
        ...client.bindings.flatMap((binding) => [binding.uuid, binding.wxid])
      ].some((value) => this.normalizeListSearch(value)?.includes(search))
    })
    return this.paginateItems(filtered, page, pageSize)
  }

  private matchesAccountFilters(account: WechatAccountEntity, filters: Record<string, unknown>): boolean {
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
    item: WechatConversationListItem,
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

  private matchesLogFilters(log: WechatMessageLogEntity, filters: Record<string, unknown>): boolean {
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

  private matchesTunnelClientFilters(
    client: WechatTunnelClientWorkbenchItem,
    filters: Record<string, unknown>
  ): boolean {
    const state = this.normalizeListSearch(filters.state ?? filters.status)
    if (state && client.state !== state) {
      return false
    }
    return (
      this.matchesFilter(client.integrationId, filters.integrationId) &&
      this.matchesFilter(client.clientId, filters.clientId) &&
      this.matchesFilter(client.clientName, filters.clientName) &&
      this.matchesFilter(client.remoteAddress, filters.remoteAddress)
    )
  }

  private tunnelClientActivityTime(client: WechatTunnelClientWorkbenchItem): number {
    const value = client.lastSeenAt || client.connectedAt || client.disconnectedAt || ''
    const time = Date.parse(value)
    return Number.isFinite(time) ? time : 0
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

  private normalizeDirection(value: unknown): WechatMessageDirection | null {
    const normalized = this.normalizeListSearch(value)
    return normalized === 'inbound' || normalized === 'outbound' || normalized === 'system' ? normalized : null
  }

  private normalizeLogStatus(value: unknown): WechatMessageLogStatus | null {
    const normalized = this.normalizeListSearch(value)
    return [
      'received',
      'dispatched',
      'history_only',
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
      ? (normalized as WechatMessageLogStatus)
      : null
  }

  private isQueueStatus(status: WechatMessageLogStatus): boolean {
    return ['queued', 'deferred', 'sending', 'paused'].includes(status)
  }

  private normalizeChatType(value: unknown): 'private' | 'group' | null {
    const normalized = this.normalizeListSearch(value)
    return normalized === 'private' || normalized === 'group' ? normalized : null
  }

  private matchesConversationSearch(item: WechatConversationListItem, search: string | null): boolean {
    if (!search) {
      return true
    }
    return [item.integrationId, item.uuid, item.contactId, item.senderId, item.xpertId, item.conversationId].some(
      (value) => this.normalizeListSearch(value)?.includes(search)
    )
  }

  private matchesLogSearch(log: WechatMessageLogEntity, search: string | null): boolean {
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
    binding: WechatConversationBindingEntity,
    integrationId: string
  ): WechatConversationListItem | null {
    const parsed = parseWechatConversationUserKey(binding.conversationUserKey)
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

  private paginateItems<T>(items: T[], page: number, pageSize: number): WechatPagedResult<T> {
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

  private parseOutboundPayloadSummary(payloadSummary?: string): Record<string, unknown> | null {
    if (!payloadSummary) {
      return null
    }
    try {
      const payload = JSON.parse(payloadSummary)
      return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null
    } catch {
      return null
    }
  }

  private describeError(error: unknown): string {
    const response = this.resolveErrorResponse(error)
    if (response) {
      const code = normalizeString(response.code)
      const message = normalizeString(response.message)
      const xpertId = normalizeString(response.xpertId)
      const remediation = normalizeString(response.remediation)
      const details = [code, message].filter(Boolean).join(': ')
      const context = xpertId ? `xpertId=${xpertId}` : ''
      const parts = [details, context, remediation].filter(Boolean)
      if (parts.length) {
        return parts.join('; ')
      }
    }
    return error instanceof Error ? error.message : String(error)
  }

  private resolveErrorResponse(error: unknown): Record<string, unknown> | null {
    if (!error || typeof error !== 'object') {
      return null
    }
    const candidate = error as {
      getResponse?: () => unknown
      response?: unknown
    }
    const response = typeof candidate.getResponse === 'function' ? candidate.getResponse() : candidate.response
    return response && typeof response === 'object' && !Array.isArray(response)
      ? (response as Record<string, unknown>)
      : null
  }

  private getNewConversationStartedText(language: unknown): string {
    return language === 'en'
      ? 'A new conversation has started. Please continue sending your message.'
      : '已开启新会话，请继续发送消息。'
  }
}

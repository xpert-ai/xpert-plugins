import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type PluginContext,
  RequestContext,
  runWithRequestContext,
  TChatCardAction,
  TChatEventContext,
  TChatInboundMessage
} from '@xpert-ai/plugin-sdk'
import Bull, { Queue } from 'bull'
import { type Cache } from 'cache-manager'
import { Repository } from 'typeorm'
import { createHash } from 'node:crypto'
import { ChatDingTalkMessage } from './message.js'
import {
  buildAnonymousConversationKey,
  normalizeConversationUserKey,
  parseAnonymousConversationKey,
  resolveConversationUserKey
} from './conversation-user-key.js'
import { translate } from './i18n.js'
import { DingTalkChannelStrategy } from './dingtalk-channel.strategy.js'
import { DispatchDingTalkChatCommand, DispatchDingTalkChatPayload } from './handoff/commands/dispatch-dingtalk-chat.command.js'
import { DINGTALK_PLUGIN_CONTEXT, DINGTALK_TRIGGER_STRATEGY } from './tokens.js'
import {
  ChatDingTalkContext,
  DINGTALK_MAX_FILE_BYTES,
  DingTalkImageMimeType,
  DingTalkInboundFile,
  isConfirmAction,
  isDingTalkCardActionValue,
  isEndAction,
  isRejectAction,
  normalizeDingTalkRobotCode,
  resolveDingTalkCardActionValue,
  resolveDingTalkSenderRecipient,
  TDingTalkEvent,
  TIntegrationDingTalkOptions
} from './types.js'
import { DingTalkConversationBindingEntity } from './entities/dingtalk-conversation-binding.entity.js'
import { DingTalkTriggerBindingEntity } from './entities/dingtalk-trigger-binding.entity.js'
import { resolveDingTalkFileMimeType, sanitizeDingTalkFileName } from './dingtalk-send-file.js'

const CACHE_TTL_MS = 10 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type DingTalkConversationQueueJob = {
  tenantId?: string
  organizationId?: string
  integrationId: string
  userId: string
  senderOpenId?: string
  senderRecipient?: ChatDingTalkContext['senderRecipient']
  chatId?: string
  chatType?: 'private' | 'group' | 'channel' | 'thread'
  input?: string
  message?: TDingTalkEvent
  preferLanguage?: string
  requestUser?: {
    id: string
    tenantId?: string
    organizationId?: string
    [key: string]: unknown
  }
}

type DingTalkRequestUser = {
  id: string
  tenantId?: string
  organizationId?: string
  [key: string]: unknown
}

type DingTalkInboundFileRef = {
  kind: 'image' | 'file'
  downloadCode: string
  fileName?: string
  robotCode?: string
}

type DingTalkTriggerService = {
  handleInboundMessage: (params: {
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
  }) => Promise<boolean>
  getBinding?: (integrationId: string) => Promise<{
    xpertId: string
    sessionTimeoutSeconds?: number
    summaryWindowSeconds?: number
  } | null>
  clearBufferedConversation?: (conversationUserKey: string) => Promise<void>
}

type DingTalkConversationBindingState = {
  conversationId: string
  lastActiveAt?: Date
}

type DingTalkActiveMessage = {
  id?: string
  thirdPartyMessage?: {
    id?: string
    messageId?: string
    language?: string
    header?: any
    elements?: any[]
    status?: string
  }
}

export type DingTalkDispatchExecutionContextSource = 'exact' | 'xpert-latest' | 'trigger-binding' | 'request-fallback'

export interface DingTalkDispatchExecutionContext {
  tenantId?: string
  organizationId?: string
  createdById?: string
  source: DingTalkDispatchExecutionContextSource
}

@Injectable()
export class DingTalkConversationService implements OnModuleDestroy {
  private readonly logger = new Logger(DingTalkConversationService.name)
  private readonly queueNamespace = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
  private _integrationPermissionService: IntegrationPermissionService
  private _dingtalkTriggerStrategy: DingTalkTriggerService

  public static readonly prefix = 'dingtalk:chat'
  private userQueues: Map<string, Queue<DingTalkConversationQueueJob>> = new Map()

  constructor(
    private readonly commandBus: CommandBus,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly dingtalkChannel: DingTalkChannelStrategy,
    @InjectRepository(DingTalkConversationBindingEntity)
    private readonly conversationBindingRepository: Repository<DingTalkConversationBindingEntity>,
    @InjectRepository(DingTalkTriggerBindingEntity)
    private readonly triggerBindingRepository: Repository<DingTalkTriggerBindingEntity>,
    @Inject(DINGTALK_TRIGGER_STRATEGY)
    private readonly dingtalkTriggerStrategy: DingTalkTriggerService,
    @Inject(DINGTALK_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  private async getDingTalkTriggerStrategy(): Promise<DingTalkTriggerService> {
    if (!this._dingtalkTriggerStrategy) {
      this._dingtalkTriggerStrategy = this.dingtalkTriggerStrategy
    }
    return this._dingtalkTriggerStrategy
  }

  async getConversationState(
    conversationUserKey: string,
    xpertId: string
  ): Promise<DingTalkConversationBindingState | undefined> {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return undefined
    }

    const key = this.getConversationCacheKey(normalizedUserKey, normalizedXpertId)
    const cachedValue = await this.cacheManager.get<
      | string
      | {
          conversationId?: unknown
          lastActiveAt?: unknown
        }
    >(key)
    if (typeof cachedValue === 'string') {
      const cachedConversationId = normalizeConversationUserKey(cachedValue)
      if (cachedConversationId) {
        return {
          conversationId: cachedConversationId
        }
      }
    } else if (cachedValue && typeof cachedValue === 'object') {
      const cachedConversationId = normalizeConversationUserKey(cachedValue.conversationId)
      if (cachedConversationId) {
        return {
          conversationId: cachedConversationId,
          lastActiveAt: this.normalizeDate(cachedValue.lastActiveAt)
        }
      }
    }

    const binding = await this.conversationBindingRepository.findOne({
      where: {
        conversationUserKey: normalizedUserKey,
        xpertId: normalizedXpertId
      }
    })

    const conversationId = normalizeConversationUserKey(binding?.conversationId)
    if (!conversationId) {
      return undefined
    }

    const lastActiveAt = this.normalizeDate(binding?.updatedAt)
    await this.cacheConversation(normalizedUserKey, normalizedXpertId, conversationId, lastActiveAt)
    return {
      conversationId,
      lastActiveAt
    }
  }

  async getConversation(conversationUserKey: string, xpertId: string) {
    const state = await this.getConversationState(conversationUserKey, xpertId)
    return state?.conversationId
  }

  async setConversation(
    conversationUserKey: string,
    xpertId: string,
    conversationId: string,
    lastActiveAt: Date = new Date(),
    context?: {
      tenantId?: string | null
      organizationId?: string | null
      createdById?: string | null
      updatedById?: string | null
    }
  ) {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    const normalizedConversationId = normalizeConversationUserKey(conversationId)
    if (!normalizedUserKey || !normalizedXpertId || !normalizedConversationId) {
      return
    }

    const resolvedLastActiveAt = this.normalizeDate(lastActiveAt) ?? new Date()
    await this.cacheConversation(
      normalizedUserKey,
      normalizedXpertId,
      normalizedConversationId,
      resolvedLastActiveAt
    )

    const isIntegrationScopedConversation = Boolean(parseAnonymousConversationKey(normalizedUserKey))
    const userId = isIntegrationScopedConversation ? null : this.resolveUserIdFromConversationUserKey(normalizedUserKey)
    const bindingContext = this.resolveBindingContext(context)
    await this.conversationBindingRepository.upsert(
      {
        userId: userId ?? null,
        conversationUserKey: normalizedUserKey,
        xpertId: normalizedXpertId,
        conversationId: normalizedConversationId,
        tenantId: bindingContext.tenantId ?? null,
        organizationId: bindingContext.organizationId ?? null,
        createdById: bindingContext.createdById ?? null,
        updatedById: bindingContext.updatedById ?? null
      },
      ['conversationUserKey', 'xpertId']
    )
  }

  async getLatestConversationBindingByUserId(
    userId: string
  ): Promise<{ xpertId: string; conversationId: string; conversationUserKey: string; updatedAt?: Date } | null> {
    const normalizedUserId = normalizeConversationUserKey(userId)
    if (!normalizedUserId) {
      return null
    }

    const binding = await this.conversationBindingRepository.findOne({
      where: { userId: normalizedUserId },
      order: { updatedAt: 'DESC' }
    })
    if (!binding?.xpertId || !binding?.conversationId || !binding?.conversationUserKey) {
      return null
    }

    return {
      xpertId: binding.xpertId,
      conversationId: binding.conversationId,
      conversationUserKey: binding.conversationUserKey,
      updatedAt: binding.updatedAt
    }
  }

  async resolveDispatchExecutionContext(
    xpertId: string,
    conversationUserKey?: string
  ): Promise<DingTalkDispatchExecutionContext> {
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedXpertId) {
      return { source: 'request-fallback' }
    }

    const normalizedConversationUserKey = normalizeConversationUserKey(conversationUserKey)
    const exactBinding = normalizedConversationUserKey
      ? await this.conversationBindingRepository.findOne({
          where: {
            conversationUserKey: normalizedConversationUserKey,
            xpertId: normalizedXpertId
          }
        })
      : null

    const needsXpertLatestBinding = !this.hasCompleteDispatchBindingContext(exactBinding)
    const xpertLatestBinding = needsXpertLatestBinding
      ? await this.conversationBindingRepository.findOne({
          where: { xpertId: normalizedXpertId },
          order: { updatedAt: 'DESC' }
        })
      : null

    const needsTriggerBinding =
      !this.hasCompleteDispatchBindingContext(exactBinding) &&
      !this.hasCompleteDispatchBindingContext(xpertLatestBinding)
    const triggerBinding = needsTriggerBinding
      ? await this.triggerBindingRepository.findOne({
          where: { xpertId: normalizedXpertId },
          order: { updatedAt: 'DESC' }
        })
      : null

    const tenantId =
      this.normalizeBindingContextField(exactBinding?.tenantId) ??
      this.normalizeBindingContextField(xpertLatestBinding?.tenantId) ??
      this.normalizeBindingContextField(triggerBinding?.tenantId)
    const organizationId =
      this.normalizeBindingContextField(exactBinding?.organizationId) ??
      this.normalizeBindingContextField(xpertLatestBinding?.organizationId) ??
      this.normalizeBindingContextField(triggerBinding?.organizationId)
    const createdById =
      this.normalizeExecutionUserIdField(exactBinding?.createdById) ??
      this.normalizeExecutionUserIdField(xpertLatestBinding?.createdById) ??
      this.normalizeExecutionUserIdField(triggerBinding?.createdById)
    const source: DingTalkDispatchExecutionContextSource = this.hasCompleteDispatchBindingContext(exactBinding)
      ? 'exact'
      : this.hasCompleteDispatchBindingContext(xpertLatestBinding)
        ? 'xpert-latest'
        : triggerBinding
          ? 'trigger-binding'
          : exactBinding
            ? 'exact'
            : xpertLatestBinding
              ? 'xpert-latest'
              : 'request-fallback'

    return {
      tenantId,
      organizationId,
      createdById,
      source
    }
  }

  async getActiveMessage(conversationUserKey: string, xpertId: string): Promise<DingTalkActiveMessage | null> {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return null
    }
    const key = this.getActiveMessageCacheKey(normalizedUserKey, normalizedXpertId)
    const message = await this.cacheManager.get<DingTalkActiveMessage>(key)
    return message ?? null
  }

  async setActiveMessage(conversationUserKey: string, xpertId: string, message: DingTalkActiveMessage): Promise<void> {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return
    }
    const key = this.getActiveMessageCacheKey(normalizedUserKey, normalizedXpertId)
    await this.cacheManager.set(key, message, CACHE_TTL_MS)
  }

  async clearConversationSession(conversationUserKey: string, xpertId: string): Promise<void> {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return
    }

    await this.cacheManager.del(this.getConversationCacheKey(normalizedUserKey, normalizedXpertId))
    await this.cacheManager.del(this.getActiveMessageCacheKey(normalizedUserKey, normalizedXpertId))
    await this.removeConversationBindingFromStore(normalizedUserKey, normalizedXpertId)
  }

  async clearConversationSessionByUserKey(conversationUserKey: string, xpertId?: string | null): Promise<boolean> {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    if (!normalizedUserKey) {
      return false
    }

    let normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedXpertId) {
      const latestBinding = await this.conversationBindingRepository.findOne({
        where: { conversationUserKey: normalizedUserKey },
        order: { updatedAt: 'DESC' }
      })
      normalizedXpertId = normalizeConversationUserKey(latestBinding?.xpertId)
    }

    if (!normalizedXpertId) {
      return false
    }

    await this.clearConversationSession(normalizedUserKey, normalizedXpertId)
    return true
  }

  async ask(xpertId: string, content: string, message: ChatDingTalkMessage) {
    await this.dispatchToDingTalkChat({
      xpertId,
      input: content,
      dingtalkMessage: message
    })
  }

  async processMessage(options: ChatDingTalkContext<TDingTalkEvent>): Promise<unknown> {
    const { integrationId, senderOpenId } = options
    const integration = await this.integrationPermissionService.read(integrationId)
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`)
    }

    const requestUser = this.resolveRequestUser({
      id: options.userId || '',
      tenantId: integration.tenantId,
      organizationId: options.organizationId || integration.organizationId
    })
    const text = this.extractInputText(options)
    const dingtalkTriggerStrategy = await this.getDingTalkTriggerStrategy()
    const triggerBinding =
      typeof dingtalkTriggerStrategy.getBinding === 'function'
        ? await dingtalkTriggerStrategy.getBinding(integrationId)
        : await this.triggerBindingRepository.findOne({
            where: {
              integrationId
            }
          })
    const conversationId =
      normalizeConversationUserKey(options.chatId) ||
      normalizeConversationUserKey(options.message?.conversationId) ||
      normalizeConversationUserKey(options.message?.chatId)

    let conversationUserKey = resolveConversationUserKey({
      integrationId,
      conversationId,
      senderOpenId,
      fallbackUserId: options.userId
    })

    if (!conversationUserKey) {
      this.logger.warn(`Failed to resolve conversation user key for integration ${integrationId}`)
      return null
    }

    const triggerXpertId = normalizeConversationUserKey(triggerBinding?.xpertId)
    let targetXpertId = triggerXpertId
    let existingConversation:
      | {
          conversationId: string
          lastActiveAt?: Date
        }
      | undefined =
      triggerXpertId && conversationUserKey
        ? await this.getConversationState(conversationUserKey, triggerXpertId)
        : undefined

    if (
      existingConversation &&
      triggerBinding?.xpertId === triggerXpertId &&
      this.isConversationExpired(existingConversation.lastActiveAt, this.resolveSessionTimeoutMs(triggerBinding.sessionTimeoutSeconds))
    ) {
      await this.clearConversationSession(conversationUserKey, triggerXpertId)
      if (typeof dingtalkTriggerStrategy.clearBufferedConversation === 'function') {
        await dingtalkTriggerStrategy.clearBufferedConversation(conversationUserKey)
      }
      existingConversation = undefined
    }

    const normalizedSenderOpenId = normalizeConversationUserKey(senderOpenId)
    const latestBinding =
      targetXpertId || !normalizedSenderOpenId
        ? null
        : await this.getLatestConversationBindingByUserId(normalizedSenderOpenId)
    if (!targetXpertId && latestBinding) {
      targetXpertId = latestBinding.xpertId
      conversationUserKey = latestBinding.conversationUserKey
      await this.cacheConversation(
        latestBinding.conversationUserKey,
        latestBinding.xpertId,
        latestBinding.conversationId,
        latestBinding.updatedAt
      )
    }

    if (!targetXpertId) {
      await this.dingtalkChannel.errorMessage(
        {
          integrationId,
          chatId: options.chatId
        },
        new Error('No DingTalk trigger binding configured for this integration. Please link it through a trigger first.')
      )
      return null
    }

    const activeConversationId = existingConversation?.conversationId ?? latestBinding?.conversationId
    const files = await this.resolveInboundFiles({
      integrationId,
      message: options.message,
      xpertId: targetXpertId,
      tenantId: requestUser.tenantId,
      organizationId: requestUser.organizationId || integration.organizationId,
      userId: UUID_PATTERN.test(requestUser.id) ? requestUser.id : undefined,
      conversationId: activeConversationId
    })
    const dispatchFiles = files.length ? files : undefined
    const activeMessage = await this.getActiveMessage(conversationUserKey, targetXpertId)
    const dingtalkMessage = new ChatDingTalkMessage(
      {
        tenant: integration.tenant,
        organizationId: integration.organizationId,
        integrationId,
        preferLanguage: integration.options?.preferLanguage,
        userId: options.userId,
        senderOpenId,
        senderRecipient: options.senderRecipient || resolveDingTalkSenderRecipient(options.message) || undefined,
        sessionWebhook: (options.message as any)?.sessionWebhook,
        robotCode:
          normalizeDingTalkRobotCode((options.message as any)?.robotCode) ||
          normalizeDingTalkRobotCode(integration.options?.robotCode) ||
          undefined,
        chatId: options.chatId,
        chatType: options.chatType === 'group' ? 'group' : 'private',
        dingtalkChannel: this.dingtalkChannel
      },
      {
        text,
        language: activeMessage?.thirdPartyMessage?.language || integration.options?.preferLanguage
      }
    )

    if (activeConversationId) {
      if (triggerBinding?.xpertId === targetXpertId) {
        const handledByTrigger = await dingtalkTriggerStrategy.handleInboundMessage({
          integrationId,
          input: text,
          files: dispatchFiles,
          dingtalkMessage,
          conversationId: activeConversationId,
          conversationUserKey,
          tenantId: requestUser.tenantId,
          organizationId: requestUser.organizationId || integration.organizationId,
          executorUserId: requestUser.id,
          endUserId: senderOpenId
        })
        if (handledByTrigger) {
          return dingtalkMessage
        }
      }

      return await this.dispatchToDingTalkChat({
        xpertId: targetXpertId,
        input: text,
        files: dispatchFiles,
        dingtalkMessage,
        conversationId: activeConversationId,
        conversationUserKey
      })
    }

    const handledByTrigger = await dingtalkTriggerStrategy.handleInboundMessage({
      integrationId,
      input: text,
      files: dispatchFiles,
      dingtalkMessage,
      conversationUserKey,
      tenantId: requestUser.tenantId,
      organizationId: requestUser.organizationId || integration.organizationId,
      executorUserId: requestUser.id,
      endUserId: senderOpenId
    })
    if (handledByTrigger) {
      return dingtalkMessage
    }

    await this.dingtalkChannel.errorMessage(
      {
        integrationId,
        chatId: options.chatId
      },
      new Error('No DingTalk trigger binding configured for this integration. Please link it through a trigger first.')
    )
    return null
  }

  async onAction(
    action: string,
    chatContext: ChatDingTalkContext,
    conversationUserKey: string,
    xpertId: string,
    actionMessageId?: string
  ) {
    const conversationId = await this.getConversation(conversationUserKey, xpertId)
    if (!conversationId) {
      return this.replyActionSessionTimedOut(chatContext)
    }

    const normalizedAction = normalizeConversationUserKey(action) || ''
    if (!isEndAction(normalizedAction) && !isConfirmAction(normalizedAction) && !isRejectAction(normalizedAction)) {
      const queueKey = `${chatContext.integrationId}:${chatContext.senderOpenId || chatContext.userId}`
      const userQueue = await this.getUserQueue(queueKey)
      const currentUser = this.resolveRequestUser({
        id: chatContext.userId || '',
        organizationId: chatContext.organizationId
      })
      if (!currentUser?.id) {
        this.logger.warn('Missing request user id for DingTalk action handling, skip')
        return
      }
      await userQueue.add({
        integrationId: chatContext.integrationId,
        tenantId: currentUser?.tenantId,
        organizationId: chatContext.organizationId,
        userId: currentUser?.id || chatContext.userId,
        senderOpenId: chatContext.senderOpenId,
        chatId: chatContext.chatId,
        input: action,
        preferLanguage: chatContext.preferLanguage,
        requestUser: currentUser
      })
      return
    }

    const activeMessage = await this.getActiveMessage(conversationUserKey, xpertId)
    const thirdPartyMessage = activeMessage?.thirdPartyMessage
    const dingtalkMessageId = actionMessageId || thirdPartyMessage?.id

    if (!activeMessage || !thirdPartyMessage || !dingtalkMessageId) {
      await this.clearConversationSession(conversationUserKey, xpertId)
      return this.replyActionSessionTimedOut(chatContext)
    }

    const prevMessage = new ChatDingTalkMessage(
      { ...chatContext, dingtalkChannel: this.dingtalkChannel },
      {
        id: dingtalkMessageId,
        messageId: activeMessage.id || thirdPartyMessage.messageId,
        language: thirdPartyMessage.language,
        header: thirdPartyMessage.header,
        elements: [...(thirdPartyMessage.elements ?? [])],
        status: thirdPartyMessage.status as any
      }
    )

    const newMessage = new ChatDingTalkMessage(
      { ...chatContext, dingtalkChannel: this.dingtalkChannel },
      {
        language: thirdPartyMessage.language
      }
    )

    if (isEndAction(normalizedAction)) {
      await prevMessage.end()
      await this.clearConversationSession(conversationUserKey, xpertId)
      return
    }

    if (isConfirmAction(normalizedAction)) {
      await prevMessage.done()
      await this.dispatchToDingTalkChat({
        xpertId,
        dingtalkMessage: newMessage,
        options: {
          confirm: true
        }
      })
      return
    }

    if (isRejectAction(normalizedAction)) {
      await prevMessage.done()
      await this.dispatchToDingTalkChat({
        xpertId,
        dingtalkMessage: newMessage,
        options: {
          reject: true
        }
      })
      return
    }
  }

  async getUserQueue(queueKey: string): Promise<Bull.Queue<DingTalkConversationQueueJob>> {
    const normalizedQueueKey = normalizeConversationUserKey(queueKey)
    if (!normalizedQueueKey) {
      throw new Error('Missing queueKey for DingTalk queue')
    }

    if (!this.userQueues.has(normalizedQueueKey)) {
      const queueName = this.getUserQueueName(normalizedQueueKey)
      const queue = new Bull<DingTalkConversationQueueJob>(queueName, {
        redis: this.getBullRedisConfig()
      })

      queue.process(1, async (job) => {
        const requestUser = this.normalizeRequestUser(job.data)
        const tenantId = requestUser?.tenantId || job.data.tenantId
        if (!tenantId) {
          this.logger.warn(`Missing tenantId for queue job ${job.id}, skip`)
          return
        }

        await new Promise<void>((resolve, reject) => {
          runWithRequestContext(
            {
              user: requestUser,
              headers: {
                ...(job.data.organizationId ? { ['organization-id']: job.data.organizationId } : {}),
                ['tenant-id']: tenantId,
                ...(job.data.preferLanguage
                  ? {
                      language: job.data.preferLanguage
                    }
                  : {})
              }
            },
            {},
            () => {
              this.processMessage({
                integrationId: job.data.integrationId,
                userId: requestUser.id,
                senderOpenId: job.data.senderOpenId,
                senderRecipient: job.data.senderRecipient,
                chatId: job.data.chatId,
                chatType: job.data.chatType,
                input: job.data.input,
                message: job.data.message,
                preferLanguage: job.data.preferLanguage,
                organizationId: job.data.organizationId
              } as ChatDingTalkContext<TDingTalkEvent>)
                .then(() => resolve())
                .catch(reject)
            }
          )
        })
      })

      queue.on('failed', (job, error) => {
        this.logger.error(`Job ${job.id} for queue ${normalizedQueueKey} failed: ${error?.message || error}`)
      })

      queue.on('error', (error) => {
        this.logger.error(`Queue ${queueName} error: ${error?.message || error}`)
      })

      this.userQueues.set(normalizedQueueKey, queue)
    }

    return this.userQueues.get(normalizedQueueKey)
  }

  async handleMessage(message: TChatInboundMessage, ctx: TChatEventContext<TIntegrationDingTalkOptions>): Promise<void> {
    const executionUserId = this.resolveExecutionUserId(ctx.integration)
    if (!executionUserId) {
      this.logger.error(`Missing valid UUID execution user for DingTalk integration ${ctx.integration.id}`)
      await this.dingtalkChannel.errorMessage(
        {
          integrationId: ctx.integration.id,
          chatId: message.chatId
        },
        new Error('Integration owner is missing. Please re-save integration using an internal user account.')
      )
      return
    }

    const requestUser = this.resolveRequestUser({
      id: executionUserId,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId
    })

    const queueKey = `${ctx.integration.id}:${message.senderId || requestUser.id}`
    const userQueue = await this.getUserQueue(queueKey)

    await userQueue.add({
      tenantId: requestUser.tenantId || ctx.tenantId,
      organizationId: requestUser.organizationId || ctx.organizationId,
      integrationId: ctx.integration.id,
      preferLanguage: ctx.integration.options?.preferLanguage,
      userId: requestUser.id,
      message: message.raw as TDingTalkEvent,
      input: message.content,
      chatId: message.chatId,
      chatType: message.chatType,
      senderOpenId: message.senderId,
      senderRecipient: resolveDingTalkSenderRecipient(message.raw) || undefined,
      requestUser
    })
  }

  async handleCardAction(action: TChatCardAction, ctx: TChatEventContext<TIntegrationDingTalkOptions>): Promise<void> {
    if (!isDingTalkCardActionValue(action.value)) {
      this.logger.warn(`Unsupported card action value from DingTalk: ${JSON.stringify(action.value)}`)
      return
    }

    const executionUserId = this.resolveExecutionUserId(ctx.integration)
    if (!executionUserId) {
      this.logger.error(`Missing valid UUID execution user for DingTalk integration ${ctx.integration.id}`)
      return
    }

    const requestUser = this.resolveRequestUser({
      id: executionUserId,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId
    })

    const dingtalkTriggerStrategy = await this.getDingTalkTriggerStrategy()
    const triggerBinding =
      typeof dingtalkTriggerStrategy.getBinding === 'function'
        ? await dingtalkTriggerStrategy.getBinding(ctx.integration.id)
        : await this.triggerBindingRepository.findOne({
            where: {
              integrationId: ctx.integration.id
            }
          })
    const xpertId = normalizeConversationUserKey(triggerBinding?.xpertId)
    if (!xpertId) {
      this.logger.warn('No DingTalk trigger conversation binding configured for card action')
      return
    }

    const conversationUserKey =
      buildAnonymousConversationKey({
        integrationId: ctx.integration.id,
        conversationId: action.chatId,
        senderId: action.userId
      }) ||
      resolveConversationUserKey({
        integrationId: ctx.integration.id,
        conversationId: action.chatId,
        senderOpenId: action.userId,
        fallbackUserId: requestUser.id
      })

    if (!conversationUserKey) {
      this.logger.warn('Missing DingTalk action user open_id, skip card action conversation handling')
      return
    }

    await this.onAction(
      resolveDingTalkCardActionValue(action.value),
      {
        tenant: ctx.integration.tenant,
        organizationId: ctx.organizationId,
        integrationId: ctx.integration.id,
        preferLanguage: ctx.integration.options?.preferLanguage,
        userId: requestUser.id,
        senderOpenId: action.userId,
        sessionWebhook: (action.raw as any)?.sessionWebhook,
        chatId: action.chatId
      } as ChatDingTalkContext,
      conversationUserKey,
      xpertId,
      action.messageId
    )
  }

  async closeQueues() {
    for (const queue of this.userQueues.values()) {
      await queue.close()
    }
    this.userQueues.clear()
  }

  async onModuleDestroy() {
    await this.closeQueues()
  }

  private extractInputText(options: ChatDingTalkContext<TDingTalkEvent>): string {
    if (typeof options.input === 'string' && options.input.trim()) {
      return options.input.trim()
    }

    const message = this.normalizeRecord(options.message)
    if (!message) {
      return ''
    }

    if (typeof message.text === 'string' && message.text.trim()) {
      return message.text.trim()
    }

    const contentText = this.extractContentText(message.content)
    if (contentText) {
      return contentText
    }

    const bodyMessage = this.normalizeRecord(message.message)
    const nestedContentText = this.extractContentText(bodyMessage?.content)
    if (nestedContentText) {
      return nestedContentText
    }

    const richTextText = this.extractRichTextText(message.richText)
    if (richTextText) {
      return richTextText
    }

    return ''
  }

  private extractContentText(content: unknown): string | undefined {
    if (typeof content === 'string') {
      const parsedContent = this.safeJsonRecord(content)
      if (parsedContent) {
        return this.extractContentText(parsedContent)
      }
      return this.normalizeString(content)
    }

    const contentRecord = this.normalizeRecord(content)
    if (!contentRecord) {
      return undefined
    }

    const directText = this.normalizeString(contentRecord.text) ?? this.normalizeString(contentRecord.content)
    if (directText) {
      return directText
    }

    return this.extractRichTextText(contentRecord.richText)
  }

  private extractRichTextText(richText: unknown): string | undefined {
    if (!Array.isArray(richText)) {
      return undefined
    }

    const text = richText
      .map((item) => {
        const record = this.normalizeRecord(item)
        if (!record) {
          return ''
        }
        const itemType = this.resolveDingTalkMessageType(record, true)
        if (itemType === 'image' || itemType === 'picture') {
          return ''
        }
        return this.normalizeString(record.text) ?? (itemType === 'text' ? this.normalizeString(record.content) : '') ?? ''
      })
      .filter(Boolean)
      .join('')
      .trim()

    return text || undefined
  }

  private async resolveInboundFiles(params: {
    integrationId: string
    message?: unknown
    xpertId: string
    tenantId?: string
    organizationId?: string
    userId?: string
    conversationId?: string
  }): Promise<DingTalkInboundFile[]> {
    const refs = this.extractInboundFileRefs(params.message)
    if (!refs.length) {
      return []
    }

    const client = await this.dingtalkChannel.getOrCreateDingTalkClientById(params.integrationId)
    const files: DingTalkInboundFile[] = []
    for (const ref of refs) {
      const downloaded = await client.downloadMessageFile({
        downloadCode: ref.downloadCode,
        robotCode: ref.robotCode
      })
      const buffer = this.normalizeBuffer(downloaded?.buffer)
      if (!buffer?.length) {
        throw new Error(`DingTalk inbound file "${ref.downloadCode}" did not return content`)
      }
      if (buffer.length > DINGTALK_MAX_FILE_BYTES) {
        throw new Error(
          `DingTalk inbound file "${ref.downloadCode}" is too large (${buffer.length} bytes). Maximum size is ${DINGTALK_MAX_FILE_BYTES} bytes.`
        )
      }

      if (ref.kind === 'image') {
        const mimeType = this.detectImageMimeType(buffer) ?? this.normalizeImageMimeType(downloaded?.mimeType)
        if (!mimeType) {
          throw new Error(`DingTalk image file "${ref.downloadCode}" returned unsupported image content`)
        }

        const fileUrl = `data:${mimeType};base64,${buffer.toString('base64')}`
        files.push({
          fileUrl,
          mimeType,
          originalName: downloaded?.fileName || ref.fileName || `${ref.downloadCode}${this.resolveImageExtension(mimeType)}`,
          fileKey: ref.downloadCode
        })
        continue
      }

      files.push(await this.materializeInboundFile(buffer, downloaded, ref, params))
    }

    return files
  }

  private async materializeInboundFile(
    buffer: Buffer,
    downloaded: { mimeType?: string; fileName?: string } | null | undefined,
    ref: DingTalkInboundFileRef,
    scope: {
      integrationId: string
      xpertId: string
      tenantId?: string
      organizationId?: string
      userId?: string
      conversationId?: string
    }
  ): Promise<DingTalkInboundFile> {
    const workspaceFiles = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!workspaceFiles) {
      throw new Error('Platform workspace files capability is required for DingTalk inbound files')
    }

    const fallbackName = `dingtalk-file-${createHash('sha256').update(ref.downloadCode).digest('hex').slice(0, 12)}`
    const originalName = sanitizeDingTalkFileName(downloaded?.fileName || ref.fileName, fallbackName)
    const mimeType = resolveDingTalkFileMimeType(originalName, downloaded?.mimeType)
    const workspaceScope = {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'xperts' as const,
      xpertId: scope.xpertId,
      isolateByUser: false
    }
    const metadata = {
      source: 'dingtalk_message_file',
      integrationId: scope.integrationId,
      organizationId: scope.organizationId,
      downloadCodeHash: createHash('sha256').update(ref.downloadCode).digest('hex'),
      resourceType: ref.kind
    }
    const uploaded = await workspaceFiles.uploadBuffer({
      ...workspaceScope,
      folder: `files/dingtalk/${this.safePathSegment(scope.integrationId)}/${metadata.downloadCodeHash.slice(0, 16)}`,
      fileName: originalName,
      originalName,
      mimeType,
      size: buffer.length,
      buffer,
      metadata
    })
    const understood = await workspaceFiles.understandFile({
      ...workspaceScope,
      filePath: uploaded.filePath,
      originalName,
      mimeType: uploaded.mimeType || mimeType,
      size: uploaded.size ?? buffer.length,
      fileUrl: uploaded.fileUrl ?? uploaded.url,
      purpose: 'chat_attachment',
      parseMode: 'auto',
      conversationId: scope.conversationId,
      metadata
    })

    const fileUrl = understood.fileUrl ?? understood.url ?? uploaded.fileUrl ?? uploaded.url
    return {
      id: understood.fileAssetId ?? understood.fileId ?? understood.id,
      fileAssetId: understood.fileAssetId,
      fileId: understood.fileId,
      storageFileId: understood.storageFileId,
      filePath: understood.filePath || uploaded.filePath,
      workspacePath: understood.workspacePath || uploaded.workspacePath,
      fileUrl,
      url: fileUrl,
      mimeType: understood.mimeType || uploaded.mimeType || mimeType,
      mimetype: understood.mimeType || uploaded.mimeType || mimeType,
      originalName: understood.originalName || originalName,
      name: understood.originalName || originalName,
      fileKey: ref.downloadCode,
      size: understood.size ?? uploaded.size ?? buffer.length
    }
  }

  private extractInboundFileRefs(message: unknown): DingTalkInboundFileRef[] {
    const payload = this.normalizeRecord(message)
    if (!payload) {
      return []
    }

    const msgType = this.resolveDingTalkMessageType(payload)
    const content = this.normalizeRecord(payload.content) ?? this.safeJsonRecord(payload.content)
    const nestedMessage = this.normalizeRecord(payload.message)
    const nestedContent = this.normalizeRecord(nestedMessage?.content) ?? this.safeJsonRecord(nestedMessage?.content)
    const refs: DingTalkInboundFileRef[] = []
    const baseRecords = [payload, content, nestedContent].filter((item): item is Record<string, unknown> => Boolean(item))

    if (msgType === 'image' || msgType === 'picture') {
      const image =
        this.normalizeRecord(payload.image) ??
        this.normalizeRecord(content?.image) ??
        this.normalizeRecord(nestedContent?.image)
      const file =
        this.normalizeRecord(payload.file) ??
        this.normalizeRecord(content?.file) ??
        this.normalizeRecord(nestedContent?.file)
      const ref = this.extractInboundFileRef('image', [content, nestedContent, image, file, payload], baseRecords)
      if (ref) {
        refs.push(ref)
      }
    }

    if (msgType === 'file') {
      const file =
        this.normalizeRecord(payload.file) ??
        this.normalizeRecord(content?.file) ??
        this.normalizeRecord(nestedContent?.file)
      const ref = this.extractInboundFileRef('file', [content, nestedContent, file, payload], baseRecords)
      if (ref) {
        refs.push(ref)
      }
    }

    const richTextItems = [
      ...(Array.isArray(payload.richText) ? payload.richText : []),
      ...(Array.isArray(content?.richText) ? content.richText : []),
      ...(Array.isArray(nestedContent?.richText) ? nestedContent.richText : [])
    ]
    for (const rawItem of richTextItems) {
      const item = this.normalizeRecord(rawItem)
      const itemType = this.resolveDingTalkMessageType(item, true)
      if (itemType !== 'image' && itemType !== 'picture') {
        continue
      }

      const image = this.normalizeRecord(item?.image)
      const file = this.normalizeRecord(item?.file)
      const ref = this.extractInboundFileRef('image', [item, image, file, content, nestedContent, payload], baseRecords)
      if (ref) {
        refs.push(ref)
      }
    }

    const dedupedRefs = new Map<string, (typeof refs)[number]>()
    for (const ref of refs) {
      dedupedRefs.set(ref.downloadCode, ref)
    }
    return [...dedupedRefs.values()]
  }

  private extractInboundFileRef(
    kind: DingTalkInboundFileRef['kind'],
    records: Array<Record<string, unknown> | null | undefined>,
    baseRecords: Array<Record<string, unknown>>
  ): DingTalkInboundFileRef | null {
    const sourceRecords = records.filter((item): item is Record<string, unknown> => Boolean(item))
    const downloadCode = this.firstNormalizedString(sourceRecords, [
      'downloadCode',
      'download_code',
      'pictureDownloadCode',
      'picture_download_code',
      'downloadMediaCode',
      'download_media_code'
    ])
    if (!downloadCode) {
      return null
    }

    return {
      kind,
      downloadCode,
      fileName: this.firstNormalizedString(sourceRecords, ['fileName', 'filename', 'name']),
      robotCode: this.firstNormalizedString(baseRecords, ['robotCode', 'robot_code'])
    }
  }

  private safePathSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128) || 'unknown'
  }

  private resolveDingTalkMessageType(record: Record<string, unknown> | null, includeTypeField = false): string | undefined {
    if (!record) {
      return undefined
    }
    return this.normalizeString(
      record.msgType ??
        record.msgtype ??
        record.MsgType ??
        record.messageType ??
        record.MessageType ??
        (includeTypeField ? record.type : undefined)
    )?.toLowerCase()
  }

  private firstNormalizedString(records: Array<Record<string, unknown>>, keys: string[]): string | undefined {
    for (const record of records) {
      for (const key of keys) {
        const value = this.normalizeString(record[key])
        if (value) {
          return value
        }
      }
    }
    return undefined
  }

  private safeJsonRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null
    }
    try {
      return this.normalizeRecord(JSON.parse(value))
    } catch {
      return null
    }
  }

  private normalizeRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  }

  private normalizeString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }
    const text = value.trim()
    return text || undefined
  }

  private normalizeBuffer(value: unknown): Buffer | null {
    if (Buffer.isBuffer(value)) {
      return value
    }
    if (value instanceof ArrayBuffer) {
      return Buffer.from(value)
    }
    if (ArrayBuffer.isView(value)) {
      return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    }
    return null
  }

  private normalizeImageMimeType(value: unknown): DingTalkImageMimeType | null {
    const mimeType = this.normalizeString(value)?.split(';')[0]?.trim().toLowerCase()
    switch (mimeType) {
      case 'image/png':
      case 'image/jpeg':
      case 'image/gif':
      case 'image/webp':
        return mimeType
      default:
        return null
    }
  }

  private detectImageMimeType(buffer: Buffer): DingTalkImageMimeType | null {
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'image/png'
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg'
    }

    const firstSixBytes = buffer.subarray(0, 6).toString('ascii')
    if (firstSixBytes === 'GIF87a' || firstSixBytes === 'GIF89a') {
      return 'image/gif'
    }
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp'
    }

    return null
  }

  private resolveImageExtension(mimeType: DingTalkImageMimeType): string {
    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg'
      case 'image/png':
        return '.png'
      case 'image/webp':
        return '.webp'
      case 'image/gif':
        return '.gif'
    }
  }

  private normalizeRequestUser(job: DingTalkConversationQueueJob): DingTalkRequestUser {
    const baseUser = job.requestUser ?? { id: job.userId }
    return {
      ...baseUser,
      id: baseUser.id || job.userId,
      tenantId: baseUser.tenantId || job.tenantId,
      organizationId: baseUser.organizationId || job.organizationId
    }
  }

  private resolveRequestUser(fallback: {
    id: string
    tenantId?: string
    organizationId?: string
  }): DingTalkRequestUser {
    const currentUser = (RequestContext.currentUser() || {}) as Record<string, unknown>
    const currentUserId = normalizeConversationUserKey(currentUser.id)
    const fallbackUserId = normalizeConversationUserKey(fallback.id)
    const resolvedUserId =
      (currentUserId && UUID_PATTERN.test(currentUserId) ? currentUserId : null) ||
      (fallbackUserId && UUID_PATTERN.test(fallbackUserId) ? fallbackUserId : null) ||
      fallbackUserId ||
      currentUserId ||
      fallback.id

    return {
      ...currentUser,
      id: resolvedUserId,
      tenantId: (currentUser.tenantId as string) || fallback.tenantId,
      organizationId: (currentUser.organizationId as string) || fallback.organizationId
    }
  }

  private resolveExecutionUserId(integration?: { createdById?: string; updatedById?: string }): string | null {
    const candidates = [
      RequestContext.currentUserId(),
      integration?.createdById,
      integration?.updatedById
    ]
      .map((value) => normalizeConversationUserKey(value))
      .filter((value): value is string => Boolean(value))

    const matched = candidates.find((value) => UUID_PATTERN.test(value))
    return matched ?? null
  }

  private resolveUserIdFromConversationUserKey(conversationUserKey: string): string | null {
    const parsedAnonymous = parseAnonymousConversationKey(conversationUserKey)
    if (parsedAnonymous?.senderId) {
      return parsedAnonymous.senderId
    }

    if (conversationUserKey.startsWith('open_id:')) {
      const openId = normalizeConversationUserKey(conversationUserKey.slice('open_id:'.length))
      return openId ?? null
    }

    const segments = conversationUserKey.split(':')
    if (segments.length === 2) {
      return normalizeConversationUserKey(segments[1])
    }

    return null
  }

  private resolveBindingContext(context?: {
    tenantId?: string | null
    organizationId?: string | null
    createdById?: string | null
    updatedById?: string | null
  }): {
    tenantId: string | null
    organizationId: string | null
    createdById: string | null
    updatedById: string | null
  } {
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId()
    const userId = normalizeConversationUserKey(RequestContext.currentUserId())
    const executionUserId = userId && UUID_PATTERN.test(userId) ? userId : null
    const contextCreatedById = this.normalizeExecutionUserIdField(context?.createdById)
    const contextUpdatedById = this.normalizeExecutionUserIdField(context?.updatedById)
    return {
      tenantId: tenantId ?? this.normalizeBindingContextField(context?.tenantId) ?? null,
      organizationId: organizationId ?? this.normalizeBindingContextField(context?.organizationId) ?? null,
      createdById: executionUserId ?? contextCreatedById ?? null,
      updatedById: executionUserId ?? contextUpdatedById ?? contextCreatedById ?? null
    }
  }

  private hasCompleteDispatchBindingContext(
    binding?: Pick<DingTalkConversationBindingEntity, 'tenantId' | 'organizationId' | 'createdById'> | null
  ): boolean {
    return Boolean(
      this.normalizeBindingContextField(binding?.tenantId) &&
        this.normalizeBindingContextField(binding?.organizationId) &&
        this.normalizeExecutionUserIdField(binding?.createdById)
    )
  }

  private normalizeBindingContextField(value: unknown): string | undefined {
    return normalizeConversationUserKey(value) ?? undefined
  }

  private normalizeExecutionUserIdField(value: unknown): string | undefined {
    const normalized = normalizeConversationUserKey(value)
    if (!normalized || !UUID_PATTERN.test(normalized)) {
      return undefined
    }
    return normalized
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

  private async cacheConversation(
    conversationUserKey: string,
    xpertId: string,
    conversationId: string,
    lastActiveAt?: Date | null
  ): Promise<void> {
    const key = this.getConversationCacheKey(conversationUserKey, xpertId)
    await this.cacheManager.set(
      key,
      {
        conversationId,
        lastActiveAt: lastActiveAt?.toISOString()
      },
      CACHE_TTL_MS
    )
  }

  private async dispatchToDingTalkChat(payload: DispatchDingTalkChatPayload): Promise<ChatDingTalkMessage> {
    return this.commandBus.execute(new DispatchDingTalkChatCommand(payload))
  }

  private async removeConversationBindingFromStore(conversationUserKey: string, xpertId: string): Promise<void> {
    await this.conversationBindingRepository.delete({
      conversationUserKey,
      xpertId
    })
  }

  private getConversationCacheKey(conversationUserKey: string, xpertId: string): string {
    return `${DingTalkConversationService.prefix}:${conversationUserKey}:${xpertId}`
  }

  private getActiveMessageCacheKey(conversationUserKey: string, xpertId: string): string {
    return `${this.getConversationCacheKey(conversationUserKey, xpertId)}:active-message`
  }

  private getUserQueueName(normalizedQueueKey: string): string {
    return `dingtalk:user:${this.queueNamespace}:${normalizedQueueKey}`
  }

  private async replyActionSessionTimedOut(chatContext: ChatDingTalkContext): Promise<void> {
    const { integrationId, chatId } = chatContext
    await this.dingtalkChannel.errorMessage(
      { integrationId, chatId },
      new Error(translate('integration.DingTalk.ActionSessionTimedOut'))
    )
  }

  private getBullRedisConfig(): Bull.QueueOptions['redis'] {
    const redisUrl = process.env.REDIS_URL
    if (redisUrl) {
      return redisUrl
    }

    const host = process.env.REDIS_HOST || 'localhost'
    const portRaw = process.env.REDIS_PORT || 6379
    const username = process.env['REDIS.USERNAME'] || process.env.REDIS_USER || process.env.REDIS_USERNAME || undefined
    const password = process.env.REDIS_PASSWORD || undefined

    const port = Number(portRaw)
    const redis: Bull.QueueOptions['redis'] = {
      host,
      port: Number.isNaN(port) ? 6379 : port
    }
    if (username) {
      redis['username'] = username
    }
    if (password) {
      redis['password'] = password
    }

    if (process.env.REDIS_TLS === 'true') {
      redis['tls'] = {
        host,
        port: Number.isNaN(port) ? 6379 : port
      }
    }

    return redis
  }
}

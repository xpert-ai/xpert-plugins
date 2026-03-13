import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
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
import { DINGTALK_PLUGIN_CONTEXT } from './tokens.js'
import {
  ChatDingTalkContext,
  isConfirmAction,
  isDingTalkCardActionValue,
  isEndAction,
  isRejectAction,
  resolveDingTalkCardActionValue,
  TDingTalkEvent,
  TIntegrationDingTalkOptions
} from './types.js'
import { DingTalkConversationBindingEntity } from './entities/dingtalk-conversation-binding.entity.js'
import { DingTalkTriggerBindingEntity } from './entities/dingtalk-trigger-binding.entity.js'

const CACHE_TTL_MS = 10 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type DingTalkConversationQueueJob = {
  tenantId?: string
  organizationId?: string
  integrationId: string
  userId: string
  senderOpenId?: string
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

type DingTalkTriggerService = {
  handleInboundMessage: (params: {
    integrationId: string
    input?: string
    dingtalkMessage: ChatDingTalkMessage
    options?: {
      confirm?: boolean
      reject?: boolean
    }
  }) => Promise<boolean>
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

export type DingTalkDispatchExecutionContextSource = 'exact' | 'xpert-latest' | 'request-fallback'

export interface DingTalkDispatchExecutionContext {
  tenantId?: string
  organizationId?: string
  createdById?: string
  source: DingTalkDispatchExecutionContextSource
}

@Injectable()
export class DingTalkConversationService implements OnModuleDestroy {
  private readonly logger = new Logger(DingTalkConversationService.name)
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
    @Inject(DINGTALK_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  private async getDingTalkTriggerStrategy(): Promise<DingTalkTriggerService> {
    if (!this._dingtalkTriggerStrategy) {
      const { DingTalkTriggerStrategy } = await import('./workflow/dingtalk-trigger.strategy.js')
      this._dingtalkTriggerStrategy = this.pluginContext.resolve(DingTalkTriggerStrategy)
    }
    return this._dingtalkTriggerStrategy
  }

  private async getBoundXpertId(integrationId: string): Promise<string | null> {
    if (!integrationId) {
      return null
    }

    const binding = await this.triggerBindingRepository.findOne({
      where: {
        integrationId
      }
    })
    return binding?.xpertId ?? null
  }

  async getConversation(conversationUserKey: string, xpertId: string) {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return undefined
    }

    const key = this.getConversationCacheKey(normalizedUserKey, normalizedXpertId)
    const cachedConversationId = await this.cacheManager.get<string>(key)
    if (cachedConversationId) {
      return cachedConversationId
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

    await this.cacheConversation(normalizedUserKey, normalizedXpertId, conversationId)
    return conversationId
  }

  async setConversation(conversationUserKey: string, xpertId: string, conversationId: string) {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    const normalizedConversationId = normalizeConversationUserKey(conversationId)
    if (!normalizedUserKey || !normalizedXpertId || !normalizedConversationId) {
      return
    }

    await this.cacheConversation(normalizedUserKey, normalizedXpertId, normalizedConversationId)

    const userId = this.resolveUserIdFromConversationUserKey(normalizedUserKey)
    const bindingContext = this.resolveBindingContext()
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
      userId ? ['userId'] : ['conversationUserKey', 'xpertId']
    )
  }

  async getLatestConversationBindingByUserId(
    userId: string
  ): Promise<{ xpertId: string; conversationId: string; conversationUserKey: string } | null> {
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
      conversationUserKey: binding.conversationUserKey
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

    const tenantId =
      this.normalizeBindingContextField(exactBinding?.tenantId) ??
      this.normalizeBindingContextField(xpertLatestBinding?.tenantId)
    const organizationId =
      this.normalizeBindingContextField(exactBinding?.organizationId) ??
      this.normalizeBindingContextField(xpertLatestBinding?.organizationId)
    const createdById =
      this.normalizeExecutionUserIdField(exactBinding?.createdById) ??
      this.normalizeExecutionUserIdField(xpertLatestBinding?.createdById)

    return {
      tenantId,
      organizationId,
      createdById,
      source: exactBinding ? 'exact' : xpertLatestBinding ? 'xpert-latest' : 'request-fallback'
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

    const text = this.extractInputText(options)
    const normalizedSenderOpenId = normalizeConversationUserKey(senderOpenId)
    const latestBinding = normalizedSenderOpenId
      ? await this.getLatestConversationBindingByUserId(normalizedSenderOpenId)
      : null

    const triggerXpertId = latestBinding ? null : await this.getBoundXpertId(integrationId)
    const fallbackXpertId = normalizeConversationUserKey(integration.options?.xpertId)
    const targetXpertId = latestBinding?.xpertId ?? triggerXpertId ?? fallbackXpertId
    if (!targetXpertId) {
      await this.dingtalkChannel.errorMessage(
        {
          integrationId,
          chatId: options.chatId
        },
        new Error('No xpertId configured for this DingTalk integration. Please configure xpertId first.')
      )
      return null
    }

    const conversationId =
      normalizeConversationUserKey(options.chatId) ||
      normalizeConversationUserKey(options.message?.conversationId) ||
      normalizeConversationUserKey(options.message?.chatId)

    const conversationUserKey =
      latestBinding?.conversationUserKey ??
      resolveConversationUserKey({
        integrationId,
        conversationId,
        senderOpenId,
        fallbackUserId: options.userId
      })

    if (!conversationUserKey) {
      this.logger.warn(`Failed to resolve conversation user key for integration ${integrationId}`)
      return null
    }

    if (latestBinding?.conversationUserKey && latestBinding?.conversationId) {
      await this.cacheConversation(latestBinding.conversationUserKey, latestBinding.xpertId, latestBinding.conversationId)
    }

    const activeMessage = await this.getActiveMessage(conversationUserKey, targetXpertId)
    const dingtalkMessage = new ChatDingTalkMessage(
      {
        tenant: integration.tenant,
        organizationId: integration.organizationId,
        integrationId,
        preferLanguage: integration.options?.preferLanguage,
        userId: options.userId,
        senderOpenId,
        sessionWebhook: (options.message as any)?.sessionWebhook,
        chatId: options.chatId,
        dingtalkChannel: this.dingtalkChannel
      },
      {
        text,
        language: activeMessage?.thirdPartyMessage?.language || integration.options?.preferLanguage
      }
    )

    if (latestBinding) {
      return await this.dispatchToDingTalkChat({
        xpertId: targetXpertId,
        input: text,
        dingtalkMessage
      })
    }

    const dingtalkTriggerStrategy = await this.getDingTalkTriggerStrategy()
    const handledByTrigger = await dingtalkTriggerStrategy.handleInboundMessage({
      integrationId,
      input: text,
      dingtalkMessage
    })
    if (handledByTrigger) {
      return dingtalkMessage
    }

    if (fallbackXpertId) {
      return await this.dispatchToDingTalkChat({
        xpertId: fallbackXpertId,
        input: text,
        dingtalkMessage
      })
    }

    await this.dingtalkChannel.errorMessage(
      {
        integrationId,
        chatId: options.chatId
      },
      new Error('No xpertId configured for this DingTalk integration. Please configure xpertId first.')
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
      const queue = new Bull<DingTalkConversationQueueJob>(`dingtalk:user:${normalizedQueueKey}`, {
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
                chatId: job.data.chatId,
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
        this.logger.error(`Queue dingtalk:user:${normalizedQueueKey} error: ${error?.message || error}`)
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

    const xpertId = normalizeConversationUserKey(ctx.integration.options?.xpertId)
    if (!xpertId) {
      this.logger.warn('No xpertId configured for integration')
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

  async onModuleDestroy() {
    for (const queue of this.userQueues.values()) {
      await queue.close()
    }
  }

  private extractInputText(options: ChatDingTalkContext<TDingTalkEvent>): string {
    if (typeof options.input === 'string' && options.input.trim()) {
      return options.input.trim()
    }

    const message = options.message
    if (!message) {
      return ''
    }

    if (typeof message.text === 'string' && message.text.trim()) {
      return message.text.trim()
    }

    const bodyMessage = message?.message as { content?: string } | undefined
    if (bodyMessage?.content) {
      try {
        const parsed = JSON.parse(bodyMessage.content)
        if (typeof parsed?.text === 'string') {
          return parsed.text.trim()
        }
      } catch {
        return bodyMessage.content
      }
    }

    return ''
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

  private resolveBindingContext(): {
    tenantId: string | null
    organizationId: string | null
    createdById: string | null
    updatedById: string | null
  } {
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId()
    const userId = normalizeConversationUserKey(RequestContext.currentUserId())
    const executionUserId = userId && UUID_PATTERN.test(userId) ? userId : null
    return {
      tenantId: tenantId ?? null,
      organizationId: organizationId ?? null,
      createdById: executionUserId,
      updatedById: executionUserId
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

  private async cacheConversation(
    conversationUserKey: string,
    xpertId: string,
    conversationId: string
  ): Promise<void> {
    const key = this.getConversationCacheKey(conversationUserKey, xpertId)
    await this.cacheManager.set(key, conversationId, CACHE_TTL_MS)
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

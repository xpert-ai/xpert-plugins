import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  RequestContext,
  TChatEventContext,
  TChatInboundMessage,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { type Cache } from 'cache-manager'
import { IIntegration } from '@metad/contracts'
import { Repository } from 'typeorm'
import { ChatWeComMessage } from './message.js'
import { WECOM_PLUGIN_CONTEXT } from './tokens.js'
import {
  normalizeConversationUserKey,
  parseConversationUserKey,
  resolveConversationUserKey
} from './conversation-user-key.js'
import { TIntegrationWeComOptions } from './types.js'
import { WeComChannelStrategy } from './wecom-channel.strategy.js'
import {
  getWeComAvailableTriggerMissingText,
  getWeComNewConversationStartedText,
  getWeComTriggerBindingMissingText
} from './wecom-conversation-text.js'
import { WeComConversationBindingEntity } from './entities/wecom-conversation-binding.entity.js'
import { WeComTriggerStrategy } from './workflow/wecom-trigger.strategy.js'

const CACHE_TTL_MS = 10 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type WeComTriggerService = {
  handleInboundMessage: (params: {
    integrationId: string
    input?: string
    wecomMessage: ChatWeComMessage
    conversationId?: string
    conversationUserKey?: string
    tenantId: string
    organizationId?: string
    executorUserId?: string
    endUserId?: string
  }) => Promise<boolean>
  getBinding?: (integrationId: string) => Promise<{
    xpertId: string
    sessionTimeoutSeconds?: number
    summaryWindowSeconds?: number
  } | null>
  clearBufferedConversation?: (conversationUserKey: string) => Promise<void>
}

type WeComConversationBindingState = {
  conversationId: string
  lastActiveAt?: Date
}

export type WeComConversationBindingListItem = {
  id: string
  chatType: string | null
  chatId: string | null
  senderId: string | null
  xpertId: string
  conversationId: string
  updatedAt: Date | null
}

export type WeComConversationBindingListQuery = {
  page?: number
  pageSize?: number
  search?: string | null
  sortBy?: string | null
  sortDirection?: 'asc' | 'desc' | null
}

export type WeComConversationBindingListResult = {
  items: WeComConversationBindingListItem[]
  total: number
}

@Injectable()
export class WeComConversationService {
  private readonly logger = new Logger(WeComConversationService.name)
  private _integrationPermissionService: IntegrationPermissionService
  private _wecomTriggerStrategy: WeComTriggerService

  constructor(
    private readonly wecomChannel: WeComChannelStrategy,
    private readonly wecomTriggerStrategy: WeComTriggerStrategy,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @InjectRepository(WeComConversationBindingEntity)
    private readonly conversationBindingRepository: Repository<WeComConversationBindingEntity>,
    @Inject(WECOM_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  private async getWeComTriggerStrategy(): Promise<WeComTriggerService> {
    if (!this._wecomTriggerStrategy) {
      this._wecomTriggerStrategy = this.wecomTriggerStrategy
    }
    return this._wecomTriggerStrategy
  }

  async getConversationState(
    conversationUserKey: string,
    xpertId: string
  ): Promise<WeComConversationBindingState | undefined> {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return undefined
    }

    const key = this.getConversationCacheKey(normalizedUserKey, normalizedXpertId)
    const cachedValue = await this.cacheManager.get<{
      conversationId?: unknown
      lastActiveAt?: unknown
    }>(key)
    if (cachedValue && typeof cachedValue === 'object') {
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

    const lastActiveAt = this.normalizeDate(binding?.lastActiveAt) ?? this.normalizeDate(binding?.updatedAt)
    await this.cacheConversation(normalizedUserKey, normalizedXpertId, conversationId, lastActiveAt)
    return {
      conversationId,
      lastActiveAt: lastActiveAt ?? undefined
    }
  }

  async getConversation(conversationUserKey: string, xpertId: string): Promise<string | undefined> {
    const state = await this.getConversationState(conversationUserKey, xpertId)
    return state?.conversationId
  }

  async setConversation(
    conversationUserKey: string,
    xpertId: string,
    conversationId: string,
    lastActiveAt: Date = new Date()
  ): Promise<void> {
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

    const userId = this.resolveUserIdFromConversationUserKey(normalizedUserKey)
    const bindingContext = this.resolveBindingContext()
    await this.conversationBindingRepository.upsert(
      {
        userId: userId ?? null,
        conversationUserKey: normalizedUserKey,
        xpertId: normalizedXpertId,
        conversationId: normalizedConversationId,
        lastActiveAt: resolvedLastActiveAt,
        tenantId: bindingContext.tenantId ?? null,
        organizationId: bindingContext.organizationId ?? null,
        createdById: bindingContext.createdById ?? null,
        updatedById: bindingContext.updatedById ?? null
      },
      userId ? ['userId'] : ['conversationUserKey', 'xpertId']
    )
  }

  async touchConversation(
    conversationUserKey: string,
    xpertId: string,
    lastActiveAt: Date = new Date()
  ): Promise<void> {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return
    }

    const existing = await this.getConversationState(normalizedUserKey, normalizedXpertId)
    if (!existing?.conversationId) {
      return
    }

    const resolvedLastActiveAt = this.normalizeDate(lastActiveAt) ?? new Date()
    await this.cacheConversation(
      normalizedUserKey,
      normalizedXpertId,
      existing.conversationId,
      resolvedLastActiveAt
    )
    await this.conversationBindingRepository.update(
      {
        conversationUserKey: normalizedUserKey,
        xpertId: normalizedXpertId
      },
      {
        lastActiveAt: resolvedLastActiveAt
      }
    )
  }

  async clearConversation(conversationUserKey: string, xpertId: string): Promise<void> {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return
    }

    await this.cacheManager.del(this.getConversationCacheKey(normalizedUserKey, normalizedXpertId))
    await this.removeConversationBindingFromStore(normalizedUserKey, normalizedXpertId)
  }

  async restartConversationBinding(integrationId: string, bindingId: string): Promise<void> {
    const normalizedIntegrationId = normalizeConversationUserKey(integrationId)
    const normalizedBindingId = normalizeConversationUserKey(bindingId)
    if (!normalizedIntegrationId || !normalizedBindingId) {
      throw new Error('缺少可重置的会话目标。')
    }

    const binding = await this.conversationBindingRepository.findOne({
      where: {
        id: normalizedBindingId
      }
    })
    if (!binding) {
      throw new Error('该会话不存在或已被重置。')
    }

    const parsedConversationUserKey = parseConversationUserKey(binding.conversationUserKey)
    if (!parsedConversationUserKey) {
      throw new Error('该会话已不可重置。')
    }
    if (parsedConversationUserKey.integrationId !== normalizedIntegrationId) {
      throw new Error('该会话不属于当前企业微信集成。')
    }

    await this.clearConversation(binding.conversationUserKey, binding.xpertId)

    const triggerStrategy = await this.getWeComTriggerStrategy()
    if (typeof triggerStrategy.clearBufferedConversation === 'function') {
      await triggerStrategy.clearBufferedConversation(binding.conversationUserKey)
    }
  }

  async listBindingsByIntegration(
    integrationId: string,
    query: WeComConversationBindingListQuery = {}
  ): Promise<WeComConversationBindingListResult> {
    const normalizedIntegrationId = normalizeConversationUserKey(integrationId)
    if (!normalizedIntegrationId) {
      return {
        items: [],
        total: 0
      }
    }

    const bindings = await this.conversationBindingRepository.find({
      order: {
        updatedAt: 'DESC'
      }
    })

    const normalizedSearch = this.normalizeListSearch(query.search)
    const filtered = bindings
      .map((binding) => this.toBindingListItem(binding, normalizedIntegrationId))
      .filter((binding): binding is WeComConversationBindingListItem => Boolean(binding))
      .filter((binding) => {
        if (!normalizedSearch) {
          return true
        }

        return [
          binding.chatType,
          binding.chatId,
          binding.senderId,
          binding.xpertId,
          binding.conversationId
        ].some((value) => this.normalizeListSearch(value)?.includes(normalizedSearch))
      })

    const sorted = this.sortBindingListItems(filtered, query.sortBy, query.sortDirection)
    const pageSize = this.normalizePositiveInt(query.pageSize) ?? 10
    const page = this.normalizePositiveInt(query.page) ?? 1
    const start = Math.max(0, (page - 1) * pageSize)

    return {
      items: sorted.slice(start, start + pageSize),
      total: sorted.length
    }
  }

  async handleMessage(message: TChatInboundMessage, ctx: TChatEventContext<TIntegrationWeComOptions>): Promise<void> {
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWeComOptions>>(
      ctx.integration.id,
      {
        relations: ['tenant']
      }
    )

    if (!integration) {
      this.logger.error(`Integration ${ctx.integration.id} not found`)
      return
    }

    const input = this.normalizeInputText(message.content)
    if (!input) {
      this.logger.debug(`Skip empty WeCom message integration=${integration.id} chatId=${message.chatId}`)
      return
    }

    const executorUserId = this.resolveExecutionUserId(integration)

    const conversationUserKey = resolveConversationUserKey({
      integrationId: integration.id,
      chatId: message.chatId,
      senderId: message.senderId,
      fallbackUserId: executorUserId
    })

    const wecomMessage = new ChatWeComMessage(
      {
        integrationId: integration.id,
        chatId: message.chatId,
        chatType: message.chatType,
        senderId: message.senderId,
        responseUrl: this.resolveResponseUrl(message.raw),
        reqId: this.resolveReqId(message.raw),
        wecomChannel: this.wecomChannel
      },
      {
        status: 'thinking',
        language: integration.options?.preferLanguage
      }
    )

    const tenantId = integration.tenantId || ctx.tenantId
    const organizationId = integration.organizationId || ctx.organizationId
    const triggerStrategy = await this.getWeComTriggerStrategy()
    const triggerBinding =
      typeof triggerStrategy.getBinding === 'function'
        ? await triggerStrategy.getBinding(integration.id)
        : null
    const triggerBoundXpertId = normalizeConversationUserKey(triggerBinding?.xpertId)
    if (!triggerBoundXpertId) {
      this.logger.warn(
        `[wecom-conversation] trigger binding missing integrationId=${integration.id} chatId=${message.chatId} senderId=${
          message.senderId || 'n/a'
        }`
      )
      await this.wecomChannel.errorMessage(
        {
          integrationId: integration.id,
          chatId: message.chatId,
          chatType: message.chatType,
          senderId: message.senderId,
          responseUrl: this.resolveResponseUrl(message.raw),
          reqId: this.resolveReqId(message.raw)
        },
        new Error(getWeComTriggerBindingMissingText(integration.options?.preferLanguage))
      )
      return
    }

    const newSessionCommand = this.parseNewSessionCommand(input)
    if (newSessionCommand.matched && conversationUserKey) {
      await this.clearConversation(conversationUserKey, triggerBoundXpertId)
      if (typeof triggerStrategy.clearBufferedConversation === 'function') {
        await triggerStrategy.clearBufferedConversation(conversationUserKey)
      }

      if (!newSessionCommand.input) {
        await wecomMessage.reply(getWeComNewConversationStartedText(wecomMessage.language))
        return
      }
    }

    let triggerConversationId: string | undefined
    if (conversationUserKey && !newSessionCommand.matched) {
      const currentConversation = await this.getConversationState(conversationUserKey, triggerBoundXpertId)
      const sessionTimeoutMs = this.resolveSessionTimeoutMs(triggerBinding?.sessionTimeoutSeconds)
      if (currentConversation?.conversationId) {
        if (this.isConversationExpired(currentConversation.lastActiveAt, sessionTimeoutMs)) {
          await this.clearConversation(conversationUserKey, triggerBoundXpertId)
        } else {
          triggerConversationId = currentConversation.conversationId
          await this.touchConversation(conversationUserKey, triggerBoundXpertId)
        }
      }
    }

    const handledByTrigger = await triggerStrategy.handleInboundMessage({
      integrationId: integration.id,
      input: newSessionCommand.matched ? newSessionCommand.input : input,
      wecomMessage,
      conversationId: triggerConversationId,
      conversationUserKey: conversationUserKey || undefined,
      tenantId,
      organizationId,
      executorUserId,
      endUserId: message.senderId
    })
    if (handledByTrigger) {
      this.logger.debug(
        `[wecom-conversation] handled by trigger integrationId=${integration.id} chatId=${message.chatId} senderId=${message.senderId || 'n/a'}`
      )
      return
    }
    this.logger.warn(
      `[wecom-conversation] trigger dispatch miss integrationId=${integration.id} chatId=${message.chatId} senderId=${
        message.senderId || 'n/a'
      }`
    )
    await this.wecomChannel.errorMessage(
      {
        integrationId: integration.id,
        chatId: message.chatId,
        chatType: message.chatType,
        senderId: message.senderId,
        responseUrl: this.resolveResponseUrl(message.raw),
        reqId: this.resolveReqId(message.raw)
      },
      new Error(getWeComAvailableTriggerMissingText(integration.options?.preferLanguage))
    )
  }

  private normalizeInputText(value: unknown): string {
    if (typeof value !== 'string') {
      return ''
    }
    return value.trim()
  }

  private resolveResponseUrl(raw: unknown): string | undefined {
    if (!raw || typeof raw !== 'object') {
      return undefined
    }
    const record = raw as Record<string, unknown>
    const direct =
      (typeof record.response_url === 'string' ? record.response_url : undefined) ||
      (typeof record.responseUrl === 'string' ? record.responseUrl : undefined) ||
      (typeof record.ResponseUrl === 'string' ? record.ResponseUrl : undefined)
    const nested =
      typeof (record.response as Record<string, unknown> | undefined)?.url === 'string'
        ? ((record.response as Record<string, unknown>).url as string)
        : undefined
    const value = (direct || nested || '').trim()
    return value || undefined
  }

  private resolveReqId(raw: unknown): string | undefined {
    if (!raw || typeof raw !== 'object') {
      return undefined
    }
    const record = raw as Record<string, unknown>
    const direct =
      (typeof record.req_id === 'string' ? record.req_id : undefined) ||
      (typeof record.reqId === 'string' ? record.reqId : undefined) ||
      (typeof record.ReqId === 'string' ? record.ReqId : undefined)
    const nested =
      typeof (record.headers as Record<string, unknown> | undefined)?.req_id === 'string'
        ? ((record.headers as Record<string, unknown>).req_id as string)
        : typeof (record.headers as Record<string, unknown> | undefined)?.reqId === 'string'
          ? ((record.headers as Record<string, unknown>).reqId as string)
          : undefined
    const value = (direct || nested || '').trim()
    return value || undefined
  }

  private resolveExecutionUserId(integration?: {
    createdById?: string
    updatedById?: string
  }): string | undefined {
    const candidates = [
      RequestContext.currentUserId(),
      integration?.createdById,
      integration?.updatedById
    ]
      .map((value) => normalizeConversationUserKey(value))
      .filter((value): value is string => Boolean(value))

    const uuidMatched = candidates.find((value) => UUID_PATTERN.test(value))
    return uuidMatched ?? candidates[0]
  }

  private getConversationCacheKey(conversationUserKey: string, xpertId: string): string {
    return `wecom:chat:${conversationUserKey}:${xpertId}`
  }

  private resolveUserIdFromConversationUserKey(conversationUserKey: string): string | null {
    return parseConversationUserKey(conversationUserKey)?.senderId ?? null
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

  private async removeConversationBindingFromStore(conversationUserKey: string, xpertId: string): Promise<void> {
    await this.conversationBindingRepository.delete({
      conversationUserKey,
      xpertId
    })
  }

  private toBindingListItem(
    binding: WeComConversationBindingEntity,
    integrationId: string
  ): WeComConversationBindingListItem | null {
    const bindingId = normalizeConversationUserKey(binding.id)
    const parsed = parseConversationUserKey(binding.conversationUserKey)
    if (!bindingId || !parsed || parsed.integrationId !== integrationId) {
      return null
    }

    return {
      id: bindingId,
      chatType: this.resolveChatType(parsed.chatId, parsed.senderId),
      chatId: parsed.chatId,
      senderId: parsed.senderId,
      xpertId: binding.xpertId,
      conversationId: binding.conversationId,
      updatedAt: this.normalizeDate(binding.lastActiveAt) ?? this.normalizeDate(binding.updatedAt) ?? null
    }
  }

  private sortBindingListItems(
    items: WeComConversationBindingListItem[],
    sortBy?: string | null,
    sortDirection?: 'asc' | 'desc' | null
  ): WeComConversationBindingListItem[] {
    const key =
      sortBy === 'chatType' ||
      sortBy === 'chatId' ||
      sortBy === 'senderId' ||
      sortBy === 'xpertId' ||
      sortBy === 'conversationId' ||
      sortBy === 'updatedAt'
        ? sortBy
        : 'updatedAt'
    const direction = sortDirection === 'asc' ? 'asc' : 'desc'

    return [...items].sort((left, right) => {
      const factor = direction === 'asc' ? 1 : -1
      if (key === 'updatedAt') {
        const leftTime = left.updatedAt?.getTime() ?? 0
        const rightTime = right.updatedAt?.getTime() ?? 0
        return factor * (leftTime - rightTime)
      }

      const leftValue =
        key === 'chatType'
          ? left.chatType ?? ''
          : key === 'chatId'
            ? left.chatId ?? ''
            : key === 'senderId'
              ? left.senderId ?? ''
              : key === 'xpertId'
                ? left.xpertId
                : left.conversationId
      const rightValue =
        key === 'chatType'
          ? right.chatType ?? ''
          : key === 'chatId'
            ? right.chatId ?? ''
            : key === 'senderId'
              ? right.senderId ?? ''
              : key === 'xpertId'
                ? right.xpertId
                : right.conversationId
      return factor * leftValue.localeCompare(rightValue)
    })
  }

  private resolveChatType(chatId?: string | null, senderId?: string | null): string | null {
    const normalizedChatId = normalizeConversationUserKey(chatId)
    const normalizedSenderId = normalizeConversationUserKey(senderId)
    if (!normalizedChatId || !normalizedSenderId) {
      return null
    }

    return normalizedChatId !== normalizedSenderId ? 'group' : 'private'
  }

  private normalizeListSearch(value: unknown): string | null {
    const normalized = normalizeConversationUserKey(value)
    return normalized ? normalized.toLocaleLowerCase() : null
  }

  private normalizePositiveInt(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value
    }

    return null
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
}

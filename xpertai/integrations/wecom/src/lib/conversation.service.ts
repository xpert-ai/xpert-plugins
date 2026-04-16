import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
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
import { DispatchWeComChatCommand, DispatchWeComChatPayload } from './handoff/commands/dispatch-wecom-chat.command.js'
import { ChatWeComMessage } from './message.js'
import { WECOM_PLUGIN_CONTEXT } from './tokens.js'
import { normalizeConversationUserKey, resolveConversationUserKey } from './conversation-user-key.js'
import { TIntegrationWeComOptions } from './types.js'
import { WeComChannelStrategy } from './wecom-channel.strategy.js'
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
  getBoundXpertId?: (integrationId: string) => Promise<string | null>
}

@Injectable()
export class WeComConversationService {
  private readonly logger = new Logger(WeComConversationService.name)
  private _integrationPermissionService: IntegrationPermissionService
  private _wecomTriggerStrategy: WeComTriggerService

  constructor(
    private readonly commandBus: CommandBus,
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

  async getConversation(conversationUserKey: string, xpertId: string): Promise<string | undefined> {
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

  async setConversation(conversationUserKey: string, xpertId: string, conversationId: string): Promise<void> {
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

  async clearConversation(conversationUserKey: string, xpertId: string): Promise<void> {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return
    }

    await this.cacheManager.del(this.getConversationCacheKey(normalizedUserKey, normalizedXpertId))
    await this.removeConversationBindingFromStore(normalizedUserKey, normalizedXpertId)
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
        senderId: message.senderId,
        responseUrl: this.resolveResponseUrl(message.raw),
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
    const triggerBoundXpertId = normalizeConversationUserKey(
      typeof triggerStrategy.getBoundXpertId === 'function'
        ? await triggerStrategy.getBoundXpertId(integration.id)
        : null
    )
    const triggerConversationId =
      conversationUserKey && triggerBoundXpertId
        ? await this.getConversation(conversationUserKey, triggerBoundXpertId)
        : undefined
    const handledByTrigger = await triggerStrategy.handleInboundMessage({
      integrationId: integration.id,
      input,
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
    this.logger.debug(
      `[wecom-conversation] trigger miss, fallback to integration xpertId integrationId=${integration.id} chatId=${message.chatId}`
    )

    const xpertId = normalizeConversationUserKey(integration.options?.xpertId)
    if (!xpertId) {
      this.logger.warn(
        `[wecom-conversation] fallback xpertId missing integrationId=${integration.id} chatId=${message.chatId} senderId=${message.senderId || 'n/a'}`
      )
      await this.wecomChannel.errorMessage(
        {
          integrationId: integration.id,
          chatId: message.chatId,
          senderId: message.senderId,
          responseUrl: this.resolveResponseUrl(message.raw)
        },
        new Error('No xpertId configured for this WeCom integration. Please configure xpertId first.')
      )
      return
    }

    const fallbackConversationId =
      conversationUserKey && xpertId
        ? await this.getConversation(conversationUserKey, xpertId)
        : undefined

    await this.dispatchToWeComChat({
      xpertId,
      input,
      wecomMessage,
      conversationId: fallbackConversationId,
      conversationUserKey: conversationUserKey || undefined,
      tenantId,
      organizationId,
      executorUserId,
      endUserId: message.senderId
    })
    this.logger.debug(
      `[wecom-conversation] dispatched by fallback xpertId integrationId=${integration.id} xpertId=${xpertId} chatId=${message.chatId}`
    )
  }

  private async dispatchToWeComChat(payload: DispatchWeComChatPayload): Promise<ChatWeComMessage> {
    return this.commandBus.execute(new DispatchWeComChatCommand(payload))
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
    const segments = conversationUserKey.split(':')
    if (segments.length < 3) {
      return null
    }
    return normalizeConversationUserKey(segments[segments.length - 1])
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
    conversationId: string
  ): Promise<void> {
    const key = this.getConversationCacheKey(conversationUserKey, xpertId)
    await this.cacheManager.set(key, conversationId, CACHE_TTL_MS)
  }

  private async removeConversationBindingFromStore(conversationUserKey: string, xpertId: string): Promise<void> {
    await this.conversationBindingRepository.delete({
      conversationUserKey,
      xpertId
    })
  }
}

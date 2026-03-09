import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  CHAT_CHANNEL_TEXT_LIMITS,
  ChatChannel,
  IChatChannel,
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  TChatCardAction,
  TChatChannelCapabilities,
  TChatChannelMeta,
  TChatContext,
  TChatEventContext,
  TChatEventHandlers,
  TChatInboundMessage,
  TChatSendResult,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { type Cache } from 'cache-manager'
import { IIntegration } from '@metad/contracts'
import { DINGTALK_PLUGIN_CONTEXT } from './tokens.js'
import {
  buildEventDedupeKey,
  ChatDingTalkContext,
  DingTalkCardActionValue,
  isDingTalkCardActionValue,
  normalizeDingTalkRobotCode,
  TDingTalkEvent,
  TIntegrationDingTalkOptions
} from './types.js'
import { DingTalkClient } from './dingtalk.client.js'

type DingTalkRecipient = {
  type: 'chat_id' | 'open_id' | 'user_id' | 'union_id' | 'email'
  id: string
}

type DingTalkClientCacheEntry = {
  integration: IIntegration<TIntegrationDingTalkOptions>
  client: DingTalkClient
  revision: string
}

@Injectable()
@ChatChannel('dingtalk')
export class DingTalkChannelStrategy implements IChatChannel<TIntegrationDingTalkOptions> {
  private readonly logger = new Logger(DingTalkChannelStrategy.name)

  @Inject(CACHE_MANAGER)
  private readonly cacheManager: Cache

  private readonly clients = new Map<string, DingTalkClientCacheEntry>()
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    @Inject(DINGTALK_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  meta: TChatChannelMeta = {
    type: 'dingtalk',
    label: '钉钉 / DingTalk',
    description: 'DingTalk bidirectional messaging channel',
    icon: 'dingtalk',
    configSchema: {
      type: 'object',
      properties: {
        clientId: { type: 'string', description: 'DingTalk app key (client id)' },
        clientSecret: { type: 'string', description: 'DingTalk app secret' },
        robotCode: { type: 'string', description: 'DingTalk robot code for send APIs' },
        xpertId: { type: 'string', description: 'Fallback xpert id when trigger binding is not configured' },
        httpCallbackEnabled: { type: 'boolean' },
        callbackToken: { type: 'string', description: 'HTTP callback signature token' },
        callbackAesKey: { type: 'string', description: 'HTTP callback AES key' },
        appKey: { type: 'string', description: 'DingTalk appKey for callback payload' }
      },
      required: ['clientId', 'clientSecret']
    }
  }

  capabilities: TChatChannelCapabilities = {
    markdown: true,
    card: true,
    cardAction: true,
    updateMessage: true,
    mention: true,
    group: true,
    thread: false,
    media: false,
    textChunkLimit: CHAT_CHANNEL_TEXT_LIMITS['dingtalk'] || 3000,
    streamingUpdate: true
  }

  getOrCreateDingTalkClient(integration: IIntegration<TIntegrationDingTalkOptions>): DingTalkClientCacheEntry {
    const existed = this.clients.get(integration.id)
    const revision = this.resolveIntegrationRevision(integration)
    if (existed && existed.revision === revision) {
      return existed
    }

    const client = new DingTalkClient(integration)
    const entry = {
      integration,
      client,
      revision
    }
    this.clients.set(integration.id, entry)
    return entry
  }

  private resolveIntegrationRevision(integration: IIntegration<TIntegrationDingTalkOptions>): string {
    const updatedAtValue = (integration as any)?.updatedAt
    const updatedAt = updatedAtValue instanceof Date ? updatedAtValue.getTime() : String(updatedAtValue ?? '')
    const options = integration.options || ({} as TIntegrationDingTalkOptions)
    const clientId = typeof options.clientId === 'string' ? options.clientId.trim() : ''
    const clientSecretMarker = typeof options.clientSecret === 'string' && options.clientSecret.trim() ? 'set' : 'empty'
    const robotCode = typeof options.robotCode === 'string' ? options.robotCode.trim() : ''
    return `${updatedAt}|${clientId}|${clientSecretMarker}|${robotCode}`
  }

  async getOrCreateDingTalkClientById(integrationId: string): Promise<DingTalkClient> {
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationDingTalkOptions>>(
      integrationId,
      {
        relations: ['tenant']
      }
    )
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`)
    }

    return this.getOrCreateDingTalkClient(integration).client
  }

  createEventHandler(
    ctx: TChatEventContext<TIntegrationDingTalkOptions>,
    handlers: TChatEventHandlers
  ): (req: any, res: any, next?: any) => Promise<void> {
    const eventHandlers = handlers ?? {}

    return async (req, res) => {
      const normalized = this.normalizeWebhookEvent(req.body)
      if (!normalized) {
        res.status(200).send('success')
        return
      }

      const dedupeSkipped = await this.shouldSkipDuplicatedEvent(ctx.integration.id, normalized)
      if (dedupeSkipped) {
        res.status(200).send('success')
        return
      }

      // Cache sessionWebhook by (integrationId, conversationId) so notify tools can use it when sending to this chat
      const convId = normalized.conversationId || normalized.chatId
      if (normalized.sessionWebhook && convId) {
        await this.cacheSessionWebhook(
          ctx.integration.id,
          convId,
          normalized.sessionWebhook,
          normalized.sessionWebhookExpiredTime
        )
      }

      if (normalized.cardAction && eventHandlers.onCardAction) {
        const action = this.parseCardAction(normalized, ctx)
        if (action) {
          await eventHandlers.onCardAction(action, ctx)
        }
        res.status(200).send('success')
        return
      }

      const message = this.parseInboundMessage(normalized, ctx)
      if (!message) {
        res.status(200).send('success')
        return
      }

      if (this.isSelfMessage(normalized, message)) {
        this.logger.debug(`Skip DingTalk self message: sender=${message.senderId}, chatbot=${normalized.chatbotUserId}`)
        res.status(200).send('success')
        return
      }

      if (message.chatType === 'group') {
        if (!this.isMessageMentioningBot(normalized, message)) {
          this.logger.debug(`Skip group message without @bot: conversation=${message.chatId}, sender=${message.senderId}`)
          res.status(200).send('success')
          return
        }
        await eventHandlers.onMention?.(message, ctx)
      } else {
        await eventHandlers.onMessage?.(message, ctx)
      }

      res.status(200).send('success')
    }
  }

  private async shouldSkipDuplicatedEvent(integrationId: string, event: TDingTalkEvent): Promise<boolean> {
    const key = buildEventDedupeKey({
      integrationId,
      eventId: event.eventId,
      timestamp: event.timestamp,
      conversationId: event.conversationId || event.chatId,
      senderId: event.senderId
    })

    const existed = await this.cacheManager.get<string>(`dingtalk:dedupe:${key}`)
    if (existed) {
      this.logger.warn(`Skip duplicated dingtalk event: ${key}`)
      return true
    }

    const ttlSeconds = this.resolveDedupeTtlSeconds()
    await this.cacheManager.set(`dingtalk:dedupe:${key}`, '1', ttlSeconds * 1000)
    return false
  }

  private sessionWebhookCacheKey(integrationId: string, conversationId: string): string {
    return `dingtalk:sw:${integrationId}:${conversationId}`
  }

  private async cacheSessionWebhook(
    integrationId: string,
    conversationId: string,
    sessionWebhook: string,
    expiredTimeMs?: number
  ): Promise<void> {
    const ttlMs =
      typeof expiredTimeMs === 'number' && expiredTimeMs > Date.now()
        ? Math.min(2 * 3600 * 1000, expiredTimeMs - Date.now())
        : 3600 * 1000
    await this.cacheManager.set(this.sessionWebhookCacheKey(integrationId, conversationId), sessionWebhook, Math.max(60000, ttlMs))
  }

  async getCachedSessionWebhook(integrationId: string, conversationId: string): Promise<string | null> {
    const v = await this.cacheManager.get<string>(this.sessionWebhookCacheKey(integrationId, conversationId))
    return typeof v === 'string' && v ? v : null
  }

  private resolveDedupeTtlSeconds(): number {
    const configured = Number((this.pluginContext.config as any)?.dedupe?.ttlSeconds)
    if (Number.isFinite(configured) && configured > 0) {
      return configured
    }
    return 180
  }

  private normalizeWebhookEvent(body: any): TDingTalkEvent | null {
    if (!body) {
      return null
    }

    if (body.__normalizedEvent) {
      return body.__normalizedEvent as TDingTalkEvent
    }

    const payload = body?.data && typeof body.data === 'object' ? body.data : body
    const headers = body?.headers || payload?.headers || {}

    const eventType =
      payload?.EventType ||
      payload?.eventType ||
      headers?.eventType ||
      payload?.type ||
      ''

    const eventId =
      payload?.EventId ||
      payload?.eventId ||
      headers?.eventId ||
      payload?.msgId ||
      `${Date.now()}`

    const timestamp = Number(
      payload?.Timestamp ||
        payload?.eventTime ||
        payload?.createAt ||
        headers?.eventBornTime ||
        Date.now()
    )

    const conversationId =
      payload?.conversationId ||
      payload?.openConversationId ||
      payload?.conversation?.openConversationId ||
      payload?.chatId ||
      payload?.chat_id

    const chatbotUserId =
      payload?.chatbotUserId ||
      payload?.chatbotUser?.id ||
      payload?.robotUserId

    const senderId =
      payload?.senderStaffId ||
      payload?.senderId ||
      payload?.sender?.staffId ||
      payload?.sender?.openId ||
      payload?.sender?.senderId ||
      payload?.staffId ||
      payload?.userid

    const senderName = payload?.senderNick || payload?.senderName || payload?.sender?.nick || payload?.sender?.name
    const robotCode = typeof payload?.robotCode === 'string' ? payload.robotCode : undefined

    const cardActionValue = payload?.actionCallback?.value || payload?.value
    const isCardAction =
      eventType === 'chatbot_card_callback' ||
      Boolean(payload?.actionCallback) ||
      Boolean(payload?.msgId && cardActionValue)

    if (isCardAction) {
      return {
        eventType,
        eventId,
        timestamp,
        chatId: conversationId,
        conversationId,
        robotCode,
        chatbotUserId,
        isInAtList: payload?.isInAtList === true,
        senderId,
        senderName,
        sessionWebhook: payload?.sessionWebhook,
        cardAction: {
          messageId: payload?.msgId || payload?.messageId,
          chatId: conversationId,
          userId: senderId,
          value: cardActionValue
        },
        raw: payload
      }
    }

    const textFromRichText = Array.isArray(payload?.richText)
      ? payload.richText
          .map((item: any) => (typeof item?.text === 'string' ? item.text : ''))
          .filter(Boolean)
          .join('')
      : ''

    const textFromContentObject =
      typeof payload?.content === 'object' && payload?.content
        ? payload.content?.text || payload.content?.content || ''
        : ''

    let textFromContentString = ''
    if (typeof payload?.content === 'string') {
      try {
        const parsedContent = JSON.parse(payload.content)
        textFromContentString =
          (typeof parsedContent?.text === 'string' && parsedContent.text) ||
          (typeof parsedContent?.content === 'string' && parsedContent.content) ||
          ''
      } catch {
        textFromContentString = payload.content
      }
    }

    const text =
      payload?.text?.content ||
      textFromContentObject ||
      textFromContentString ||
      payload?.msg?.text ||
      textFromRichText ||
      payload?.message ||
      (typeof payload?.text === 'string' ? payload.text : null)

    if (!text && !conversationId) {
      return null
    }

    const mentions = Array.isArray(payload?.atUsers)
      ? payload.atUsers.map((item: any) => ({
          id: item?.dingtalkId || item?.staffId || item?.userId,
          name: item?.name
        }))
      : []

    const sessionWebhookExpiredTime =
      typeof payload?.sessionWebhookExpiredTime === 'number' ? payload.sessionWebhookExpiredTime : undefined

    return {
      eventType,
      eventId,
      timestamp,
      text: text ? String(text) : '',
      chatId: conversationId,
      conversationId,
      robotCode,
      chatbotUserId,
      isInAtList: payload?.isInAtList === true,
      senderId,
      senderName,
      sessionWebhook: payload?.sessionWebhook,
      sessionWebhookExpiredTime,
      mentions,
      raw: payload
    }
  }

  parseInboundMessage(event: TDingTalkEvent, _ctx: TChatEventContext<TIntegrationDingTalkOptions>): TChatInboundMessage | null {
    if (!event?.conversationId && !event?.chatId) {
      return null
    }

    const raw = event.raw as Record<string, any> | undefined
    const chatTypeRaw = raw?.conversationType || raw?.chatType || raw?.sessionWebhookType
    const normalizedChatType = String(chatTypeRaw ?? '').toLowerCase()
    const chatType =
      normalizedChatType === '2' ||
      normalizedChatType === 'group' ||
      normalizedChatType === 'chat'
        ? 'group'
        : 'private'

    return {
      messageId: event.eventId || `${Date.now()}`,
      chatId: event.chatId || event.conversationId,
      chatType,
      senderId: event.senderId,
      senderName: event.senderName,
      content: event.text || '',
      contentType: 'text',
      mentions: event.mentions,
      timestamp: Number(event.timestamp || Date.now()),
      raw: event.raw || event
    }
  }

  parseCardAction(
    event: TDingTalkEvent,
    _ctx: TChatEventContext<TIntegrationDingTalkOptions>
  ): TChatCardAction<DingTalkCardActionValue> | null {
    if (!event.cardAction || !isDingTalkCardActionValue(event.cardAction.value)) {
      return null
    }

    return {
      type: 'card.action.trigger',
      value: event.cardAction.value,
      messageId: event.cardAction.messageId,
      chatId: event.cardAction.chatId,
      userId: event.cardAction.userId,
      raw: event.raw || event
    }
  }

  async sendText(ctx: TChatContext, content: string): Promise<TChatSendResult> {
    try {
      const client = await this.getOrCreateDingTalkClientById(ctx.integration.id)
      const recipient = this.resolveRecipient(ctx)
      const sessionWebhook = this.resolveSessionWebhook(ctx)
      const robotCodeOverride = this.resolveRobotCode(ctx)
      const result = await client.sendMessage({
        recipient,
        sessionWebhook,
        robotCodeOverride,
        msgType: 'text',
        content: {
          text: content
        }
      })

      return {
        success: true,
        messageId: result.messageId || undefined,
        metadata: {
          degraded: result.degraded === true
        }
      } as TChatSendResult
    } catch (error: any) {
      this.logger.error('Failed to send DingTalk text message', error)
      return {
        success: false,
        error: error?.message || 'Failed to send text message'
      }
    }
  }

  async sendMarkdown(ctx: TChatContext, content: string): Promise<TChatSendResult> {
    try {
      const client = await this.getOrCreateDingTalkClientById(ctx.integration.id)
      const recipient = this.resolveRecipient(ctx)
      const sessionWebhook = this.resolveSessionWebhook(ctx)
      const robotCodeOverride = this.resolveRobotCode(ctx)
      const result = await client.sendMessage({
        recipient,
        sessionWebhook,
        robotCodeOverride,
        msgType: 'markdown',
        content: {
          title: 'Xpert Notification',
          markdown: content
        }
      })

      return {
        success: true,
        messageId: result.messageId || undefined,
        metadata: {
          degraded: result.degraded === true
        }
      } as TChatSendResult
    } catch (error: any) {
      this.logger.error('Failed to send DingTalk markdown message', error)
      return {
        success: false,
        error: error?.message || 'Failed to send markdown message'
      }
    }
  }

  async sendCard(ctx: TChatContext, card: Record<string, unknown>): Promise<TChatSendResult> {
    try {
      const client = await this.getOrCreateDingTalkClientById(ctx.integration.id)
      const recipient = this.resolveRecipient(ctx)
      const sessionWebhook = this.resolveSessionWebhook(ctx)
      const robotCodeOverride = this.resolveRobotCode(ctx)
      const result = await client.sendMessage({
        recipient,
        sessionWebhook,
        robotCodeOverride,
        msgType: 'interactive',
        content: card
      })

      return {
        success: true,
        messageId: result.messageId || undefined,
        metadata: {
          degraded: result.degraded === true
        }
      } as TChatSendResult
    } catch (error: any) {
      this.logger.error('Failed to send DingTalk card message', error)
      return {
        success: false,
        error: error?.message || 'Failed to send card message'
      }
    }
  }

  async updateMessage(ctx: TChatContext, messageId: string, content: string | any): Promise<TChatSendResult> {
    try {
      const client = await this.getOrCreateDingTalkClientById(ctx.integration.id)
      const payload = typeof content === 'string' ? { markdown: content } : content
      const result = await client.updateMessage({
        messageId,
        content: payload
      })

      return {
        success: result.success,
        messageId: result.messageId || undefined,
        metadata: {
          degraded: result.degraded === true
        }
      } as TChatSendResult
    } catch (error: any) {
      this.logger.error('Failed to update DingTalk message', error)
      return {
        success: false,
        error: error?.message || 'Failed to update message'
      }
    }
  }

  async sendMedia(): Promise<TChatSendResult> {
    return {
      success: false,
      error: 'DingTalk media send is not implemented in plugin v1'
    }
  }

  async createMessage(integrationId: string, message: {
    recipient: DingTalkRecipient
    msgType: 'text' | 'markdown' | 'interactive'
    content: Record<string, unknown>
    sessionWebhook?: string | null
    allowFallback?: boolean
    robotCodeOverride?: string | null
  }) {
    const client = await this.getOrCreateDingTalkClientById(integrationId)
    const result = await client.sendMessage({
      recipient: message.recipient,
      sessionWebhook: message.sessionWebhook,
      robotCodeOverride: message.robotCodeOverride || undefined,
      msgType: message.msgType,
      content: message.content,
      allowFallback: message.allowFallback
    })

    return {
      data: {
        message_id: result.messageId
      },
      degraded: result.degraded === true
    }
  }

  async patchMessage(
    integrationId: string,
    payload: {
      messageId: string
      content: Record<string, unknown>
      sessionWebhook?: string | null
      silentOnFailure?: boolean
    }
  ) {
    const client = await this.getOrCreateDingTalkClientById(integrationId)
    return client.updateMessage(payload)
  }

  async deleteMessage(integrationId: string, messageId: string) {
    const client = await this.getOrCreateDingTalkClientById(integrationId)
    return client.recallMessage({ messageId })
  }

  async errorMessage(
    { integrationId, chatId }: { integrationId: string; chatId?: string },
    err: Error
  ): Promise<void> {
    if (!chatId) {
      return
    }

    await this.createMessage(integrationId, {
      recipient: {
        type: 'chat_id',
        id: chatId
      },
      msgType: 'text',
      content: {
        text: `Error: ${err.message}`
      }
    })
  }

  async textMessage(context: { integrationId: string; chatId: string; messageId?: string; sessionWebhook?: string | null }, content: string) {
    if (context.messageId) {
      return this.patchMessage(context.integrationId, {
        messageId: context.messageId,
        content: {
          markdown: content
        },
        sessionWebhook: context.sessionWebhook
      })
    }

    return this.createMessage(context.integrationId, {
      recipient: {
        type: 'chat_id',
        id: context.chatId
      },
      sessionWebhook: context.sessionWebhook,
      msgType: 'text',
      content: {
        text: content
      }
    })
  }

  async interactiveMessage(
    context: ChatDingTalkContext,
    card: Record<string, unknown>,
    options?: { allowFallback?: boolean }
  ) {
    return this.createMessage(context.integrationId, {
      recipient: {
        type: 'chat_id',
        id: context.chatId
      },
      sessionWebhook: context.sessionWebhook,
      robotCodeOverride: this.resolveRobotCode(context),
      msgType: 'interactive',
      content: card,
      allowFallback: options?.allowFallback
    })
  }

  async markdownMessage(context: ChatDingTalkContext, markdown: string) {
    return this.createMessage(context.integrationId, {
      recipient: {
        type: 'chat_id',
        id: context.chatId
      },
      sessionWebhook: context.sessionWebhook,
      robotCodeOverride: this.resolveRobotCode(context),
      msgType: 'markdown',
      content: {
        title: 'Xpert Notification',
        markdown
      }
    })
  }

  async patchInteractiveMessage(
    integrationId: string,
    messageId: string,
    card: Record<string, unknown>,
    sessionWebhook?: string | null,
    silentOnFailure?: boolean
  ) {
    return this.patchMessage(integrationId, {
      messageId,
      content: card,
      sessionWebhook,
      silentOnFailure
    })
  }

  async listUsers(integrationId: string, options: {
    keyword?: string | null
    pageSize?: number
    pageToken?: string | null
    timeoutMs?: number
  }) {
    const client = await this.getOrCreateDingTalkClientById(integrationId)
    return client.listUsers(options)
  }

  async listChats(integrationId: string, options: {
    keyword?: string | null
    pageSize?: number
    pageToken?: string | null
    timeoutMs?: number
  }) {
    const client = await this.getOrCreateDingTalkClientById(integrationId)
    return client.listChats(options)
  }

  private resolveRecipient(ctx: TChatContext): DingTalkRecipient {
    if (ctx.chatId) {
      return {
        type: 'chat_id',
        id: ctx.chatId
      }
    }

    if (ctx.userId) {
      return {
        type: 'user_id',
        id: ctx.userId
      }
    }

    return {
      type: 'chat_id',
      id: ''
    }
  }

  private resolveSessionWebhook(ctx: TChatContext): string | null {
    const fromContext = (ctx as any)?.sessionWebhook
    if (typeof fromContext === 'string' && fromContext.trim()) {
      return fromContext.trim()
    }

    const fromMessage = (ctx as any)?.message?.sessionWebhook || (ctx as any)?.raw?.sessionWebhook
    if (typeof fromMessage === 'string' && fromMessage.trim()) {
      return fromMessage.trim()
    }

    return null
  }

  private resolveRobotCode(ctx: any): string | null {
    const fromContext = (ctx as any)?.robotCode
    const normalizedContext = normalizeDingTalkRobotCode(fromContext)
    if (normalizedContext) {
      return normalizedContext
    }

    const fromMessageRaw = (ctx as any)?.message?.raw?.robotCode || (ctx as any)?.raw?.robotCode
    const normalizedMessageRaw = normalizeDingTalkRobotCode(fromMessageRaw)
    if (normalizedMessageRaw) {
      return normalizedMessageRaw
    }

    return null
  }

  private isSelfMessage(event: TDingTalkEvent, message: TChatInboundMessage): boolean {
    const senderId = typeof message.senderId === 'string' ? message.senderId.trim() : ''
    const chatbotUserId = typeof event.chatbotUserId === 'string' ? event.chatbotUserId.trim() : ''
    return Boolean(senderId && chatbotUserId && senderId === chatbotUserId)
  }

  private isMessageMentioningBot(event: TDingTalkEvent, message: TChatInboundMessage): boolean {
    if (event.isInAtList === true) {
      return true
    }
    const chatbotUserId = typeof event.chatbotUserId === 'string' ? event.chatbotUserId.trim() : ''
    if (!chatbotUserId) {
      return Boolean(message.mentions?.length)
    }
    return Boolean(message.mentions?.some((mention) => mention?.id === chatbotUserId))
  }
}

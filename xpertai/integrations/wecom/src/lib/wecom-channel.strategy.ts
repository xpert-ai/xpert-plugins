import { randomUUID } from 'crypto'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  CHAT_CHANNEL_TEXT_LIMITS,
  ChatChannel,
  IChatChannel,
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
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
import { WECOM_LONG_CONNECTION_SERVICE, WECOM_PLUGIN_CONTEXT } from './tokens.js'
import {
  iconImage,
  INTEGRATION_WECOM,
  INTEGRATION_WECOM_LONG,
  TIntegrationWeComOptions,
  TWeComEvent
} from './types.js'

const DEFAULT_TIMEOUT_MS = 10000
const RESPONSE_URL_CACHE_TTL_MS = 60 * 60 * 1000
const REQ_ID_CACHE_TTL_MS = 60 * 60 * 1000

export type WeComResolvedRobotContext = {
  integrationId: string
  provider: typeof INTEGRATION_WECOM | typeof INTEGRATION_WECOM_LONG
  senderId: string | null
  chatId: string | null
  responseUrl: string | null
  reqId: string | null
}

type WeComLongConnectionClient = {
  sendRespondMessage: (params: {
    integrationId: string
    reqId: string
    body: Record<string, unknown>
    timeoutMs?: number
  }) => Promise<{ reqId: string; errcode: number; errmsg: string; raw: Record<string, unknown> }>
  sendUpdateMessage: (params: {
    integrationId: string
    reqId: string
    templateCard: Record<string, unknown>
    timeoutMs?: number
  }) => Promise<{ reqId: string; errcode: number; errmsg: string; raw: Record<string, unknown> }>
  sendActiveMessage: (params: {
    integrationId: string
    chatId: string
    body: Record<string, unknown>
    timeoutMs?: number
  }) => Promise<{ reqId: string; errcode: number; errmsg: string; raw: Record<string, unknown> }>
}

@Injectable()
@ChatChannel('wecom')
export class WeComChannelStrategy implements IChatChannel<TIntegrationWeComOptions, TWeComEvent> {
  private readonly logger = new Logger(WeComChannelStrategy.name)

  @Inject(CACHE_MANAGER)
  private readonly cacheManager: Cache

  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    @Inject(WECOM_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext,
    @Inject(WECOM_LONG_CONNECTION_SERVICE)
    private readonly longConnectionService: WeComLongConnectionClient
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  private get longConnection(): WeComLongConnectionClient {
    return this.longConnectionService
  }

  meta: TChatChannelMeta = {
    type: 'wecom',
    label: '企业微信 / WeCom',
    description: 'WeCom robot channel (short callback + long websocket)',
    icon: iconImage,
    configSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: '短连接回调 Token' },
        encodingAesKey: { type: 'string', description: '短连接回调 EncodingAESKey' },
        botId: { type: 'string', description: '长连接 Bot ID' },
        secret: { type: 'string', description: '长连接 Secret' },
        xpertId: { type: 'string', description: '默认数字专家 ID' },
        timeoutMs: { type: 'number', description: '发送超时（毫秒）' }
      },
      required: []
    }
  }

  capabilities: TChatChannelCapabilities = {
    markdown: true,
    card: true,
    cardAction: false,
    updateMessage: true,
    mention: true,
    group: true,
    thread: false,
    media: false,
    textChunkLimit: CHAT_CHANNEL_TEXT_LIMITS['wecom'] || 2000,
    streamingUpdate: false
  }

  createEventHandler(
    ctx: TChatEventContext<TIntegrationWeComOptions>,
    handlers: TChatEventHandlers
  ): (req: any, res: any, next?: any) => Promise<void> {
    const eventHandlers = handlers ?? {}

    return async (req, res) => {
      const event = this.normalizeWebhookEvent(req?.body)
      if (!event) {
        this.logger.debug(`[wecom-event] ignore empty/invalid payload integration=${ctx.integration.id}`)
        res.status(200).send('success')
        return
      }

      const skip = await this.shouldSkipDuplicatedEvent(ctx.integration.id, event)
      if (skip) {
        res.status(200).send('success')
        return
      }

      const senderId = this.normalizeString(event.senderId)
      const chatId = this.normalizeString(event.chatId) || senderId
      const responseUrl = this.normalizeString(event.responseUrl)
      const reqId = this.normalizeString(event.reqId)

      if (responseUrl && senderId && chatId) {
        await this.cacheResponseUrl(ctx.integration.id, senderId, chatId, responseUrl)
        this.logger.debug(
          `[wecom-event] cached response_url integration=${ctx.integration.id} senderId=${senderId} chatId=${chatId}`
        )
      }

      if (reqId && senderId && chatId) {
        await this.cacheReqId(ctx.integration.id, senderId, chatId, reqId)
        this.logger.debug(
          `[wecom-event] cached req_id integration=${ctx.integration.id} senderId=${senderId} chatId=${chatId} reqId=${reqId}`
        )
      }

      const message = this.parseInboundMessage(event, ctx)
      if (!message) {
        this.logger.warn(
          `[wecom-event] drop event integration=${ctx.integration.id} cmd=${event.cmd || 'n/a'} msgType=${
            event.msgType || 'unknown'
          } chatId=${event.chatId || 'empty'} senderId=${event.senderId || 'empty'} reqId=${event.reqId || 'empty'} contentLen=${
            event.content?.length || 0
          }`
        )
        res.status(200).send('success')
        return
      }

      if (message.chatType === 'group' && message.mentions?.length) {
        await eventHandlers.onMention?.(message, ctx)
      } else {
        await eventHandlers.onMessage?.(message, ctx)
      }

      res.status(200).send('success')
    }
  }

  parseInboundMessage(event: TWeComEvent, _ctx: TChatEventContext<TIntegrationWeComOptions>): TChatInboundMessage | null {
    const senderId = this.normalizeString(event.senderId)
    const chatId = this.normalizeString(event.chatId) || senderId

    if (!chatId || !senderId || !event.content) {
      return null
    }

    return {
      messageId: event.messageId || randomUUID(),
      chatId,
      chatType: event.chatType || 'private',
      senderId,
      senderName: event.senderName,
      content: event.content,
      contentType: 'text',
      mentions: event.mentions,
      timestamp: event.timestamp || Date.now(),
      raw: event.raw ?? event
    }
  }

  async sendText(ctx: TChatContext, content: string): Promise<TChatSendResult> {
    const timeoutMs = this.normalizeTimeout((ctx.integration.options as TIntegrationWeComOptions)?.timeoutMs, DEFAULT_TIMEOUT_MS)
    const raw = (ctx as Record<string, unknown>)?.raw
    const responseUrl = this.extractResponseUrl(raw)
    const reqId = this.extractReqId(raw)
    const chatId = this.normalizeString((ctx as Record<string, unknown>)?.chatId)
    const senderId = this.normalizeString((ctx as Record<string, unknown>)?.senderId)

    return this.sendTextByIntegrationId(ctx.integration.id, {
      chatId: chatId || undefined,
      senderId: senderId || undefined,
      responseUrl: responseUrl || undefined,
      reqId: reqId || undefined,
      preferResponseUrl: true,
      content,
      timeoutMs
    })
  }

  async sendTextByIntegrationId(
    integrationId: string,
    params: {
      chatId?: string
      senderId?: string
      responseUrl?: string
      reqId?: string
      preferResponseUrl?: boolean
      content: string
      timeoutMs?: number
    }
  ): Promise<TChatSendResult> {
    const payload = {
      msgtype: 'markdown',
      markdown: {
        content: params.content
      }
    }

    return this.sendRobotPayload({
      integrationId,
      chatId: params.chatId,
      senderId: params.senderId,
      responseUrl: params.responseUrl,
      reqId: params.reqId,
      preferConversationContext: params.preferResponseUrl === true,
      timeoutMs: params.timeoutMs,
      payload
    })
  }

  async sendRobotPayload(params: {
    integrationId: string
    chatId?: string | null
    senderId?: string | null
    responseUrl?: string | null
    reqId?: string | null
    preferConversationContext?: boolean
    timeoutMs?: number
    payload: Record<string, unknown>
  }): Promise<TChatSendResult> {
    const integration = await this.readIntegration(params.integrationId)
    const provider = this.normalizeProvider(integration.provider)
    const timeoutMs = this.normalizeTimeout(params.timeoutMs, this.normalizeTimeout(integration.options?.timeoutMs, DEFAULT_TIMEOUT_MS))

    const context = await this.resolveRobotContext({
      integrationId: integration.id,
      provider,
      senderId: params.senderId,
      chatId: params.chatId,
      responseUrl: params.responseUrl,
      reqId: params.reqId,
      allowLatestFallback: params.preferConversationContext !== false
    })

    if (!context) {
      return {
        success: false,
        error: '当前会话缺少可用机器人上下文（response_url/req_id/chat）'
      }
    }

    if (context.provider === INTEGRATION_WECOM) {
      if (!context.responseUrl) {
        return {
          success: false,
          error: '当前会话缺少可用机器人上下文（response_url/req_id/chat）'
        }
      }

      return this.sendToResponseUrlPayload(context.responseUrl, params.payload, timeoutMs)
    }

    if (context.reqId) {
      await this.longConnection.sendRespondMessage({
        integrationId: context.integrationId,
        reqId: context.reqId,
        body: params.payload,
        timeoutMs
      })
      return {
        success: true,
        messageId: randomUUID()
      }
    }

    const targetChatId = context.chatId || context.senderId
    if (!targetChatId) {
      return {
        success: false,
        error: '当前会话缺少可用机器人上下文（response_url/req_id/chat）'
      }
    }

    await this.longConnection.sendActiveMessage({
      integrationId: context.integrationId,
      chatId: targetChatId,
      body: params.payload,
      timeoutMs
    })

    return {
      success: true,
      messageId: randomUUID()
    }
  }

  async updateRobotTemplateCard(params: {
    integrationId: string
    templateCard: Record<string, unknown>
    senderId?: string | null
    chatId?: string | null
    responseUrl?: string | null
    reqId?: string | null
    timeoutMs?: number
  }): Promise<TChatSendResult> {
    const integration = await this.readIntegration(params.integrationId)
    const provider = this.normalizeProvider(integration.provider)
    const timeoutMs = this.normalizeTimeout(params.timeoutMs, this.normalizeTimeout(integration.options?.timeoutMs, DEFAULT_TIMEOUT_MS))

    const context = await this.resolveRobotContext({
      integrationId: integration.id,
      provider,
      senderId: params.senderId,
      chatId: params.chatId,
      responseUrl: params.responseUrl,
      reqId: params.reqId,
      allowLatestFallback: true
    })

    if (!context) {
      return {
        success: false,
        error: '当前会话缺少可用机器人上下文（response_url/req_id/chat）'
      }
    }

    if (context.provider === INTEGRATION_WECOM) {
      if (!context.responseUrl) {
        return {
          success: false,
          error: '当前会话缺少可用机器人上下文（response_url/req_id/chat）'
        }
      }

      return this.sendToResponseUrlPayload(
        context.responseUrl,
        {
          response_type: 'update_template_card',
          template_card: params.templateCard
        },
        timeoutMs
      )
    }

    if (!context.reqId) {
      return {
        success: false,
        error: '当前会话缺少可用机器人上下文（response_url/req_id/chat）'
      }
    }

    await this.longConnection.sendUpdateMessage({
      integrationId: context.integrationId,
      reqId: context.reqId,
      templateCard: params.templateCard,
      timeoutMs
    })

    return {
      success: true,
      messageId: randomUUID()
    }
  }

  async resolveResponseUrl(params: {
    integrationId: string
    senderId?: string | null
    chatId?: string | null
    responseUrl?: string | null
    allowLatestFallback?: boolean | null
  }): Promise<string | null> {
    const integration = await this.readIntegration(params.integrationId)
    const provider = this.normalizeProvider(integration.provider)
    if (provider !== INTEGRATION_WECOM) {
      return null
    }

    const context = await this.resolveRobotContext({
      integrationId: integration.id,
      provider,
      senderId: params.senderId,
      chatId: params.chatId,
      responseUrl: params.responseUrl,
      allowLatestFallback: params.allowLatestFallback !== false
    })

    return context?.responseUrl || null
  }

  async resolveRobotContext(params: {
    integrationId: string
    provider?: string | null
    senderId?: string | null
    chatId?: string | null
    responseUrl?: string | null
    reqId?: string | null
    allowLatestFallback?: boolean
  }): Promise<WeComResolvedRobotContext | null> {
    const integrationId = this.normalizeString(params.integrationId)
    if (!integrationId) {
      return null
    }

    const provider = this.normalizeProvider(params.provider)
    const senderId = this.normalizeString(params.senderId)
    const chatId = this.normalizeString(params.chatId) || senderId
    const allowLatestFallback = params.allowLatestFallback !== false

    if (provider === INTEGRATION_WECOM_LONG) {
      const reqId = this.normalizeString(params.reqId)
      if (reqId && senderId && chatId) {
        await this.cacheReqId(integrationId, senderId, chatId, reqId)
        return {
          integrationId,
          provider,
          senderId,
          chatId,
          reqId,
          responseUrl: null
        }
      }

      if (senderId && chatId) {
        const cachedReqId = await this.getCachedReqId(integrationId, senderId, chatId)
        if (cachedReqId) {
          return {
            integrationId,
            provider,
            senderId,
            chatId,
            reqId: cachedReqId,
            responseUrl: null
          }
        }
      }

      if (allowLatestFallback) {
        const latestReqContext = await this.getLatestCachedReqContext(integrationId)
        if (latestReqContext?.reqId) {
          this.logger.warn(
            `[wecom-send] req_id fallback by integration latest context integration=${integrationId} senderId=${latestReqContext.senderId} chatId=${latestReqContext.chatId}`
          )
          return {
            integrationId,
            provider,
            senderId: senderId || latestReqContext.senderId,
            chatId: chatId || latestReqContext.chatId,
            reqId: latestReqContext.reqId,
            responseUrl: null
          }
        }
      }

      return {
        integrationId,
        provider,
        senderId,
        chatId,
        reqId: null,
        responseUrl: null
      }
    }

    const responseUrl = this.normalizeString(params.responseUrl)
    if (responseUrl) {
      if (senderId && chatId) {
        await this.cacheResponseUrl(integrationId, senderId, chatId, responseUrl)
      }
      return {
        integrationId,
        provider: INTEGRATION_WECOM,
        senderId,
        chatId,
        responseUrl,
        reqId: null
      }
    }

    if (senderId && chatId) {
      const cachedResponseUrl = await this.getCachedResponseUrl(integrationId, senderId, chatId)
      if (cachedResponseUrl) {
        return {
          integrationId,
          provider: INTEGRATION_WECOM,
          senderId,
          chatId,
          responseUrl: cachedResponseUrl,
          reqId: null
        }
      }
    }

    if (allowLatestFallback) {
      const latestContext = await this.getLatestCachedResponseContext(integrationId)
      if (latestContext?.responseUrl) {
        this.logger.warn(
          `[wecom-send] response_url fallback by integration latest context integration=${integrationId} senderId=${latestContext.senderId} chatId=${latestContext.chatId}`
        )
        return {
          integrationId,
          provider: INTEGRATION_WECOM,
          senderId: senderId || latestContext.senderId,
          chatId: chatId || latestContext.chatId,
          responseUrl: latestContext.responseUrl,
          reqId: null
        }
      }
    }

    return {
      integrationId,
      provider: INTEGRATION_WECOM,
      senderId,
      chatId,
      responseUrl: null,
      reqId: null
    }
  }

  async errorMessage(
    params: {
      integrationId: string
      chatId?: string
      senderId?: string
      responseUrl?: string
      reqId?: string
    },
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)
    const content = `[企业微信对话异常]\n${message}`
    const result = await this.sendTextByIntegrationId(params.integrationId, {
      chatId: params.chatId,
      senderId: params.senderId,
      responseUrl: params.responseUrl,
      reqId: params.reqId,
      preferResponseUrl: true,
      content
    })

    if (!result.success) {
      this.logger.warn(`[wecom-error-message] failed integration=${params.integrationId} error=${result.error || 'unknown'}`)
    }
  }

  normalizeWebhookEvent(input: unknown): TWeComEvent | null {
    const payload = this.normalizePayload(input)
    if (!payload) {
      return null
    }

    const wrapperBody = this.normalizeRecord(payload.body)
    const wrapperHeaders = this.normalizeRecord(payload.headers)
    const sourcePayload = wrapperBody
      ? {
          ...wrapperBody,
          cmd: this.normalizeString(payload.cmd) || this.normalizeString(wrapperBody.cmd),
          req_id:
            this.normalizeString((wrapperBody as Record<string, unknown>).req_id) ||
            this.normalizeString(payload.req_id) ||
            this.normalizeString(wrapperHeaders?.req_id),
          reqId:
            this.normalizeString((wrapperBody as Record<string, unknown>).reqId) ||
            this.normalizeString(payload.reqId) ||
            this.normalizeString(wrapperHeaders?.reqId)
        }
      : payload

    const payloadRecord = this.normalizeRecord(sourcePayload) || {}
    const from = this.normalizeRecord(payloadRecord.from || payloadRecord.From)
    const textPayload = this.normalizeRecord(payloadRecord.text || payloadRecord.Text)
    const markdownPayload = this.normalizeRecord(payloadRecord.markdown || payloadRecord.Markdown)
    const voicePayload = this.normalizeRecord(payloadRecord.voice || payloadRecord.Voice)
    const filePayload = this.normalizeRecord(payloadRecord.file || payloadRecord.File)
    const mixedPayload = this.normalizeRecord(payloadRecord.mixed || payloadRecord.Mixed)
    const responsePayload = this.normalizeRecord(payloadRecord.response || payloadRecord.Response)

    const msgType = this.normalizeString(payloadRecord.MsgType || payloadRecord.msgType || payloadRecord.msgtype) || undefined
    const eventType =
      this.normalizeString(payloadRecord.Event || payloadRecord.event || payloadRecord.EventType || payloadRecord.eventType) || undefined
    const cmd = this.normalizeString(payloadRecord.cmd) || undefined
    const reqId = this.normalizeString(payloadRecord.req_id || payloadRecord.reqId) || undefined

    const mixedContent = this.extractMixedTextContent(mixedPayload)
    const content =
      this.normalizeString(payloadRecord.Content) ||
      this.normalizeString(payloadRecord.content) ||
      this.normalizeString(textPayload?.content) ||
      this.normalizeString(markdownPayload?.content) ||
      this.normalizeString(voicePayload?.content) ||
      this.normalizeString(filePayload?.url) ||
      mixedContent ||
      this.normalizeString(payloadRecord.text)

    const chatId =
      this.normalizeString(payloadRecord.ChatId) ||
      this.normalizeString(payloadRecord.chatId) ||
      this.normalizeString(payloadRecord.chatid) ||
      this.normalizeString(payloadRecord.ConversationId) ||
      this.normalizeString(payloadRecord.conversationId)

    const senderId =
      this.normalizeString(from?.userid) ||
      this.normalizeString(from?.userId) ||
      this.normalizeString(from?.id) ||
      this.normalizeString(payloadRecord.FromUserName) ||
      this.normalizeString(payloadRecord.fromUserName) ||
      this.normalizeString(payloadRecord.senderId) ||
      this.normalizeString(payloadRecord.UserId) ||
      this.normalizeString(payloadRecord.userId)

    const resolvedChatId = chatId || senderId || ''

    const senderName = this.normalizeString(payloadRecord.senderName) || undefined
    const responseUrl =
      this.normalizeString(payloadRecord.response_url) ||
      this.normalizeString(payloadRecord.responseUrl) ||
      this.normalizeString(payloadRecord.ResponseUrl) ||
      this.normalizeString(responsePayload?.url) ||
      undefined
    const messageId =
      this.normalizeString(payloadRecord.MsgId) ||
      this.normalizeString(payloadRecord.msgId) ||
      this.normalizeString(payloadRecord.msgid) ||
      this.normalizeString(payloadRecord.messageId) ||
      undefined

    const timestamp = this.normalizeTimestamp(
      payloadRecord.CreateTime || payloadRecord.createTime || payloadRecord.create_time || payloadRecord.timestamp || Date.now()
    )

    const mentions = this.normalizeMentions(payloadRecord.mentions || payloadRecord.Mentions || payloadRecord.atUsers)
    const chatType = this.normalizeChatType(
      payloadRecord.ChatType || payloadRecord.chatType || payloadRecord.chattype || payloadRecord.conversationType,
      resolvedChatId || null,
      senderId
    )

    if (!content && msgType !== 'text') {
      return {
        cmd,
        reqId,
        msgType,
        eventType,
        messageId,
        chatId: resolvedChatId,
        chatType,
        senderId: senderId || '',
        senderName,
        content: '',
        responseUrl,
        timestamp,
        mentions,
        raw: payload
      }
    }

    return {
      cmd,
      reqId,
      msgType,
      eventType,
      messageId,
      chatId: resolvedChatId,
      chatType,
      senderId: senderId || '',
      senderName,
      content: content || '',
      responseUrl,
      timestamp,
      mentions,
      raw: payload
    }
  }

  private async sendToResponseUrlPayload(
    responseUrl: string,
    payload: Record<string, unknown>,
    timeoutMs: number
  ): Promise<TChatSendResult> {
    if (!this.isValidWeComAIBotResponseUrl(responseUrl)) {
      return {
        success: false,
        error: `Invalid responseUrl: ${responseUrl}`
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(responseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      })

      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}`
        }
      }

      const errCode = typeof body?.errcode === 'number' ? (body.errcode as number) : -1
      const errMsg = typeof body?.errmsg === 'string' ? body.errmsg : 'unknown'
      if (errCode !== 0) {
        return {
          success: false,
          error: `errcode=${errCode}, errmsg=${errMsg}`
        }
      }

      return {
        success: true,
        messageId: randomUUID()
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private async shouldSkipDuplicatedEvent(integrationId: string, event: TWeComEvent): Promise<boolean> {
    const dedupeId = [integrationId, event.messageId || event.reqId || 'no-id', event.chatId || 'no-chat', event.timestamp || 0].join(':')
    const cacheKey = `wecom:dedupe:${dedupeId}`
    const existed = await this.cacheManager.get<string>(cacheKey)
    if (existed) {
      this.logger.debug(`Skip duplicated WeCom event: ${dedupeId}`)
      return true
    }

    await this.cacheManager.set(cacheKey, '1', 180 * 1000)
    return false
  }

  private responseUrlCacheKey(integrationId: string, senderId: string, chatId: string): string {
    return `wecom:ru:${integrationId}:${senderId}:${chatId}`
  }

  private latestResponseContextCacheKey(integrationId: string): string {
    return `wecom:ru:last:${integrationId}`
  }

  private reqIdCacheKey(integrationId: string, senderId: string, chatId: string): string {
    return `wecom:req:${integrationId}:${senderId}:${chatId}`
  }

  private latestReqContextCacheKey(integrationId: string): string {
    return `wecom:req:last:${integrationId}`
  }

  private async cacheResponseUrl(
    integrationId: string,
    senderId: string,
    chatId: string,
    responseUrl: string
  ): Promise<void> {
    if (!integrationId || !senderId || !chatId || !responseUrl) {
      return
    }

    await this.cacheManager.set(this.responseUrlCacheKey(integrationId, senderId, chatId), responseUrl, RESPONSE_URL_CACHE_TTL_MS)
    await this.cacheManager.set(
      this.latestResponseContextCacheKey(integrationId),
      {
        senderId,
        chatId,
        responseUrl
      },
      RESPONSE_URL_CACHE_TTL_MS
    )
  }

  private async getCachedResponseUrl(
    integrationId: string,
    senderId: string,
    chatId: string
  ): Promise<string | null> {
    if (!integrationId || !senderId || !chatId) {
      return null
    }
    const value = await this.cacheManager.get<string>(this.responseUrlCacheKey(integrationId, senderId, chatId))
    return this.normalizeString(value)
  }

  private async getLatestCachedResponseContext(
    integrationId: string
  ): Promise<{ senderId: string; chatId: string; responseUrl: string } | null> {
    if (!integrationId) {
      return null
    }

    const value = await this.cacheManager.get<{ senderId?: unknown; chatId?: unknown; responseUrl?: unknown }>(
      this.latestResponseContextCacheKey(integrationId)
    )
    if (!value || typeof value !== 'object') {
      return null
    }

    const senderId = this.normalizeString(value.senderId)
    const chatId = this.normalizeString(value.chatId)
    const responseUrl = this.normalizeString(value.responseUrl)
    if (!senderId || !chatId || !responseUrl) {
      return null
    }

    return {
      senderId,
      chatId,
      responseUrl
    }
  }

  private async cacheReqId(
    integrationId: string,
    senderId: string,
    chatId: string,
    reqId: string
  ): Promise<void> {
    if (!integrationId || !senderId || !chatId || !reqId) {
      return
    }

    await this.cacheManager.set(this.reqIdCacheKey(integrationId, senderId, chatId), reqId, REQ_ID_CACHE_TTL_MS)
    await this.cacheManager.set(
      this.latestReqContextCacheKey(integrationId),
      {
        senderId,
        chatId,
        reqId
      },
      REQ_ID_CACHE_TTL_MS
    )
  }

  private async getCachedReqId(
    integrationId: string,
    senderId: string,
    chatId: string
  ): Promise<string | null> {
    if (!integrationId || !senderId || !chatId) {
      return null
    }

    const value = await this.cacheManager.get<string>(this.reqIdCacheKey(integrationId, senderId, chatId))
    return this.normalizeString(value)
  }

  private async getLatestCachedReqContext(
    integrationId: string
  ): Promise<{ senderId: string; chatId: string; reqId: string } | null> {
    if (!integrationId) {
      return null
    }

    const value = await this.cacheManager.get<{ senderId?: unknown; chatId?: unknown; reqId?: unknown }>(
      this.latestReqContextCacheKey(integrationId)
    )
    if (!value || typeof value !== 'object') {
      return null
    }

    const senderId = this.normalizeString(value.senderId)
    const chatId = this.normalizeString(value.chatId)
    const reqId = this.normalizeString(value.reqId)
    if (!senderId || !chatId || !reqId) {
      return null
    }

    return {
      senderId,
      chatId,
      reqId
    }
  }

  private async readIntegration(integrationId: string): Promise<IIntegration<TIntegrationWeComOptions>> {
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWeComOptions>>(
      integrationId,
      {
        relations: ['tenant']
      }
    )

    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`)
    }

    return integration
  }

  private normalizeProvider(provider: unknown): typeof INTEGRATION_WECOM | typeof INTEGRATION_WECOM_LONG {
    const normalized = this.normalizeString(provider)
    if (normalized === INTEGRATION_WECOM_LONG) {
      return INTEGRATION_WECOM_LONG
    }
    return INTEGRATION_WECOM
  }

  private normalizeTimeout(value: unknown, fallback: number): number {
    const timeout = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(timeout) && timeout >= 100) {
      return Math.min(Math.floor(timeout), 120000)
    }
    return fallback
  }

  private normalizePayload(input: unknown): Record<string, unknown> | null {
    if (!input) {
      return null
    }

    if (typeof input === 'string') {
      const text = input.trim()
      if (!text) {
        return null
      }
      if (text.startsWith('{')) {
        try {
          return JSON.parse(text) as Record<string, unknown>
        } catch {
          return null
        }
      }

      return {
        MsgType: this.matchXmlTag(text, 'MsgType') || this.matchXmlTag(text, 'msgType'),
        Event: this.matchXmlTag(text, 'Event') || this.matchXmlTag(text, 'event'),
        Content: this.matchXmlTag(text, 'Content') || this.matchXmlTag(text, 'content'),
        text: {
          content: this.matchXmlTag(text, 'Content') || this.matchXmlTag(text, 'content')
        },
        voice: {
          content: this.matchXmlTag(text, 'Voice') || this.matchXmlTag(text, 'voice')
        },
        file: {
          url: this.matchXmlTag(text, 'FileUrl') || this.matchXmlTag(text, 'fileurl')
        },
        from: {
          userid:
            this.matchXmlTag(text, 'UserId') ||
            this.matchXmlTag(text, 'userid') ||
            this.matchXmlTag(text, 'FromUserName') ||
            this.matchXmlTag(text, 'fromUserName'),
          corpid: this.matchXmlTag(text, 'CorpId') || this.matchXmlTag(text, 'corpid')
        },
        FromUserName: this.matchXmlTag(text, 'FromUserName') || this.matchXmlTag(text, 'fromUserName'),
        ChatId: this.matchXmlTag(text, 'ChatId') || this.matchXmlTag(text, 'chatId'),
        chatid: this.matchXmlTag(text, 'chatid') || this.matchXmlTag(text, 'ChatId') || this.matchXmlTag(text, 'chatId'),
        chattype: this.matchXmlTag(text, 'chattype') || this.matchXmlTag(text, 'ChatType') || this.matchXmlTag(text, 'chatType'),
        response_url:
          this.matchXmlTag(text, 'response_url') ||
          this.matchXmlTag(text, 'ResponseUrl') ||
          this.matchXmlTag(text, 'responseUrl'),
        MsgId: this.matchXmlTag(text, 'MsgId') || this.matchXmlTag(text, 'msgId'),
        msgid: this.matchXmlTag(text, 'msgid') || this.matchXmlTag(text, 'MsgId') || this.matchXmlTag(text, 'msgId'),
        CreateTime: this.matchXmlTag(text, 'CreateTime') || this.matchXmlTag(text, 'createTime'),
        create_time:
          this.matchXmlTag(text, 'create_time') || this.matchXmlTag(text, 'CreateTime') || this.matchXmlTag(text, 'createTime')
      }
    }

    if (typeof input === 'object') {
      return input as Record<string, unknown>
    }

    return null
  }

  private normalizeTimestamp(value: unknown): number {
    const num = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(num)) {
      return Date.now()
    }
    return num < 1000000000000 ? Math.floor(num * 1000) : Math.floor(num)
  }

  private normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null
    }
    const text = value.trim()
    return text ? text : null
  }

  private normalizeRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null
    }
    return value as Record<string, unknown>
  }

  private normalizeMentions(value: unknown): Array<{ id: string; name?: string }> | undefined {
    if (!Array.isArray(value)) {
      return undefined
    }

    const mentions: Array<{ id: string; name?: string }> = []
    for (const item of value) {
      if (typeof item === 'string') {
        const id = this.normalizeString(item)
        if (id) {
          mentions.push({ id })
        }
        continue
      }

      if (!item || typeof item !== 'object') {
        continue
      }

      const record = item as Record<string, unknown>
      const id = this.normalizeString(record.id || record.userId || record.userid)
      if (!id) {
        continue
      }

      const name = this.normalizeString(record.name || record.userName) || undefined
      mentions.push({ id, name })
    }

    return mentions.length ? mentions : undefined
  }

  private normalizeChatType(value: unknown, chatId: string | null, senderId: string | null): TChatInboundMessage['chatType'] {
    const type = this.normalizeString(value)?.toLowerCase()
    if (type === 'group' || type === 'chatroom') {
      return 'group'
    }
    if (type === 'channel') {
      return 'channel'
    }
    if (type === 'thread') {
      return 'thread'
    }
    if (chatId && senderId && chatId !== senderId) {
      return 'group'
    }
    return 'private'
  }

  private extractMixedTextContent(mixedPayload: Record<string, unknown> | null): string | null {
    const msgItems = (mixedPayload?.msg_item || mixedPayload?.msgItem) as unknown
    if (!Array.isArray(msgItems)) {
      return null
    }

    const chunks: string[] = []
    for (const item of msgItems) {
      if (!item || typeof item !== 'object') {
        continue
      }
      const record = item as Record<string, unknown>
      const textRecord = this.normalizeRecord(record.text)
      const text = this.normalizeString(textRecord?.content) || this.normalizeString(record.content)
      if (text) {
        chunks.push(text)
      }
    }

    if (!chunks.length) {
      return null
    }
    return chunks.join('\n')
  }

  private extractResponseUrl(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') {
      return null
    }
    const record = raw as Record<string, unknown>
    return (
      this.normalizeString(record.response_url) ||
      this.normalizeString(record.responseUrl) ||
      this.normalizeString(record.ResponseUrl) ||
      this.normalizeString((record.response as Record<string, unknown> | undefined)?.url)
    )
  }

  private extractReqId(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') {
      return null
    }
    const record = raw as Record<string, unknown>
    return (
      this.normalizeString(record.req_id) ||
      this.normalizeString(record.reqId) ||
      this.normalizeString((record.headers as Record<string, unknown> | undefined)?.req_id) ||
      this.normalizeString((record.headers as Record<string, unknown> | undefined)?.reqId)
    )
  }

  private isValidWeComAIBotResponseUrl(url: string): boolean {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'https:' && parsed.hostname === 'qyapi.weixin.qq.com' && parsed.pathname === '/cgi-bin/aibot/response'
    } catch {
      return false
    }
  }

  private matchXmlTag(xml: string, tagName: string): string {
    const cdataRegex = new RegExp(`<${tagName}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tagName}>`, 'i')
    const plainRegex = new RegExp(`<${tagName}>(.*?)<\\/${tagName}>`, 'i')
    const cdata = xml.match(cdataRegex)
    if (cdata?.[1]) {
      return cdata[1].trim()
    }
    const plain = xml.match(plainRegex)
    return plain?.[1]?.trim() || ''
  }
}

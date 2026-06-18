import { randomUUID } from 'crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
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
import { IIntegration } from '@xpert-ai/contracts'
import {
  WECHAT_PERSONAL_CHANNEL_TYPE,
  WECHAT_PERSONAL_ICON,
  WECHAT_PERSONAL_PROVIDER_KEY
} from './constants.js'
import { WECHAT_PERSONAL_PLUGIN_CONTEXT } from './tokens.js'
import {
  normalizeString,
  normalizeWechatPersonalInboundPayload,
  TIntegrationWechatPersonalOptions,
  WechatPersonalInboundEvent
} from './types.js'
import { WechatPersonalClient } from './wechat-personal.client.js'
import {
  WechatPersonalOutboundQueueTextInput,
  WechatPersonalOutboundQueueService,
  WechatPersonalQueuedSendResult
} from './wechat-personal-outbound-queue.service.js'
import { fetchWechatPersonalImageAsBase64 } from './wechat-personal-image.js'
import {
  parseWechatPersonalOutgoingContent,
  WechatPersonalOutgoingContentPart
} from './wechat-personal-outgoing-content.js'
import { formatWechatPersonalOutgoingText } from './wechat-personal-text-format.js'

const DEFAULT_TEXT_LIMIT = 4000

export type WechatPersonalReplyPartSendResult = WechatPersonalQueuedSendResult & {
  type: 'text' | 'image'
  content: string
  payloadSummary?: string
}

export type WechatPersonalReplySendResult = WechatPersonalQueuedSendResult & {
  items: WechatPersonalReplyPartSendResult[]
}

@Injectable()
@ChatChannel(WECHAT_PERSONAL_CHANNEL_TYPE)
export class WechatPersonalChannelStrategy
  implements IChatChannel<TIntegrationWechatPersonalOptions, WechatPersonalInboundEvent>
{
  private readonly logger = new Logger(WechatPersonalChannelStrategy.name)
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    private readonly client: WechatPersonalClient,
    private readonly outboundQueue: WechatPersonalOutboundQueueService,
    @Inject(WECHAT_PERSONAL_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  meta: TChatChannelMeta = {
    type: WECHAT_PERSONAL_CHANNEL_TYPE,
    label: '个人微信 / WeChat Personal',
    description: 'wx2.0 personal WeChat webhook, text/image/voice inbound, and text/image reply bridge',
    icon: WECHAT_PERSONAL_ICON,
    configSchema: {
      type: 'object',
      properties: {
        connectionMode: {
          type: 'string',
          enum: ['direct_http', 'reverse_tunnel'],
          description: 'Outbound connection mode, default direct_http'
        },
        baseUrl: { type: 'string', description: 'wx2.0 HTTP base URL, required in direct_http mode' },
        tunnelClientId: { type: 'string', description: 'MsgClientInfo.Id, required in reverse_tunnel mode' },
        apiVersion: { type: 'string', description: 'wx2.0 v2 API prefix, default /v1/' },
        apiToken: { type: 'string', description: 'Optional wx2.0 token header' },
        timeoutMs: { type: 'number', description: 'Outbound wx2.0 request timeout in milliseconds' },
        outboundQueue: {
          type: 'object',
          description: 'Redis-backed outbound queue and rate-limit settings'
        }
      },
      required: []
    }
  }

  capabilities: TChatChannelCapabilities = {
    markdown: false,
    card: false,
    cardAction: false,
    updateMessage: false,
    mention: true,
    group: true,
    thread: false,
    media: true,
    textChunkLimit: DEFAULT_TEXT_LIMIT,
    streamingUpdate: false
  }

  async readIntegrationById(id: string): Promise<IIntegration<TIntegrationWechatPersonalOptions> | null> {
    if (!id) {
      return null
    }

    return this.integrationPermissionService.read<IIntegration<TIntegrationWechatPersonalOptions>>(id, {
      relations: ['tenant']
    })
  }

  createEventHandler(
    ctx: TChatEventContext<TIntegrationWechatPersonalOptions>,
    handlers: TChatEventHandlers
  ): (req: any, res: any, next?: any) => Promise<void> {
    const eventHandlers = handlers ?? {}
    return async (req, res) => {
      const event = this.normalizeWebhookEvent(req?.body)
      if (!event) {
        this.logger.debug(`[wechat-personal-event] ignore invalid payload integration=${ctx.integration.id}`)
        res.status(200).send('success')
        return
      }

      const message = this.parseInboundMessage(event, ctx)
      if (!message) {
        this.logger.debug(
          `[wechat-personal-event] ignore non-message integration=${ctx.integration.id} uuid=${event.uuid || 'n/a'}`
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

  normalizeWebhookEvent(payload: unknown): WechatPersonalInboundEvent | null {
    return normalizeWechatPersonalInboundPayload(payload)
  }

  parseInboundMessage(
    event: WechatPersonalInboundEvent,
    _ctx: TChatEventContext<TIntegrationWechatPersonalOptions>
  ): TChatInboundMessage | null {
    const chatId = normalizeString(event.contactId)
    const senderId = normalizeString(event.senderId) || chatId
    if (!chatId || !senderId) {
      return null
    }

    return {
      messageId: event.messageId || randomUUID(),
      chatId,
      chatType: event.chatType,
      senderId,
      senderName: event.senderName,
      content: event.content,
      contentType: event.messageKind === 'image' ? 'image' : event.messageKind === 'voice' ? 'voice' : 'text',
      ...(event.files?.length ? { files: event.files } : {}),
      mentions: event.chatType === 'group' ? this.resolveMentions(event) : undefined,
      timestamp: event.timestamp || Date.now(),
      raw: event.rawPayload ?? event.raw ?? event
    }
  }

  async sendText(ctx: TChatContext, content: string): Promise<TChatSendResult> {
    return this.sendTextByIntegrationId(ctx.integration.id, {
      uuid: normalizeString((ctx as Record<string, unknown>).uuid),
      contactId: ctx.chatId,
      content
    })
  }

  async sendMedia(
    ctx: TChatContext,
    media: {
      type: 'image' | 'file' | 'audio' | 'video'
      url?: string
      content?: Buffer
      filename?: string
    }
  ): Promise<TChatSendResult> {
    if (media.type !== 'image') {
      return {
        success: false,
        error: '个人微信通道当前仅支持发送图片媒体。'
      }
    }

    return this.sendImageByIntegrationId(ctx.integration.id, {
      uuid: normalizeString((ctx as Record<string, unknown>).uuid),
      contactId: ctx.chatId,
      imageUrl: media.url,
      imageContent: media.content?.toString('base64')
    })
  }

  async sendReplyByIntegrationId(
    integrationId: string,
    params: {
      uuid?: string | null
      contactId?: string | null
      content: string
      atUsers?: string[] | null
    } & Pick<WechatPersonalOutboundQueueTextInput, 'context' | 'source' | 'idempotencyKey'>
  ): Promise<WechatPersonalReplySendResult> {
    const parts = parseWechatPersonalOutgoingContent(params.content)
    if (!parts.length) {
      return {
        success: false,
        error: '发送微信消息缺少可发送内容。',
        items: []
      }
    }

    const items: WechatPersonalReplyPartSendResult[] = []
    for (const part of parts) {
      const result =
        part.type === 'image'
          ? await this.sendImageByIntegrationId(integrationId, {
              uuid: params.uuid,
              contactId: params.contactId,
              imageUrl: part.imageUrl,
              context: params.context,
              source: params.source,
              idempotencyKey: params.idempotencyKey
            })
          : await this.sendTextByIntegrationId(integrationId, {
              uuid: params.uuid,
              contactId: params.contactId,
              content: part.content,
              atUsers: params.atUsers,
              context: params.context,
              source: params.source,
              idempotencyKey: params.idempotencyKey
            })

      const item = this.toReplyPartResult(part, result, params.source, params.idempotencyKey)
      items.push(item)
      if (!result.success) {
        return {
          success: false,
          queued: items.some((entry) => entry.queued),
          messageId: result.messageId,
          error: result.error,
          items
        }
      }
    }

    const last = items[items.length - 1]
    return {
      success: true,
      queued: items.some((entry) => entry.queued),
      queueJobId: last?.queueJobId,
      outboundLogId: last?.outboundLogId,
      scheduledAt: last?.scheduledAt,
      messageId: last?.messageId,
      items
    }
  }

  async sendTextByIntegrationId(
    integrationId: string,
    params: {
      uuid?: string | null
      contactId?: string | null
      content: string
      atUsers?: string[] | null
    } & Pick<WechatPersonalOutboundQueueTextInput, 'context' | 'source' | 'idempotencyKey'>
  ): Promise<WechatPersonalQueuedSendResult> {
    const integration = await this.readIntegration(integrationId)
    if (!integration) {
      return {
        success: false,
        error: '个人微信集成不存在或不可访问。'
      }
    }

    const uuid = normalizeString(params.uuid)
    const contactId = normalizeString(params.contactId)
    const content = formatWechatPersonalOutgoingText(normalizeString(params.content))
    if (!uuid || !contactId || !content) {
      return {
        success: false,
        error: '发送微信消息缺少 uuid/contactId/content。'
      }
    }

    if (integration.options?.outboundQueue?.enabled === false) {
      const result = await this.client.sendText(integration, {
        uuid,
        contactId,
        content,
        atUsers: Array.isArray(params.atUsers) ? params.atUsers.filter(Boolean) : []
      })

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error
      }
    }

    return this.outboundQueue.enqueueText(integration, {
      uuid,
      contactId,
      content,
      atUsers: Array.isArray(params.atUsers) ? params.atUsers.filter(Boolean) : [],
      context: params.context,
      source: params.source,
      idempotencyKey: params.idempotencyKey
    })
  }

  async sendImageByIntegrationId(
    integrationId: string,
    params: {
      uuid?: string | null
      contactId?: string | null
      imageUrl?: string | null
      imageContent?: string | null
    } & Pick<WechatPersonalOutboundQueueTextInput, 'context' | 'source' | 'idempotencyKey'>
  ): Promise<WechatPersonalQueuedSendResult> {
    const integration = await this.readIntegration(integrationId)
    if (!integration) {
      return {
        success: false,
        error: '个人微信集成不存在或不可访问。'
      }
    }

    const uuid = normalizeString(params.uuid)
    const contactId = normalizeString(params.contactId)
    const imageUrl = normalizeString(params.imageUrl)
    const imageContent = normalizeString(params.imageContent)
    if (!uuid || !contactId || (!imageUrl && !imageContent)) {
      return {
        success: false,
        error: '发送微信图片缺少 uuid/contactId/imageUrl。'
      }
    }

    if (integration.options?.outboundQueue?.enabled === false) {
      let result: Awaited<ReturnType<WechatPersonalClient['sendImage']>>
      try {
        const resolvedImageContent = imageContent || (await this.fetchImageContent(imageUrl, integration))
        result = await this.client.sendImage(integration, {
          uuid,
          contactId,
          imageContent: resolvedImageContent
        })
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error
      }
    }

    if (!imageUrl) {
      return {
        success: false,
        error: '启用出站队列时，微信图片发送需要可下载的 imageUrl。'
      }
    }

    return this.outboundQueue.enqueueImage(integration, {
      type: 'image',
      uuid,
      contactId,
      imageUrl,
      context: params.context,
      source: params.source,
      idempotencyKey: params.idempotencyKey
    })
  }

  async registerCallback(params: {
    integrationId: string
    uuid: string
    callbackUrl: string
    enabled?: boolean
  }): Promise<TChatSendResult> {
    const integration = await this.readIntegrationById(params.integrationId)
    if (!integration) {
      return {
        success: false,
        error: '个人微信集成不存在或不可访问。'
      }
    }

    const result = await this.client.registerCallback({
      integration,
      uuid: params.uuid,
      callbackUrl: params.callbackUrl,
      enabled: params.enabled
    })

    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error
    }
  }

  private async fetchImageContent(
    imageUrl: string,
    integration: IIntegration<TIntegrationWechatPersonalOptions>
  ): Promise<string> {
    const image = await fetchWechatPersonalImageAsBase64(imageUrl, {
      timeoutMs: integration.options?.timeoutMs
    })
    return image.imageContent
  }

  private toReplyPartResult(
    part: WechatPersonalOutgoingContentPart,
    result: WechatPersonalQueuedSendResult,
    source: WechatPersonalOutboundQueueTextInput['source'],
    idempotencyKey?: string
  ): WechatPersonalReplyPartSendResult {
    const payloadSummary =
      part.type === 'image'
        ? JSON.stringify({
            type: 'image',
            source: source || 'message_reply',
            imageUrl: part.imageUrl,
            ...(idempotencyKey ? { idempotencyKey } : {})
          })
        : JSON.stringify({
            type: 'text',
            source: source || 'message_reply',
            ...(idempotencyKey ? { idempotencyKey } : {})
          })

    return {
      ...result,
      type: part.type,
      content: part.type === 'image' ? part.imageUrl : part.content,
      payloadSummary
    }
  }

  private async readIntegration(integrationId: string): Promise<IIntegration<TIntegrationWechatPersonalOptions> | null> {
    const id = normalizeString(integrationId)
    if (!id) {
      return null
    }
    return this.readIntegrationById(id)
  }

  private resolveMentions(event: WechatPersonalInboundEvent): Array<{ id: string; name?: string }> | undefined {
    const rawText = JSON.stringify(event.raw || {})
    const ownerWxid = normalizeString(event.ownerWxid)
    if (ownerWxid && rawText.includes(ownerWxid)) {
      return [{ id: ownerWxid }]
    }
    if (/@[^\s]+/.test(`${event.content}\n${event.displayText || ''}`)) {
      return [{ id: 'mentioned' }]
    }
    return undefined
  }
}

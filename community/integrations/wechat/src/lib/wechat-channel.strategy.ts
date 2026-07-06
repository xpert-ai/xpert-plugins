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
  WECHAT_CHANNEL_TYPE,
  WECHAT_ICON,
  WECHAT_PROVIDER_KEY
} from './constants.js'
import { WECHAT_PLUGIN_CONTEXT } from './tokens.js'
import {
  normalizeString,
  normalizeWechatInboundPayload,
  TIntegrationWechatOptions,
  WechatInboundEvent
} from './types.js'
import { WechatClient } from './wechat.client.js'
import {
  WechatOutboundQueueFileInput,
  WechatOutboundQueueTextInput,
  WechatOutboundQueueService,
  WechatQueuedSendResult
} from './wechat-outbound-queue.service.js'
import { fetchWechatImageAsBase64 } from './wechat-image.js'
import {
  parseWechatOutgoingContent,
  WechatOutgoingContentPart
} from './wechat-outgoing-content.js'
import { formatWechatOutgoingText } from './wechat-text-format.js'
import {
  resolveWechatSendFile,
  sanitizeWechatSendFileName,
  type WechatResolvedSendFile
} from './wechat-send-file.js'

const DEFAULT_TEXT_LIMIT = 4000

export type WechatReplyPartSendResult = WechatQueuedSendResult & {
  type: 'text' | 'image'
  content: string
  payloadSummary?: string
}

export type WechatReplySendResult = WechatQueuedSendResult & {
  items: WechatReplyPartSendResult[]
}

@Injectable()
@ChatChannel(WECHAT_CHANNEL_TYPE)
export class WechatChannelStrategy
  implements IChatChannel<TIntegrationWechatOptions, WechatInboundEvent>
{
  private readonly logger = new Logger(WechatChannelStrategy.name)
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    private readonly client: WechatClient,
    private readonly outboundQueue: WechatOutboundQueueService,
    @Inject(WECHAT_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  meta: TChatChannelMeta = {
    type: WECHAT_CHANNEL_TYPE,
    label: '微信 / WeChat',
    description: 'wx2.0 WeChat webhook, text/image/voice inbound, and text/image reply bridge',
    icon: WECHAT_ICON,
    configSchema: {
      type: 'object',
      properties: {
        connectionMode: {
          type: 'string',
          enum: ['direct_http', 'reverse_tunnel'],
          description: 'Outbound connection mode, default direct_http'
        },
        baseUrl: { type: 'string', description: 'wx2.0 HTTP base URL, required in direct_http mode' },
        apiVersion: { type: 'string', description: 'wx2.0 v2 API prefix, default /v1/' },
        apiToken: { type: 'string', description: 'Optional wx2.0 token header' },
        timeoutMs: { type: 'number', description: 'Outbound wx2.0 request timeout in milliseconds' },
        outboundQueue: {
          type: 'object',
          description: 'Redis-backed outbound queue and rate-limit settings'
        },
        agentCallbackIntermediateTextEnabled: {
          type: 'boolean',
          description: 'Send visible assistant text between agent tool calls as intermediate WeChat text messages'
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

  async readIntegrationById(id: string): Promise<IIntegration<TIntegrationWechatOptions> | null> {
    if (!id) {
      return null
    }

    return this.integrationPermissionService.read<IIntegration<TIntegrationWechatOptions>>(id, {
      relations: ['tenant']
    })
  }

  createEventHandler(
    ctx: TChatEventContext<TIntegrationWechatOptions>,
    handlers: TChatEventHandlers
  ): (req: any, res: any, next?: any) => Promise<void> {
    const eventHandlers = handlers ?? {}
    return async (req, res) => {
      const event = this.normalizeWebhookEvent(req?.body)
      if (!event) {
        this.logger.debug(`[wechat-event] ignore invalid payload integration=${ctx.integration.id}`)
        res.status(200).send('success')
        return
      }

      const message = this.parseInboundMessage(event, ctx)
      if (!message) {
        this.logger.debug(
          `[wechat-event] ignore non-message integration=${ctx.integration.id} uuid=${event.uuid || 'n/a'}`
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

  normalizeWebhookEvent(payload: unknown): WechatInboundEvent | null {
    return normalizeWechatInboundPayload(payload)
  }

  parseInboundMessage(
    event: WechatInboundEvent,
    _ctx: TChatEventContext<TIntegrationWechatOptions>
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
    if (media.type === 'file') {
      const uuid = normalizeString((ctx as Record<string, unknown>).uuid)
      const contactId = normalizeString(ctx.chatId)
      if (!uuid || !contactId) {
        return {
          success: false,
          error: '发送微信文件缺少 uuid/contactId。'
        }
      }
      if (media.url) {
        try {
          const file = await resolveWechatSendFile({
            path: media.url,
            originalName: media.filename
          })
          return this.sendFileByIntegrationId(ctx.integration.id, {
            uuid,
            contactId,
            file
          })
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }
      if (!media.content) {
        return {
          success: false,
          error: '发送微信文件缺少本地文件路径或文件内容。'
        }
      }
      if (ctx.integration.options?.outboundQueue?.enabled !== false) {
        return {
          success: false,
          error: '启用出站队列时，微信文件发送需要可重新读取的本地文件路径。'
        }
      }
      const result = await this.client.sendFile(ctx.integration, {
        uuid,
        contactId,
        fileName: sanitizeWechatSendFileName(media.filename, 'file'),
        fileContent: media.content.toString('base64')
      })
      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error
      }
    }

    if (media.type !== 'image') {
      return {
        success: false,
        error: '微信通道当前仅支持发送图片和文件媒体。'
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
    } & Pick<WechatOutboundQueueTextInput, 'context' | 'source' | 'idempotencyKey'>
  ): Promise<WechatReplySendResult> {
    const parts = this.buildReplySendParts(parseWechatOutgoingContent(params.content))
    if (!parts.length) {
      return {
        success: false,
        error: '发送微信消息缺少可发送内容。',
        items: []
      }
    }

    const items: WechatReplyPartSendResult[] = []
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

  private buildReplySendParts(parts: WechatOutgoingContentPart[]): WechatOutgoingContentPart[] {
    const imageParts = parts.filter(
      (part): part is Extract<WechatOutgoingContentPart, { type: 'image' }> => part.type === 'image'
    )
    if (!imageParts.length) {
      return parts
    }

    const textContent = parts
      .filter((part): part is Extract<WechatOutgoingContentPart, { type: 'text' }> => part.type === 'text')
      .map((part) => normalizeString(part.content))
      .filter(Boolean)
      .join('\n\n')

    return [
      ...(textContent ? [{ type: 'text' as const, content: textContent }] : []),
      ...imageParts,
      {
        type: 'text' as const,
        content: `${imageParts.length}个图片已发完`
      }
    ]
  }

  async sendTextByIntegrationId(
    integrationId: string,
    params: {
      uuid?: string | null
      contactId?: string | null
      content: string
      atUsers?: string[] | null
    } & Pick<WechatOutboundQueueTextInput, 'context' | 'source' | 'idempotencyKey'>
  ): Promise<WechatQueuedSendResult> {
    const integration = await this.readIntegration(integrationId)
    if (!integration) {
      return {
        success: false,
        error: '微信集成不存在或不可访问。'
      }
    }

    const uuid = normalizeString(params.uuid)
    const contactId = normalizeString(params.contactId)
    const content = formatWechatOutgoingText(normalizeString(params.content))
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
    } & Pick<WechatOutboundQueueTextInput, 'context' | 'source' | 'idempotencyKey'>
  ): Promise<WechatQueuedSendResult> {
    const integration = await this.readIntegration(integrationId)
    if (!integration) {
      return {
        success: false,
        error: '微信集成不存在或不可访问。'
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
      let result: Awaited<ReturnType<WechatClient['sendImage']>>
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

  async sendFileByIntegrationId(
    integrationId: string,
    params: {
      uuid?: string | null
      contactId?: string | null
      file: WechatResolvedSendFile
      uploadToken?: string | null
    } & Pick<WechatOutboundQueueTextInput, 'context' | 'source' | 'idempotencyKey'>
  ): Promise<WechatQueuedSendResult> {
    const integration = await this.readIntegration(integrationId)
    if (!integration) {
      return {
        success: false,
        error: '微信集成不存在或不可访问。'
      }
    }

    const uuid = normalizeString(params.uuid)
    const contactId = normalizeString(params.contactId)
    const uploadToken = normalizeString(params.uploadToken)
    const file = params.file
    if (!uuid || !contactId || !file?.fileName || !file.fileContent || !file.filePath) {
      return {
        success: false,
        error: '发送微信文件缺少 uuid/contactId/file。'
      }
    }

    if (integration.options?.outboundQueue?.enabled === false) {
      const result = await this.client.sendFile(integration, {
        uuid,
        contactId,
        fileName: file.fileName,
        fileContent: file.fileContent,
        uploadToken
      })

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error
      }
    }

    return this.outboundQueue.enqueueFile(integration, {
      type: 'file',
      uuid,
      contactId,
      filePath: file.filePath,
      fileRef: file.fileRef,
      fileName: file.fileName,
      mimeType: file.mimeType,
      extension: file.extension,
      size: file.size,
      sha256: file.sha256,
      uploadToken,
      context: params.context,
      source: params.source,
      idempotencyKey: params.idempotencyKey
    } satisfies WechatOutboundQueueFileInput)
  }

  private async fetchImageContent(
    imageUrl: string,
    integration: IIntegration<TIntegrationWechatOptions>
  ): Promise<string> {
    const image = await fetchWechatImageAsBase64(imageUrl, {
      timeoutMs: integration.options?.timeoutMs
    })
    return image.imageContent
  }

  private toReplyPartResult(
    part: WechatOutgoingContentPart,
    result: WechatQueuedSendResult,
    source: WechatOutboundQueueTextInput['source'],
    idempotencyKey?: string
  ): WechatReplyPartSendResult {
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

  private async readIntegration(integrationId: string): Promise<IIntegration<TIntegrationWechatOptions> | null> {
    const id = normalizeString(integrationId)
    if (!id) {
      return null
    }
    return this.readIntegrationById(id)
  }

  private resolveMentions(event: WechatInboundEvent): Array<{ id: string; name?: string }> | undefined {
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

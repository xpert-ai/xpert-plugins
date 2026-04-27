import { Serializable } from '@langchain/core/load/serializable'
import { IChatMessage } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import type { WeComChannelStrategy } from './wecom-channel.strategy.js'
import { buildWeComRestartConversationCard } from './wecom-conversation-action-card.js'
import { formatWeComConversationFailedText } from './wecom-conversation-text.js'

export type ChatWeComMessageStatus =
  | IChatMessage['status']
  | 'thinking'
  | 'continuing'
  | 'waiting'
  | 'done'
  | 'end'
  | 'error'

export type WeComStreamSendStatus = 'sent' | 'skipped'

type WeComMessageChannel = Pick<
  WeComChannelStrategy,
  | 'sendTextByIntegrationId'
  | 'sendRobotPayload'
  | 'updateRobotTemplateCard'
  | 'sendReplyStreamByIntegrationId'
>

export interface ChatWeComMessageFields {
  id: string
  messageId: string
  streamId?: string
  status: ChatWeComMessageStatus
  language?: string
}

type ChatWeComContext = {
  integrationId: string
  chatId: string
  chatType?: 'private' | 'group' | 'channel' | 'thread'
  senderId?: string
  responseUrl?: string
  reqId?: string
  wecomChannel: WeComMessageChannel
}

type ReplyTemplateCardOptions = {
  preferActiveMessageForLongConnection?: boolean
}

export class ChatWeComMessage extends Serializable implements ChatWeComMessageFields {
  lc_namespace: string[] = ['wecom']
  override lc_serializable = true

  override get lc_attributes() {
    return {
      status: this.status,
      id: this.id,
      messageId: this.messageId,
      streamId: this.streamId,
      language: this.language
    }
  }

  private readonly logger = new Logger(ChatWeComMessage.name)

  public id: string = null
  public messageId: string = null
  public streamId?: string
  public status: ChatWeComMessageStatus = 'thinking'
  public language?: string

  constructor(
    private readonly chatContext: ChatWeComContext,
    options?: Partial<ChatWeComMessageFields> & {
      language?: string
    }
  ) {
    super(options || {})
    this.id = options?.id || null
    this.messageId = options?.messageId || null
    this.streamId = options?.streamId
    this.status = options?.status || 'thinking'
    this.language = options?.language
  }

  get integrationId() {
    return this.chatContext.integrationId
  }

  get chatId() {
    return this.chatContext.chatId
  }

  get chatType() {
    return this.chatContext.chatType
  }

  get senderId() {
    return this.chatContext.senderId
  }

  get responseUrl() {
    return this.chatContext.responseUrl
  }

  get reqId() {
    return this.chatContext.reqId
  }

  async update(options: { status?: ChatWeComMessageStatus; text?: string }): Promise<void> {
    if (options.status) {
      this.status = options.status
    }
    if (options.text) {
      await this.reply(options.text)
    }
  }

  async reply(content: string): Promise<void> {
    const result = await this.chatContext.wecomChannel.sendTextByIntegrationId(this.integrationId, {
      chatId: this.chatId,
      chatType: this.chatType,
      senderId: this.senderId,
      responseUrl: this.responseUrl,
      reqId: this.reqId,
      preferResponseUrl: true,
      content
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to send WeCom message')
    }

    this.id = result.messageId || this.id
    this.messageId = result.messageId || this.messageId
  }

  async replyTemplateCard(
    templateCard: Record<string, unknown>,
    options?: ReplyTemplateCardOptions
  ): Promise<void> {
    const result = await this.chatContext.wecomChannel.sendRobotPayload({
      integrationId: this.integrationId,
      chatId: this.chatId,
      chatType: this.chatType,
      senderId: this.senderId,
      responseUrl: this.responseUrl,
      reqId: this.reqId,
      preferActiveMessage: options?.preferActiveMessageForLongConnection === true,
      payload: {
        msgtype: 'template_card',
        template_card: templateCard
      }
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to send WeCom template card')
    }

    this.id = result.messageId || this.id
    this.messageId = result.messageId || this.messageId
  }

  async replyStream(
    content: string,
    finish = false,
    msgItem?: Array<Record<string, unknown>>,
    feedback?: Record<string, unknown>
  ): Promise<void> {
    const startedAt = Date.now()
    const result = await this.chatContext.wecomChannel.sendReplyStreamByIntegrationId(this.integrationId, {
      chatId: this.chatId,
      senderId: this.senderId,
      responseUrl: this.responseUrl,
      reqId: this.reqId,
      preferConversationContext: true,
      streamId: this.streamId,
      content,
      finish,
      msgItem,
      feedback
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to send WeCom stream message')
    }

    this.streamId = result.messageId || this.streamId
    this.logger.debug(
      `[wecom-message] replyStream sent integration=${this.integrationId} chatId=${this.chatId} reqId=${
        this.reqId || 'n/a'
      } streamId=${this.streamId || 'n/a'} finish=${finish} contentLen=${content.length} elapsedMs=${
        Date.now() - startedAt
      }`
    )
  }

  async replyStreamNonBlocking(
    content: string,
    finish = false,
    msgItem?: Array<Record<string, unknown>>,
    feedback?: Record<string, unknown>
  ): Promise<WeComStreamSendStatus> {
    const startedAt = Date.now()
    const result = await this.chatContext.wecomChannel.sendReplyStreamByIntegrationId(this.integrationId, {
      chatId: this.chatId,
      senderId: this.senderId,
      responseUrl: this.responseUrl,
      reqId: this.reqId,
      preferConversationContext: true,
      streamId: this.streamId,
      content,
      finish,
      msgItem,
      feedback,
      nonBlocking: true
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to send WeCom stream message')
    }

    this.streamId = result.messageId || this.streamId
    const skipped = (result as typeof result & { skipped?: boolean }).skipped === true
    this.logger.debug(
      `[wecom-message] replyStreamNonBlocking ${skipped ? 'skipped' : 'sent'} integration=${this.integrationId} chatId=${
        this.chatId
      } reqId=${this.reqId || 'n/a'} streamId=${this.streamId || 'n/a'} finish=${finish} contentLen=${
        content.length
      } elapsedMs=${Date.now() - startedAt}`
    )
    return skipped ? 'skipped' : 'sent'
  }

  async updateTemplateCard(templateCard: Record<string, unknown>): Promise<void> {
    const result = await this.chatContext.wecomChannel.updateRobotTemplateCard({
      integrationId: this.integrationId,
      templateCard: templateCard,
      chatId: this.chatId,
      chatType: this.chatType,
      senderId: this.senderId,
      responseUrl: this.responseUrl,
      reqId: this.reqId
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to update WeCom template card')
    }

    this.id = result.messageId || this.id
    this.messageId = result.messageId || this.messageId
  }

  async done(): Promise<void> {
    this.status = 'done'
  }

  async replyRestartConversationCard(options?: ReplyTemplateCardOptions): Promise<void> {
    await this.replyTemplateCard(buildWeComRestartConversationCard(this.language), options)
  }

  async fail(error: unknown): Promise<void> {
    this.status = 'error'
    const message = error instanceof Error ? error.message : String(error)
    try {
      await this.reply(formatWeComConversationFailedText(this.language, message))
    } catch (sendError) {
      this.logger.error(
        `Failed to send WeCom error message: ${sendError instanceof Error ? sendError.message : String(sendError)}`
      )
      return
    }

    try {
      await this.replyRestartConversationCard({
        // Long-connection error follow-up cards should be proactive instead of reusing the callback reqId.
        preferActiveMessageForLongConnection: true
      })
    } catch (sendError) {
      this.logger.warn(
        `Failed to send WeCom restart conversation card: ${
          sendError instanceof Error ? sendError.message : String(sendError)
        }`
      )
    }
  }
}

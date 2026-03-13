import { Serializable } from '@langchain/core/load/serializable'
import { IChatMessage } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import type { WeComChannelStrategy } from './wecom-channel.strategy.js'

export type ChatWeComMessageStatus =
  | IChatMessage['status']
  | 'thinking'
  | 'continuing'
  | 'waiting'
  | 'done'
  | 'end'
  | 'error'

type WeComMessageChannel = Pick<WeComChannelStrategy, 'sendTextByIntegrationId'>

export interface ChatWeComMessageFields {
  id: string
  messageId: string
  status: ChatWeComMessageStatus
  language?: string
}

type ChatWeComContext = {
  integrationId: string
  chatId: string
  senderId?: string
  responseUrl?: string
  wecomChannel: WeComMessageChannel
}

export class ChatWeComMessage extends Serializable implements ChatWeComMessageFields {
  lc_namespace: string[] = ['wecom']
  override lc_serializable = true

  override get lc_attributes() {
    return {
      status: this.status,
      id: this.id,
      messageId: this.messageId,
      language: this.language
    }
  }

  private readonly logger = new Logger(ChatWeComMessage.name)

  public id: string = null
  public messageId: string = null
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
    this.status = options?.status || 'thinking'
    this.language = options?.language
  }

  get integrationId() {
    return this.chatContext.integrationId
  }

  get chatId() {
    return this.chatContext.chatId
  }

  get senderId() {
    return this.chatContext.senderId
  }

  get responseUrl() {
    return this.chatContext.responseUrl
  }

  async update(options: {
    status?: ChatWeComMessageStatus
    text?: string
  }): Promise<void> {
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
      senderId: this.senderId,
      responseUrl: this.responseUrl,
      preferResponseUrl: true,
      content
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to send WeCom message')
    }

    this.id = result.messageId || this.id
    this.messageId = result.messageId || this.messageId
  }

  async done(): Promise<void> {
    this.status = 'done'
  }

  async fail(error: unknown): Promise<void> {
    this.status = 'error'
    const message = error instanceof Error ? error.message : String(error)
    try {
      await this.reply(`[企业微信对话失败]\n${message}`)
    } catch (sendError) {
      this.logger.error(`Failed to send WeCom error message: ${sendError instanceof Error ? sendError.message : String(sendError)}`)
    }
  }
}

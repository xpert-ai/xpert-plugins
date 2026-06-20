import { Serializable } from '@langchain/core/load/serializable'
import { IChatMessage } from '@xpert-ai/contracts'
import type { WechatPersonalChannelStrategy } from './wechat-personal-channel.strategy.js'

export type WechatPersonalMessageStatus =
  | IChatMessage['status']
  | 'thinking'
  | 'continuing'
  | 'waiting'
  | 'done'
  | 'end'
  | 'error'

type WechatPersonalMessageChannel = Pick<WechatPersonalChannelStrategy, 'sendReplyByIntegrationId'>

export interface WechatPersonalMessageFields {
  id?: string
  messageId?: string
  status?: WechatPersonalMessageStatus
  language?: string
}

type WechatPersonalMessageContext = {
  integrationId: string
  uuid: string
  contactId: string
  chatType?: 'private' | 'group'
  senderId?: string
  ownerWxid?: string
  atUsers?: string[]
  wechatChannel: WechatPersonalMessageChannel
}

export class WechatPersonalMessage extends Serializable implements Required<WechatPersonalMessageFields> {
  lc_namespace: string[] = ['wechat-personal']
  override lc_serializable = true

  override get lc_attributes() {
    return {
      status: this.status,
      id: this.id,
      messageId: this.messageId,
      language: this.language
    }
  }

  public id: string = null
  public messageId: string = null
  public status: WechatPersonalMessageStatus = 'thinking'
  public language: string = null

  constructor(
    private readonly chatContext: WechatPersonalMessageContext,
    options?: WechatPersonalMessageFields
  ) {
    super(options || {})
    this.id = options?.id || null
    this.messageId = options?.messageId || null
    this.status = options?.status || 'thinking'
    this.language = options?.language || null
  }

  get integrationId() {
    return this.chatContext.integrationId
  }

  get uuid() {
    return this.chatContext.uuid
  }

  get contactId() {
    return this.chatContext.contactId
  }

  get chatType() {
    return this.chatContext.chatType
  }

  get senderId() {
    return this.chatContext.senderId
  }

  get ownerWxid() {
    return this.chatContext.ownerWxid
  }

  async update(options: { status?: WechatPersonalMessageStatus; text?: string }): Promise<void> {
    if (options.status) {
      this.status = options.status
    }
    if (options.text) {
      await this.reply(options.text)
    }
  }

  async reply(content: string): Promise<void> {
    const result = await this.chatContext.wechatChannel.sendReplyByIntegrationId(this.integrationId, {
      uuid: this.uuid,
      contactId: this.contactId,
      content,
      atUsers: this.chatContext.atUsers,
      source: 'message_reply'
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to send WeChat personal message')
    }

    this.id = result.messageId || this.id
    this.messageId = result.messageId || this.messageId
  }
}

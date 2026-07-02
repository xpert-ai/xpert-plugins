import { Serializable } from '@langchain/core/load/serializable'
import { IChatMessage } from '@xpert-ai/contracts'
import type { WechatChannelStrategy } from './wechat-channel.strategy.js'

export type WechatMessageStatus =
  | IChatMessage['status']
  | 'thinking'
  | 'continuing'
  | 'waiting'
  | 'done'
  | 'end'
  | 'error'

type WechatMessageChannel = Pick<WechatChannelStrategy, 'sendReplyByIntegrationId'>

export interface WechatMessageFields {
  id?: string
  messageId?: string
  status?: WechatMessageStatus
  language?: string
}

type WechatMessageContext = {
  integrationId: string
  uuid: string
  contactId: string
  chatType?: 'private' | 'group'
  senderId?: string
  senderName?: string
  ownerWxid?: string
  atUsers?: string[]
  wechatChannel: WechatMessageChannel
}

export class WechatMessage extends Serializable implements Required<WechatMessageFields> {
  lc_namespace: string[] = ['wechat']
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
  public status: WechatMessageStatus = 'thinking'
  public language: string = null

  constructor(
    private readonly chatContext: WechatMessageContext,
    options?: WechatMessageFields
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

  get senderName() {
    return this.chatContext.senderName
  }

  get ownerWxid() {
    return this.chatContext.ownerWxid
  }

  async update(options: { status?: WechatMessageStatus; text?: string }): Promise<void> {
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
      context: {
        integrationId: this.integrationId,
        uuid: this.uuid,
        ownerWxid: this.ownerWxid,
        contactId: this.contactId,
        chatType: this.chatType,
        senderId: this.senderId,
        senderName: this.senderName
      },
      source: 'message_reply'
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to send WeChat message')
    }

    this.id = result.messageId || this.id
    this.messageId = result.messageId || this.messageId
  }
}

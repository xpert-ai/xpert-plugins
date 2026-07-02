import { AgentChatCallbackEnvelopePayload, defineChannelMessageType } from '@xpert-ai/plugin-sdk'

export const WECHAT_CHAT_CALLBACK_MESSAGE_TYPE = defineChannelMessageType(
  'wechat',
  'chat_final_event',
  1
)

export interface WechatChatMessageSnapshot {
  id?: string
  messageId?: string
  status?: string
  language?: string
}

export interface WechatChatCallbackContext extends Record<string, unknown> {
  tenantId: string
  organizationId?: string
  userId?: string
  xpertId: string
  from?: string
  channelType?: string
  wechatConversation?: boolean
  channelSource?: string
  integrationId: string
  uuid: string
  ownerWxid?: string
  contactId: string
  chatId: string
  chatType?: 'private' | 'group'
  senderId?: string
  senderName?: string
  responseStrategy?: 'final_text'
  preferLanguage?: string
  conversationUserKey?: string
  conversationId?: string
  currentInboundLogIds?: string[]
  message: WechatChatMessageSnapshot
}

export interface WechatChatCallbackPayload extends AgentChatCallbackEnvelopePayload {
  context?: WechatChatCallbackContext
}

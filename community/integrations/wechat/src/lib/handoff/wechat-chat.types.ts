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
  wechat_conversation?: boolean
  channelSource?: string
  channel_source?: string
  integrationId: string
  uuid: string
  ownerWxid?: string
  contactId: string
  contact_id?: string
  chatId: string
  chat_id?: string
  chatType?: 'private' | 'group'
  chat_type?: 'private' | 'group'
  senderId?: string
  sender_id?: string
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

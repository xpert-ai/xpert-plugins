import { AgentChatCallbackEnvelopePayload, defineChannelMessageType } from '@xpert-ai/plugin-sdk'

export const WECHAT_PERSONAL_CHAT_CALLBACK_MESSAGE_TYPE = defineChannelMessageType(
  'wechat_personal',
  'chat_final_event',
  1
)

export interface WechatPersonalChatMessageSnapshot {
  id?: string
  messageId?: string
  status?: string
  language?: string
}

export interface WechatPersonalChatCallbackContext extends Record<string, unknown> {
  tenantId: string
  organizationId?: string
  userId: string
  xpertId: string
  from?: string
  channelType?: string
  wechatPersonalConversation?: boolean
  wechat_personal_conversation?: boolean
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
  message: WechatPersonalChatMessageSnapshot
}

export interface WechatPersonalChatCallbackPayload extends AgentChatCallbackEnvelopePayload {
  context?: WechatPersonalChatCallbackContext
}

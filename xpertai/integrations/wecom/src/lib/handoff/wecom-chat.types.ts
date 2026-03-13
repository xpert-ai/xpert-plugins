import { LanguagesEnum, TChatOptions } from '@metad/contracts'
import { AgentChatCallbackEnvelopePayload, defineChannelMessageType } from '@xpert-ai/plugin-sdk'

export const WECOM_CHAT_STREAM_CALLBACK_MESSAGE_TYPE = defineChannelMessageType(
  'wecom',
  'chat_stream_event',
  1
)

export interface WeComChatMessageSnapshot {
  id?: string
  messageId?: string
  status?: string
  language?: string
}

export interface WeComChatCallbackContext extends Record<string, unknown> {
  tenantId: string
  organizationId?: string
  userId: string
  xpertId: string
  from?: string
  channelType?: string
  wecomConversation?: boolean
  wecom_conversation?: boolean
  channelSource?: string
  channel_source?: string
  integrationId: string
  chatId: string
  senderId?: string
  chat_id?: string
  sender_id?: string
  responseUrl?: string
  response_url?: string
  preferLanguage?: string
  conversationUserKey?: string
  conversationId?: string
  message: WeComChatMessageSnapshot
}

export interface WeComChatStreamCallbackPayload extends AgentChatCallbackEnvelopePayload {
  context?: WeComChatCallbackContext
}

export interface WeComChatHandoffPayload extends Record<string, unknown> {
  request: {
    input: {
      input: string
    }
    conversationId?: string
    confirm?: boolean
  }
  options: TChatOptions & {
    xpertId: string
    from: string
    fromEndUserId: string
    tenantId: string
    organizationId?: string
    user?: any
    language?: LanguagesEnum
    channelType?: string
    wecomConversation?: boolean
    wecom_conversation?: boolean
    channelSource?: string
    channel_source?: string
    integrationId?: string
    chatId?: string
    chat_id?: string
    senderId?: string
    sender_id?: string
    channelUserId?: string
    responseUrl?: string
    response_url?: string
  }
}

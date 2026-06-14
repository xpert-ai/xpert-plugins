import { defineChannelMessageType } from '@xpert-ai/plugin-sdk'

export const WECHAT_PERSONAL_TRIGGER_FLUSH_MESSAGE_TYPE = defineChannelMessageType(
  'wechat_personal',
  'trigger_flush',
  1
)

export interface WechatPersonalTriggerFlushPayload extends Record<string, unknown> {
  aggregateKey: string
  version: number
}

export interface WechatPersonalTriggerAggregationMessageContext {
  integrationId: string
  uuid: string
  ownerWxid?: string
  contactId: string
  chatType?: 'private' | 'group'
  senderId?: string
  language?: string
  messageId?: string
}

export interface WechatPersonalTriggerAggregationState {
  aggregateKey: string
  integrationId: string
  conversationUserKey: string
  xpertId: string
  version: number
  inputParts: string[]
  lastMessageAt: number
  conversationId?: string
  tenantId: string
  organizationId?: string
  executorUserId?: string
  endUserId?: string
  latestMessage: WechatPersonalTriggerAggregationMessageContext
}

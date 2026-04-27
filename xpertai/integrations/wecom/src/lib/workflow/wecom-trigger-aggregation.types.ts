import { defineChannelMessageType } from '@xpert-ai/plugin-sdk'

export const WECOM_TRIGGER_FLUSH_MESSAGE_TYPE = defineChannelMessageType('wecom', 'trigger_flush', 1)

export interface WeComTriggerFlushPayload extends Record<string, unknown> {
  aggregateKey: string
  version: number
}

export interface WeComTriggerAggregationMessageContext {
  integrationId: string
  chatId: string
  chatType?: 'private' | 'group' | 'channel' | 'thread'
  senderId?: string
  responseUrl?: string
  reqId?: string
  language?: string
}

export interface WeComTriggerAggregationState {
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
  latestMessage: WeComTriggerAggregationMessageContext
}

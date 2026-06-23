import type { WechatInboundFile } from '../types.js'

export interface WechatTriggerFlushPayload extends Record<string, unknown> {
  aggregateKey: string
  version: number
}

export interface WechatTriggerAggregationMessageContext {
  integrationId: string
  uuid: string
  ownerWxid?: string
  contactId: string
  chatType?: 'private' | 'group'
  senderId?: string
  language?: string
  messageId?: string
}

export interface WechatTriggerAggregationState {
  aggregateKey: string
  integrationId: string
  conversationUserKey: string
  xpertId: string
  version: number
  inputParts: string[]
  files?: WechatInboundFile[]
  currentInboundLogIds?: string[]
  historyContext?: string
  lastMessageAt: number
  tenantId: string
  organizationId?: string
  endUserId?: string
  latestMessage: WechatTriggerAggregationMessageContext
}

export interface WechatTriggerAggregatePayload extends Record<string, unknown> {
  aggregateKey: string
  integrationId: string
  xpertId: string
  input?: string
  files?: WechatInboundFile[]
  historyContext?: string
  currentInboundLogIds?: string[]
  summaryWindowSeconds: number
  sessionTimeoutSeconds: number
  tenantId: string
  organizationId?: string
  endUserId?: string
  latestMessage: WechatTriggerAggregationMessageContext
}

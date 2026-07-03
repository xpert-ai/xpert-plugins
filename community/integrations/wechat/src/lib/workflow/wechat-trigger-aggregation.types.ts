import type {
  WechatBatchTriggerItem,
  WechatInboundFile,
  WechatInboundTriggerOptions,
  WechatPendingInboundFile
} from '../types.js'

export interface WechatTriggerFlushPayload extends Record<string, unknown> {
  aggregateKey: string
  version: number
  integrationId?: string
  tenantId?: string
  organizationId?: string
}

export interface WechatTriggerAggregationMessageContext {
  integrationId: string
  uuid: string
  ownerWxid?: string
  contactId: string
  chatType?: 'private' | 'group'
  senderId?: string
  senderName?: string
  language?: string
  messageId?: string
}

export interface WechatTriggerAggregationState {
  aggregateKey: string
  integrationId: string
  accountUuid: string
  conversationUserKey: string
  xpertId: string
  version: number
  inputParts: string[]
  items?: WechatBatchTriggerItem[]
  triggerOptions?: WechatInboundTriggerOptions
  files?: WechatInboundFile[]
  pendingFiles?: WechatPendingInboundFile[]
  currentInboundLogIds?: string[]
  duplicateInboundLogIds?: string[]
  historyContext?: string
  fileMaterializeRetryCount?: number
  fileMaterializeLastError?: string
  lastMessageAt: number
  tenantId: string
  organizationId?: string
  endUserId?: string
  latestMessage: WechatTriggerAggregationMessageContext
}

export interface WechatTriggerAggregatePayload extends Record<string, unknown> {
  aggregateKey: string
  integrationId: string
  accountUuid: string
  xpertId: string
  input?: string
  item?: WechatBatchTriggerItem
  triggerOptions?: WechatInboundTriggerOptions
  files?: WechatInboundFile[]
  pendingFiles?: WechatPendingInboundFile[]
  historyContext?: string
  currentInboundLogIds?: string[]
  summaryWindowSeconds: number
  sessionTimeoutSeconds: number
  tenantId: string
  organizationId?: string
  endUserId?: string
  latestMessage: WechatTriggerAggregationMessageContext
}

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
  currentInboundLogIds?: string[]
  historyContext?: string
  lastMessageAt: number
  tenantId: string
  organizationId?: string
  executorUserId?: string
  endUserId?: string
  latestMessage: WechatPersonalTriggerAggregationMessageContext
}

export interface WechatPersonalTriggerAggregatePayload extends Record<string, unknown> {
  aggregateKey: string
  integrationId: string
  xpertId: string
  input?: string
  historyContext?: string
  currentInboundLogIds?: string[]
  summaryWindowSeconds: number
  sessionTimeoutSeconds: number
  tenantId: string
  organizationId?: string
  executorUserId?: string
  endUserId?: string
  latestMessage: WechatPersonalTriggerAggregationMessageContext
}

import { defineChannelMessageType } from '@xpert-ai/plugin-sdk'
import type { DingTalkInboundFile, DingTalkRecipient } from '../types.js'

export const DINGTALK_TRIGGER_FLUSH_MESSAGE_TYPE = defineChannelMessageType('dingtalk', 'trigger_flush', 1)

export interface DingTalkTriggerFlushPayload extends Record<string, unknown> {
	aggregateKey: string
	version: number
}

export interface DingTalkTriggerAggregationMessageContext {
	integrationId: string
	organizationId?: string
	chatId?: string
	userId?: string
	senderOpenId?: string
	senderRecipient?: DingTalkRecipient
	chatType?: 'private' | 'group'
	sessionWebhook?: string
	robotCode?: string
	language?: string
}

export interface DingTalkTriggerAggregationState {
	aggregateKey: string
	integrationId: string
	conversationUserKey: string
	xpertId: string
	version: number
	inputParts: string[]
	files?: DingTalkInboundFile[]
	lastMessageAt: number
	conversationId?: string
	tenantId?: string
	organizationId?: string
	executorUserId?: string
	endUserId?: string
	latestMessage: DingTalkTriggerAggregationMessageContext
}

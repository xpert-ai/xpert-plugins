import { defineChannelMessageType } from '@xpert-ai/plugin-sdk'
import type { LarkGroupWindow, LarkInboundFile, LarkMessageReactionRef } from '../types.js'

export const LARK_TRIGGER_FLUSH_MESSAGE_TYPE = defineChannelMessageType('lark', 'trigger_flush', 1)

export interface LarkTriggerFlushPayload extends Record<string, unknown> {
	aggregateKey: string
	version: number
}

export interface LarkTriggerAggregationDispatchOptions {
	fromEndUserId?: string
	executorUserId?: string
	streamingEnabled?: boolean
	groupWindow?: LarkGroupWindow
}

export interface LarkTriggerAggregationMessageContext {
	integrationId: string
	organizationId?: string
	connectionMode?: 'webhook' | 'long_connection'
	chatId?: string
	chatType?: 'p2p' | 'group' | string
	senderOpenId?: string
	senderName?: string
	principalKey?: string
	scopeKey?: string
	legacyConversationUserKey?: string
	recipientDirectoryKey?: string
	replyToMessageId?: string
	typingReaction?: LarkMessageReactionRef
	language?: string
}

export interface LarkTriggerAggregationState {
	aggregateKey: string
	integrationId: string
	xpertId: string
	version: number
	inputParts: string[]
	files?: LarkInboundFile[]
	historyContext?: string
	historyFiles?: LarkInboundFile[]
	currentInboundLogIds?: string[]
	historyBefore?: string
	lastMessageAt: number
	tenantId?: string
	organizationId?: string
	executorUserId?: string
	endUserId?: string
	options?: LarkTriggerAggregationDispatchOptions
	latestMessage: LarkTriggerAggregationMessageContext
}

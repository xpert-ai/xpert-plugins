import type { LanguagesEnum, TChatOptions, TChatRequest } from '@metad/contracts'
import {
	defineChannelMessageType,
	AgentChatCallbackEnvelopePayload
} from '@xpert-ai/plugin-sdk'
import { LarkCardElement, LarkGroupWindow, LarkStructuredElement } from '../types.js'

export const LARK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE = defineChannelMessageType(
	'lark',
	'chat_stream_event',
	1
)

export interface LarkStreamTextRenderItem {
	kind: 'stream_text'
	text: string
}

export interface LarkProgressRenderItem {
	kind: 'progress'
	id: string
	title: string
	detail?: string | null
	status?: string | null
}

export interface LarkToolTraceRenderItem {
	kind: 'tool_trace'
	id: string
	tool?: string | null
	title: string
	detail?: string | null
	status?: string | null
	error?: string | null
}

export interface LarkEventRenderItem {
	kind: 'event'
	id: string
	eventType: string
	tool?: string | null
	title?: string | null
	message?: string | null
	status?: string | null
	error?: string | null
}

export interface LarkStructuredRenderItem {
	kind: 'structured'
	element: LarkStructuredElement
}

export type LarkRenderItem =
	| LarkStreamTextRenderItem
	| LarkProgressRenderItem
	| LarkToolTraceRenderItem
	| LarkEventRenderItem
	| LarkStructuredRenderItem

export interface LarkChatMessageSnapshot {
	id?: string
	messageId?: string
	deliveryMode?: 'interactive' | 'text'
	status?: string
	language?: string
	header?: any
	elements?: LarkCardElement[]
	renderItems?: LarkRenderItem[]
	text?: string
}

export interface LarkChatCallbackContext extends Record<string, unknown> {
	tenantId: string
	organizationId?: string
	userId: string
	xpertId: string
	connectionMode?: 'webhook' | 'long_connection'
	preferLanguage?: string
	integrationId?: string
	chatId?: string
	chatType?: string
	senderOpenId?: string
	senderName?: string
	principalKey?: string
	scopeKey?: string
	legacyConversationUserKey?: string
	recipientDirectoryKey?: string
	groupWindowId?: string
	groupWindow?: LarkGroupWindow
	reject?: boolean
	streaming?: {
		enabled?: boolean
		updateWindowMs?: number
	}
	message: LarkChatMessageSnapshot
}

export interface LarkChatStreamCallbackPayload extends AgentChatCallbackEnvelopePayload {
	context?: LarkChatCallbackContext
}

export interface LarkChatHandoffPayload extends Record<string, unknown> {
	request: TChatRequest
	options: TChatOptions & {
		xpertId: string
		from: string
		fromEndUserId?: string
		tenantId: string
		organizationId?: string
		user?: any
		language?: LanguagesEnum
		channelType?: string
		integrationId?: string
		chatId?: string
		channelUserId?: string
	}
}

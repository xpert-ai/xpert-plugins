import { LanguagesEnum, TChatOptions } from '@metad/contracts'
import {
	defineChannelMessageType,
	AgentChatCallbackEnvelopePayload
} from '@xpert-ai/plugin-sdk'
import { DingTalkCardElement, DingTalkStructuredElement } from '../types.js'

export const DINGTALK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE = defineChannelMessageType(
	'dingtalk',
	'chat_stream_event',
	1
)

export interface DingTalkStreamTextRenderItem {
	kind: 'stream_text'
	text: string
}

export interface DingTalkEventRenderItem {
	kind: 'event'
	id: string
	eventType: string
	tool?: string | null
	title?: string | null
	message?: string | null
	status?: string | null
	error?: string | null
}

export interface DingTalkStructuredRenderItem {
	kind: 'structured'
	element: DingTalkStructuredElement
}

export type DingTalkRenderItem = DingTalkStreamTextRenderItem | DingTalkEventRenderItem | DingTalkStructuredRenderItem

export interface DingTalkChatMessageSnapshot {
	id?: string
	messageId?: string
	status?: string
	language?: string
	header?: any
	elements?: DingTalkCardElement[]
	renderItems?: DingTalkRenderItem[]
	text?: string
	degradedWithoutMessageId?: boolean
	terminalDelivered?: boolean
}

export interface DingTalkChatCallbackContext extends Record<string, unknown> {
	tenantId: string
	organizationId?: string
	userId: string
	xpertId: string
	preferLanguage?: string
	integrationId?: string
	chatId?: string
	senderOpenId?: string
	robotCode?: string
	sessionWebhook?: string
	reject?: boolean
	streaming?: {
		updateWindowMs?: number
		firstFlushMinChars?: number
	}
	message: DingTalkChatMessageSnapshot
}

export interface DingTalkChatStreamCallbackPayload extends AgentChatCallbackEnvelopePayload {
	context?: DingTalkChatCallbackContext
}

export interface DingTalkChatHandoffPayload extends Record<string, unknown> {
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
		integrationId?: string
		chatId?: string
		channelUserId?: string
	}
}

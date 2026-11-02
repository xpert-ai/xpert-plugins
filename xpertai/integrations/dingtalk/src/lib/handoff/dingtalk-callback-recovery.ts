import type { DingTalkChatRunState } from './dingtalk-chat-run-state.service.js'
import type { DingTalkChatStreamCallbackPayload } from './dingtalk-chat.types.js'

export const DINGTALK_CALLBACK_QUEUE = { pluginName: '@xpert-ai/plugin-dingtalk', queueName: 'dingtalk.callback' }
export const DINGTALK_CALLBACK_RECOVERY_DELAY_MS = 5000

export function lifecycleEvent(payload: DingTalkChatStreamCallbackPayload) {
	const event = payload.event
	if (payload.kind !== 'stream' || !event || typeof event !== 'object' || !('data' in event)) return null
	const value = event.data
	if (
		!value ||
		typeof value !== 'object' ||
		!('type' in value) ||
		value.type !== 'event' ||
		!('event' in value) ||
		typeof value.event !== 'string' ||
		!('data' in value)
	)
		return null
	return { name: value.event, data: value.data }
}

export function isTerminalCallback(payload: DingTalkChatStreamCallbackPayload): boolean {
	return (
		payload.kind === 'complete' || payload.kind === 'error' || lifecycleEvent(payload)?.name === 'on_conversation_end'
	)
}

/** Use only the explicit final-message contract, never a concatenation of incomplete deltas. */
export function finalMessageSnapshot(payload: DingTalkChatStreamCallbackPayload): DingTalkChatRunState['finalMessage'] {
	const event = lifecycleEvent(payload)
	const data = event?.data
	if (
		event?.name !== 'on_message_end' ||
		!data ||
		typeof data !== 'object' ||
		!('content' in data) ||
		!('status' in data) ||
		typeof data.status !== 'string'
	)
		return undefined
	let text: string
	if (typeof data.content === 'string') text = data.content
	else if (Array.isArray(data.content)) {
		const parts: string[] = []
		for (const block of data.content) {
			if (
				block &&
				typeof block === 'object' &&
				'type' in block &&
				block.type === 'text' &&
				'text' in block &&
				typeof block.text === 'string'
			)
				parts.push(block.text)
			else return undefined
		}
		text = parts.join('')
	} else return undefined
	return {
		sequence: payload.sequence,
		text,
		status: data.status,
		error: 'error' in data && typeof data.error === 'string' ? data.error : undefined
	}
}

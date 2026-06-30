import { ChatDingTalkMessage } from '../../message.js'
import type { DingTalkInboundFile } from '../../types.js'

export type DispatchDingTalkChatPayload = {
	xpertId: string
	input?: string
	files?: DingTalkInboundFile[]
	dingtalkMessage: ChatDingTalkMessage
	conversationId?: string
	conversationUserKey?: string
	options?: {
		confirm?: boolean
		reject?: boolean
	}
}

export class DispatchDingTalkChatCommand {
	constructor(public readonly input: DispatchDingTalkChatPayload) {}
}

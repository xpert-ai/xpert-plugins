import { ChatDingTalkMessage } from '../../message.js'

export type DispatchDingTalkChatPayload = {
	xpertId: string
	input?: string
	dingtalkMessage: ChatDingTalkMessage
	options?: {
		confirm?: boolean
		reject?: boolean
	}
}

export class DispatchDingTalkChatCommand {
	constructor(public readonly input: DispatchDingTalkChatPayload) {}
}

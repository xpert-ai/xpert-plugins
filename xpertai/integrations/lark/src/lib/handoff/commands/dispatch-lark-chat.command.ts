import { LarkGroupWindow } from '../../types.js'
import { ChatLarkMessage } from '../../message.js'

export type DispatchLarkChatPayload = {
	xpertId: string
	input?: string
	larkMessage: ChatLarkMessage
	options?: {
		confirm?: boolean
		reject?: boolean
		fromEndUserId?: string
		executorUserId?: string
		streamingEnabled?: boolean
		groupWindow?: LarkGroupWindow
	}
}

export class DispatchLarkChatCommand {
	constructor(public readonly input: DispatchLarkChatPayload) {}
}

import { ChatLarkMessage } from '../../message.js'

export type DispatchLarkChatPayload = {
	xpertId: string
	input?: string
	larkMessage: ChatLarkMessage
	options?: {
		confirm?: boolean
		reject?: boolean
	}
}

export class DispatchLarkChatCommand {
	constructor(public readonly input: DispatchLarkChatPayload) {}
}

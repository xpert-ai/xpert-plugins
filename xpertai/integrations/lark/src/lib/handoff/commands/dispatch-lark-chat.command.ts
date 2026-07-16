import { LarkGroupWindow, LarkInboundFile } from '../../types.js'
import { ChatLarkMessage } from '../../message.js'

export type DispatchLarkChatPayload = {
	xpertId: string
	executionContext?: {
		tenantId?: string
		organizationId?: string
		createdById?: string
	}
	input?: string
	files?: LarkInboundFile[]
	historyContext?: string
	historyFiles?: LarkInboundFile[]
	currentInboundLogIds?: string[]
	larkMessage: ChatLarkMessage
	options?: {
		confirm?: boolean
		reject?: boolean
		fromEndUserId?: string
		executorUserId?: string
		streamingEnabled?: boolean
		groupWindow?: LarkGroupWindow
		/** Internal stale-steer recovery: reuse the existing card and start a normal run. */
		forceNewRun?: boolean
	}
}

export class DispatchLarkChatCommand {
	constructor(public readonly input: DispatchLarkChatPayload) {}
}

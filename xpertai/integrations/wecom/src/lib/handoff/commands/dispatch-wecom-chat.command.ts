import { ChatWeComMessage } from '../../message.js'
import type { WeComInboundFile } from '../../types.js'

export type DispatchWeComChatPayload = {
  xpertId: string
  input?: string
  files?: WeComInboundFile[]
  wecomMessage: ChatWeComMessage
  conversationId?: string
  conversationUserKey?: string
  tenantId: string
  organizationId?: string
  executorUserId?: string
  endUserId?: string
}

export class DispatchWeComChatCommand {
  constructor(public readonly input: DispatchWeComChatPayload) {}
}

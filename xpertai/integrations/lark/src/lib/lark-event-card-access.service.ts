import { Injectable } from '@nestjs/common'
import type { AgentEventContext } from '@xpert-ai/plugin-sdk'
import { LarkConversationService } from './conversation.service.js'
import { card } from './lark-event-ingress.js'
import { LarkInboundIdentityService } from './lark-inbound-identity.service.js'

/** Trusted binding whose owner is permitted to act on the original Feishu card. */
type CardScope = Pick<AgentEventContext, 'sourceBindingRef' | 'tenantId' | 'organizationId' | 'xpertId' | 'userId'>

/** Actual destination of a queued Handoff. The captured card must still be active there. */
export interface LarkEventCardTarget {
  chatId: string
  scopeKey: string
  /** Feishu ID returned by this dispatch when it posted its own response card. */
  responseCardId?: string
}

@Injectable()
export class LarkEventCardAccess {
  constructor(
    private readonly identity: LarkInboundIdentityService,
    private readonly conversation: LarkConversationService
  ) {}

  async resolve(scope: CardScope, snapshot: unknown, target?: LarkEventCardTarget) {
    const action = card.safeParse(snapshot)
    if (!action.success || !action.data.operator.union_id) return null
    const { open_chat_id, open_message_id } = action.data.context
    if (target && open_chat_id !== target.chatId) return null

    const integration = await this.identity.findIntegration(scope.sourceBindingRef)
    if (!integration || integration.tenantId !== scope.tenantId || integration.organizationId !== scope.organizationId)
      return null
    const actor = await this.identity.readCurrentCardActor(integration, action.data.operator.union_id)
    if (!actor || actor.id !== scope.userId) return null

    const binding = await this.conversation.getLatestConversationBindingByChatId(integration.id, open_chat_id)
    if (
      !binding?.scopeKey ||
      binding.organizationId !== scope.organizationId ||
      binding.xpertId !== scope.xpertId ||
      (target && binding.scopeKey !== target.scopeKey)
    )
      return null
    const active = await this.conversation.getActiveMessage(binding.scopeKey, scope.xpertId)
    const activeId = active?.thirdPartyMessage?.id
    if (!activeId || (activeId !== open_message_id && activeId !== target?.responseCardId)) return null
    return { integration, actor, binding, chatId: open_chat_id }
  }
}

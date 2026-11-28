import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { scopeSchema, TicketError } from './contracts.js'

export function viewScope(context: XpertResolvedViewHostContext) {
  if (context.hostType !== 'agent') throw new TicketError('unavailable')
  return scopeSchema.parse({
    tenantId: context.tenantId, organizationId: context.organizationId,
    workspaceId: context.workspaceId, userId: context.userId, xpertId: context.hostId,
  })
}

export function agentScope(context: IAgentMiddlewareContext) {
  return scopeSchema.parse({
    tenantId: context.tenantId, organizationId: context.organizationId,
    workspaceId: context.workspaceId, userId: context.userId, xpertId: context.xpertId,
  })
}

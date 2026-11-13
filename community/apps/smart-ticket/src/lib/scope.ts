import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { scopeSchema, type TicketScope } from './domain/contracts.js'

export function scopeFromView(context: XpertResolvedViewHostContext): TicketScope {
  if (context.hostType !== 'agent') throw new Error('unsupported_host')
  return scopeSchema.parse({
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? '',
    workspaceId: context.workspaceId ?? '',
    userId: context.userId,
    xpertId: context.hostId
  })
}

export function scopeFromAgent(context: IAgentMiddlewareContext): TicketScope {
  return scopeSchema.parse({
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? '',
    workspaceId: context.workspaceId ?? '',
    userId: context.userId,
    xpertId: context.xpertId
  })
}

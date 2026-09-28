import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { scopeSchema, TriageError } from './domain/contracts.js'
import { FEATURE } from './constants.js'

export function scopeFromView(context: XpertResolvedViewHostContext) {
  if (context.hostType !== 'agent' || !context.capabilities?.features?.includes(FEATURE)) throw new TriageError('forbidden')
  return scopeSchema.parse({ tenantId: context.tenantId, organizationId: context.organizationId,
    workspaceId: context.workspaceId, userId: context.userId, xpertId: context.hostId })
}
export function scopeFromAgent(context: IAgentMiddlewareContext) {
  return scopeSchema.parse({ tenantId: context.tenantId, organizationId: context.organizationId,
    workspaceId: context.workspaceId, userId: context.userId, xpertId: context.xpertId })
}

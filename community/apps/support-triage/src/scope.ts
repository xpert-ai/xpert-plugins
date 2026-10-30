import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { scopeSchema } from './domain.js'

export function viewScope(context: XpertResolvedViewHostContext) {
  if (context.hostType !== 'agent') throw new Error('unsupported_host')
  return scopeSchema.parse({ tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId, xpertId: context.hostId })
}
export function agentScope(context: IAgentMiddlewareContext) {
  return scopeSchema.parse({ tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId, xpertId: context.xpertId })
}

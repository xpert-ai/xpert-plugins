import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { scopeSchema, ResearchError } from './domain/contracts.js'
export function viewScope(c: XpertResolvedViewHostContext) {
  if(c.hostType!=='agent')throw new ResearchError('unsupported_host')
  return scopeSchema.parse({tenantId:c.tenantId,organizationId:c.organizationId??'',workspaceId:c.workspaceId??'',userId:c.userId,xpertId:c.hostId})
}
export function agentScope(c: IAgentMiddlewareContext) {
  return scopeSchema.parse({tenantId:c.tenantId,organizationId:c.organizationId??'',workspaceId:c.workspaceId??'',userId:c.userId,xpertId:c.xpertId})
}

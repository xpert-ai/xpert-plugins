import { ForbiddenException } from '@nestjs/common'
import type { XpertBusinessToolContext } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { Scope } from '../contracts.js'
export interface RuntimeScope extends Scope {
  assistantId: string
  /** Trusted version family, supplied only by the Profile View Host. */
  assistantVersionIds?: string[]
  agentKey?: string
  projectId?: string
  conversationId?: string
  threadId?: string
  executionId?: string
  actorType: 'user' | 'agent'
}
export function viewScope(c: XpertResolvedViewHostContext): RuntimeScope {
  if (!c.tenantId || !c.organizationId || !c.userId || c.hostType !== 'agent')
    throw new ForbiddenException('organization_user_required')
  return {
    tenantId: c.tenantId,
    organizationId: c.organizationId,
    userId: c.userId,
    assistantId: c.hostId,
    actorType: 'user',
  }
}
export function toolScope(c: XpertBusinessToolContext): RuntimeScope {
  const userId = c.principal.userId ?? c.principal.id
  if (
    !c.organizationId ||
    !userId ||
    !c.xpertId ||
    !c.agentKey ||
    !c.executionId
  )
    throw new ForbiddenException('authenticated_assistant_execution_required')
  return {
    tenantId: c.tenantId,
    organizationId: c.organizationId,
    userId,
    assistantId: c.xpertId,
    agentKey: c.agentKey,
    projectId: c.projectId,
    conversationId: c.conversationId,
    threadId: c.threadId,
    executionId: c.executionId,
    actorType: 'agent',
  }
}
export const scopeKey = (s: Scope) => `${s.tenantId}:${s.organizationId}`
export const scoped = (s: Pick<Scope, 'tenantId' | 'organizationId'>) => ({
  tenantId: s.tenantId,
  organizationId: s.organizationId,
})

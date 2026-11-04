import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { AgentMiddlewareRuntimeScope, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import type { RunnableConfig } from '@langchain/core/runnables'
import { z } from 'zod/v3'
import { ReviewError, scopeSchema, type Scope } from './domain.js'

const hostSnapshotSchema = z.object({
  name: z.string(), title: z.string().nullish().transform(value => value ?? undefined),
  organization: z.object({ name: z.string() }).nullish(), workspace: z.object({ name: z.string() }).nullish()
})

export function viewScope(c: Pick<XpertResolvedViewHostContext, 'tenantId' | 'organizationId' | 'userId' | 'hostId' | 'hostType' | 'workspaceId' | 'runtimeScope' | 'assistant' | 'permissions' | 'hostSnapshot'>): Scope {
  if (c.hostType !== 'agent') throw new ReviewError('view_not_found')
  return {
    ...scopeSchema.parse({ tenantId: c.tenantId, organizationId: c.organizationId, userId: c.userId, assistantId: c.hostId, workspaceId: c.workspaceId }),
    assistant: c.assistant,
    permissions: c.permissions,
    hostSnapshot: c.hostSnapshot ? hostSnapshotSchema.parse(c.hostSnapshot) : undefined,
    runtime: { viewHost: { type: 'agent', id: c.hostId }, projectId: c.runtimeScope?.projectId }
  }
}

const executionSchema = z.object({
  conversationId: z.string().min(1).nullish(), conversation_id: z.string().min(1).nullish(),
  executionId: z.string().min(1).nullish()
})

export function middlewareScope(c: Pick<IAgentMiddlewareContext, 'tenantId' | 'organizationId' | 'userId' | 'xpertId' | 'workspaceId' | 'conversationId' | 'executionId' | 'projectId'>, config?: RunnableConfig): Scope {
  // Middleware is constructed before the task's execution is assigned. Read the
  // host-provided tool invocation config, never the model's tool arguments.
  const execution = executionSchema.parse(config?.configurable ?? {})
  return {
    ...scopeSchema.parse({ tenantId: c.tenantId, organizationId: c.organizationId, userId: c.userId, assistantId: c.xpertId, workspaceId: c.workspaceId }),
    runtime: { conversationId: execution.conversationId ?? execution.conversation_id ?? c.conversationId,
      executionId: execution.executionId ?? c.executionId, projectId: c.projectId }
  }
}

export function reviewRuntimeScope(s: Scope): AgentMiddlewareRuntimeScope {
  return { tenantId: s.tenantId, organizationId: s.organizationId, userId: s.userId,
    xpertId: s.assistantId, workspaceId: s.workspaceId, ...s.runtime, connectorProviders: ['github'] }
}

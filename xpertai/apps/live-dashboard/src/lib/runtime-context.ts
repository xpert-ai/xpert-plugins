import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { RequestContext, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

export function dashboardRuntimeContext(context: IAgentMiddlewareContext): XpertResolvedViewHostContext {
  if (!context.xpertId) throw new Error('DASHBOARD_ASSISTANT_REQUIRED')
  return { tenantId: context.tenantId ?? RequestContext.currentTenantId(),
    organizationId: context.organizationId ?? RequestContext.getOrganizationId(), userId: context.userId ?? RequestContext.currentUserId(),
    hostType: 'agent', hostId: context.xpertId, slots: [],
    ...(context.projectId ? { runtimeScope: { projectId: context.projectId, conversationId: context.conversationId ?? null,
      dataScopeKey: `project:${context.projectId}`, workspaceFiles: { catalog: 'projects', scopeId: context.projectId, projectId: context.projectId } } } : {}) }
}

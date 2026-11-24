import { ToolMessage } from '@langchain/core/messages'
import type { DynamicStructuredTool, ToolRunnableConfig } from '@langchain/core/tools'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { RequestContext, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

export function dashboardRuntimeContext(context: IAgentMiddlewareContext): XpertResolvedViewHostContext {
  if (!context.xpertId) throw new Error('DASHBOARD_ASSISTANT_REQUIRED')
  return { tenantId: context.tenantId ?? RequestContext.currentTenantId(),
    organizationId: context.organizationId ?? RequestContext.getOrganizationId(), userId: context.userId ?? RequestContext.currentUserId(),
    hostType: 'agent', hostId: context.xpertId, slots: [],
    ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
    ...(context.projectId ? { runtimeScope: { projectId: context.projectId, conversationId: context.conversationId ?? null,
      dataScopeKey: `project:${context.projectId}`, workspaceFiles: { catalog: 'projects', scopeId: context.projectId, projectId: context.projectId } } } : {}) }
}

const missingProject = JSON.stringify({
  code: 'PROJECT_REQUIRED',
  message: 'Dashboard operations need a Project. Ask the user to select or create one, then retry this operation.'
})

export function dashboardProjectTools(projectId: string | undefined, operations: DynamicStructuredTool[]): DynamicStructuredTool[] {
  for (const operation of operations) {
    const execute = operation.func
    // A refused call is visible to the model. It performs no workspace operation to attach to chat history.
    if (!projectId) operation.metadata = { ...operation.metadata, internal: true }
    operation.func = async (input, callbacks, config?: ToolRunnableConfig) => {
      if (projectId) return execute(input, callbacks, config)
      const id = config?.toolCall?.id
      return id ? new ToolMessage({ name: operation.name, tool_call_id: id, status: 'error', content: missingProject }) : missingProject
    }
  }
  return operations
}

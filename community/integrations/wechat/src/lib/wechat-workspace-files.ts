import {
  type AgentMiddlewareRuntimeScope,
  type AgentMiddlewareRuntimeServiceApi,
  type PluginContext,
  WorkspaceFilesRuntimeCapability,
  XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN
} from '@xpert-ai/plugin-sdk'

/** Resolve per operation: workspace capabilities must never cross data owners. */
export function resolveWechatWorkspaceFiles(context: PluginContext, scope: AgentMiddlewareRuntimeScope) {
  if (!scope.projectId && !scope.xpertId) {
    throw new Error('platform.workspace.files requires an Xpert or Project scope')
  }
  const runtime = context.resolve<AgentMiddlewareRuntimeServiceApi>(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
  const files = runtime?.createScopedApi(scope).capabilities?.get(WorkspaceFilesRuntimeCapability)
  if (!files) {
    throw new Error('platform.workspace.files capability is not available')
  }
  return files
}

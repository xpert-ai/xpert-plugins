import { SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { AgentMiddlewareStrategy, AnalyticsRuntimeCapability, AnalyticsDefinitionAuthoringCapability, RequestContext, WorkspaceFilesRuntimeCapability,
  analyticsBindingSchema, jsonEncodedSchema, type AgentMiddleware, type IAgentMiddlewareContext, type IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { ScriptDefinitions } from './definitions'
import { registrationSchema, PROVIDER, PUBLISHED_PROVIDER } from './schema'

const registrationObject = registrationSchema.innerType()
const registerToolSchema = registrationSchema.innerType().omit({ sources: true }).extend({
  files: jsonEncodedSchema(registrationObject.shape.files), parameters: jsonEncodedSchema(registrationObject.shape.parameters), output: jsonEncodedSchema(registrationObject.shape.output),
  sources: jsonEncodedSchema(z.array(z.object({ alias: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/), bindingJson: z.string().min(2).max(64000) }).strict()).max(4).default([]))
}).strict()

export const SCRIPT_GUIDANCE = `For Python/JavaScript data preparation, read the workspace-script-dataset skill with read_skill_file. Inspect real files using sandbox_read_file, create scripts with sandbox_write_file({file_path,content}) and edit using sandbox_edit_file/multi_edit_file. Then register with workspace_dataset_register and preview its returned canonical bindingJson through dashboard_discover and dashboard_preview_binding. A script file alone is not a registered Dataset or saved dashboard. Use live-dashboard skills/tools for the final dashboard. Private scripts cannot be shared directly. On an explicit publication request, use workspace_dataset_prepare_publication and the published provider; the human owner must review code/files and publish organization visibility in Analytics settings. Never invent business data; preserve the user's requested execution language and use the script provider as the final Binding.`

@AgentMiddlewareStrategy('WorkspaceScriptDataset')
export class WorkspaceScriptMiddleware implements IAgentMiddlewareStrategy {
  readonly meta: TAgentMiddlewareMeta = { name: 'WorkspaceScriptDataset', label: { en_US: 'Workspace script datasets', zh_Hans: 'Workspace 脚本数据集' },
    description: { en_US: 'Author Python/JavaScript datasets in the authorized file workspace.', zh_Hans: '在授权文件工作区编写和保存 Python/JavaScript 数据处理脚本。' },
    icon: { type: 'font', value: 'ri-code-box-line' }, configSchema: { type: 'object', properties: {} } }
  constructor(private readonly definitions: ScriptDefinitions) {}
  createMiddleware(_options: object, context: IAgentMiddlewareContext): AgentMiddleware {
    const candidate = { tenantId: context.tenantId ?? RequestContext.currentTenantId(), organizationId: context.organizationId ?? RequestContext.getOrganizationId(),
      userId: context.userId ?? RequestContext.currentUserId() }
    if (!candidate.tenantId || !candidate.organizationId || !candidate.userId || !context.xpertId) throw new Error('WORKSPACE_SCRIPT_CONTEXT_REQUIRED')
    const actor = { tenantId: candidate.tenantId, organizationId: candidate.organizationId, userId: candidate.userId }
    const capabilities = context.runtime.capabilities
    if (!capabilities) throw new Error('WORKSPACE_SCRIPT_RUNTIME_REQUIRED')
    const files = capabilities.require(WorkspaceFilesRuntimeCapability)
    return { name: 'WorkspaceScriptDataset', wrapModelCall: (request, handler) => handler({ ...request,
      systemMessage: new SystemMessage({ content: [...(typeof request.systemMessage?.content === 'string' ? [{ type: 'text' as const, text: request.systemMessage.content }] : request.systemMessage?.content ?? []), { type: 'text', text: SCRIPT_GUIDANCE }] }) }),
      tools: [
        tool(async input => {
          if (!context.workspaceId || !context.xpertId) throw new Error('WORKSPACE_SCRIPT_CONTEXT_REQUIRED')
          const receipt = await capabilities.require(AnalyticsDefinitionAuthoringCapability).register({ actor,
            workspaceId: context.workspaceId, xpertId: context.xpertId, files }, { providerId: PUBLISHED_PROVIDER,
            connectionKey: 'workspace', requestId: input.requestId, name: input.name,
            definition: { artifactId: input.artifactId, versionId: input.versionId, includeCodeAndFiles: input.includeCodeAndFiles } })
          return JSON.stringify({ ...receipt, next: 'Prepared privately. Ask the owner to review code/files and publish Organization visibility in Settings → Analytics. Discover and preview this exact source with workspace_script.published_query, then update the existing dashboard binding. Do not share the original private script or impersonate its owner.' })
        }, { name: 'workspace_dataset_prepare_publication', description: 'On explicit request, prepare a pinned private script as an immutable reusable dataset, including declared code/file snapshots. Stays private until the human owner publishes visibility in Analytics settings. Upstream sources must themselves support sharing; their current viewer ACLs still apply.',
          schema: z.object({ artifactId: z.string().uuid(), versionId: z.string().uuid(), requestId: z.string().min(1).max(128),
            name: z.string().min(1).max(160), includeCodeAndFiles: z.literal(true) }).strict(),
          metadata: { toolName: { en_US: 'Prepare reusable script dataset', zh_Hans: '准备可复用脚本数据集' } } }),
        tool(async (args: z.infer<typeof registerToolSchema>) => {
          const definition = args
          const input = registrationSchema.parse({ ...definition, sources: definition.sources.map(source => {
            try { return { alias: source.alias, binding: analyticsBindingSchema.parse(JSON.parse(source.bindingJson)) } }
            catch (error) { throw new Error(`WORKSPACE_SCRIPT_SOURCE_BINDING_INVALID: bindingJson must encode exactly one full AnalyticsBinding object, including each parameter controlId. Remove trailing text/extra braces. ${error instanceof Error ? error.message.slice(0, 500) : ''}`) }
          }) })
          // Validate each native binding before creating a definition or starting a container.
          // Errors retain the owning provider's safe, actionable diagnostics.
          for (const source of input.sources) {
            const controls = Object.fromEntries(source.binding.parameters.map(parameter => [parameter.controlId, parameter.defaultValue ?? null]))
            try { await capabilities.require(AnalyticsRuntimeCapability).query(actor, { binding: source.binding, controls }) }
            catch (error) { throw new Error(`WORKSPACE_SCRIPT_SOURCE_PREFLIGHT_FAILED (${source.alias}): fix this source binding using its discovery contract; the script has not run. ${error instanceof Error ? error.message : 'Source query failed'}`) }
          }
          const saved = await this.definitions.register(actor, files, input)
          return JSON.stringify({ scriptDefinition: { artifactId: saved.artifactId, versionId: saved.versionId },
            bindingJson: JSON.stringify(this.definitions.binding(saved.artifactId, saved.versionId, saved.definition)),
            source: { kind: 'artifact', artifactId: saved.artifactId, versionId: saved.versionId },
            discoveryRequest: { source: { kind: 'artifact', artifactId: saved.artifactId, versionId: saved.versionId }, providerId: PROVIDER, requestJson: '{}' } })
        }, { name: 'workspace_dataset_register', description: 'Save a versioned script definition from an existing Workspace code file, declared aliases, parameters and output contract. Returns binding and discoveryRequest for dashboard_discover/preview/create.',
          schema: registerToolSchema, verboseParsingErrors: true, metadata: { toolName: { en_US: 'Register script dataset', zh_Hans: '注册脚本数据集' } } })
      ] }
  }
}

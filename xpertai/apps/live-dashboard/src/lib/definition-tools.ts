import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { AnalyticsDefinitionAuthoringCapability, WorkspaceFilesRuntimeCapability, analyticsOptionsSchema,
  type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

const selection = z.object({ providerId: z.string().min(1).max(160), connectionKey: z.string().min(1).max(400) }).strict()
export const DEFINITION_GUIDANCE = 'If dashboard_list_sources lacks the requested source, call analytics_definition_connections, then analytics_definition_inspect with an exact returned selection and inputJson="{}". Follow its instructions, inspect real source data and generate the business definition yourself. Never ask users to fill internal IDs/configuration. Register using analytics_definition_register and a stable requestId, refresh dashboard_list_sources, discover the returned source and preview before saving. Settings → Analytics is for viewing, correction and version management. Do not create redundant definitions for already governed sources.'
export function createDefinitionTools(context: IAgentMiddlewareContext, registered: () => void) {
  const api = () => {
    if (!context.workspaceId || !context.xpertId || !context.organizationId || !context.runtime?.capabilities) throw new Error('ANALYTICS_ASSISTANT_SCOPE_REQUIRED')
    return { runtime: context.runtime.capabilities.require(AnalyticsDefinitionAuthoringCapability), scope: {
      actor: { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId },
      workspaceId: context.workspaceId, xpertId: context.xpertId,
      files: context.runtime.capabilities.require(WorkspaceFilesRuntimeCapability)
    } }
  }
  return [
    tool(async () => { const { runtime, scope } = api(); return JSON.stringify(await runtime.catalog(scope)) }, {
      name: 'analytics_definition_connections', description: 'List authorized connections for generating a missing analytics source. Returns exact providerId/connectionKey selections; no credentials.',
      schema: z.object({}).strict(), metadata: { toolName: { en_US: 'Find analytics inputs', zh_Hans: '发现分析输入' } }
    }),
    tool(async ({ inputJson, ...selection }) => {
      const { runtime, scope } = api()
      return JSON.stringify(await runtime.inspect(scope, selection, analyticsOptionsSchema.parse(JSON.parse(inputJson))))
    }, { name: 'analytics_definition_inspect', description: 'Inspect approved input metadata and provider authoring schemas. Start inputJson="{}". Follow inspectSchema for operation samples/file inspection. Input cannot override host scope.',
      schema: selection.extend({ inputJson: z.string().min(2).max(100000) }).strict(), verboseParsingErrors: true,
      metadata: { toolName: { en_US: 'Inspect analytics input', zh_Hans: '检查分析输入' } }
    }),
    tool(async ({ definitionJson, ...input }) => {
      const { runtime, scope } = api()
      const receipt = await runtime.register(scope, { ...input, definition: analyticsOptionsSchema.parse(JSON.parse(definitionJson)) })
      registered()
      return JSON.stringify(receipt)
    }, { name: 'analytics_definition_register', description: 'Register an Agent-generated definition matching definitionSchema. System supplies identities and validates real input. Keep requestId stable on retries; changed intent needs another key. Returns an immutable source and discoveryRequest. Refresh sources, discover and preview it before saving a dashboard.',
      schema: selection.extend({ requestId: z.string().min(1).max(128), name: z.string().min(1).max(200), definitionJson: z.string().min(2).max(100000) }).strict(), verboseParsingErrors: true,
      metadata: { toolName: { en_US: 'Register analytics definition', zh_Hans: '生成分析定义' } }
    })
  ]
}

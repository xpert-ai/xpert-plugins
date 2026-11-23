import { exampleIdSchema, EXAMPLE_SOURCE_GUIDANCE, registerExampleSource } from './bundled-example-source'
import type { AnalyticsBinding } from '@xpert-ai/contracts'
import type { AnalyticsDefinitionReceipt } from '@xpert-ai/plugin-sdk'
import { tool, type DynamicStructuredTool } from '@langchain/core/tools'
import { toJsonSchema } from '@langchain/core/utils/json_schema'
import { z } from 'zod/v3'
import { AnalyticsDefinitionAuthoringCapability, WorkspaceFilesRuntimeCapability, analyticsOptionsSchema,
  type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

const selection = z.object({ providerId: z.string().min(1).max(160), connectionKey: z.string().min(1).max(400) }).strict()
export const DEFINITION_GUIDANCE = 'If dashboard_list_sources lacks the requested source, call analytics_definition_connections, then analytics_definition_inspect with an exact returned selection and inputJson="{}". Follow its instructions, inspect real source data and generate the business definition yourself. Never ask users to fill internal IDs/configuration. For a custom definition, register the inspected providerId, connectionKey, name, definitionJson and a stable requestId. For a bundled sample, register with only its exampleId. Refresh sources and preview before saving. Settings → Analytics is for viewing, correction and version management. Do not create redundant definitions for already governed sources.'
const authoredSourceSchema = selection.extend({
  requestId: z.string().min(1).max(128).describe('Idempotency key for a custom definition.'), name: z.string().min(1).max(200), definitionJson: z.string().min(2).max(100000)
}).strict()
const sampleSchema = z.object({ exampleId: exampleIdSchema }).strict().describe('Packaged sample. Supply only exampleId; the server derives its idempotency key.')
const registrationInput = z.union([sampleSchema, authoredSourceSchema])
// Keep an object root for model providers and expose the same exclusive input shapes the server validates.
const registrationSchema = { ...toJsonSchema(registrationInput), type: 'object' as const }
export function createDefinitionTools(context: IAgentMiddlewareContext, registered: () => void,
  selectExample?: (id: z.infer<typeof exampleIdSchema>, receipt?: AnalyticsDefinitionReceipt) => Promise<{ binding: AnalyticsBinding, preparedQuery?: { description: string, previewRequest: { exampleQuery: string } } } | undefined> | void): DynamicStructuredTool[] {
  const api = () => {
    if (!context.workspaceId || !context.xpertId || !context.organizationId || !context.runtime?.capabilities) throw new Error('ANALYTICS_ASSISTANT_SCOPE_REQUIRED')
    const files = context.runtime.capabilities.require(WorkspaceFilesRuntimeCapability)
    return { files, runtime: context.runtime.capabilities.require(AnalyticsDefinitionAuthoringCapability), scope: {
      actor: { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId },
      workspaceId: context.workspaceId, xpertId: context.xpertId,
      files
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
    tool(async (input) => {
      const args = registrationInput.parse(input)
      const { runtime, scope, files } = api()
      if ('exampleId' in args) {
        const { exampleId } = args
        await selectExample?.(exampleId)
        const receipt = await registerExampleSource(exampleId, context.projectId, runtime, scope, files)
        registered()
        const discovery = await selectExample?.(exampleId, receipt)
        return JSON.stringify({ ...receipt, exampleId, ...discovery })
      }
      const { definitionJson, ...selection } = args
      const receipt = await runtime.register(scope, { ...selection, definition: analyticsOptionsSchema.parse(JSON.parse(definitionJson)) })
      registered()
      return JSON.stringify(receipt)
    }, { name: 'analytics_definition_register', description: EXAMPLE_SOURCE_GUIDANCE + ' For a custom, Agent-authored definition use the separate providerId/connectionKey/requestId/name/definitionJson form. Only that form takes requestId. Returns an immutable source and discoveryRequest. Refresh sources, discover and preview it before saving a dashboard.',
      schema: registrationSchema, verboseParsingErrors: true,
      metadata: { toolName: { en_US: 'Register analytics definition', zh_Hans: '生成分析定义' } }
    })
  ]
}

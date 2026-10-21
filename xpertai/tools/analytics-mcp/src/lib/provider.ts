import { createAuthoring } from './authoring'
import { Inject } from '@nestjs/common'
import type { AnalyticsBinding, AnalyticsDiscoveryResult, AnalyticsProviderDescriptor, AnalyticsValue, JSONValue } from '@xpert-ai/contracts'
import { AnalyticsProvider, McpClientRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AnalyticsQueryProvider, type AnalyticsProviderContext, type AnalyticsProviderResult, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { bindArguments, discoverySchema, jsonSchema, optionsSchema, payloadSchema } from './schema'
import { projectResult } from './result'

const queryContract: AnalyticsDiscoveryResult['queryContract'] = {
  operation: 'query', contractVersion: 1, payloadSchema: jsonSchema(payloadSchema),
  instructions: 'Inspect a configured dataset. Copy datasetId, revision and toolContractHash from discovery. Follow the live MCP inputSchema and the authored metric/field descriptions; do not infer business semantics from tool names. arguments must be an object conforming to the MCP schema. parameterPaths maps every Binding parameter name to a unique existing scalar path RELATIVE TO arguments, including array indices as strings. Example: arguments:{limit:7}, parameterPaths:{limit:["limit"]}; do NOT prepend "arguments" to the path. Keep each target field present with its literal default in arguments; do not omit it just because it is bound to a control. Null handling belongs to the MCP input schema; never splice controls into query text. Output sourceField uses columns.key, not a JSON path. decimal/int64 remain exact strings. Only the approved tool and configured result mapping are available. URLs, credentials, tool names, connections and mappings cannot be overridden. Preview and inspect completeness before saving; page/truncated results are not complete totals. Use dashboard Binding query/filter/refresh, never direct browser MCP calls.'
}

@AnalyticsProvider('mcp.tool')
export class McpAnalyticsProvider implements AnalyticsQueryProvider {
  readonly descriptor: AnalyticsProviderDescriptor = {
    id: 'mcp.tool', name: 'MCP Tools', sourceKinds: ['definition'],
    operations: [{ name: 'query', contractVersion: 1, readOnly: true }]
  }
  readonly authoring = createAuthoring(() => this.runtime.require(McpClientRuntimeCapability))
  readonly configuration = { kind: 'definition' as const, connection: 'mcp-toolset' as const, schema: jsonSchema(optionsSchema) }
  validateConfiguration(options: Record<string, JSONValue>) { return optionsSchema.parse(options) }
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}

  private connection(context: AnalyticsProviderContext) {
    context.signal.throwIfAborted()
    if (context.deadlineAt <= Date.now()) throw new Error('MCP_DATASET_DEADLINE_EXCEEDED')
    const options = optionsSchema.parse(context.options)
    const scope = { actor: context.actor, workspaceId: options.workspaceId, toolsetId: options.toolsetId,
      serverName: options.serverName, signal: context.signal, deadlineAt: context.deadlineAt }
    if (!this.runtime.has(McpClientRuntimeCapability))
      throw new Error('MCP_DATASET_HOST_UPDATE_REQUIRED')
    return { options, scope, api: this.runtime.require(McpClientRuntimeCapability) }
  }

  async discover(request: JSONValue, context: AnalyticsProviderContext): Promise<AnalyticsDiscoveryResult> {
    const input = discoverySchema.parse(request), { options, scope, api } = this.connection(context)
    const tools = await api.tools.list(scope)
    context.signal.throwIfAborted()
    const available = options.datasets.flatMap((dataset) => {
      const tool = tools.find((item) => item.name === dataset.toolName)
      return tool && (!input.datasetId || input.datasetId === dataset.id) ? [{ dataset, tool }] : []
    })
    if (input.datasetId && !available.length) throw new Error('MCP_DATASET_UNAVAILABLE')
    const start = (input.page - 1) * 20
    return {
       queryContract,
      items: available.slice(start, start + 20).map(({ dataset, tool }) => ({
        id: dataset.id, name: dataset.name, kind: 'dataset', description: dataset.description,
        inspectRequest: { datasetId: dataset.id },
        metadata: !input.datasetId ? { revision: dataset.revision } : { datasetId: dataset.id, revision: dataset.revision, toolContractHash: tool.contractHash,
          inputSchema: tool.inputSchema, ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
          ...(tool.description ? { toolDescription: tool.description } : {}),
          columns: dataset.result.columns.map(({ path, ...column }) => column), resultScope: dataset.result.scope,
          bindingPayload: { datasetId: dataset.id, revision: dataset.revision, toolContractHash: tool.contractHash, arguments: dataset.defaultArguments, parameterPaths: {} }
        }
      })),
      ...(start + 20 < available.length ? { nextRequest: { page: input.page + 1 } } : {})
    }
  }

  async execute(binding: AnalyticsBinding, parameters: Record<string, AnalyticsValue>, context: AnalyticsProviderContext): Promise<AnalyticsProviderResult> {
    const payload = payloadSchema.parse(binding.payload), { options, scope, api } = this.connection(context)
    const dataset = options.datasets.find((item) => item.id === payload.datasetId)
    if (!dataset) throw new Error('MCP_DATASET_UNAVAILABLE')
    if (dataset.revision !== payload.revision) throw new Error('MCP_DATASET_REVISION_CHANGED')
    const result = await api.tools.call(scope, { toolName: dataset.toolName, contractHash: payload.toolContractHash,
      arguments: bindArguments(payload, parameters) })
    context.signal.throwIfAborted()
    return { ...projectResult(result, dataset, context.maxRows), sourceVersion: `${dataset.revision}:${payload.toolContractHash}` }
  }
}

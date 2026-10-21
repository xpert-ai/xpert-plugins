import { Inject } from '@nestjs/common'
import type { AnalyticsBinding, AnalyticsDiscoveryResult, AnalyticsProviderDescriptor, AnalyticsValue, JSONValue } from '@xpert-ai/contracts'
import { AnalyticsProvider, RestClientRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AnalyticsQueryProvider, type AnalyticsProviderContext, type AnalyticsProviderResult, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { bindArguments, discoverySchema, jsonSchema, optionsSchema, payloadSchema } from './schema'
import { bindingInputSchema, checkPaginationArguments, paginationDefaults, queryPages } from './pagination'

const queryContract: AnalyticsDiscoveryResult['queryContract'] = {
  operation: 'query', contractVersion: 1, payloadSchema: jsonSchema(payloadSchema),
  instructions: 'Inspect an approved dataset and copy its bindingPayload, datasetId, revision and operationContractHash. Follow inputSchema and authored business/column descriptions. arguments is grouped by query/path/body (for example {query:{region:""}}); copy default arguments then set required business fields. parameterPaths maps every Binding parameter to a unique existing scalar path RELATIVE TO arguments, for example {region:["query","region"]}. Keep that field present with its literal default. Use only schema-approved values; null is not an automatic all-values marker. Pagination is server-owned: preserve its advertised defaults and never bind pagination fields to controls. Output sourceField is columns.key, not a JSON selector. decimal/int64 remain exact strings. Only the approved operation and catalog result mapping are available; URLs, methods, credentials, connections and mappings cannot be overridden. Preview before saving, inspect completeness, and never describe page/truncated results as complete totals. Dashboard filters and refresh use Binding queries, never browser fetch.'
}

@AnalyticsProvider('rest.json')
export class RestAnalyticsProvider implements AnalyticsQueryProvider {
  readonly descriptor: AnalyticsProviderDescriptor = {
    id: 'rest.json', name: 'REST/JSON', dataSourceTypes: ['rest-json'],
    operations: [{ name: 'query', contractVersion: 1, readOnly: true }],
    connectionType: { type: 'rest-json', name: 'REST/JSON', configuration: jsonSchema(optionsSchema) }
  }
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}

  private connection(context: AnalyticsProviderContext) {
    context.signal.throwIfAborted()
    if (context.deadlineAt <= Date.now()) throw new Error('REST_DATASET_DEADLINE_EXCEEDED')
    const options = optionsSchema.parse(context.options)
    const scope = { actor: context.actor, workspaceId: options.workspaceId, toolsetId: options.toolsetId,
      signal: context.signal, deadlineAt: context.deadlineAt }
    if (!RestClientRuntimeCapability || !this.runtime.has(RestClientRuntimeCapability))
      throw new Error('REST_DATASET_HOST_UPDATE_REQUIRED')
    return { options, scope, api: this.runtime.require(RestClientRuntimeCapability) }
  }

  async discover(request: JSONValue, context: AnalyticsProviderContext): Promise<AnalyticsDiscoveryResult> {
    const input = discoverySchema.parse(request), { options, scope, api } = this.connection(context)
    const operations = await api.operations.list(scope)
    context.signal.throwIfAborted()
    const available = options.datasets.flatMap((dataset) => {
      const operation = operations.find((item) => item.operationId === dataset.operationId)
      return operation && (!input.datasetId || input.datasetId === dataset.id) ? [{ dataset, operation }] : []
    })
    if (input.datasetId && !available.length) throw new Error('REST_DATASET_UNAVAILABLE')
    const start = (input.page - 1) * 20
    return {
      schemaVersion: 1, queryContract,
      items: available.slice(start, start + 20).map(({ dataset, operation }) => ({
        id: dataset.id, name: dataset.name, kind: 'dataset', description: dataset.description,
        inspectRequest: { datasetId: dataset.id },
        metadata: !input.datasetId ? { revision: dataset.revision } : { datasetId: dataset.id, revision: dataset.revision, operationContractHash: operation.contractHash,
          inputSchema: bindingInputSchema(operation.inputSchema, dataset), method: operation.method,
          ...(operation.description ? { operationDescription: operation.description } : {}),
          columns: dataset.result.columns.map(({ path, ...column }) => column), resultScope: dataset.result.scope,
          bindingPayload: { datasetId: dataset.id, revision: dataset.revision, operationContractHash: operation.contractHash, arguments: paginationDefaults(dataset), parameterPaths: {} }
        }
      })),
      ...(start + 20 < available.length ? { nextRequest: { page: input.page + 1 } } : {})
    }
  }

  async execute(binding: AnalyticsBinding, parameters: Record<string, AnalyticsValue>, context: AnalyticsProviderContext): Promise<AnalyticsProviderResult> {
    const payload = payloadSchema.parse(binding.payload), { options, scope, api } = this.connection(context)
    const dataset = options.datasets.find((item) => item.id === payload.datasetId)
    if (!dataset) throw new Error('REST_DATASET_UNAVAILABLE')
    if (dataset.revision !== payload.revision) throw new Error('REST_DATASET_REVISION_CHANGED')
    checkPaginationArguments(dataset, payload)
    const result = await queryPages(api, scope, dataset, payload, bindArguments(payload, parameters), context.maxRows)
    context.signal.throwIfAborted()
    return { ...result, sourceVersion: `${dataset.revision}:${payload.operationContractHash}` }
  }
}

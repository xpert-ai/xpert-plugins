import { z } from 'zod/v3'
import { analyticsOptionsSchema, type AnalyticsDefinitionAuthoring, type AnalyticsAuthoringContext, type RestClientRuntimeApi } from '@xpert-ai/plugin-sdk'
import { datasetSchema, jsonSchema, optionsSchema, payloadSchema } from './schema'
import { paginationDefaults, queryPages } from './pagination'

const inspectSchema = z.object({ operationId: z.string().min(1).optional(), arguments: analyticsOptionsSchema.optional() }).strict()
const definitionSchema = datasetSchema.innerType().omit({ id: true, revision: true, readOnly: true })
export function createAuthoring(api: () => RestClientRuntimeApi): AnalyticsDefinitionAuthoring {
  const scope = (context: AnalyticsAuthoringContext) => {
    if (context.connection.kind !== 'rest-toolset') throw new Error('ANALYTICS_CONNECTION_INVALID')
    return { toolsetId: context.connection.toolsetId, actor: context.actor, workspaceId: context.workspaceId, signal: context.signal, deadlineAt: context.deadlineAt }
  }
  return {
    inspectSchema: jsonSchema(inspectSchema), definitionSchema: jsonSchema(definitionSchema),
    instructions: 'Inspect approved read-only operations; use their documented semantics and a real sample to author columns and result mapping. Pass arguments only to sample the selected operation. Never guess metric meaning or mark a page as a complete total. System supplies connection, scope, dataset identity and revision. Register then discover and preview the returned source before saving a dashboard.',
    async inspect(original, context) {
      const input = inspectSchema.parse(original), operations = await api().operations.list(scope(context))
      if (!input.operationId) return { operations: JSON.parse(JSON.stringify(operations)) }
      const operation = operations.find(operation => operation.operationId === input.operationId)
      if (!operation) throw new Error('ANALYTICS_OPERATION_UNAVAILABLE')
      if (!input.arguments) return JSON.parse(JSON.stringify(operation))
      const result = await api().operations.call(scope(context), { operationId: operation.operationId, contractHash: operation.contractHash, arguments: input.arguments })
      const sample = JSON.stringify(result)
      return { operation: JSON.parse(JSON.stringify(operation)), sampleJson: sample.slice(0, 16000), sampleTruncated: sample.length > 16000 }
    },
    async prepare(original, context) {
      const input = definitionSchema.parse(original)
      const options = optionsSchema.parse({ workspaceId: context.workspaceId, toolsetId: scope(context).toolsetId,
        
        datasets: [{ ...input, id: 'dataset', revision: 'initial', readOnly: true }] })
      const dataset = options.datasets[0]
      const operations = await api().operations.list(scope(context))
      const operation = operations.find(operation => operation.operationId === input.operationId)
      if (!operation) throw new Error('ANALYTICS_OPERATION_UNAVAILABLE')
      const payload = payloadSchema.parse({ datasetId: dataset.id, revision: dataset.revision, operationContractHash: operation.contractHash,
        arguments: paginationDefaults(dataset), parameterPaths: {} })
      await queryPages(api(), scope(context), dataset, payload, payload.arguments, 5)
      // Permission/operation changes during preview are checked again before persistence.
      const current = await api().operations.list(scope(context))
      if (!current.some(item => item.contractHash === operation.contractHash && item.operationId === operation.operationId)) throw new Error('ANALYTICS_OPERATION_CHANGED')
      context.signal.throwIfAborted()
      return options
    }
  }
}

import { z } from 'zod/v3'
import { analyticsOptionsSchema, type AnalyticsDefinitionAuthoring, type AnalyticsAuthoringContext, type McpClientRuntimeApi } from '@xpert-ai/plugin-sdk'
import { datasetSchema, jsonSchema, optionsSchema } from './schema'
import { projectResult } from './result'

const inspectSchema = z.object({ toolName: z.string().min(1).optional(), arguments: analyticsOptionsSchema.optional() }).strict()
const definitionSchema = datasetSchema.innerType().omit({ id: true, revision: true, readOnly: true })
export function createAuthoring(api: () => McpClientRuntimeApi): AnalyticsDefinitionAuthoring {
  const scope = (context: AnalyticsAuthoringContext) => {
    if (context.connection.kind !== 'mcp-toolset') throw new Error('ANALYTICS_CONNECTION_INVALID')
    return { toolsetId: context.connection.toolsetId, serverName: context.connection.serverName, actor: context.actor, workspaceId: context.workspaceId, signal: context.signal, deadlineAt: context.deadlineAt }
  }
  return {
    inspectSchema: jsonSchema(inspectSchema), definitionSchema: jsonSchema(definitionSchema),
    instructions: 'Inspect approved read-only tools; use their documented semantics and a real sample to author columns and result mapping. Pass arguments only to sample the selected operation. Never guess metric meaning or mark a page as a complete total. System supplies connection, scope, dataset identity and revision. Register then discover and preview the returned source before saving a dashboard.',
    async inspect(original, context) {
      const input = inspectSchema.parse(original), operations = await api().tools.list(scope(context))
      if (!input.toolName) return { operations: JSON.parse(JSON.stringify(operations)) }
      const operation = operations.find(operation => operation.name === input.toolName)
      if (!operation) throw new Error('ANALYTICS_OPERATION_UNAVAILABLE')
      if (!input.arguments) return JSON.parse(JSON.stringify(operation))
      const result = await api().tools.call(scope(context), { toolName: operation.name, contractHash: operation.contractHash, arguments: input.arguments })
      const sample = JSON.stringify(result)
      return { operation: JSON.parse(JSON.stringify(operation)), sampleJson: sample.slice(0, 16000), sampleTruncated: sample.length > 16000 }
    },
    async prepare(original, context) {
      const input = definitionSchema.parse(original)
      const options = optionsSchema.parse({ workspaceId: context.workspaceId, toolsetId: scope(context).toolsetId,
        serverName: scope(context).serverName,
        datasets: [{ ...input, id: 'dataset', revision: 'initial', readOnly: true }] })
      const dataset = options.datasets[0]
      const operations = await api().tools.list(scope(context))
      const operation = operations.find(operation => operation.name === input.toolName)
      if (!operation) throw new Error('ANALYTICS_OPERATION_UNAVAILABLE')
      const result = await api().tools.call(scope(context), { toolName: dataset.toolName, contractHash: operation.contractHash, arguments: dataset.defaultArguments })
      projectResult(result, dataset, 5)
      // Permission/operation changes during preview are checked again before persistence.
      const current = await api().tools.list(scope(context))
      if (!current.some(item => item.contractHash === operation.contractHash && item.name === operation.name)) throw new Error('ANALYTICS_OPERATION_CHANGED')
      context.signal.throwIfAborted()
      return options
    }
  }
}

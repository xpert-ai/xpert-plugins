import { z } from 'zod/v3'
import type { AnalyticsDiscoveryResult, JSONValue } from '@xpert-ai/contracts'
import { dataXpertPayloadSchema } from './payload'
import { dataXpertDiscoveryRequestSchema } from './discovery'

/** Provider-owned reference migration. Native Action arguments and output contracts remain unchanged. */
export const importTargetRequest = z.object({
  kind: z.literal('import-targets'), payload: dataXpertPayloadSchema,
  browse: dataXpertDiscoveryRequestSchema.default({ kind: 'resources' })
}).strict()

export async function discoverImportTargets(input: z.infer<typeof importTargetRequest>, discover: (request: JSONValue) => Promise<AnalyticsDiscoveryResult>): Promise<AnalyticsDiscoveryResult> {
  const result = await discover(input.browse)
  const wrap = (browse: JSONValue): JSONValue => ({ kind: 'import-targets', payload: { ...input.payload, params: {}, parameterPaths: {} }, browse })
  return { ...result,
    items: result.items.flatMap<AnalyticsDiscoveryResult['items'][number]>(item => {
      const next = dataXpertDiscoveryRequestSchema.safeParse(item.inspectRequest)
      if (next.success && next.data.kind === 'actions') {
        const target = next.data.target
        if (input.payload.target.entityTypeCode && target.entityTypeCode !== input.payload.target.entityTypeCode) return []
        return [{ id: item.id, name: item.name, kind: 'dataset' as const, description: item.description,
          metadata: { schema: 'xpert.analytics.import-target', version: 1,
            payloadPatch: { resourceId: next.data.resourceId, target } } }]
      }
      return item.inspectRequest ? [{ ...item, inspectRequest: wrap(item.inspectRequest) }] : []
    }),
    ...(result.nextRequest ? { nextRequest: wrap(result.nextRequest) } : {})
  }
}

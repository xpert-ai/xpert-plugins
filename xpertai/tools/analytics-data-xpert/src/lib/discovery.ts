import { z } from 'zod/v3'
import type { AnalyticsDiscoveryResult } from '@xpert-ai/contracts'

/** Private wire contract for data-xpert discovery; actor and Assistant scope are server-owned. */
export const dataXpertDiscoveryRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('resources'), after: z.string().min(1).max(160).optional() }).strict(),
  z.object({
    kind: z.literal('entities'), resourceId: z.string().min(1).max(160),
    entityTypeCode: z.string().min(1).max(160).optional(), query: z.string().max(256).optional()
  }).strict(),
  z.object({
    kind: z.literal('actions'), resourceId: z.string().min(1).max(160),
    target: z.object({ entityTypeCode: z.string().min(1).max(160), entityRef: z.string().min(1).max(512) }).strict()
  }).strict()
])

/**
 * All ontology adapters share this envelope, not a native query language.
 * Preserve definition.adapterId/contractVersion/metadata/instructions and Action inputSchema
 * from data-xpert. New adapters must not require branches in this provider or the renderer.
 */
export const dataXpertQueryContract: AnalyticsDiscoveryResult['queryContract'] = {
  operation: 'action', contractVersion: 1,
  payloadSchema: {
    type: 'object', additionalProperties: false,
    required: ['resourceId', 'actionTypeCode', 'target', 'params', 'parameterPaths'],
    properties: {
      resourceId: { type: 'string', minLength: 1, maxLength: 160 },
      actionTypeCode: { type: 'string', minLength: 1, maxLength: 160 },
      target: {
        type: 'object', additionalProperties: false,
        properties: {
          entityId: { type: 'string', minLength: 1, maxLength: 256 },
          entityTypeCode: { type: 'string', minLength: 1, maxLength: 256 },
          entityRef: { type: 'string', minLength: 1, maxLength: 512 }
        },
        anyOf: [{ required: ['entityId'] }, { required: ['entityRef'] }]
      },
      params: { type: 'object' },
      parameterPaths: { type: 'object', additionalProperties: {
        type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', minLength: 1 }
      } }
    }
  },
  instructions: [
    'Follow inspectRequest: resources -> entities -> actions. Continue nextRequest even when the visible resource page is empty. Entity discovery returns top 20 matches; narrow query/entityTypeCode if needed.',
    'Entity metadata.definition contains adapterId, contractVersion, metadata and instructions. Follow that adapter-specific definition and the discovered Action inputSchema/inputHint. Preserve canonical targets, resource IDs and exact field names. Do not infer adapter types from names or apply one adapter\'s query, filter or time rules to another.',
    'Use only published metadata and authorized previews to establish business metrics, time axes, supported filters and complete aggregation. Missing metadata does not authorize guessing; obtain sufficient evidence before generating a time filter.',
    'Use parameterPaths relative to params to replace an existing scalar value, for example {region:["filters","0","value"]}. Paths must be unique. Never interpolate values into query text. Controls supply scalar values; arrays remain static unless the native Action explicitly supports another declared scalar mapping. Null handling and filter operators are defined by the Action schema and adapter instructions.',
    'Before authoring a binding, use dashboard_discover with the same source/providerId and requestJson encoding {kind:"query-schema",datasetId:"your_dataset_id",payload:<native Action envelope>,parameters:<mapped scalar values, or {}>}. This runs that bounded read-only Action under the current viewer policy; respect the native Action limits and filters. It returns items[0].metadata.output without business rows. Copy this output into the dashboard_preview binding, preserving field IDs, sourceField, logicalType, role and nullable. Decimal/int64 remain exact strings; do not infer types from sample cells or names. If declarations are missing, obtain source metadata instead of guessing.',
    'The discovered output has empty grain because column roles alone do not prove uniqueness. Declare grain only when supported by query semantics. Always run dashboard_preview with the same payload and parameter values to validate the binding and obtain a preview receipt before saving; schema discovery is not a preview receipt. Re-discover after changing the query projection. A partial page is not a complete business aggregate.'
  ].join(' ')
}

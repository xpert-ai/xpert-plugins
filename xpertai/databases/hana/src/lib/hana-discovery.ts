import { z } from 'zod'
import type { AnalyticsDiscoveryResult, JSONValue } from '@xpert-ai/contracts'
import type { DatabaseWorkbenchAdapter } from '@xpert-ai/plugin-sdk'

const identifier = z.string().min(1).max(127)
export const hanaLocationSchema = z.object({ schema: identifier, database: identifier.optional() }).strict()
export const hanaPayloadSchema = z.object({ sql: z.string().trim().min(1).max(32000),
  parameterOrder: z.array(z.string().min(1).max(128)).max(24).default([]), location: hanaLocationSchema.optional() }).strict()
const discoverySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('schemas'), page: z.number().int().min(1).max(50).default(1) }).strict(),
  z.object({ kind: z.literal('catalog'), location: hanaLocationSchema, search: z.string().max(160).optional(),
    page: z.number().int().min(1).max(10000).default(1) }).strict(),
  z.object({ kind: z.literal('inspect'), object: hanaLocationSchema.extend({ name: identifier, kind: z.enum(['table', 'view']) }) }).strict()
])
export type HanaDiscoveryRequest = z.infer<typeof discoverySchema>
export function parseHanaDiscoveryRequest(input: JSONValue): HanaDiscoveryRequest {
  return discoverySchema.parse(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 0
    ? { kind: 'schemas' } : input)
}
export const hanaQueryContract: AnalyticsDiscoveryResult['queryContract'] = {
  operation: 'query', contractVersion: 1,
  payloadSchema: { type: 'object', additionalProperties: false, required: ['sql', 'parameterOrder'], properties: {
    sql: { type: 'string', minLength: 1, maxLength: 32000 }, parameterOrder: { type: 'array', maxItems: 24, items: { type: 'string' } },
    location: { type: 'object', additionalProperties: false, required: ['schema'], properties: { schema: { type: 'string' }, database: { type: 'string' } } }
  } },
  instructions: 'Read-only SAP HANA SELECT/CTE queries, using the existing connection tenant database. Discover schemas, then catalog and inspect columns/comments before choosing metrics. location.schema selects the current schema; location.database cannot change the configured HANA tenant. Quote exact identifiers with double quotes and use explicit output aliases. Bind scalar values with positional ? placeholders and parameterOrder (repeat names for repeated placeholders). Cast nullable parameters explicitly, e.g. CAST(? AS NVARCHAR(100)) IS NULL. Never interpolate values or quote placeholders. DECIMAL/SMALLDECIMAL and BIGINT/COUNT use decimal/int64 exact string encodings; cast to DOUBLE only if approximate float64 is intended. DATE uses date; TIMESTAMP/SECONDDATE have no time zone, so format as string unless a known offset is explicitly supplied. Use TO_VARCHAR(date_column, \'YYYY-MM\') for month labels. Only approved HANA scalar/aggregate/window functions are supported; no procedures, table functions, sequences, writes, EXPLAIN or CTE column lists. LOB/binary/spatial/array columns require explicit bounded scalar conversion. Keys and DDL are not inspected: verify join cardinality rather than infer it. Results are bounded; truncated results are not complete totals.'
}

export async function discoverHana(request: HanaDiscoveryRequest, adapter: DatabaseWorkbenchAdapter): Promise<AnalyticsDiscoveryResult> {
  const queryContract = hanaQueryContract
  if (request.kind === 'schemas') {
    const locations = await adapter.locations(), start = (request.page - 1) * 20
    return { queryContract, items: locations.slice(start, start + 20).flatMap((location) => location.schema ? [{
      id: location.schema, name: location.schema, kind: 'collection' as const, metadata: {},
      inspectRequest: { kind: 'catalog', location: { schema: location.schema, ...(location.database ? { database: location.database } : {}) } }
    }] : []), ...(locations.length > start + 20 ? { nextRequest: { kind: 'schemas', page: request.page + 1 } } : {}) }
  }
  if (request.kind === 'catalog') {
    const result = await adapter.objects({ ...request.location, page: request.page, pageSize: 20, search: request.search })
    return { queryContract, items: result.items.map((object) => ({ id: JSON.stringify(object), name: object.name, kind: 'dataset',
      inspectRequest: { kind: 'inspect', object: { ...request.location, name: object.name, kind: object.kind } }, metadata: { objectKind: object.kind } })),
      ...(result.hasMore ? { nextRequest: { ...request, page: request.page + 1 } } : {}) }
  }
  const detail = await adapter.describe({ ...request.object, name: request.object.name, kind: request.object.kind })
  return { queryContract, items: [{ id: JSON.stringify(request.object), name: request.object.name, kind: 'dataset', metadata: {
    object: { ...detail.object }, columns: detail.columns.map((column) => ({ name: column.name, dataType: column.dataType,
      nullable: column.nullable ?? true, description: column.comment ?? '' })), diagnostics: detail.diagnostics
  } }] }
}

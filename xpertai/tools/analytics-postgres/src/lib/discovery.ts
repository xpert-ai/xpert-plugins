import { z } from 'zod/v3'
import type { AnalyticsDiscoveryResult, JSONValue } from '@xpert-ai/contracts'
import type { DatabaseWorkbenchAdapter } from '@xpert-ai/plugin-sdk'

const location = z.object({ database: z.string().min(1).max(128).optional(), schema: z.string().min(1).max(128).default('public') }).strict()
/** Provider-owned metadata requests; identity and connection credentials remain host-owned. */
const requestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('catalog'), location: location.default({}), search: z.string().max(160).optional(), page: z.number().int().min(1).max(10000).default(1) }).strict(),
  z.object({ kind: z.literal('inspect'), object: location.extend({ name: z.string().min(1).max(128), kind: z.enum(['table', 'view']) }).strict() }).strict()
])
/** Validated catalog/inspect request. Keep source-specific details outside the platform contract. */
export type PostgresDiscoveryRequest = z.infer<typeof requestSchema>

export function parsePostgresDiscoveryRequest(input: JSONValue): PostgresDiscoveryRequest {
  return requestSchema.parse(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 0 ? { kind: 'catalog' } : input)
}

const queryContract: AnalyticsDiscoveryResult['queryContract'] = {
  operation: 'query', contractVersion: 1,
  payloadSchema: { type: 'object', additionalProperties: false, required: ['sql', 'parameterOrder'], properties: {
    sql: { type: 'string', maxLength: 32000 }, parameterOrder: { type: 'array', items: { type: 'string' }, maxItems: 24 },
    location: { type: 'object', properties: { database: { type: 'string' }, schema: { type: 'string' } }, additionalProperties: false }
  } },
  instructions: 'Read-only PostgreSQL SELECT. Inspect tables and comments before selecting business metrics. Bind filters with $1, $2 and parameterOrder names, never string interpolation. Cast nullable placeholders explicitly (e.g. $1::text IS NULL OR region = $1::text); PostgreSQL cannot infer a type from IS NULL. Use exact quoted identifiers; explicit output aliases become sourceField. Declare numeric/decimal as decimal, bigint/count as int64 (exact strings), double precision as float64. Aggregate at the requested grain, avoid duplicate joins and unjustified LIMITs. For a large catalog use {kind: "catalog", search: "business keyword", page: 1} to search table names. A date field requires YYYY-MM-DD (cast DATE_TRUNC to date); timestamps require an explicit timezone and timestamp logicalType. For month labels use TO_CHAR with string logicalType. Catalog defaults to public; provide location.schema to inspect another schema. Column types are PostgreSQL types, not inferred from samples.'
}
export async function discoverPostgres(request: PostgresDiscoveryRequest, adapter: DatabaseWorkbenchAdapter): Promise<AnalyticsDiscoveryResult> {
  if (request.kind === 'catalog') {
    const page = await adapter.objects({ ...request.location, search: request.search, page: request.page, pageSize: 20 })
    return { queryContract,
      items: page.items.map((object) => ({ id: JSON.stringify(object), name: `${object.schema ?? 'public'}.${object.name}`, kind: 'dataset',
        inspectRequest: { kind: 'inspect', object: { name: object.name, kind: object.kind, schema: object.schema ?? 'public', ...(object.database ? { database: object.database } : {}) } },
        metadata: { objectKind: object.kind } })),
      ...(page.hasMore ? { nextRequest: { ...request, page: request.page + 1 } } : {}) }
  }
  const detail = await adapter.describe(request.object)
  return { queryContract, items: [{ id: JSON.stringify(request.object), name: request.object.name, kind: 'dataset',
    metadata: { object: { ...detail.object }, columns: detail.columns.map((column) => ({ name: column.name, dataType: column.dataType,
      nullable: column.nullable ?? true, ...(column.comment ? { description: column.comment } : {}) })),
      keys: detail.keys.map((key) => ({ name: key.name, kind: key.kind, columns: key.columns,
        ...(key.referencedTable ? { referencedTable: { ...key.referencedTable }, referencedColumns: key.referencedColumns ?? [] } : {}) })),
      definition: detail.definition.slice(0, 16000), diagnostics: detail.diagnostics } }] }
}

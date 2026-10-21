import { z } from 'zod/v3'
import type { AnalyticsDiscoveryResult, JSONValue } from '@xpert-ai/contracts'
import type { DatabaseWorkbenchAdapter } from '@xpert-ai/plugin-sdk'
import { databaseLocationSchema } from './query'

const requestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('databases'), page: z.number().int().min(1).max(50).default(1) }).strict(),
  z.object({ kind: z.literal('catalog'), location: databaseLocationSchema, search: z.string().max(160).optional(), page: z.number().int().min(1).max(10000).default(1) }).strict(),
  z.object({ kind: z.literal('inspect'), object: databaseLocationSchema.extend({ name: z.string().min(1).max(128), kind: z.enum(['table', 'view']) }).strict() }).strict()
])
export type MysqlDiscoveryRequest = z.infer<typeof requestSchema>
export function parseDiscoveryRequest(input: JSONValue): MysqlDiscoveryRequest {
  return requestSchema.parse(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 0 ? { kind: 'databases' } : input)
}

export function queryContract(engine: 'mysql' | 'doris'): AnalyticsDiscoveryResult['queryContract'] {
  return {
    operation: 'query', contractVersion: 1,
    payloadSchema: { type: 'object', additionalProperties: false, required: ['sql', 'parameterOrder'], properties: {
      sql: { type: 'string', minLength: 1, maxLength: 32000 }, parameterOrder: { type: 'array', items: { type: 'string' }, maxItems: 24 },
      location: { type: 'object', required: ['database'], properties: { database: { type: 'string' } }, additionalProperties: false }
    } },
    instructions: `Read-only ${engine === 'mysql' ? 'MySQL' : 'Apache Doris internal-catalog'} SELECT. Discover databases, then catalog and inspect tables/comments/keys before choosing business metrics. Bind scalar filters using positional ? placeholders and parameterOrder; repeat a name for every occurrence, e.g. WHERE (? IS NULL OR region = ?) with ["region","region"]. Never quote placeholders, use ?? for identifiers, put ? in literals/comments when using parameters, or interpolate values. Exact backtick-quoted identifiers and explicit output aliases become sourceField. Declare DECIMAL/SUM(decimal) as decimal and BIGINT/COUNT as int64 (exact strings); use CAST(... AS DOUBLE) only when float64 precision is intended. TINYINT may map to boolean only when explicitly declared and values are 0/1; BIT is binary, cast it explicitly. DATE maps to date; DATETIME/TIMESTAMP have no zone in the wire result: format them as strings or explicitly produce an ISO timestamp with a known offset, never invent UTC. Month labels: DATE_FORMAT(date_column, '%Y-%m') with string logicalType. Aggregate at the requested grain, preserve units and business filters; do not add an arbitrary LIMIT to complete totals. location.database selects a database, not a tenant or credential. ${engine === 'doris' ? 'External catalogs are not supported. Doris has no exposed read-only transaction: use a SELECT-only database principal; UNIQUE/DUPLICATE/AGGREGATE table models are reported by inspect and affect aggregation semantics.' : 'Queries run in the driver read-only transaction. Only mysql source types are advertised; MariaDB/RDS/StarRocks need their own verified runtime support.'}`
  }
}

export async function discoverMysql(request: MysqlDiscoveryRequest, adapter: DatabaseWorkbenchAdapter): Promise<AnalyticsDiscoveryResult> {
  const contract = queryContract(adapter.engine === 'doris' ? 'doris' : 'mysql')
  if (request.kind === 'databases') {
    const locations = await adapter.locations()
    const offset = (request.page - 1) * 20
    return { schemaVersion: 1, queryContract: contract,
      items: locations.slice(offset, offset + 20).flatMap((location) => location.database ? [{
        id: location.database, name: location.database, kind: 'collection' as const,
        inspectRequest: { kind: 'catalog', location: { database: location.database } },
        metadata: { database: location.database }
      }] : []),
      ...(locations.length > offset + 20 ? { nextRequest: { kind: 'databases', page: request.page + 1 } } : {}) }
  }
  if (request.kind === 'catalog') {
    const page = await adapter.objects({ ...request.location, search: request.search, page: request.page, pageSize: 20 })
    return { schemaVersion: 1, queryContract: contract,
      items: page.items.map((object) => ({ id: JSON.stringify(object), name: object.name, kind: 'dataset',
        inspectRequest: { kind: 'inspect', object: { name: object.name, kind: object.kind, database: object.database ?? request.location.database } },
        metadata: { objectKind: object.kind } })),
      ...(page.hasMore ? { nextRequest: { ...request, page: request.page + 1 } } : {}) }
  }
  const detail = await adapter.describe(request.object)
  return { schemaVersion: 1, queryContract: contract, items: [{ id: JSON.stringify(request.object), name: request.object.name, kind: 'dataset',
    metadata: { object: { ...detail.object }, columns: detail.columns.map((column) => ({ name: column.name, dataType: column.dataType,
      nullable: column.nullable ?? true, ...(column.comment ? { description: column.comment } : {}) })),
      keys: detail.keys.map((key) => ({ name: key.name, kind: key.kind, columns: key.columns,
        ...(key.referencedTable ? { referencedTable: { ...key.referencedTable }, referencedColumns: key.referencedColumns ?? [] } : {}) })),
      ...(detail.model ? { tableModel: detail.model } : {}), definition: detail.definition.slice(0, 16000), diagnostics: detail.diagnostics } }] }
}

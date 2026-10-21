import { discoverPostgres, parsePostgresDiscoveryRequest } from './discovery'
import { BadRequestException, Inject } from '@nestjs/common'
import { z } from 'zod/v3'
import type { AnalyticsBinding, AnalyticsProviderDescriptor, AnalyticsValue, JSONValue } from '@xpert-ai/contracts'
import {
  AnalyticsProvider, DataSourceRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AnalyticsQueryProvider, type AnalyticsProviderContext, type AnalyticsProviderResult, type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'

/** SQL stays opaque to the host; values are bound in parameterOrder, never interpolated. */
export const postgresPayloadSchema = z.object({
  sql: z.string().min(1).max(32000),
  parameterOrder: z.array(z.string()).max(24).default([]),
  location: z.object({ database: z.string().max(128).optional(), schema: z.string().max(128).optional() }).strict().optional()
}).strict()

/** Uses the host's scoped, read-only adapter, including per-user credentials and cancellation. */
@AnalyticsProvider('postgres.sql')
export class PostgresAnalyticsProvider implements AnalyticsQueryProvider {
  readonly descriptor: AnalyticsProviderDescriptor = {
    id: 'postgres.sql', name: 'PostgreSQL', dataSourceTypes: ['pg', 'postgres'],
    operations: [{ name: 'query', contractVersion: 1, readOnly: true }]
  }
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  async discover(request: JSONValue, context: AnalyticsProviderContext) {
    const parsed = parsePostgresDiscoveryRequest(request)
    const location = parsed.kind === 'catalog' ? parsed.location : parsed.object
    const adapter = await this.runtime.require(DataSourceRuntimeCapability).open({
      actor: context.actor, dataSourceId: context.dataSourceId,
      location: { database: location.database, schema: location.schema }
    })
    try {
      if (adapter.engine !== 'postgres') throw new Error('POSTGRES_ENGINE_REQUIRED')
      return await discoverPostgres(parsed, adapter)
    } finally { await adapter.close() }
  }
  async execute(binding: AnalyticsBinding, parameters: Record<string, AnalyticsValue>, context: AnalyticsProviderContext): Promise<AnalyticsProviderResult> {
    const payload = postgresPayloadSchema.parse(binding.payload)
    if (payload.parameterOrder.some((name) => !Object.prototype.hasOwnProperty.call(parameters, name)) ||
      Object.keys(parameters).some((name) => !payload.parameterOrder.includes(name))) throw new Error('POSTGRES_PARAMETER_ORDER_INVALID')
    const adapter = await this.runtime.require(DataSourceRuntimeCapability).open({
      actor: context.actor, dataSourceId: context.dataSourceId, location: payload.location
    })
    try {
      if (adapter.engine !== 'postgres') throw new Error('POSTGRES_ENGINE_REQUIRED')
      const result = await adapter.query({ ...payload.location, sql: payload.sql, parameters: payload.parameterOrder.map((name) => parameters[name]),
        mode: 'read', limit: context.maxRows, timeoutMs: context.timeoutMs }, context.signal)
      if (result.outcome !== 'succeeded') throw new Error('POSTGRES_QUERY_INCOMPLETE')
      if (new Set(result.columns.map((column) => column.name)).size !== result.columns.length) throw new Error('POSTGRES_DUPLICATE_COLUMNS')
      const truncated = result.truncated || result.hasMore
      return {
        columns: result.columns.map((column) => ({ key: column.name })),
        rows: result.rows.map((row) => Object.fromEntries(result.columns.map((column, index) => {
          const field = binding.output.fields.find((field) => field.sourceField === column.name)
          const value = row[index]
          return [column.name, normalizePostgresCell(value, column.dataType, field?.logicalType)]
        }))),
        completeness: { returnedRows: result.rows.length, totalAccuracy: truncated ? 'unknown' : 'exact',
          ...(!truncated ? { totalRows: result.rows.length } : {}), scope: truncated ? 'page' : 'full_query_result', truncated },
        sourceFetchedAt: new Date().toISOString()
      }
    } catch (error) {
      if (error instanceof Error && ['42P08', '42P18'].includes(error.message))
        throw new BadRequestException('POSTGRES_PARAMETER_TYPE_REQUIRED: cast nullable placeholders explicitly, for example $1::text IS NULL OR region = $1::text')
      throw error
    } finally { await adapter.close() }
  }
}

/** Convert only declared PostgreSQL OIDs; exact decimal/int64 strings must never pass through Number. */
export function normalizePostgresCell(value: AnalyticsValue, oid: string, logicalType?: string): AnalyticsValue {
  if (value === null) return null
  if (logicalType === 'float64' && ['700', '701', '21', '23'].includes(oid) && typeof value === 'string') {
    const number = Number(value)
    if (!value.trim() || !Number.isFinite(number)) throw new Error('POSTGRES_NONFINITE_NUMBER')
    return number
  }
  if (logicalType === 'boolean' && oid === '16' && (value === 't' || value === 'f')) return value === 't'
  if (logicalType === 'timestamp' && oid === '1184' && typeof value === 'string') {
    const milliseconds = Date.parse(value)
    if (!Number.isFinite(milliseconds)) throw new Error('POSTGRES_TIMESTAMP_INVALID')
    return new Date(milliseconds).toISOString()
  }
  return logicalType === 'int64' && typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
}

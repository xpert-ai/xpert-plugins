import { Inject } from '@nestjs/common'
import type { AnalyticsBinding, AnalyticsProviderDescriptor, AnalyticsValue, JSONValue } from '@xpert-ai/contracts'
import {
  AnalyticsProvider, DataSourceRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AnalyticsQueryProvider, type AnalyticsProviderContext, type AnalyticsProviderResult,
  type DatabaseLocation, type DatabaseWorkbenchAdapter, type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { discoverMysql, parseDiscoveryRequest } from './discovery'
import { bindMysqlParameters, mysqlPayloadSchema, normalizeMysqlCell } from './query'

/** Two explicit providers share wire conversion, never credentials or engine inference from source names. */
abstract class MysqlProtocolProvider implements AnalyticsQueryProvider {
  abstract readonly descriptor: AnalyticsProviderDescriptor
  constructor(private readonly runtime: RuntimeCapabilityRegistry, private readonly engine: 'mysql' | 'doris') {}

  private async withAdapter<T>(context: AnalyticsProviderContext, location: DatabaseLocation | undefined, run: (adapter: DatabaseWorkbenchAdapter) => Promise<T>): Promise<T> {
    context.signal.throwIfAborted()
    const adapter = await this.runtime.require(DataSourceRuntimeCapability).open({ actor: context.actor, dataSourceId: context.dataSourceId, location })
    const abort = () => { void adapter.close().catch(() => undefined) }
    context.signal.addEventListener('abort', abort, { once: true })
    try {
      context.signal.throwIfAborted()
      if (adapter.engine !== this.engine) throw new Error('MYSQL_ANALYTICS_ENGINE_MISMATCH')
      const result = await run(adapter)
      context.signal.throwIfAborted()
      return result
    } finally {
      context.signal.removeEventListener('abort', abort)
      await adapter.close()
    }
  }

  async discover(request: JSONValue, context: AnalyticsProviderContext) {
    const parsed = parseDiscoveryRequest(request)
    const location = parsed.kind === 'inspect' ? { database: parsed.object.database } : parsed.kind === 'catalog' ? parsed.location : undefined
    return this.withAdapter(context, location, (adapter) => discoverMysql(parsed, adapter))
  }

  async execute(binding: AnalyticsBinding, parameters: Record<string, AnalyticsValue>, context: AnalyticsProviderContext): Promise<AnalyticsProviderResult> {
    const payload = mysqlPayloadSchema.parse(binding.payload)
    const values = bindMysqlParameters(payload.sql, payload.parameterOrder, parameters)
    return this.withAdapter(context, payload.location, async (adapter) => {
      const timeoutMs = Math.min(context.timeoutMs, context.deadlineAt - Date.now())
      if (timeoutMs <= 0) throw new Error('MYSQL_ANALYTICS_DEADLINE_EXCEEDED')
      const result = await adapter.query({ ...payload.location, sql: payload.sql, parameters: values, mode: 'read', limit: context.maxRows, timeoutMs }, context.signal)
      if (result.outcome !== 'succeeded') throw new Error('MYSQL_QUERY_INCOMPLETE')
      if (new Set(result.columns.map((column) => column.name)).size !== result.columns.length) throw new Error('MYSQL_DUPLICATE_COLUMNS')
      const truncated = result.truncated || result.hasMore
      const types = new Map(binding.output.fields.map((field) => [field.sourceField, field.logicalType]))
      return {
        columns: result.columns.map((column) => ({ key: column.name })),
        rows: result.rows.map((row) => {
          if (row.length !== result.columns.length) throw new Error('MYSQL_ROW_SHAPE_INVALID')
          return Object.fromEntries(result.columns.map((column, index) => [column.name, normalizeMysqlCell(row[index], column.dataType, types.get(column.name))]))
        }),
        completeness: { returnedRows: result.rows.length, totalAccuracy: truncated ? 'unknown' : 'exact',
          ...(!truncated ? { totalRows: result.rows.length } : {}), scope: truncated ? 'page' : 'full_query_result', truncated },
        sourceFetchedAt: new Date().toISOString()
      }
    })
  }
}

@AnalyticsProvider('mysql.sql')
export class MysqlAnalyticsProvider extends MysqlProtocolProvider {
  readonly descriptor: AnalyticsProviderDescriptor = { id: 'mysql.sql', name: 'MySQL', dataSourceTypes: ['mysql'], operations: [{ name: 'query', contractVersion: 1, readOnly: true }] }
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) runtime: RuntimeCapabilityRegistry) { super(runtime, 'mysql') }
}

@AnalyticsProvider('doris.sql')
export class DorisAnalyticsProvider extends MysqlProtocolProvider {
  readonly descriptor: AnalyticsProviderDescriptor = { id: 'doris.sql', name: 'Apache Doris', dataSourceTypes: ['doris'], operations: [{ name: 'query', contractVersion: 1, readOnly: true }] }
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) runtime: RuntimeCapabilityRegistry) { super(runtime, 'doris') }
}

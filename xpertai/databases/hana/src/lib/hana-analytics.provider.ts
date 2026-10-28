import { Inject } from '@nestjs/common'
import type { AnalyticsBinding, AnalyticsProviderDescriptor, AnalyticsValue, JSONValue } from '@xpert-ai/contracts'
import { AnalyticsProvider, DataSourceRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AnalyticsQueryProvider, type AnalyticsProviderContext, type AnalyticsProviderResult,
  type DatabaseLocation, type DatabaseWorkbenchAdapter, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { discoverHana, hanaPayloadSchema, parseHanaDiscoveryRequest } from './hana-discovery.js'
import { validateHanaRead } from './hana-sql.js'

@AnalyticsProvider('hana.sql')
export class HanaAnalyticsProvider implements AnalyticsQueryProvider {
  readonly descriptor: AnalyticsProviderDescriptor = { id: 'hana.sql', name: 'SAP HANA', sourceKinds: ['data-source'],
    dataSourceTypes: ['hana'], operations: [{ name: 'query', contractVersion: 1, readOnly: true }] }
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}

  private async withAdapter<T>(context: AnalyticsProviderContext, location: DatabaseLocation | undefined,
    run: (adapter: DatabaseWorkbenchAdapter) => Promise<T>): Promise<T> {
    context.signal.throwIfAborted()
    if (context.source.kind !== 'data-source') throw new Error('ANALYTICS_SOURCE_UNAVAILABLE')
    if (context.deadlineAt <= Date.now()) throw new Error('HANA_DEADLINE_EXCEEDED')
    const adapter = await this.runtime.require(DataSourceRuntimeCapability).open({ actor: context.actor,
      dataSourceId: context.source.dataSourceId, location })
    let rejectInterrupted: (error: Error) => void = () => undefined
    const interrupted = new Promise<never>((_, reject) => { rejectInterrupted = reject })
    const abort = () => {
      rejectInterrupted(new Error('HANA_QUERY_CANCELLED'))
      void adapter.close().catch(() => undefined)
    }
    const timer = setTimeout(() => {
      rejectInterrupted(new Error('HANA_DEADLINE_EXCEEDED'))
      void adapter.close().catch(() => undefined)
    }, Math.max(1, Math.min(context.timeoutMs, context.deadlineAt - Date.now())))
    context.signal.addEventListener('abort', abort, { once: true })
    try {
      context.signal.throwIfAborted()
      if (adapter.engine !== 'hana') throw new Error('HANA_ENGINE_REQUIRED')
      const result = await Promise.race([run(adapter), interrupted])
      context.signal.throwIfAborted()
      if (context.deadlineAt <= Date.now()) throw new Error('HANA_DEADLINE_EXCEEDED')
      return result
    } finally {
      clearTimeout(timer)
      context.signal.removeEventListener('abort', abort)
      await adapter.close()
    }
  }
  async discover(input: JSONValue, context: AnalyticsProviderContext) {
    const request = parseHanaDiscoveryRequest(input)
    const location = request.kind === 'catalog' ? request.location : request.kind === 'inspect' ? request.object : undefined
    return this.withAdapter(context, location, (adapter) => discoverHana(request, adapter))
  }
  async execute(binding: AnalyticsBinding, parameters: Record<string, AnalyticsValue>, context: AnalyticsProviderContext): Promise<AnalyticsProviderResult> {
    const payload = hanaPayloadSchema.parse(binding.payload)
    if (payload.parameterOrder.some((name) => !Object.hasOwn(parameters, name)) ||
      Object.keys(parameters).some((name) => !payload.parameterOrder.includes(name))) throw new Error('HANA_PARAMETER_ORDER_INVALID')
    validateHanaRead(payload.sql, payload.parameterOrder.length)
    return this.withAdapter(context, payload.location, async (adapter) => {
      const timeoutMs = Math.min(context.timeoutMs, context.deadlineAt - Date.now())
      if (timeoutMs <= 0) throw new Error('HANA_DEADLINE_EXCEEDED')
      const result = await adapter.query({ ...payload.location, sql: payload.sql,
        parameters: payload.parameterOrder.map((name) => parameters[name]), mode: 'read', limit: Math.min(context.maxRows, 10000), timeoutMs }, context.signal)
      if (result.outcome !== 'succeeded') throw new Error('HANA_QUERY_INCOMPLETE')
      if (new Set(result.columns.map((column) => column.name)).size !== result.columns.length) throw new Error('HANA_DUPLICATE_COLUMNS')
      const fields = new Map(binding.output.fields.map((field) => [field.sourceField, field.logicalType]))
      const rows = result.rows.map((row) => {
        if (row.length !== result.columns.length) throw new Error('HANA_ROW_SHAPE_INVALID')
        return Object.fromEntries(result.columns.map((column, index) => {
          const value = row[index]
          return [column.name, fields.get(column.name) === 'int64' && typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value]
        }))
      })
      const truncated = result.truncated || result.hasMore
      return { columns: result.columns.map((column) => ({ key: column.name })), rows,
        completeness: { returnedRows: rows.length, totalAccuracy: truncated ? 'unknown' : 'exact',
          ...(!truncated ? { totalRows: rows.length } : {}), scope: truncated ? 'page' : 'full_query_result', truncated },
        sourceFetchedAt: new Date().toISOString() }
    })
  }
}

import type { AnalyticsBinding, AnalyticsValue } from '@xpert-ai/contracts'
import { cell, compare, Exact } from './cells'
import type { Column, FileDataset, FileQuery } from './schema'

export type Row = Record<string, AnalyticsValue>
function requireColumn(columns: Map<string, Column>, name: string) {
  const column = columns.get(name)
  if (!column) throw new Error('FILE_DATASET_COLUMN_UNAVAILABLE')
  return column
}
export function outputColumns(definition: FileDataset, query: FileQuery): Column[] {
  const source = new Map(definition.columns.map(c => [c.key, c])), available = new Map<string, Column>()
  if (new Set(query.select).size !== query.select.length || new Set(query.groupBy).size !== query.groupBy.length)
    throw new Error('FILE_DATASET_DUPLICATE_COLUMN')
  if (query.aggregates.length) {
    for (const name of query.groupBy) available.set(name, requireColumn(source, name))
    for (const a of query.aggregates) {
      if (source.has(a.key) || available.has(a.key)) throw new Error('FILE_DATASET_AGGREGATE_ALIAS_INVALID')
      const column = a.column ? requireColumn(source, a.column) : undefined
      if (!column && a.operation !== 'count') throw new Error('FILE_DATASET_AGGREGATE_COLUMN_REQUIRED')
      if (a.operation === 'sum' && column && !['int64', 'decimal', 'float64'].includes(column.logicalType)) throw new Error('FILE_DATASET_SUM_TYPE_INVALID')
      available.set(a.key, { key: a.key, path: [a.key], label: a.key, description: a.operation,
        logicalType: a.operation === 'count' ? 'int64' : a.operation === 'sum' && column?.logicalType === 'int64' ? 'decimal' : column!.logicalType,
        nullable: a.operation !== 'count', role: 'measure', nullValues: [], ...(column?.unit && a.operation !== 'count' ? { unit: column.unit } : {}) })
    }
  } else {
    if (query.groupBy.length) throw new Error('FILE_DATASET_GROUP_REQUIRES_AGGREGATE')
    for (const [name, column] of source) available.set(name, column)
  }
  const columns = query.select.map(name => requireColumn(available, name))
  for (const sort of query.orderBy) if (!query.select.includes(sort.column)) throw new Error('FILE_DATASET_SORT_COLUMN_INVALID')
  for (const filter of query.filters) requireColumn(source, filter.column)
  return columns
}

export function validateOutput(binding: AnalyticsBinding, columns: Column[]) {
  for (const field of binding.output.fields) {
    const column = columns.find(c => c.key === field.sourceField)
    if (!column || field.semanticRef || field.logicalType !== column.logicalType || field.nullable !== column.nullable || field.unit !== column.unit)
      throw new Error('FILE_DATASET_OUTPUT_CONTRACT_INVALID')
  }
}

export function executeQuery(rows: Row[], definition: FileDataset, query: FileQuery, parameters: Row, maxRows: number) {
  const columns = outputColumns(definition, query), source = new Map(definition.columns.map(c => [c.key, c]))
  const parameterNames = new Set(query.filters.flatMap(f => f.value.type === 'parameter' ? [f.value.name] : []))
  if (parameterNames.size !== Object.keys(parameters).length || Object.keys(parameters).some(name => !parameterNames.has(name)))
    throw new Error('FILE_DATASET_PARAMETERS_INVALID')
  const filters = query.filters.map(filter => {
    const column = requireColumn(source, filter.column)
    const raw = filter.value.type === 'parameter' ? parameters[filter.value.name] : filter.value.value
    const value = raw === null ? null : cell(raw, { ...column, nullValues: [] }, 'json')
    if (filter.operator === 'contains' && column.logicalType !== 'string') throw new Error('FILE_DATASET_FILTER_TYPE_INVALID')
    if (value === null && !filter.skipWhenNull && !['eq', 'ne'].includes(filter.operator)) throw new Error('FILE_DATASET_NULL_COMPARISON_INVALID')
    return { ...filter, column, value }
  })
  let result = rows.filter(row => filters.every(f => {
    if (f.value === null && f.skipWhenNull) return true
    const value = row[f.column.key]
    if (f.operator === 'contains') return typeof value === 'string' && typeof f.value === 'string' && value.includes(f.value)
    const order = compare(value, f.value, f.column.logicalType)
    if (f.operator === 'eq') return order === 0
    if (f.operator === 'ne') return order !== 0
    if (value === null || f.value === null) return false
    return f.operator === 'gt' ? order > 0 : f.operator === 'gte' ? order >= 0 : f.operator === 'lt' ? order < 0 : order <= 0
  }))
  if (query.aggregates.length) {
    const groups = new Map<string, Row[]>()
    if (!query.groupBy.length) groups.set('[]', [])
    for (const row of result) {
      const id = JSON.stringify(query.groupBy.map(name => row[name]))
      const group = groups.get(id) ?? []; group.push(row); groups.set(id, group)
    }
    result = [...groups.values()].map(group => {
      const row: Row = Object.fromEntries(query.groupBy.map(name => [name, group[0][name]]))
      for (const aggregate of query.aggregates) {
        const values = aggregate.column ? group.map(r => r[aggregate.column!]).filter(v => v !== null) : []
        if (aggregate.operation === 'count') row[aggregate.key] = String(aggregate.column ? values.length : group.length)
        else if (!values.length) row[aggregate.key] = null
        else if (aggregate.operation === 'sum') {
          const sum = values.reduce<InstanceType<typeof Exact>>((sum, value) => sum.plus(String(value)), new Exact(0))
          const float = source.get(aggregate.column!)!.logicalType === 'float64'
          if (float && !Number.isFinite(sum.toNumber())) throw new Error('FILE_DATASET_SUM_OVERFLOW')
          row[aggregate.key] = float ? sum.toNumber() : sum.toFixed()
        } else row[aggregate.key] = values.reduce((a, b) => {
          const order = compare(a, b, source.get(aggregate.column!)!.logicalType)
          return aggregate.operation === 'min' ? order <= 0 ? a : b : order >= 0 ? a : b
        })
      }
      return row
    })
  }
  result.sort((a, b) => {
    for (const order of query.orderBy) {
      const diff = compare(a[order.column], b[order.column], columns.find(c => c.key === order.column)!.logicalType)
      if (diff) return order.direction === 'asc' ? diff : -diff
    }
    return 0
  })
  const totalRows = result.length, truncated = totalRows > maxRows
  const projected = result.slice(0, maxRows).map(row => Object.fromEntries(query.select.map(key => [key, row[key]])))
  if (Buffer.byteLength(JSON.stringify(projected)) > 2_000_000) throw new Error('FILE_DATASET_RESULT_LIMIT')
  return { columns: columns.map(c => ({ key: c.key })), rows: projected, completeness: {
    totalRows, returnedRows: projected.length, totalAccuracy: 'exact' as const,
    scope: truncated ? 'page' as const : 'full_query_result' as const, truncated } }
}

import type { AnalyticsValue } from '@xpert-ai/contracts'
import type { AnalyticsProviderResult, McpClientToolResult } from '@xpert-ai/plugin-sdk'
import type { McpColumn, McpDatasetDefinition } from './schema'
import { readPath } from './schema'

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const validTimestamp = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value))

function mapCell(row: unknown, column: McpColumn): AnalyticsValue {
  const value = readPath(row, column.path)
  if (value === null && column.nullable) return null
  switch (column.logicalType) {
    case 'string': if (typeof value === 'string') return value; break
    case 'boolean': if (typeof value === 'boolean') return value; break
    case 'float64': if (typeof value === 'number' && Number.isFinite(value)) return value; break
    case 'int64': {
      const exact = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
      if (typeof exact === 'string' && /^-?\d{1,19}$/.test(exact) && BigInt(exact) >= -(2n ** 63n) && BigInt(exact) < 2n ** 63n) return exact
      break
    }
    case 'decimal': if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return value; break
    case 'date': if (typeof value === 'string' && validDate(value)) return value; break
    case 'timestamp': if (validTimestamp(value)) return value; break
  }
  throw new Error('MCP_DATASET_FIELD_TYPE_INVALID')
}

export function projectResult(result: McpClientToolResult, definition: McpDatasetDefinition, maxRows: number): AnalyticsProviderResult {
  let document: unknown
  if (definition.result.format === 'structured') {
    if (result.structuredContent === undefined) throw new Error('MCP_DATASET_STRUCTURED_CONTENT_REQUIRED')
    document = result.structuredContent
  } else {
    if (result.text.length !== 1) throw new Error('MCP_DATASET_SINGLE_JSON_TEXT_REQUIRED')
    try { document = JSON.parse(result.text[0]) } catch { throw new Error('MCP_DATASET_JSON_TEXT_INVALID') }
  }
  const selectors = definition.result
  const sourceRows = readPath(document, selectors.rowsPath)
  if (!Array.isArray(sourceRows)) throw new Error('MCP_DATASET_ROWS_INVALID')
  const rows = sourceRows.slice(0, maxRows).map((row) => Object.fromEntries(selectors.columns.map((column) => [column.key, mapCell(row, column)])))
  const reportedTruncation = selectors.truncatedPath ? readPath(document, selectors.truncatedPath) : false
  if (typeof reportedTruncation !== 'boolean') throw new Error('MCP_DATASET_TRUNCATION_INVALID')
  const total = selectors.totalPath ? readPath(document, selectors.totalPath) : undefined
  if (total !== undefined && (typeof total !== 'number' || !Number.isSafeInteger(total) || total < sourceRows.length))
    throw new Error('MCP_DATASET_TOTAL_INVALID')
  if (selectors.scope === 'full_query_result' && !reportedTruncation && total !== undefined && total !== sourceRows.length)
    throw new Error('MCP_DATASET_TOTAL_INVALID')
  const truncated = reportedTruncation || sourceRows.length > maxRows
  const complete = selectors.scope === 'full_query_result' && !truncated
  const dataAsOf = selectors.dataAsOfPath ? readPath(document, selectors.dataAsOfPath) : undefined
  if (dataAsOf !== undefined && !validTimestamp(dataAsOf)) throw new Error('MCP_DATASET_FRESHNESS_INVALID')
  return {
    columns: selectors.columns.map(({ key, semanticRef }) => ({ key, ...(semanticRef ? { semanticRef } : {}) })), rows,
    completeness: { returnedRows: rows.length, scope: complete ? 'full_query_result' : 'page', truncated,
      totalAccuracy: total !== undefined || complete ? 'exact' : 'unknown',
      ...(typeof total === 'number' ? { totalRows: total } : complete ? { totalRows: rows.length } : {}) },
    sourceFetchedAt: new Date().toISOString(), ...(typeof dataAsOf === 'string' ? { dataAsOf } : {})
  }
}

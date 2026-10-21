import Decimal from 'decimal.js'
import type { AnalyticsValue } from '@xpert-ai/contracts'
import type { Column } from './schema'

export const Exact = Decimal.clone({ precision: 160, toExpNeg: -160, toExpPos: 160 })
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
export function cell(value: unknown, column: Column, format: 'csv' | 'json' | 'xlsx'): AnalyticsValue {
  if ((value === null || (typeof value === 'string' && column.nullValues.includes(value))) && column.nullable) return null
  if (value instanceof Date && format === 'xlsx' && Number.isFinite(value.getTime()))
    value = column.logicalType === 'date' ? value.toISOString().slice(0, 10) : value.toISOString()
  if (typeof value === 'string' && value.length > 4096) throw new Error('FILE_DATASET_CELL_LIMIT')
  const text = typeof value === 'string' ? value : undefined
  switch (column.logicalType) {
    case 'string': if (text !== undefined) return text; break
    case 'boolean':
      if (typeof value === 'boolean') return value
      if (format === 'csv' && (text === 'true' || text === 'false')) return text === 'true'
      break
    case 'int64': {
      const exact = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : text
      if (exact && /^-?\d{1,19}$/.test(exact) && BigInt(exact) >= -(2n ** 63n) && BigInt(exact) < 2n ** 63n) return BigInt(exact).toString()
      break
    }
    case 'decimal': {
      // JSON decimals must be strings. Excel numeric cells carry Excel's stored numeric precision.
      const exact = format === 'xlsx' && typeof value === 'number' && Number.isFinite(value) ? new Exact(value).toFixed() : text
      if (exact && /^-?\d{1,60}(\.\d{1,30})?$/.test(exact)) return new Exact(exact).toFixed()
      break
    }
    case 'float64': {
      const number = format === 'csv' && text && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text) ? Number(text) : value
      if (typeof number === 'number' && Number.isFinite(number)) return number
      break
    }
    case 'date': if (text && date(text)) return text; break
    case 'timestamp': if (text && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(text) && date(text.slice(0, 10)) && Number.isFinite(Date.parse(text))) return text; break
  }
  throw new Error(`FILE_DATASET_FIELD_TYPE_INVALID: ${column.key}`)
}
export function compare(a: AnalyticsValue, b: AnalyticsValue, type: Column['logicalType']): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1
  if (type === 'decimal' || type === 'int64' || type === 'float64') return new Exact(String(a)).comparedTo(String(b))
  if (type === 'timestamp') return Math.sign(Date.parse(String(a)) - Date.parse(String(b)))
  return a === b ? 0 : a < b ? -1 : 1
}

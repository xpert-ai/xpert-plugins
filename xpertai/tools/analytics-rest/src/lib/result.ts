import type { AnalyticsValue } from '@xpert-ai/contracts'
import type { RestColumn } from './schema'
import { readPath } from './schema'

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
export const validTimestamp = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value))

export function mapCell(row: unknown, column: RestColumn): AnalyticsValue {
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
  throw new Error('REST_DATASET_FIELD_TYPE_INVALID')
}

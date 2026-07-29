import type { IColumnDef } from '@xpert-ai/plugin-sdk'

export const CLICKHOUSE_ICON = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
  '<rect width="64" height="64" rx="8" fill="#ffcc01"/>',
  '<g fill="#111">',
  '<path d="M10 10h6v44h-6zM22 10h6v44h-6zM34 10h6v44h-6zM46 10h6v18h-6z"/>',
  '<path d="M46 36h6v18h-6z"/>',
  '</g></svg>'
].join('')

export function typeToClickHouse(type: string): string {
  switch (type.toLowerCase()) {
    case 'int':
    case 'integer':
    case 'number':
      return 'Int32'
    case 'bigint':
      return 'Int64'
    case 'float':
      return 'Float32'
    case 'double':
      return 'Float64'
    case 'boolean':
    case 'bool':
      return 'UInt8'
    case 'date':
      return 'Date'
    case 'datetime':
    case 'timestamp':
      return 'DateTime'
    case 'time':
    case 'string':
    case 'text':
    default:
      return 'String'
  }
}

export function clickHouseTypeToColumnType(type: string): IColumnDef['type'] {
  const normalized = type.replace(/^Nullable\((.*)\)$/, '$1')

  if (/^(U?Int|Float|Decimal)/.test(normalized)) {
    return 'number'
  }
  if (/^(Bool)$/.test(normalized)) {
    return 'boolean'
  }
  if (/^(Date|DateTime)/.test(normalized)) {
    return 'timestamp'
  }
  if (/^(Array|Map|Tuple|Nested|Object|JSON)/.test(normalized)) {
    return 'object'
  }
  return 'string'
}

export function valueToColumnType(value: unknown): IColumnDef['type'] {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return 'number'
  }
  if (typeof value === 'boolean') {
    return 'boolean'
  }
  if (value instanceof Date) {
    return 'timestamp'
  }
  if (value !== null && typeof value === 'object') {
    return 'object'
  }
  return 'string'
}

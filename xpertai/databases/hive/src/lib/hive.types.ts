import type { IColumnDef } from '@xpert-ai/plugin-sdk'

export const HIVE_ICON = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
  '<rect width="64" height="64" rx="8" fill="#f9c80e"/>',
  '<path fill="#1f2937" d="M13 16h8v13h22V16h8v32h-8V36H21v12h-8z"/>',
  '</svg>'
].join('')

export function hiveTypeToColumnType(
  type: string | number
): IColumnDef['type'] {
  if (typeof type === 'number') {
    return [1, 2, 3, 4, 5, 6, 7, 15].includes(type)
      ? 'number'
      : [9, 10].includes(type)
        ? 'timestamp'
        : 'string'
  }
  const normalized = type.toLowerCase()
  if (
    [
      'tinyint',
      'smallint',
      'int',
      'integer',
      'bigint',
      'float',
      'double',
      'decimal'
    ].some((value) => normalized.startsWith(value))
  ) {
    return 'number'
  }
  if (normalized === 'boolean') {
    return 'boolean'
  }
  if (normalized.startsWith('timestamp') || normalized === 'date') {
    return 'timestamp'
  }
  if (
    normalized.startsWith('array') ||
    normalized.startsWith('map') ||
    normalized.startsWith('struct') ||
    normalized === 'json'
  ) {
    return 'object'
  }
  return 'string'
}

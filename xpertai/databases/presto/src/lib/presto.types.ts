import type { IColumnDef, IDSSchema } from '@xpert-ai/plugin-sdk'

export const PRESTO_ICON = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
  '<rect width="64" height="64" rx="8" fill="#5890ff"/>',
  '<path fill="#fff" d="M18 13h16c10 0 17 6 17 15 0 10-7 16-18 16h-7v8h-8V13zm8 8v15h7c6 0 10-3 10-8 0-4-4-7-10-7h-7z"/>',
  '</svg>'
].join('')

export interface PrestoMetadataRow {
  [column: string]: unknown
}

export function quotePrestoLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function prestoTypeToColumnType(
  type: string
): IColumnDef['type'] {
  const normalized = type.trim().toLowerCase()
  if (
    /^(tinyint|smallint|integer|bigint|real|double|decimal)(\b|\()/.test(
      normalized
    )
  ) {
    return 'number'
  }
  if (normalized === 'boolean') {
    return 'boolean'
  }
  if (
    normalized === 'date' ||
    normalized.startsWith('time') ||
    normalized.startsWith('timestamp')
  ) {
    return 'timestamp'
  }
  if (
    normalized.startsWith('array(') ||
    normalized.startsWith('map(') ||
    normalized.startsWith('row(') ||
    normalized === 'json'
  ) {
    return 'object'
  }
  return 'string'
}

export function convertPrestoSchema(
  rows: PrestoMetadataRow[]
): IDSSchema[] {
  const schemas = groupRowsBy(rows, 'table_schema')

  return Array.from(schemas, ([schema, schemaRows]) => {
    const tables = groupRowsBy(schemaRows, 'table_name')
    return {
      schema,
      name: schema,
      tables: Array.from(tables, ([table, columnRows]) => ({
        schema,
        name: table,
        columns: columnRows
          .filter((row) => typeof row.column_name === 'string')
          .map<IColumnDef>((row) => {
            const dataType = requireString(row, 'data_type')
            return {
              name: requireString(row, 'column_name'),
              type: prestoTypeToColumnType(dataType),
              dataType,
              nullable: row.is_nullable === 'YES',
              position: optionalNumber(row.ordinal_position)
            }
          })
      }))
    }
  })
}

function groupRowsBy(
  rows: PrestoMetadataRow[],
  property: string
): Map<string, PrestoMetadataRow[]> {
  const groups = new Map<string, PrestoMetadataRow[]>()
  for (const row of rows) {
    const key = requireString(row, property)
    const group = groups.get(key)
    if (group) {
      group.push(row)
    } else {
      groups.set(key, [row])
    }
  }
  return groups
}

function requireString(
  row: PrestoMetadataRow,
  property: string
): string {
  const value = row[property]
  if (typeof value !== 'string') {
    throw new Error(`Presto row property "${property}" must be a string`)
  }
  return value
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

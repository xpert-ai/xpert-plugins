import type {
  ColumnDef,
  IColumnDef,
  IDSSchema
} from '@xpert-ai/plugin-sdk'

export const POSTGRES_ICON = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
  '<rect width="64" height="64" rx="8" fill="#336791"/>',
  '<path fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M18 42c-5-7-5-23 4-27 7-4 19-2 23 5 3 5 1 13-1 19-2 7 4 7 2 11-2 4-8 0-10-4-2-3-2-8-1-13-2 2-5 3-8 2-5-2-5-9-2-12 4-4 11-2 12 4 1 5-3 11-8 13-4 2-8 1-11-1"/>',
  '</svg>'
].join('')

export interface PostgresRow {
  [column: string]: unknown
}

export interface PostgresColumnOptions {
  precision?: number
  scale?: number
}

export function isPostgresRow(value: unknown): value is PostgresRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function requireRowString(row: PostgresRow, property: string): string {
  const value = row[property]
  if (typeof value !== 'string') {
    throw new Error(`PostgreSQL row property "${property}" must be a string`)
  }
  return value
}

export function optionalRowString(
  row: PostgresRow,
  property: string
): string | undefined {
  const value = row[property]
  return typeof value === 'string' ? value : undefined
}

export function optionalRowNumber(
  row: PostgresRow,
  property: string
): number | undefined {
  const value = row[property]
  return typeof value === 'number' ? value : undefined
}

export function quotePostgresIdentifier(value: string): string {
  if (!value) {
    throw new Error('PostgreSQL identifier must not be empty')
  }
  return `"${value.replaceAll('"', '""')}"`
}

export function quotePostgresLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function qualifyPostgresTable(
  schema: string | undefined,
  table: string
): string {
  return schema
    ? `${quotePostgresIdentifier(schema)}.${quotePostgresIdentifier(table)}`
    : quotePostgresIdentifier(table)
}

export function getPostgresSchemaQuery(
  schemaName?: string,
  tableName?: string
): string {
  const tableSchema = schemaName
    ? `cols.table_schema = ${quotePostgresLiteral(schemaName)}`
    : "cols.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'pg_toast_temp_1', 'pg_temp_1')"

  if (tableName) {
    return [
      'SELECT cols.table_schema, cols.table_name, cols.column_name, cols.data_type,',
      'cols.character_maximum_length, cols.ordinal_position, cols.is_nullable,',
      'pg_catalog.col_description(c.oid, cols.ordinal_position::int) AS column_comment,',
      "pg_catalog.obj_description(c.oid, 'pg_class') AS table_comment",
      'FROM pg_catalog.pg_class c, information_schema.columns cols',
      `WHERE ${tableSchema}`,
      `AND cols.table_name = ${quotePostgresLiteral(tableName)}`,
      'AND cols.table_name = c.relname',
      'ORDER BY cols.ordinal_position'
    ].join(' ')
  }

  const schemaFilter = schemaName
    ? `t.table_schema = ${quotePostgresLiteral(schemaName)}`
    : "t.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'pg_toast_temp_1', 'pg_temp_1')"
  return [
    'SELECT t.table_schema, t.table_name,',
    "pg_catalog.obj_description(pgc.oid, 'pg_class') AS table_comment",
    'FROM information_schema.tables t',
    'INNER JOIN pg_catalog.pg_class pgc ON t.table_name = pgc.relname',
    `WHERE ${schemaFilter}`
  ].join(' ')
}

export function convertPostgresSchema(rows: PostgresRow[]): IDSSchema[] {
  const schemas = groupRowsBy(rows, 'table_schema')

  return Array.from(schemas, ([schema, schemaRows]) => {
    const tableGroups = groupRowsBy(schemaRows, 'table_name')
    return {
      schema,
      name: schema,
      tables: Array.from(tableGroups, ([table, tableRows]) => ({
        schema,
        name: table,
        label: optionalRowString(tableRows[0], 'table_comment'),
        columns: tableRows
          .filter((row) => typeof row.column_name === 'string')
          .map<IColumnDef>((row) => {
            const dataType = requireRowString(row, 'data_type')
            return {
              name: requireRowString(row, 'column_name'),
              type: postgresTypeToColumnType(dataType),
              label: optionalRowString(row, 'column_comment'),
              dataType,
              nullable: optionalRowString(row, 'is_nullable') === 'YES',
              position: optionalRowNumber(row, 'ordinal_position')
            }
          })
      }))
    }
  })
}

export function postgresTypeToColumnType(type: string): IColumnDef['type'] {
  const normalized = type.toLowerCase()
  if (
    [
      'numeric',
      'int',
      'int4',
      'int8',
      'integer',
      'float',
      'float4',
      'float8',
      'double',
      'real',
      'bigint',
      'smallint',
      'double precision',
      'decimal'
    ].includes(normalized)
  ) {
    return 'number'
  }
  if (normalized.includes('bool')) {
    return 'boolean'
  }
  if (
    normalized.includes('timestamp') ||
    normalized === 'date' ||
    normalized.startsWith('time')
  ) {
    return 'timestamp'
  }
  if (normalized.includes('json') || normalized.endsWith('[]')) {
    return 'object'
  }
  return 'string'
}

export function typeToPostgres(
  type: string,
  length?: number,
  precision?: number,
  scale?: number,
  enumValues?: string[]
): string {
  switch (type.toLowerCase()) {
    case 'smallint':
      return 'SMALLINT'
    case 'number':
    case 'int':
    case 'integer':
      return 'INTEGER'
    case 'bigint':
      return 'BIGINT'
    case 'serial':
      return 'SERIAL'
    case 'bigserial':
      return 'BIGSERIAL'
    case 'real':
      return 'REAL'
    case 'float':
    case 'double':
      return 'DOUBLE PRECISION'
    case 'decimal':
    case 'numeric':
      return `NUMERIC(${precision ?? 10}, ${scale ?? 2})`
    case 'money':
      return 'MONEY'
    case 'char':
    case 'character':
      return `CHAR(${length ?? 255})`
    case 'string':
    case 'varchar':
    case 'character varying':
      return `VARCHAR(${length ?? 200})`
    case 'text':
      return 'TEXT'
    case 'bytea':
      return 'BYTEA'
    case 'date':
      return 'DATE'
    case 'time':
      return 'TIME'
    case 'timetz':
      return 'TIME WITH TIME ZONE'
    case 'datetime':
      return 'TIMESTAMP'
    case 'timestamp':
      return 'TIMESTAMP WITH TIME ZONE'
    case 'interval':
      return 'INTERVAL'
    case 'boolean':
    case 'bool':
      return 'BOOLEAN'
    case 'enum':
      if (!enumValues?.length) {
        throw new Error('ENUM type requires at least one enum value')
      }
      return 'VARCHAR(200)'
    case 'json':
      return 'JSON'
    case 'object':
    case 'jsonb':
      return 'JSONB'
    case 'uuid':
      return 'UUID'
    case 'array_int':
      return 'INTEGER[]'
    case 'array_varchar':
      return `VARCHAR(${length ?? 200})[]`
    case 'array_text':
      return 'TEXT[]'
    case 'array_jsonb':
      return 'JSONB[]'
    case 'point':
      return 'POINT'
    case 'line':
      return 'LINE'
    case 'circle':
      return 'CIRCLE'
    case 'xml':
      return 'XML'
    case 'hstore':
      return 'HSTORE'
    default:
      return 'VARCHAR(200)'
  }
}

export function readPostgresColumnOptions(
  column: ColumnDef
): PostgresColumnOptions {
  let precision: number | undefined
  let scale: number | undefined

  if ('precision' in column && typeof column.precision === 'number') {
    precision = column.precision
  }
  if ('scale' in column && typeof column.scale === 'number') {
    scale = column.scale
  }

  return { precision, scale }
}

export function formatPostgresDefaultValue(
  value: string,
  type: string
): string {
  const upperValue = value.toUpperCase()
  const lowerValue = value.toLowerCase()
  const timeFunctions = new Set([
    'CURRENT_DATE',
    'CURRENT_TIME',
    'CURRENT_TIMESTAMP',
    'NOW()',
    'LOCALTIME',
    'LOCALTIMESTAMP'
  ])

  if (lowerValue === 'uuid_generate_v4()') {
    return 'uuid_generate_v4()'
  }
  if (timeFunctions.has(upperValue)) {
    return upperValue
  }
  if (
    [
      'string',
      'text',
      'uuid',
      'varchar',
      'date',
      'datetime',
      'timestamp',
      'time'
    ].includes(type.toLowerCase())
  ) {
    return quotePostgresLiteral(value)
  }
  if (type.toLowerCase() === 'boolean' || type.toLowerCase() === 'bool') {
    return lowerValue === 'true' ? 'TRUE' : 'FALSE'
  }
  return value
}

export function postgresDatabaseTypeToApplicationType(type: string): string {
  const normalized = type.toLowerCase()
  if (['integer', 'int', 'int4', 'smallint'].includes(normalized)) {
    return 'number'
  }
  if (['bigint', 'int8'].includes(normalized) || normalized.includes('serial')) {
    return 'bigint'
  }
  if (normalized.includes('decimal') || normalized.includes('numeric')) {
    return 'decimal'
  }
  if (
    normalized.includes('float') ||
    normalized.includes('double') ||
    normalized.includes('real')
  ) {
    return 'float'
  }
  if (
    normalized.includes('varchar') ||
    normalized === 'char' ||
    normalized === 'character varying'
  ) {
    return 'string'
  }
  if (normalized === 'text' || normalized === 'uuid') {
    return normalized
  }
  if (normalized.includes('bool')) {
    return 'boolean'
  }
  if (normalized === 'date') {
    return 'date'
  }
  if (normalized === 'time' || normalized.includes('time without')) {
    return 'time'
  }
  if (normalized.includes('timestamp without')) {
    return 'datetime'
  }
  if (normalized.includes('timestamp') || normalized.includes('timestamptz')) {
    return 'timestamp'
  }
  if (normalized.includes('json')) {
    return 'object'
  }
  return 'string'
}

function groupRowsBy(
  rows: PostgresRow[],
  property: string
): Map<string, PostgresRow[]> {
  const groups = new Map<string, PostgresRow[]>()
  for (const row of rows) {
    const key = requireRowString(row, property)
    const group = groups.get(key)
    if (group) {
      group.push(row)
    } else {
      groups.set(key, [row])
    }
  }
  return groups
}

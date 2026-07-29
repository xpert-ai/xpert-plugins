import { ClickHouse } from 'clickhouse'
import {
  BaseSQLQueryRunner,
  CreationTable,
  IColumnDef,
  IDSSchema,
  QueryOptions,
  QueryResult,
  SQLAdapterOptions
} from '@xpert-ai/plugin-sdk'
import {
  clickHouseTypeToColumnType,
  typeToClickHouse,
  valueToColumnType
} from './clickhouse.types.js'

export const CLICKHOUSE_TYPE = 'clickhouse'

const DEFAULT_URL = 'http://127.0.0.1:8123'
const DEFAULT_PORT = 8123

export interface ClickHouseAdapterOptions extends SQLAdapterOptions {
  dbname?: string
  timeout?: number
  verify?: boolean
}

interface ClickHouseRow {
  [column: string]: unknown
}

interface ClickHouseCursor {
  toPromise(): Promise<object[]>
}

export interface ClickHouseClient {
  query(query: string): ClickHouseCursor
  insert(query: string, data: object): ClickHouseCursor
}

export class ClickHouseImportError extends Error {
  readonly statements: string[]

  constructor(message: string, statements: string[], cause: unknown) {
    super(message, { cause })
    this.name = 'ClickHouseImportError'
    this.statements = statements
  }
}

export class ClickHouseRunner extends BaseSQLQueryRunner<ClickHouseAdapterOptions> {
  override readonly name = 'ClickHouse'
  override readonly type = CLICKHOUSE_TYPE
  override readonly jdbcDriver = 'ru.yandex.clickhouse.ClickHouseDriver'

  override jdbcUrl(schema?: string): string {
    const database = schema ?? this.options?.dbname ?? this.options?.catalog ?? ''
    const query = this.options?.username
      ? `?user=${encodeURIComponent(this.options.username)}&password=${encodeURIComponent(this.options.password ?? '')}`
      : ''
    return `jdbc:clickhouse://${this.host}:${this.port}/${encodeURIComponent(database)}${query}`
  }

  override get configurationSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        url: { type: 'string', default: DEFAULT_URL },
        host: { type: 'string', default: 'localhost' },
        port: { type: 'number', default: DEFAULT_PORT },
        username: { type: 'string', default: 'default' },
        password: { type: 'string', title: 'Password' },
        dbname: { type: 'string', title: 'Database Name' },
        timeout: {
          type: 'number',
          title: 'Request Timeout',
          default: 30
        },
        verify: {
          type: 'boolean',
          title: 'Verify SSL certificate',
          default: true
        }
      },
      order: ['url', 'username', 'password', 'dbname'],
      required: ['dbname'],
      extra_options: ['timeout', 'verify'],
      secret: ['password']
    }
  }

  protected getClient(catalog?: string): ClickHouseClient {
    const options = this.options
    if (!options) {
      throw new Error('ClickHouse connection options are required')
    }

    const basicAuth = options.username
      ? {
          username: options.username,
          password: options.password
        }
      : null

    return new ClickHouse({
      url: options.url || DEFAULT_URL,
      debug: false,
      basicAuth,
      isUseGzip: false,
      format: 'json',
      raw: false,
      config: {
        output_format_json_quote_64bit_integers: 0,
        enable_http_compression: 0,
        database: catalog ?? options.dbname ?? options.catalog
      }
    })
  }

  override async runQuery(
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult<ClickHouseRow>> {
    const rows = parseRows(
      await this.getClient(options?.catalog).query(query).toPromise()
    )
    const columns = rows[0]
      ? Object.entries(rows[0]).map<IColumnDef>(([name, value]) => ({
          name,
          type: valueToColumnType(value),
          dataType: valueToColumnType(value)
        }))
      : []

    return {
      status: 'OK',
      data: rows,
      columns
    }
  }

  override async getCatalogs(): Promise<IDSSchema[]> {
    const result = await this.runQuery(
      "SELECT name, engine FROM system.databases WHERE (name NOT IN ('system')) AND (engine NOT IN ('Memory'))"
    )

    return (result.data ?? []).map((row) => ({
      schema: requireString(row, 'name'),
      name: requireString(row, 'name'),
      type: requireString(row, 'engine')
    }))
  }

  override async getSchema(catalog?: string, tableName?: string): Promise<IDSSchema[]> {
    const filters = catalog
      ? [`database = ${quoteString(catalog)}`]
      : ["database NOT IN ('system')"]
    if (tableName) {
      filters.push(`table = ${quoteString(tableName)}`)
    }

    const result = await this.runQuery(
      `SELECT database, table, name, type FROM system.columns WHERE ${filters.join(' AND ')}`
    )
    const databaseGroups = groupRowsBy(result.data ?? [], 'database')

    return Array.from(databaseGroups, ([database, databaseRows]) => {
      const tableGroups = groupRowsBy(databaseRows, 'table')
      return {
        schema: database,
        name: database,
        tables: Array.from(tableGroups, ([table, columnRows]) => ({
          schema: database,
          name: table,
          columns: columnRows.map((row) => {
            const dataType = requireString(row, 'type')
            return {
              name: requireString(row, 'name'),
              dataType,
              type: clickHouseTypeToColumnType(dataType)
            }
          })
        }))
      }
    })
  }

  override async describe(catalog: string, statement: string) {
    if (!statement.trim()) {
      return { columns: [] }
    }

    const normalizedStatement = statement.trim().replace(/;$/, '')
    return this.runQuery(`${normalizedStatement} LIMIT 1`, { catalog })
  }

  override async createCatalog(catalog: string): Promise<void> {
    await this.runQuery(`CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(catalog)}`)
  }

  override async import(
    params: CreationTable,
    options?: { catalog?: string }
  ): Promise<void> {
    const data: unknown[] = params.data ?? []
    if (!data.length) {
      throw new Error('ClickHouse import data is empty')
    }

    const tableName = qualifyTableName(options?.catalog ?? params.catalog, params.name)
    const dropTableStatement = `DROP TABLE IF EXISTS ${tableName}`
    const createTableStatement =
      `CREATE TABLE IF NOT EXISTS ${tableName} (` +
      params.columns
        .map(
          (column) =>
            `${quoteIdentifier(column.fieldName)} ${typeToClickHouse(column.type)}`
        )
        .join(', ') +
      ') ENGINE = MergeTree() ORDER BY tuple()'

    const values = data.map((row, rowIndex) => {
      if (!isClickHouseRow(row)) {
        throw new Error(`ClickHouse import row ${rowIndex} must be an object`)
      }

      return params.columns.map((column) =>
        normalizeImportValue(row[column.name], column.type, rowIndex, column.name)
      )
    })

    const client = this.getClient()
    try {
      if (params.mergeType === 'DELETE') {
        await this.runQuery(dropTableStatement)
      }

      await this.runQuery(createTableStatement)

      const batchSize = 10_000
      for (let index = 0; index < values.length; index += batchSize) {
        const batch = values.slice(index, index + batchSize)
        await client.insert(`INSERT INTO ${tableName}`, batch).toPromise()
      }
    } catch (error) {
      throw new ClickHouseImportError(
        error instanceof Error ? error.message : 'Unknown ClickHouse import error',
        [dropTableStatement, createTableStatement],
        error
      )
    }
  }

  override async teardown(): Promise<void> {
    // The clickhouse HTTP client does not retain a connection pool.
  }
}

function parseRows(rows: object[]): ClickHouseRow[] {
  return rows.map((row, index) => {
    if (!isClickHouseRow(row)) {
      throw new Error(`ClickHouse returned an invalid row at index ${index}`)
    }
    return row
  })
}

function isClickHouseRow(value: unknown): value is ClickHouseRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(row: ClickHouseRow, property: string): string {
  const value = row[property]
  if (typeof value !== 'string') {
    throw new Error(`ClickHouse row property "${property}" must be a string`)
  }
  return value
}

function groupRowsBy(
  rows: ClickHouseRow[],
  property: string
): Map<string, ClickHouseRow[]> {
  const groups = new Map<string, ClickHouseRow[]>()
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

function quoteString(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`
}

function quoteIdentifier(value: string): string {
  if (!value) {
    throw new Error('ClickHouse identifier must not be empty')
  }
  return `\`${value.replaceAll('`', '``')}\``
}

function qualifyTableName(catalog: string | undefined, table: string): string {
  return catalog
    ? `${quoteIdentifier(catalog)}.${quoteIdentifier(table)}`
    : quoteIdentifier(table)
}

function normalizeImportValue(
  value: unknown,
  type: string,
  rowIndex: number,
  columnName: string
): unknown {
  const normalizedType = type.toLowerCase()
  const isDate = normalizedType === 'date'
  const isDateTime = normalizedType === 'datetime' || normalizedType === 'timestamp'
  const isTime = normalizedType === 'time'

  if (value instanceof Date) {
    return formatDate(value, isDate, isDateTime, isTime)
  }

  if (!isDate && !isDateTime && !isTime) {
    return value
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(
      `ClickHouse import value in row ${rowIndex} column "${columnName}" is not a valid date`
    )
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `ClickHouse import value "${value}" in row ${rowIndex} column "${columnName}" is not a valid date`
    )
  }
  return formatDate(parsed, isDate, isDateTime, isTime)
}

function formatDate(
  value: Date,
  isDate: boolean,
  isDateTime: boolean,
  isTime: boolean
): string {
  const isoValue = value.toISOString()
  if (isDate) {
    return isoValue.slice(0, 10)
  }
  if (isDateTime) {
    return isoValue.replace('T', ' ').slice(0, 19)
  }
  if (isTime) {
    return isoValue.slice(11, 19)
  }
  return isoValue
}

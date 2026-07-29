import * as sql from 'mssql'
import {
  BaseSQLQueryRunner,
  CreationTable,
  IColumnDef,
  IDSSchema,
  QueryOptions,
  QueryResult,
  SQLAdapterOptions
} from '@xpert-ai/plugin-sdk'
import { typeToMssql } from './mssql.types.js'

export const MSSQL_TYPE = 'mssql'

export interface MssqlAdapterOptions extends SQLAdapterOptions {
  database?: string
  queryTimeout?: number
  ssl_cert?: string
  ssl_key?: string
}

export interface MssqlRow {
  [column: string]: unknown
}

export interface MssqlDriverResult {
  recordset: MssqlRow[]
  rowsAffected?: number[]
}

export interface MssqlClientOptions {
  user: string
  password: string
  database: string
  server: string
  port: number
  requestTimeout?: number
  encrypt: boolean
  trustServerCertificate: boolean
}

export interface MssqlClient {
  query(
    statement: string,
    parameters?: Readonly<Record<string, unknown>>
  ): Promise<MssqlDriverResult>
  close(): Promise<void>
}

export type MssqlClientFactory = (
  options: MssqlClientOptions
) => MssqlClient

class NodeMssqlClient implements MssqlClient {
  private readonly pool: sql.ConnectionPool
  private connected = false

  constructor(options: MssqlClientOptions) {
    this.pool = new sql.ConnectionPool({
      user: options.user,
      password: options.password,
      database: options.database,
      server: options.server,
      port: options.port,
      requestTimeout: options.requestTimeout,
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30_000
      },
      options: {
        encrypt: options.encrypt,
        trustServerCertificate: options.trustServerCertificate
      }
    })
  }

  async query(
    statement: string,
    parameters: Readonly<Record<string, unknown>> = {}
  ): Promise<MssqlDriverResult> {
    if (!this.connected) {
      await this.pool.connect()
      this.connected = true
    }
    const request = this.pool.request()
    for (const [name, value] of Object.entries(parameters)) {
      request.input(name, value)
    }
    const result = await request.query<MssqlRow>(statement)
    return {
      recordset: [...result.recordset],
      rowsAffected: [...result.rowsAffected]
    }
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.pool.close()
      this.connected = false
    }
  }
}

const defaultClientFactory: MssqlClientFactory = (options) =>
  new NodeMssqlClient(options)

export class MssqlImportError extends Error {
  readonly statements: string[]

  constructor(statements: string[], cause: unknown) {
    super('Microsoft SQL Server import failed', { cause })
    this.name = 'MssqlImportError'
    this.statements = statements
  }
}

export function createMssqlConfigurationSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      host: { type: 'string' },
      port: { type: 'number', default: 0 },
      username: { type: 'string', title: 'Username' },
      password: { type: 'string', title: 'Password' },
      database: { type: 'string', title: 'Database' },
      use_ssl: { type: 'boolean', title: 'Use SSL' },
      ssl_cacert: {
        type: 'textarea',
        title: 'CA certificate',
        depend: 'use_ssl'
      },
      ssl_cert: {
        type: 'textarea',
        title: 'Client certificate',
        depend: 'use_ssl'
      },
      ssl_key: {
        type: 'textarea',
        title: 'Client key',
        depend: 'use_ssl'
      },
      queryTimeout: {
        type: 'number',
        title: 'Query timeout'
      }
    },
    order: ['host', 'port', 'database', 'username', 'password'],
    required: ['username', 'password', 'database'],
    secret: ['password']
  }
}

export class MssqlRunner extends BaseSQLQueryRunner<MssqlAdapterOptions> {
  override readonly name = 'MSSQL'
  override readonly type = MSSQL_TYPE
  override readonly jdbcDriver =
    'com.microsoft.sqlserver.jdbc.SQLServerDriver'

  private readonly client: MssqlClient

  constructor(options?: MssqlAdapterOptions, ...args: unknown[]) {
    super(options)
    const factoryValue = args[0]
    let factory = defaultClientFactory
    if (factoryValue !== undefined) {
      if (!isClientFactory(factoryValue)) {
        throw new Error('MSSQL client factory must be a function')
      }
      factory = factoryValue
    }
    this.client = factory(buildClientOptions(options))
  }

  override jdbcUrl(): string {
    return (
      `jdbc:sqlserver://${this.host}:${this.port};` +
      `databaseName=${this.options?.database ?? ''};` +
      `user=${this.options?.username ?? ''};` +
      `password=${this.options?.password ?? ''};encrypt=false;`
    )
  }

  override get configurationSchema(): Record<string, unknown> {
    return createMssqlConfigurationSchema()
  }

  override async runQuery(
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult<MssqlRow>> {
    void options
    const result = await this.client.query(query)
    const first = result.recordset[0]
    const columns = first
      ? Object.entries(first).map<IColumnDef>(([name, value]) => ({
          name,
          type: valueToColumnType(value),
          dataType: typeof value
        }))
      : []
    return {
      status: 'OK',
      data: result.recordset,
      columns
    }
  }

  override async getCatalogs(): Promise<IDSSchema[]> {
    const result = await this.runQuery('SELECT name FROM sys.schemas')
    return (result.data ?? []).map((row) => ({
      name: requireString(row, 'name')
    }))
  }

  override async getSchema(
    schemaName?: string,
    tableName?: string
  ): Promise<IDSSchema[]> {
    const filters = schemaName
      ? [`TABLE_SCHEMA = ${quoteLiteral(schemaName)}`]
      : ['TABLE_SCHEMA IS NOT NULL']
    if (tableName) {
      filters.push(`TABLE_NAME = ${quoteLiteral(tableName)}`)
    }
    const result = await this.runQuery(
      [
        'SELECT TABLE_CATALOG AS table_catalog,',
        'TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name,',
        'COLUMN_NAME AS column_name, DATA_TYPE AS data_type',
        'FROM INFORMATION_SCHEMA.COLUMNS',
        `WHERE ${filters.join(' AND ')}`,
        'ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION'
      ].join(' ')
    )
    return convertSchema(result.data ?? [])
  }

  override async describe(
    catalog: string,
    statement: string
  ): Promise<{ columns?: QueryResult['columns'] }> {
    if (!statement) {
      return { columns: [] }
    }
    void catalog
    const normalized = statement.trim().replace(/;+$/, '')
    return this.runQuery(
      `SELECT TOP (1) * FROM (${normalized}) AS [xpert_describe]`
    )
  }

  override async createCatalog(schema: string): Promise<void> {
    const result = await this.client.query(
      'SELECT schema_name FROM information_schema.schemata WHERE schema_name = @schema',
      { schema }
    )
    if (!result.recordset.length) {
      throw new Error(`Schema "${schema}" does not exist.`)
    }
  }

  override async import(
    params: CreationTable,
    options?: QueryOptions
  ): Promise<void> {
    const schema = options?.catalog ?? this.options?.catalog ?? 'dbo'
    const table = qualifyTable(schema, params.name)
    const statements: string[] = []
    const dropStatement = `DROP TABLE IF EXISTS ${table}`
    const definitions = params.columns.map((column) => {
      const key = column.isKey ? ' PRIMARY KEY' : ''
      return `${quoteIdentifier(column.fieldName)} ${typeToMssql(
        column.type,
        column.length
      )}${key}`
    })
    const createStatement =
      `IF OBJECT_ID(${quoteLiteral(`${schema}.${params.name}`)}, 'U') IS NULL ` +
      `CREATE TABLE ${table} (${definitions.join(', ')})`
    try {
      if (params.mergeType !== 'APPEND') {
        statements.push(dropStatement)
        await this.client.query(dropStatement)
      }
      statements.push(createStatement)
      await this.client.query(createStatement)

      for (const [rowIndex, rowValue] of (params.data ?? []).entries()) {
        if (!isRow(rowValue)) {
          throw new Error(`MSSQL import row ${rowIndex} must be an object`)
        }
        const parameterEntries = params.columns.map((column, index) => [
          `p${index}`,
          rowValue[column.name]
        ] as const)
        const insertStatement =
          `INSERT INTO ${table} (` +
          params.columns
            .map((column) => quoteIdentifier(column.fieldName))
            .join(', ') +
          ') VALUES (' +
          parameterEntries.map(([name]) => `@${name}`).join(', ') +
          ')'
        statements.push(insertStatement)
        await this.client.query(
          insertStatement,
          Object.fromEntries(parameterEntries)
        )
      }
    } catch (error: unknown) {
      throw new MssqlImportError(statements, error)
    }
  }

  override async teardown(): Promise<void> {
    await this.client.close()
  }
}

function buildClientOptions(
  options?: MssqlAdapterOptions
): MssqlClientOptions {
  return {
    user: options?.username ?? '',
    password: options?.password ?? '',
    database: options?.database ?? '',
    server: options?.host ?? '',
    port: Number(options?.port ?? 0),
    requestTimeout: options?.queryTimeout,
    encrypt: Boolean(options?.use_ssl),
    trustServerCertificate: !options?.use_ssl
  }
}

function isClientFactory(value: unknown): value is MssqlClientFactory {
  return typeof value === 'function'
}

function isRow(value: unknown): value is MssqlRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(row: MssqlRow, property: string): string {
  const value = row[property]
  if (typeof value !== 'string') {
    throw new Error(`MSSQL row property "${property}" must be a string`)
  }
  return value
}

function quoteIdentifier(value: string): string {
  return `[${value.replaceAll(']', ']]')}]`
}

function quoteLiteral(value: string): string {
  return `N'${value.replaceAll("'", "''")}'`
}

function qualifyTable(schema: string, table: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`
}

function valueToColumnType(value: unknown): IColumnDef['type'] {
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

function convertSchema(rows: MssqlRow[]): IDSSchema[] {
  const schemas = new Map<string, MssqlRow[]>()
  for (const row of rows) {
    const schema = requireString(row, 'table_schema')
    schemas.set(schema, [...(schemas.get(schema) ?? []), row])
  }
  return Array.from(schemas, ([schema, schemaRows]) => {
    const tables = new Map<string, MssqlRow[]>()
    for (const row of schemaRows) {
      const table = requireString(row, 'table_name')
      tables.set(table, [...(tables.get(table) ?? []), row])
    }
    return {
      schema,
      name: schema,
      catalog:
        typeof schemaRows[0]?.table_catalog === 'string'
          ? schemaRows[0].table_catalog
          : undefined,
      tables: Array.from(tables, ([table, columnRows]) => ({
        schema,
        name: table,
        columns: columnRows.map((row) => {
          const dataType = requireString(row, 'data_type')
          return {
            name: requireString(row, 'column_name'),
            dataType,
            type: mssqlTypeToColumnType(dataType)
          }
        })
      }))
    }
  })
}

function mssqlTypeToColumnType(type: string): IColumnDef['type'] {
  const normalized = type.toLowerCase()
  if (
    /^(tinyint|smallint|int|bigint|decimal|numeric|float|real|money)/.test(
      normalized
    )
  ) {
    return 'number'
  }
  if (normalized === 'bit') {
    return 'boolean'
  }
  if (
    normalized.includes('date') ||
    normalized.includes('time')
  ) {
    return 'timestamp'
  }
  return 'string'
}

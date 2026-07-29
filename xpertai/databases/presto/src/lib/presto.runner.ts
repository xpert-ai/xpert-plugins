import { Client } from 'presto-client'
import {
  BaseSQLQueryRunner,
  IDSSchema,
  QueryOptions,
  QueryResult,
  SQLAdapterOptions
} from '@xpert-ai/plugin-sdk'
import {
  convertPrestoSchema,
  prestoTypeToColumnType,
  quotePrestoLiteral
} from './presto.types.js'

export const PRESTO_TYPE = 'presto'

const DEFAULT_CATALOG = 'hive'
const DEFAULT_SCHEMA = 'default'
const SYSTEM_SCHEMAS = new Set(['information_schema', 'pg_catalog'])

export type PrestoEngine = 'presto' | 'trino'

export interface PrestoAdapterOptions extends SQLAdapterOptions {
  catalog?: string
  schema?: string
  http_path?: string
  useSSL?: boolean
}

export interface PrestoClientOptions {
  host?: string
  port?: number
  user?: string
  source?: string
  catalog?: string
  schema?: string
  basic_auth?: {
    user: string
    password: string
  }
  ssl?: {
    rejectUnauthorized: boolean
  }
  engine?: PrestoEngine
}

export interface PrestoResultColumn {
  name: string
  type: string
}

export interface PrestoExecutionOptions {
  query: string
  catalog?: string
  schema?: string
  source?: string
  state?: (error: unknown, queryId: string, stats: unknown) => void
  columns?: (error: unknown, columns: PrestoResultColumn[]) => void
  data?: (
    error: unknown,
    rows: unknown[][],
    columns: PrestoResultColumn[],
    stats: unknown
  ) => void
  success: (error: unknown, stats: unknown, info?: unknown) => void
  error: (error: unknown) => void
}

export interface PrestoClient {
  execute(options: PrestoExecutionOptions): void
}

export type PrestoClientFactory = (
  options: PrestoClientOptions
) => PrestoClient

export interface PrestoRow {
  [column: string]: unknown
}

class NodePrestoClient implements PrestoClient {
  private readonly client: Client

  constructor(options: PrestoClientOptions) {
    this.client = new Client(options)
  }

  execute(options: PrestoExecutionOptions): void {
    this.client.execute(options)
  }
}

const defaultClientFactory: PrestoClientFactory = (options) =>
  new NodePrestoClient(options)

export function createPrestoConfigurationSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      host: { type: 'string' },
      port: { type: 'number' },
      http_path: { type: 'string', title: 'HTTP Path' },
      catalog: { type: 'string' },
      schema: { type: 'string' },
      username: { type: 'string', title: 'User' },
      password: { type: 'string', title: 'Password' },
      useSSL: {
        type: 'boolean',
        title: 'Use SSL',
        default: false
      }
    },
    order: [
      'host',
      'port',
      'http_path',
      'username',
      'password',
      'catalog',
      'schema'
    ],
    secret: ['password'],
    required: ['host', 'http_path']
  }
}

export class PrestoQueryRunner extends BaseSQLQueryRunner<PrestoAdapterOptions> {
  override readonly name: string = 'Presto'
  override readonly type: string = PRESTO_TYPE
  override readonly jdbcDriver: string =
    'com.facebook.presto.jdbc.prestodriver'

  protected readonly client: PrestoClient

  protected get engine(): PrestoEngine {
    return 'presto'
  }

  constructor(options?: PrestoAdapterOptions, ...args: unknown[]) {
    super(options)

    const factoryValue = args[0]
    let factory = defaultClientFactory
    if (factoryValue !== undefined) {
      if (!isPrestoClientFactory(factoryValue)) {
        throw new Error('Presto client factory must be a function')
      }
      factory = factoryValue
    }
    this.client = factory(buildClientOptions(options, this.engine))
  }

  override jdbcUrl(schema?: string): string {
    const catalog = encodeURIComponent(
      this.options?.catalog ?? DEFAULT_CATALOG
    )
    const schemaName = encodeURIComponent(
      schema ?? this.options?.schema ?? DEFAULT_SCHEMA
    )
    const properties: string[] = []
    if (this.options?.username) {
      properties.push(
        `user=${encodeURIComponent(this.options.username)}`
      )
    }
    if (this.options?.password) {
      properties.push(
        `password=${encodeURIComponent(this.options.password)}`
      )
    }
    if (this.options?.useSSL) {
      properties.push('SSL=true')
    }
    return (
      `jdbc:presto://${this.host}:${this.port}/${catalog}/${schemaName}?` +
      properties.join('&')
    )
  }

  override get configurationSchema(): Record<string, unknown> {
    return createPrestoConfigurationSchema()
  }

  async execute(
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult<PrestoRow>> {
    return new Promise((resolve, reject) => {
      let columns: PrestoResultColumn[] = []
      const rows: unknown[][] = []
      let settled = false

      const fail = (error: unknown, context: string): void => {
        if (settled) {
          return
        }
        settled = true
        reject(normalizeError(error, context))
      }

      this.client.execute({
        query,
        catalog: this.options?.catalog ?? DEFAULT_CATALOG,
        schema:
          options?.catalog ??
          this.options?.schema ??
          DEFAULT_SCHEMA,
        source: 'nodejs-client',
        columns: (error, resultColumns) => {
          if (error !== null && error !== undefined) {
            fail(error, 'Presto column metadata failed')
            return
          }
          columns = parseColumns(resultColumns)
        },
        data: (error, resultRows, resultColumns) => {
          if (error !== null && error !== undefined) {
            fail(error, 'Presto result page failed')
            return
          }
          if (!columns.length && resultColumns.length) {
            columns = parseColumns(resultColumns)
          }
          rows.push(...parseRows(resultRows))
        },
        success: (error, stats) => {
          if (error !== null && error !== undefined) {
            fail(error, 'Presto query failed')
            return
          }
          if (settled) {
            return
          }
          settled = true
          resolve({
            status: 'OK',
            data: rows.map((values) => rowFromValues(columns, values)),
            columns: columns.map((column) => ({
              name: column.name,
              type: prestoTypeToColumnType(column.type),
              dataType: column.type
            })),
            stats
          })
        },
        error: (error) => {
          fail(error, 'Presto query failed')
        }
      })
    })
  }

  override runQuery(
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult<PrestoRow>> {
    return this.execute(query, options)
  }

  override async getCatalogs(): Promise<IDSSchema[]> {
    const result = await this.execute('SHOW SCHEMAS')
    return (result.data ?? [])
      .map(readSchemaName)
      .filter((schema) => !SYSTEM_SCHEMAS.has(schema))
      .map((schema) => ({
        schema,
        name: schema
      }))
  }

  override async getSchema(
    schemaName?: string,
    tableName?: string
  ): Promise<IDSSchema[]> {
    const filters = schemaName
      ? [`table_schema = ${quotePrestoLiteral(schemaName)}`]
      : [
          "table_schema NOT IN ('information_schema', 'pg_catalog')"
        ]
    if (tableName) {
      filters.push(`table_name = ${quotePrestoLiteral(tableName)}`)
    }
    const result = await this.execute(
      [
        'SELECT table_schema, table_name, column_name, data_type,',
        'ordinal_position, is_nullable',
        'FROM information_schema.columns',
        `WHERE ${filters.join(' AND ')}`,
        'ORDER BY table_schema, table_name, ordinal_position'
      ].join(' ')
    )
    return convertPrestoSchema(result.data ?? [])
  }

  override async describe(
    catalog: string,
    statement: string
  ): Promise<{ columns?: QueryResult['columns'] }> {
    if (!statement) {
      return { columns: [] }
    }
    const query = `${statement.trim().replace(/;+$/, '')} LIMIT 1`
    return this.runQuery(query, { catalog })
  }

  override async createCatalog(): Promise<void> {
    throw new Error(
      'Presto catalogs are managed by the Presto server'
    )
  }

  override async teardown(): Promise<void> {
    return Promise.resolve()
  }
}

function buildClientOptions(
  options: PrestoAdapterOptions | undefined,
  engine: PrestoEngine
): PrestoClientOptions {
  const clientOptions: PrestoClientOptions = {
    host: options?.host,
    port: options?.port,
    user: options?.username || DEFAULT_CATALOG,
    catalog: options?.catalog,
    schema: options?.schema,
    engine
  }
  if (options?.username) {
    clientOptions.basic_auth = {
      user: options.username,
      password: options.password ?? ''
    }
  }
  if (options?.useSSL) {
    clientOptions.ssl = {
      rejectUnauthorized: true
    }
  }
  return clientOptions
}

function isPrestoClientFactory(
  value: unknown
): value is PrestoClientFactory {
  return typeof value === 'function'
}

function parseColumns(value: unknown): PrestoResultColumn[] {
  if (!Array.isArray(value)) {
    throw new Error('Presto columns must be an array')
  }
  return value.map((column) => {
    if (
      typeof column !== 'object' ||
      column === null ||
      !('name' in column) ||
      typeof column.name !== 'string' ||
      !('type' in column) ||
      typeof column.type !== 'string'
    ) {
      throw new Error('Presto returned an invalid column')
    }
    return {
      name: column.name,
      type: column.type
    }
  })
}

function parseRows(value: unknown): unknown[][] {
  if (!Array.isArray(value) || value.some((row) => !Array.isArray(row))) {
    throw new Error('Presto result data must be an array of rows')
  }
  return value
}

function rowFromValues(
  columns: PrestoResultColumn[],
  values: unknown[]
): PrestoRow {
  const row: PrestoRow = {}
  columns.forEach((column, index) => {
    row[column.name] = values[index]
  })
  return row
}

function readSchemaName(row: PrestoRow): string {
  const value = row.Schema ?? row.schema
  if (typeof value !== 'string') {
    throw new Error('Presto SHOW SCHEMAS returned an invalid row')
  }
  return value
}

function normalizeError(error: unknown, context: string): Error {
  if (error instanceof Error) {
    return error
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return new Error(error.message)
  }
  if (typeof error === 'string' && error) {
    return new Error(error)
  }
  return new Error(context)
}

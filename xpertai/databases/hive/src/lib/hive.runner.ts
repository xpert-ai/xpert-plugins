import {
  HiveClient,
  HiveUtils,
  auth,
  connections,
  thrift
} from 'hive-driver'
import {
  BaseSQLQueryRunner,
  IDSSchema,
  QueryOptions,
  QueryResult,
  SQLAdapterOptions
} from '@xpert-ai/plugin-sdk'
import { hiveTypeToColumnType } from './hive.types.js'

export const HIVE_TYPE = 'hive'

export interface HiveAdapterOptions extends SQLAdapterOptions {
  database?: string
  http_path?: string
  http_scheme?: string
}

export interface HiveRow {
  [column: string]: unknown
}

export interface HiveRuntimeColumn {
  name: string
  type: string | number
  label?: string
  position?: number
}

export interface HiveRuntimeResult {
  status: 'OK' | 'ERROR'
  rows: HiveRow[]
  columns: HiveRuntimeColumn[]
  stats: Record<string, unknown>
  error?: string
}

export interface HiveRuntime {
  execute(query: string): Promise<HiveRuntimeResult>
  schemas(): Promise<HiveRow[]>
  tables(schemaName?: string, tableName?: string): Promise<HiveRow[]>
  columns(schemaName?: string, tableName?: string): Promise<HiveRow[]>
  close(): Promise<void>
}

export type HiveRuntimeFactory = (
  options: HiveAdapterOptions
) => Promise<HiveRuntime>

interface DriverOperation {
  close(): Promise<unknown>
  getSchema(): unknown
}

interface DriverSession {
  executeStatement(
    query: string,
    options: { runAsync: boolean }
  ): Promise<DriverOperation>
  getSchemas(request: object): Promise<DriverOperation>
  getTables(request: {
    schemaName?: string
    tableName?: string
  }): Promise<DriverOperation>
  getColumns(request: {
    schemaName?: string
    tableName?: string
  }): Promise<DriverOperation>
  close(): Promise<unknown>
}

interface DriverHiveUtils {
  waitUntilReady(
    operation: DriverOperation,
    progress?: boolean,
    callback?: (state: unknown) => void
  ): Promise<unknown>
  fetchAll(operation: DriverOperation): Promise<unknown>
  getResult(operation: DriverOperation): {
    getValue(): unknown
  }
}

const { TCLIService, TCLIService_types } = thrift

const defaultRuntimeFactory: HiveRuntimeFactory = async (options) => {
  const client = new HiveClient(TCLIService, TCLIService_types)
  const connectionOptions: { path?: string } = {}
  if (options.http_path) {
    connectionOptions.path = options.http_path
  }
  const authentication = options.username
    ? new auth.PlainTcpAuthentication({
        username: options.username,
        password: options.password
      })
    : new auth.NoSaslAuthentication()
  const connectedClient = await client.connect(
    {
      host: options.host,
      port: Number(options.port),
      options: connectionOptions
    },
    new connections.TcpConnection(),
    authentication
  )
  const session = await connectedClient.openSession({
    client_protocol:
      TCLIService_types.TProtocolVersion.HIVE_CLI_SERVICE_PROTOCOL_V10
  })
  return new DriverHiveRuntime(
    connectedClient,
    session,
    new HiveUtils(TCLIService_types)
  )
}

export function createHiveConfigurationSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      host: { type: 'string' },
      port: { type: 'number' },
      database: { type: 'string' },
      username: { type: 'string' },
      password: { type: 'string', title: 'Password' },
      http_scheme: {
        type: 'string',
        title: 'HTTP Scheme (http or https)',
        default: 'https'
      },
      http_path: { type: 'string', title: 'HTTP Path' }
    },
    order: [
      'host',
      'port',
      'http_path',
      'username',
      'password',
      'database',
      'http_scheme'
    ],
    secret: ['password'],
    required: ['host', 'http_path']
  }
}

export class HiveQueryRunner extends BaseSQLQueryRunner<HiveAdapterOptions> {
  override readonly name = 'Hive'
  override readonly type = HIVE_TYPE
  override readonly jdbcDriver = 'org.apache.hive.jdbc.HiveDriver'

  private readonly runtimeFactory: HiveRuntimeFactory

  constructor(options?: HiveAdapterOptions, ...args: unknown[]) {
    super(options)
    const factoryValue = args[0]
    let factory = defaultRuntimeFactory
    if (factoryValue !== undefined) {
      if (!isRuntimeFactory(factoryValue)) {
        throw new Error('Hive runtime factory must be a function')
      }
      factory = factoryValue
    }
    this.runtimeFactory = factory
  }

  override jdbcUrl(catalog?: string): string {
    const database = encodeURIComponent(
      catalog ?? this.options?.database ?? ''
    )
    const path = this.options?.http_path ?? '/hive2'
    const transport = path
      ? `;transportMode=http;ssl=${this.options?.http_scheme !== 'http'};httpPath=${path}`
      : ''
    return `jdbc:hive2://${this.host}:${this.port}/${database}${transport}`
  }

  override get configurationSchema(): Record<string, unknown> {
    return createHiveConfigurationSchema()
  }

  override async runQuery(
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult<HiveRow>> {
    void options
    const result = await this.withRuntime((runtime) =>
      runtime.execute(query)
    )
    if (result.status === 'ERROR') {
      return {
        status: 'ERROR',
        error: result.error,
        stats: result.stats
      }
    }
    return {
      status: 'OK',
      data: result.rows,
      columns: result.columns.map((column) => ({
        name: normalizeColumnName(column.name),
        label: column.label,
        position: column.position,
        type: hiveTypeToColumnType(column.type),
        dataType: String(column.type)
      })),
      stats: result.stats
    }
  }

  override async getCatalogs(): Promise<IDSSchema[]> {
    const rows = await this.withRuntime((runtime) => runtime.schemas())
    return rows.map((row) => {
      const name = requireString(row, 'TABLE_SCHEM')
      return {
        catalog: optionalString(row.TABLE_CATALOG),
        schema: name,
        name,
        label: optionalString(row.REMARKS)
      }
    })
  }

  override async getSchema(
    schemaName?: string,
    tableName?: string
  ): Promise<IDSSchema[]> {
    const normalizedTable =
      schemaName && tableName?.startsWith(`${schemaName}.`)
        ? tableName.slice(schemaName.length + 1)
        : tableName
    const { tables, columns } = await this.withRuntime(async (runtime) => ({
      tables: await runtime.tables(schemaName, normalizedTable),
      columns: await runtime.columns(schemaName, normalizedTable)
    }))
    const schemaGroups = groupBy(tables, 'TABLE_SCHEM')

    return Array.from(schemaGroups, ([schema, schemaTables]) => ({
      schema,
      name: schema,
      tables: schemaTables.map((table) => {
        const name = requireString(table, 'TABLE_NAME')
        return {
          schema,
          name,
          label: optionalString(table.REMARKS),
          columns: columns
            .filter(
              (column) =>
                column.TABLE_SCHEM === schema &&
                column.TABLE_NAME === name
            )
            .map((column) => {
              const dataType = requireString(column, 'TYPE_NAME').toLowerCase()
              return {
                name: requireString(column, 'COLUMN_NAME'),
                dataType,
                type: hiveTypeToColumnType(dataType),
                label: optionalString(column.REMARKS),
                nullable: column.NULLABLE === 1
              }
            })
        }
      })
    }))
  }

  override async describe(
    catalog: string,
    statement: string
  ): Promise<{ columns?: QueryResult['columns'] }> {
    if (!statement) {
      return { columns: [] }
    }
    return this.runQuery(
      `${statement.trim().replace(/;+$/, '')} LIMIT 1`,
      { catalog }
    )
  }

  override async createCatalog(): Promise<void> {
    throw new Error('Hive schema creation is not implemented')
  }

  override async teardown(): Promise<void> {
    return Promise.resolve()
  }

  private async withRuntime<T>(
    operation: (runtime: HiveRuntime) => Promise<T>
  ): Promise<T> {
    if (!this.options) {
      throw new Error('Hive connection options are required')
    }
    const runtime = await this.runtimeFactory(this.options)
    try {
      return await operation(runtime)
    } finally {
      await runtime.close()
    }
  }
}

class DriverHiveRuntime implements HiveRuntime {
  constructor(
    private readonly client: HiveClient,
    private readonly session: DriverSession,
    private readonly utils: DriverHiveUtils
  ) {}

  async execute(query: string): Promise<HiveRuntimeResult> {
    const operation = await this.session.executeStatement(query, {
      runAsync: true
    })
    const stats: Record<string, unknown> = {}
    let executionError: string | undefined
    try {
      await this.utils.waitUntilReady(operation, false, (state: unknown) => {
        const task = parseTaskState(state)
        if (task) {
          Object.assign(stats, task)
          if (task.returnValue === 1) {
            executionError =
              typeof task.errorMsg === 'string'
                ? task.errorMsg
                : 'Hive query failed'
          }
        }
      })
      await this.utils.fetchAll(operation)
      return {
        status: executionError ? 'ERROR' : 'OK',
        error: executionError,
        rows: parseRows(this.utils.getResult(operation).getValue()),
        columns: parseColumns(operation.getSchema()),
        stats
      }
    } catch (error: unknown) {
      return {
        status: 'ERROR',
        error: errorMessage(error),
        rows: [],
        columns: [],
        stats
      }
    } finally {
      await operation.close()
    }
  }

  schemas(): Promise<HiveRow[]> {
    return this.fetchOperation(this.session.getSchemas({}))
  }

  tables(
    schemaName?: string,
    tableName?: string
  ): Promise<HiveRow[]> {
    return this.fetchOperation(
      this.session.getTables({ schemaName, tableName })
    )
  }

  columns(
    schemaName?: string,
    tableName?: string
  ): Promise<HiveRow[]> {
    return this.fetchOperation(
      this.session.getColumns({ schemaName, tableName })
    )
  }

  async close(): Promise<void> {
    await this.session.close()
    this.client.close()
  }

  private async fetchOperation(
    operationPromise: Promise<DriverOperation>
  ): Promise<HiveRow[]> {
    const operation = await operationPromise
    try {
      await this.utils.waitUntilReady(operation, false)
      await this.utils.fetchAll(operation)
      return parseRows(this.utils.getResult(operation).getValue())
    } finally {
      await operation.close()
    }
  }
}

function isRuntimeFactory(value: unknown): value is HiveRuntimeFactory {
  return typeof value === 'function'
}

function parseRows(value: unknown): HiveRow[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isRow)
}

function isRow(value: unknown): value is HiveRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseColumns(schema: unknown): HiveRuntimeColumn[] {
  if (!isRow(schema) || !Array.isArray(schema.columns)) {
    return []
  }
  return schema.columns.flatMap((value) => {
    if (!isRow(value) || typeof value.columnName !== 'string') {
      return []
    }
    const primitiveType =
      isRow(value.typeDesc) &&
      Array.isArray(value.typeDesc.types) &&
      isRow(value.typeDesc.types[0]) &&
      isRow(value.typeDesc.types[0].primitiveEntry)
        ? value.typeDesc.types[0].primitiveEntry.type
        : 'string'
    return [
      {
        name: value.columnName,
        type:
          typeof primitiveType === 'number' ||
          typeof primitiveType === 'string'
            ? primitiveType
            : 'string',
        label: optionalString(value.comment),
        position:
          typeof value.position === 'number' ? value.position : undefined
      }
    ]
  })
}

function parseTaskState(value: unknown): HiveRow | undefined {
  if (!isRow(value) || typeof value.taskStatus !== 'string') {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(value.taskStatus)
    return Array.isArray(parsed) && isRow(parsed[0])
      ? parsed[0]
      : undefined
  } catch {
    return undefined
  }
}

function normalizeColumnName(name: string): string {
  const parts = name.split('.')
  return parts[1] ?? parts[0]
}

function requireString(row: HiveRow, property: string): string {
  const value = row[property]
  if (typeof value !== 'string') {
    throw new Error(`Hive row property "${property}" must be a string`)
  }
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function groupBy(
  rows: HiveRow[],
  property: string
): Map<string, HiveRow[]> {
  const groups = new Map<string, HiveRow[]>()
  for (const row of rows) {
    const key = requireString(row, property)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return groups
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (
    isRow(error) &&
    isRow(error.response) &&
    typeof error.response.errorMessage === 'string'
  ) {
    return error.response.errorMessage
  }
  return 'Hive query failed'
}

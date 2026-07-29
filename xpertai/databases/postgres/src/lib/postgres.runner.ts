import { pipeline } from 'node:stream/promises'
import type { Writable } from 'node:stream'
import {
  BaseSQLQueryRunner,
  ColumnDef,
  CreationTable,
  DBCreateTableMode,
  DBTableAction,
  DBTableDataAction,
  DBTableDataParams,
  DBTableOperationParams,
  IDSSchema,
  QueryOptions,
  QueryResult,
  SQLAdapterOptions
} from '@xpert-ai/plugin-sdk'
import {
  Client,
  ClientConfig,
  QueryResultRow,
  types
} from 'pg'
import { from as copyFrom } from 'pg-copy-streams'
import { openCsvSource, readCsvHeader } from './postgres.csv.js'
import {
  PostgresRow,
  convertPostgresSchema,
  formatPostgresDefaultValue,
  getPostgresSchemaQuery,
  isPostgresRow,
  optionalRowString,
  postgresDatabaseTypeToApplicationType,
  postgresTypeToColumnType,
  qualifyPostgresTable,
  quotePostgresIdentifier,
  readPostgresColumnOptions,
  requireRowString,
  typeToPostgres
} from './postgres.types.js'

export const POSTGRES_TYPE = 'pg'

const DEFAULT_HOST = 'localhost'
const DEFAULT_PORT = 5432
const DEFAULT_DATABASE = 'postgres'

export function createPostgresConfigurationSchema(
  defaultDatabase = DEFAULT_DATABASE
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'number', default: DEFAULT_PORT },
      username: { type: 'string', default: '' },
      password: { type: 'string' },
      database: {
        type: 'string',
        title: 'Database Name',
        default: defaultDatabase
      },
      sslmode: {
        type: 'string',
        title: 'SSL Mode',
        default: 'prefer',
        extendedEnum: [
          { value: 'disable', name: 'Disable' },
          { value: 'allow', name: 'Allow' },
          { value: 'prefer', name: 'Prefer' },
          { value: 'require', name: 'Require' },
          { value: 'verify-ca', name: 'Verify CA' },
          { value: 'verify-full', name: 'Verify Full' }
        ]
      },
      sslrootcertFile: {
        type: 'textarea',
        title: 'SSL Root Certificate'
      },
      sslcertFile: {
        type: 'textarea',
        title: 'SSL Client Certificate'
      },
      sslkeyFile: {
        type: 'textarea',
        title: 'SSL Client Key'
      }
    },
    order: ['username', 'password', 'database'],
    required: ['database'],
    secret: [
      'password',
      'sslrootcertFile',
      'sslcertFile',
      'sslkeyFile'
    ],
    extra_options: [
      'sslmode',
      'sslrootcertFile',
      'sslcertFile',
      'sslkeyFile'
    ]
  }
}

export interface PostgresAdapterOptions extends SQLAdapterOptions {
  sslmode?: string
  sslrootcertFile?: string
  sslkeyFile?: string
  sslcertFile?: string
  database?: string
}

export interface PostgresDriverField {
  name: string
  dataTypeId: number
}

export interface PostgresDriverResult {
  rows: PostgresRow[]
  fields: PostgresDriverField[]
}

export interface PostgresClient {
  connect(): Promise<void>
  query(
    query: string,
    values?: readonly unknown[]
  ): Promise<PostgresDriverResult | PostgresDriverResult[]>
  copyFrom(statement: string): Writable
  end(): Promise<void>
}

export type PostgresClientFactory = (config: ClientConfig) => PostgresClient

interface NodePostgresRow extends QueryResultRow {
  [column: string]: unknown
}

class NodePostgresClient implements PostgresClient {
  private readonly client: Client

  constructor(config: ClientConfig) {
    this.client = new Client(config)
  }

  async connect(): Promise<void> {
    await this.client.connect()
  }

  async query(
    query: string,
    values: readonly unknown[] = []
  ): Promise<PostgresDriverResult | PostgresDriverResult[]> {
    const result: unknown = values.length
      ? await this.client.query<NodePostgresRow, unknown[]>(query, [...values])
      : await this.client.query<NodePostgresRow>(query)
    return parseDriverResult(result)
  }

  copyFrom(statement: string): Writable {
    return this.client.query(copyFrom(statement))
  }

  async end(): Promise<void> {
    await this.client.end()
  }
}

const defaultClientFactory: PostgresClientFactory = (config) =>
  new NodePostgresClient(config)

export class PostgresOperationError extends Error {
  readonly statements: string[]

  constructor(message: string, statements: string[], cause: unknown) {
    super(message, { cause })
    this.name = 'PostgresOperationError'
    this.statements = statements
  }
}

export class PostgresRunner extends BaseSQLQueryRunner<PostgresAdapterOptions> {
  override readonly name: string = 'Postgres'
  override readonly type: string = POSTGRES_TYPE
  override readonly jdbcDriver: string = 'org.postgresql.Driver'

  protected client: PostgresClient
  #clientConnected = false

  constructor(options?: PostgresAdapterOptions, ...args: unknown[]) {
    super(options)

    const factoryValue = args[0]
    if (factoryValue === undefined) {
      this.client = defaultClientFactory(buildClientConfig(options))
      return
    }
    if (!isPostgresClientFactory(factoryValue)) {
      throw new Error('PostgreSQL client factory must be a function')
    }
    this.client = factoryValue(buildClientConfig(options))
  }

  override jdbcUrl(schema?: string): string {
    const database = this.options?.database ?? DEFAULT_DATABASE
    const schemaQuery = schema
      ? `currentSchema=${encodeURIComponent(schema)}&`
      : ''
    return (
      `jdbc:postgresql://${this.host}:${this.port}/${encodeURIComponent(database)}?` +
      schemaQuery +
      `user=${encodeURIComponent(this.options?.username ?? '')}&` +
      `password=${encodeURIComponent(this.options?.password ?? '')}`
    )
  }

  override get configurationSchema(): Record<string, unknown> {
    return createPostgresConfigurationSchema()
  }

  async connect(): Promise<void> {
    if (this.#clientConnected) {
      return
    }
    await this.client.connect()
    this.#clientConnected = true
  }

  override async runQuery(
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult<PostgresRow>> {
    const values: unknown[] = options?.params ? [...options.params] : []
    return this.executeQuery(query, options?.catalog, values)
  }

  override async getCatalogs(): Promise<IDSSchema[]> {
    const result = await this.runQuery(
      "SELECT nspname AS name FROM pg_namespace WHERE nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast', 'pg_toast_temp_1', 'pg_temp_1')"
    )
    return (result.data ?? []).map((row) => ({
      name: requireRowString(row, 'name')
    }))
  }

  override async getSchema(
    catalog?: string,
    tableName?: string
  ): Promise<IDSSchema[]> {
    const result = await this.runQuery(
      getPostgresSchemaQuery(catalog, tableName)
    )
    return convertPostgresSchema(result.data ?? [])
  }

  override async describe(catalog: string, statement: string) {
    if (!statement.trim()) {
      return { columns: [] }
    }
    const normalizedStatement = statement.trim().replace(/;$/, '')
    return this.runQuery(`${normalizedStatement} LIMIT 1`, { catalog })
  }

  override async createCatalog(catalog: string): Promise<void> {
    await this.runQuery(
      `CREATE SCHEMA IF NOT EXISTS ${quotePostgresIdentifier(catalog)}`
    )
  }

  override async import(
    params: CreationTable,
    options?: { catalog?: string }
  ): Promise<void> {
    const data: unknown[] = params.data ?? []
    if (!data.length) {
      throw new Error('PostgreSQL import data is empty')
    }

    const tableName = qualifyPostgresTable(
      options?.catalog ?? params.catalog,
      params.name
    )
    const dropTableStatement = `DROP TABLE IF EXISTS ${tableName}`
    const createTableStatement = this.getCreateTableStatement(
      tableName,
      params.columns
    )
    let insertStatement = ''

    const rows = data.map((row, index) => {
      if (!isPostgresRow(row)) {
        throw new Error(`PostgreSQL import row ${index} must be an object`)
      }
      return row
    })

    try {
      if (params.mergeType === 'DELETE') {
        await this.executeQuery(dropTableStatement)
      }
      await this.executeQuery(createTableStatement)

      const batchSize = 10_000
      for (let index = 0; index < rows.length; index += batchSize) {
        const batch = rows.slice(index, index + batchSize)
        const values: unknown[] = []
        const placeholders = batch
          .map((row, batchIndex) => {
            const rowPlaceholders = params.columns.map((column) => {
              const value = normalizeImportValue(
                row[column.name],
                column.type,
                index + batchIndex,
                column.name,
                column.length
              )
              values.push(value)
              return `$${values.length}`
            })
            return `(${rowPlaceholders.join(', ')})`
          })
          .join(', ')

        insertStatement =
          `INSERT INTO ${tableName} (` +
          params.columns
            .map((column) => quotePostgresIdentifier(column.fieldName))
            .join(', ') +
          `) VALUES ${placeholders}`
        await this.executeQuery(insertStatement, undefined, values)
      }
    } catch (error) {
      throw new PostgresOperationError(
        error instanceof Error ? error.message : 'Unknown PostgreSQL import error',
        [dropTableStatement, createTableStatement, insertStatement].filter(
          Boolean
        ),
        error
      )
    }
  }

  async importCsv(
    params: CreationTable,
    options?: { catalog?: string }
  ): Promise<void> {
    if (!params.file) {
      throw new Error('CSV file stream is empty')
    }

    const tableName = qualifyPostgresTable(
      options?.catalog ?? params.catalog,
      params.name
    )
    const dropTableStatement = `DROP TABLE IF EXISTS ${tableName}`
    const createTableStatement = this.getCreateTableStatement(
      tableName,
      params.columns,
      false
    )
    const delimiter = params.columnSeparator ?? ','
    if (delimiter.length !== 1) {
      throw new Error('PostgreSQL CSV delimiter must contain exactly one character')
    }
    const copyStatement =
      `COPY ${tableName} (` +
      params.columns
        .map((column) => quotePostgresIdentifier(column.fieldName))
        .join(', ') +
      `) FROM STDIN WITH (FORMAT csv, HEADER true, DELIMITER ${quoteCsvDelimiter(delimiter)})`

    const { header, stream, hasDataRows } = await readCsvHeader(
      openCsvSource(params.file)
    )
    if (!header) {
      stream.destroy()
      throw new Error('CSV file is empty or missing header row')
    }
    if (!hasDataRows) {
      stream.destroy()
      throw new Error('CSV file has header but no data rows')
    }

    try {
      if (params.mergeType === 'DELETE') {
        await this.executeQuery(dropTableStatement)
      }
      await this.executeQuery(createTableStatement)
      await this.connect()
      await pipeline(stream, this.client.copyFrom(copyStatement))
    } catch (error) {
      throw new PostgresOperationError(
        error instanceof Error ? error.message : 'Unknown PostgreSQL CSV import error',
        [dropTableStatement, createTableStatement, copyStatement],
        error
      )
    }
  }

  override async dropTable(
    name: string,
    options?: QueryOptions
  ): Promise<void> {
    await this.runQuery(
      `DROP TABLE ${qualifyPostgresTable(options?.catalog, name)}`
    )
  }

  override async tableOp(
    action: DBTableAction,
    params: DBTableOperationParams
  ): Promise<unknown> {
    const table = requireTableName(params.table)
    const tableName = qualifyPostgresTable(params.schema, table)

    switch (action) {
      case DBTableAction.CREATE_TABLE: {
        const columns = requireColumns(params.columns)
        const createMode = params.createMode ?? DBCreateTableMode.ERROR
        await this.ensureUuidExtension(columns)

        const existsResult = await this.executeQuery(
          'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2',
          undefined,
          [params.schema ?? 'public', table]
        )
        const exists = (existsResult.data ?? []).length > 0

        if (exists && createMode === DBCreateTableMode.ERROR) {
          throw new Error(`Table ${tableName} already exists`)
        }
        if (exists && createMode === DBCreateTableMode.IGNORE) {
          return undefined
        }
        if (exists && createMode === DBCreateTableMode.UPGRADE) {
          await this.upgradeTable(tableName, params.schema, table, columns)
          return undefined
        }

        await this.runQuery(this.getCreateTableStatement(tableName, columns))
        return undefined
      }
      case DBTableAction.GET_TABLE_INFO: {
        const result = await this.executeQuery(
          'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2',
          undefined,
          [params.schema ?? 'public', table]
        )
        const rows = result.data ?? []
        return rows.length
          ? {
              table: tableName,
              columns: rows.map((row) => ({
                name: requireRowString(row, 'column_name'),
                type: postgresTypeToColumnType(
                  requireRowString(row, 'data_type')
                ),
                isNullable:
                  optionalRowString(row, 'is_nullable') === 'YES'
              }))
            }
          : null
      }
      case DBTableAction.RENAME_TABLE: {
        if (!params.newTable) {
          throw new Error('New table name is required')
        }
        await this.runQuery(
          `ALTER TABLE ${tableName} RENAME TO ${quotePostgresIdentifier(
            params.newTable
          )}`
        )
        return undefined
      }
      case DBTableAction.DROP_TABLE:
        await this.runQuery(`DROP TABLE IF EXISTS ${tableName}`)
        return undefined
      default:
        throw new Error(`Unsupported PostgreSQL table action: ${action}`)
    }
  }

  override async tableDataOp(
    action: DBTableDataAction,
    params: DBTableDataParams,
    options?: QueryOptions
  ): Promise<QueryResult<PostgresRow>> {
    if (action !== DBTableDataAction.INSERT) {
      throw new Error(`Unsupported PostgreSQL table data action: ${action}`)
    }
    if (!params.columns?.length) {
      throw new Error('INSERT requires columns definition')
    }

    const rows = normalizeDataRows(params.values)
    const tableName = qualifyPostgresTable(params.schema, params.table)
    const values: unknown[] = []
    const placeholders = rows
      .map((row) => {
        const rowPlaceholders = params.columns.map((column) => {
          const inputName = requirePartialColumnName(column)
          const type = column.type
          let value: unknown = row[inputName]
          if (type === 'object') {
            value = value === undefined ? null : JSON.stringify(value)
          }
          values.push(value ?? null)
          return `$${values.length}`
        })
        return `(${rowPlaceholders.join(', ')})`
      })
      .join(', ')
    const databaseColumns = params.columns.map((column) =>
      quotePostgresIdentifier(requirePartialColumnFieldName(column))
    )
    const sql =
      `INSERT INTO ${tableName} (${databaseColumns.join(', ')}) ` +
      `VALUES ${placeholders}`

    return this.executeQuery(sql, options?.catalog, values)
  }

  override async teardown(): Promise<void> {
    if (this.#clientConnected) {
      await this.client.end()
      this.#clientConnected = false
    }
  }

  private async executeQuery(
    query: string,
    catalog?: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<PostgresRow>> {
    await this.connect()
    if (catalog) {
      await this.client.query(
        `SET search_path TO ${quotePostgresIdentifier(catalog)}`
      )
    }

    const driverResult = await this.client.query(query, values)
    const result = Array.isArray(driverResult)
      ? driverResult[driverResult.length - 1]
      : driverResult
    if (!result) {
      throw new Error('PostgreSQL query returned no result')
    }

    const columns = result.fields.map((field) => {
      const dataType =
        POSTGRES_TYPE_NAMES.get(field.dataTypeId) ??
        String(field.dataTypeId)
      return {
        name: field.name,
        type: postgresTypeToColumnType(dataType),
        dataType
      }
    })

    return {
      status: 'OK',
      data: result.rows,
      columns
    }
  }

  private getCreateTableStatement(
    tableName: string,
    columns: ColumnDef[],
    withPrimaryKey = true
  ): string {
    return (
      `CREATE TABLE IF NOT EXISTS ${tableName} (` +
      columns
        .map((column) =>
          buildColumnDefinition(column, {
            withPrimaryKey,
            includeDefault: false
          })
        )
        .join(', ') +
      ')'
    )
  }

  private async ensureUuidExtension(columns: ColumnDef[]): Promise<void> {
    const needsUuidExtension = columns.some(
      (column) =>
        column.type.toLowerCase() === 'uuid' &&
        column.defaultValue?.toLowerCase() === 'uuid_generate_v4()'
    )
    if (!needsUuidExtension) {
      return
    }

    const extensionResult = await this.runQuery(
      "SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp'"
    )
    if (!(extensionResult.data ?? []).length) {
      await this.runQuery('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    }
  }

  private async upgradeTable(
    tableName: string,
    schema: string | undefined,
    table: string,
    columns: ColumnDef[]
  ): Promise<void> {
    const currentColumnsResult = await this.executeQuery(
      'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2',
      undefined,
      [schema ?? 'public', table]
    )
    const currentColumns = currentColumnsResult.data ?? []
    const targetColumnNames = columns.map((column) => column.fieldName)

    for (const currentColumn of currentColumns) {
      const columnName = requireRowString(currentColumn, 'column_name')
      if (!targetColumnNames.includes(columnName)) {
        await this.runQuery(
          `ALTER TABLE ${tableName} DROP COLUMN ${quotePostgresIdentifier(
            columnName
          )}`
        )
      }
    }

    for (const column of columns) {
      const existing = currentColumns.find(
        (currentColumn) =>
          optionalRowString(currentColumn, 'column_name') === column.fieldName
      )
      if (!existing) {
        await this.runQuery(
          `ALTER TABLE ${tableName} ADD COLUMN ${buildColumnDefinition(
            column,
            {
              withPrimaryKey: false,
              includeDefault: true
            }
          )}`
        )
        continue
      }

      const databaseType = requireRowString(existing, 'data_type')
      const oldApplicationType =
        postgresDatabaseTypeToApplicationType(databaseType)
      if (oldApplicationType === column.type.toLowerCase()) {
        continue
      }

      const options = readPostgresColumnOptions(column)
      const newType = typeToPostgres(
        column.type,
        column.length,
        options.precision,
        options.scale ?? column.fraction,
        column.enumValues
      )
      const identifier = quotePostgresIdentifier(column.fieldName)
      const usingClause = buildTypeConversion(identifier, column.type, newType)
      await this.runQuery(
        `ALTER TABLE ${tableName} ALTER COLUMN ${identifier} TYPE ${newType}${usingClause}`
      )
    }
  }
}

const POSTGRES_TYPE_NAMES = new Map<number, string>(
  Object.entries(types.builtins).map(([name, identifier]) => [
    identifier,
    name.toLowerCase()
  ])
)

function buildClientConfig(
  options?: PostgresAdapterOptions
): ClientConfig {
  const config: ClientConfig = {
    user: options?.username ?? '',
    host: options?.host ?? DEFAULT_HOST,
    database: options?.database ?? DEFAULT_DATABASE,
    password: options?.password ?? '',
    port: options?.port ?? DEFAULT_PORT
  }

  switch (options?.sslmode) {
    case 'verify-ca':
      config.ssl = {
        rejectUnauthorized: true,
        ca: options.sslrootcertFile
      }
      break
    case 'require':
    case 'verify-full':
      config.ssl = {
        rejectUnauthorized: true,
        ca: options.sslrootcertFile,
        key: options.sslkeyFile,
        cert: options.sslcertFile
      }
      break
  }
  return config
}

function isPostgresClientFactory(
  value: unknown
): value is PostgresClientFactory {
  return typeof value === 'function'
}

function parseDriverResult(
  value: unknown
): PostgresDriverResult | PostgresDriverResult[] {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      parseSingleDriverResult(entry, `result ${index}`)
    )
  }
  return parseSingleDriverResult(value, 'result')
}

function parseSingleDriverResult(
  value: unknown,
  label: string
): PostgresDriverResult {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('rows' in value) ||
    !Array.isArray(value.rows) ||
    !('fields' in value) ||
    !Array.isArray(value.fields)
  ) {
    throw new Error(`PostgreSQL ${label} has an invalid shape`)
  }

  const rows = value.rows.map((row, index) => {
    if (!isPostgresRow(row)) {
      throw new Error(`PostgreSQL ${label} row ${index} has an invalid shape`)
    }
    return row
  })
  const fields = value.fields.map((field, index) => {
    if (
      typeof field !== 'object' ||
      field === null ||
      !('name' in field) ||
      typeof field.name !== 'string' ||
      !('dataTypeID' in field) ||
      typeof field.dataTypeID !== 'number'
    ) {
      throw new Error(`PostgreSQL ${label} field ${index} has an invalid shape`)
    }
    return {
      name: field.name,
      dataTypeId: field.dataTypeID
    }
  })
  return { rows, fields }
}

function requireTableName(table: string | undefined): string {
  if (!table) {
    throw new Error('PostgreSQL table name is required')
  }
  return table
}

function requireColumns(columns: ColumnDef[] | undefined): ColumnDef[] {
  if (!columns?.length) {
    throw new Error('PostgreSQL column definitions are required')
  }
  return columns
}

function normalizeDataRows(value: unknown): PostgresRow[] {
  if (Array.isArray(value)) {
    if (!value.length) {
      throw new Error('INSERT requires values')
    }
    return value.map((row, index) => {
      if (!isPostgresRow(row)) {
        throw new Error(`INSERT row ${index} must be an object`)
      }
      return row
    })
  }
  if (isPostgresRow(value)) {
    return [value]
  }
  throw new Error('INSERT requires values')
}

function requirePartialColumnName(
  column: Partial<ColumnDef>
): string {
  const name = column.name ?? column.fieldName
  if (!name) {
    throw new Error('INSERT column input name is required')
  }
  return name
}

function requirePartialColumnFieldName(
  column: Partial<ColumnDef>
): string {
  if (!column.fieldName) {
    throw new Error('INSERT database column name is required')
  }
  return column.fieldName
}

function buildColumnDefinition(
  column: ColumnDef,
  options: {
    withPrimaryKey: boolean
    includeDefault: boolean
  }
): string {
  const extended = readPostgresColumnOptions(column)
  const databaseType = typeToPostgres(
    column.type,
    column.length,
    extended.precision,
    extended.scale ?? column.fraction,
    column.enumValues
  )
  const identifier = quotePostgresIdentifier(column.fieldName)
  const primaryKey = options.withPrimaryKey && column.isKey
    ? ' PRIMARY KEY'
    : ''
  const identity =
    column.autoIncrement &&
    ['number', 'bigint', 'serial', 'bigserial'].includes(
      column.type.toLowerCase()
    )
      ? ' GENERATED ALWAYS AS IDENTITY'
      : ''
  const notNull = column.required ? ' NOT NULL' : ''
  const unique = !column.isKey && column.unique ? ' UNIQUE' : ''
  const defaultValue =
    options.includeDefault &&
    !column.autoIncrement &&
    column.defaultValue?.trim()
      ? ` DEFAULT ${formatPostgresDefaultValue(
          column.defaultValue,
          column.type
        )}`
      : ''
  const enumCheck =
    column.type.toLowerCase() === 'enum' && column.enumValues?.length
      ? ` CHECK (${identifier} IN (${column.enumValues
          .map((value) => `'${value.replaceAll("'", "''")}'`)
          .join(', ')}))`
      : ''

  return `${identifier} ${databaseType}${primaryKey}${identity}${notNull}${unique}${defaultValue}${enumCheck}`
}

function buildTypeConversion(
  identifier: string,
  applicationType: string,
  databaseType: string
): string {
  switch (applicationType.toLowerCase()) {
    case 'number':
    case 'bigint':
      return ` USING CASE WHEN ${identifier}::TEXT ~ '^[0-9]+$' THEN ${identifier}::${databaseType} ELSE NULL END`
    case 'string':
    case 'text':
      return ` USING ${identifier}::TEXT`
    case 'boolean':
      return ` USING ${identifier}::BOOLEAN`
    case 'date':
      return ` USING ${identifier}::DATE`
    case 'datetime':
    case 'timestamp':
      return ` USING ${identifier}::TIMESTAMP`
    default:
      return ` USING ${identifier}::${databaseType}`
  }
}

function normalizeImportValue(
  value: unknown,
  type: string,
  rowIndex: number,
  columnName: string,
  length?: number
): unknown {
  const normalizedType = type.toLowerCase()
  if (value instanceof Date) {
    return formatImportDate(value, normalizedType, length)
  }
  if (normalizedType !== 'date' && normalizedType !== 'datetime') {
    return value
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(
      `PostgreSQL import value in row ${rowIndex} column "${columnName}" is not a valid date`
    )
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `PostgreSQL import value "${value}" in row ${rowIndex} column "${columnName}" is not a valid date`
    )
  }
  return formatImportDate(parsed, normalizedType, length)
}

function formatImportDate(
  value: Date,
  normalizedType: string,
  length?: number
): string {
  const isoValue = value.toISOString()
  if (normalizedType === 'date') {
    return isoValue.slice(0, length ?? 10)
  }
  if (normalizedType === 'time') {
    return isoValue.slice(11, 19)
  }
  if (normalizedType === 'datetime') {
    return isoValue
  }
  return length ? isoValue.slice(0, length) : isoValue
}

function quoteCsvDelimiter(delimiter: string): string {
  return `'${delimiter.replaceAll("'", "''")}'`
}

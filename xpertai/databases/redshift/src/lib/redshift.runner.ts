import { setTimeout as delay } from 'node:timers/promises'
import { randomUUID } from 'node:crypto'
import {
  DescribeStatementCommand,
  ExecuteStatementCommand,
  GetStatementResultCommand,
  RedshiftDataClient
} from '@aws-sdk/client-redshift-data'
import type {
  ColumnMetadata,
  Field
} from '@aws-sdk/client-redshift-data'
import {
  convertPostgresSchema,
  getPostgresSchemaQuery,
  quotePostgresIdentifier
} from '@xpert-ai/plugin-postgres'
import {
  BaseSQLQueryRunner,
  IColumnDef,
  IDSSchema,
  QueryOptions,
  QueryResult,
  SQLAdapterOptions
} from '@xpert-ai/plugin-sdk'

export const REDSHIFT_TYPE = 'redshift'

export interface RedshiftAdapterOptions extends SQLAdapterOptions {
  region?: string
  clusterIdentifier?: string
  database?: string
  secretArn?: string
  sslmode?: string
  sslrootcertFile?: string
  sslcertFile?: string
  sslkeyFile?: string
}

export interface RedshiftRow {
  [column: string]: unknown
}

export interface RedshiftDriverColumn {
  name: string
  typeName?: string
}

export interface RedshiftDriverResult {
  rows: RedshiftRow[]
  columns: RedshiftDriverColumn[]
}

export interface RedshiftDataApiOptions {
  region: string
  clusterIdentifier?: string
  database?: string
  secretArn?: string
  dbUser?: string
}

export interface RedshiftDataApi {
  execute(query: string): Promise<RedshiftDriverResult>
  destroy(): void
}

export type RedshiftDataApiFactory = (
  options: RedshiftDataApiOptions
) => RedshiftDataApi

class AwsRedshiftDataApi implements RedshiftDataApi {
  private readonly client: RedshiftDataClient

  constructor(private readonly options: RedshiftDataApiOptions) {
    this.client = new RedshiftDataClient({
      region: options.region || 'us-east-1'
    })
  }

  async execute(query: string): Promise<RedshiftDriverResult> {
    const execution = await this.client.send(
      new ExecuteStatementCommand({
        ClusterIdentifier: this.options.clusterIdentifier,
        Database: this.options.database,
        SecretArn: this.options.secretArn,
        DbUser: this.options.dbUser,
        ClientToken: randomUUID(),
        Sql: query
      })
    )
    if (!execution.Id) {
      throw new Error('Redshift Data API did not return a statement id')
    }
    await this.waitUntilFinished(execution.Id)
    const result = await this.client.send(
      new GetStatementResultCommand({ Id: execution.Id })
    )
    return mapAwsResult(result.Records ?? [], result.ColumnMetadata ?? [])
  }

  destroy(): void {
    this.client.destroy()
  }

  private async waitUntilFinished(id: string): Promise<void> {
    for (;;) {
      const status = await this.client.send(
        new DescribeStatementCommand({ Id: id })
      )
      if (status.Status === 'FINISHED') {
        return
      }
      if (status.Status === 'FAILED' || status.Status === 'ABORTED') {
        throw new Error(status.Error ?? `Redshift statement ${status.Status}`)
      }
      await delay(100)
    }
  }
}

const defaultDataApiFactory: RedshiftDataApiFactory = (options) =>
  new AwsRedshiftDataApi(options)

export function createRedshiftConfigurationSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'number', default: 5432 },
      username: { type: 'string', default: '' },
      password: { type: 'string' },
      database: { type: 'string', title: 'Database Name' },
      region: { type: 'string', title: 'Region' },
      clusterIdentifier: {
        type: 'string',
        title: 'Cluster Identifier'
      },
      secretArn: { type: 'string', title: 'SecretArn' },
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
    required: ['region'],
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

export class RedshiftRunner extends BaseSQLQueryRunner<RedshiftAdapterOptions> {
  override readonly name = 'AWS Redshift'
  override readonly type = REDSHIFT_TYPE
  override readonly jdbcDriver = 'com.amazon.redshift.jdbc.Driver'

  private readonly dataApi: RedshiftDataApi

  constructor(options?: RedshiftAdapterOptions, ...args: unknown[]) {
    super(options)
    const factoryValue = args[0]
    let factory = defaultDataApiFactory
    if (factoryValue !== undefined) {
      if (!isDataApiFactory(factoryValue)) {
        throw new Error('Redshift Data API factory must be a function')
      }
      factory = factoryValue
    }
    this.dataApi = factory({
      region: options?.region ?? '',
      clusterIdentifier: options?.clusterIdentifier,
      database: options?.database,
      secretArn: options?.secretArn,
      dbUser: options?.username
    })
  }

  override jdbcUrl(schema?: string): string {
    const schemaQuery = schema
      ? `currentSchema=${encodeURIComponent(schema)}&`
      : ''
    return (
      `jdbc:redshift://${this.host}:${this.port}/` +
      `${encodeURIComponent(this.options?.database ?? '')}?` +
      schemaQuery +
      `user=${encodeURIComponent(this.options?.username ?? '')}&` +
      `password=${encodeURIComponent(this.options?.password ?? '')}`
    )
  }

  override get configurationSchema(): Record<string, unknown> {
    return createRedshiftConfigurationSchema()
  }

  override async runQuery(
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult<RedshiftRow>> {
    void options
    const result = await this.dataApi.execute(query)
    return {
      status: 'OK',
      data: result.rows,
      columns: result.columns.map((column) => ({
        name: column.name,
        type: redshiftTypeToColumnType(column.typeName),
        dataType: column.typeName
      }))
    }
  }

  override async getCatalogs(): Promise<IDSSchema[]> {
    const result = await this.runQuery(
      "SELECT nspname AS name FROM pg_namespace WHERE nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast', 'pg_toast_temp_1', 'pg_temp_1')"
    )
    return (result.data ?? []).map((row) => ({
      name: requireString(row, 'name')
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

  override async describe(
    catalog: string,
    statement: string
  ): Promise<{ columns?: QueryResult['columns'] }> {
    if (!statement) {
      return { columns: [] }
    }
    const query = `${statement.trim().replace(/;+$/, '')} LIMIT 1`
    return this.runQuery(
      catalog
        ? `SET search_path TO ${quotePostgresIdentifier(catalog)}; ${query}`
        : query
    )
  }

  override async createCatalog(): Promise<void> {
    throw new Error('Redshift schema creation is not implemented')
  }

  override async teardown(): Promise<void> {
    this.dataApi.destroy()
  }
}

function isDataApiFactory(value: unknown): value is RedshiftDataApiFactory {
  return typeof value === 'function'
}

function mapAwsResult(
  records: Field[][],
  metadata: ColumnMetadata[]
): RedshiftDriverResult {
  const columns = metadata.map((column, index) => ({
    name: column.name ?? `column_${index + 1}`,
    typeName: column.typeName
  }))
  return {
    columns,
    rows: records.map((record) =>
      Object.fromEntries(
        columns.map((column, index) => [
          column.name,
          fieldValue(record[index])
        ])
      )
    )
  }
}

function fieldValue(field: Field | undefined): unknown {
  if (!field || 'isNull' in field) {
    return null
  }
  if ('stringValue' in field) {
    return field.stringValue
  }
  if ('longValue' in field) {
    return field.longValue
  }
  if ('doubleValue' in field) {
    return field.doubleValue
  }
  if ('booleanValue' in field) {
    return field.booleanValue
  }
  if ('blobValue' in field) {
    return field.blobValue
  }
  return null
}

function requireString(row: RedshiftRow, property: string): string {
  const value = row[property]
  if (typeof value !== 'string') {
    throw new Error(`Redshift row property "${property}" must be a string`)
  }
  return value
}

function redshiftTypeToColumnType(
  type: string | undefined
): IColumnDef['type'] {
  const normalized = type?.toLowerCase() ?? ''
  if (
    /^(smallint|integer|bigint|decimal|numeric|real|double|float)/.test(
      normalized
    )
  ) {
    return 'number'
  }
  if (normalized === 'boolean' || normalized === 'bool') {
    return 'boolean'
  }
  if (
    normalized.includes('date') ||
    normalized.includes('time')
  ) {
    return 'timestamp'
  }
  if (normalized === 'super' || normalized === 'json') {
    return 'object'
  }
  return 'string'
}

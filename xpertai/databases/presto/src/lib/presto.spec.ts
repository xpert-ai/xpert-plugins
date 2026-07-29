import 'reflect-metadata'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import type { QueryResult } from '@xpert-ai/plugin-sdk'
import plugin, {
  PRESTO_TYPE,
  PrestoClient,
  PrestoClientFactory,
  PrestoClientOptions,
  PrestoDataSourceStrategy,
  PrestoExecutionOptions,
  PrestoQueryRunner,
  prestoTypeToColumnType
} from '../index.js'

class FakePrestoClient implements PrestoClient {
  constructor(
    private readonly handler: (options: PrestoExecutionOptions) => void
  ) {}

  execute(options: PrestoExecutionOptions): void {
    this.handler(options)
  }
}

const connectionOptions = {
  host: 'presto.example.com',
  port: 8443,
  http_path: '/v1/statement',
  username: 'analyst',
  password: 'secret',
  catalog: 'hive',
  schema: 'analytics',
  useSSL: true
}

function createRunner(
  handler: (options: PrestoExecutionOptions) => void,
  capture?: (options: PrestoClientOptions) => void
): PrestoQueryRunner {
  const factory: PrestoClientFactory = (options) => {
    capture?.(options)
    return new FakePrestoClient(handler)
  }
  return new PrestoQueryRunner(connectionOptions, factory)
}

function completeQuery(
  options: PrestoExecutionOptions,
  rows: unknown[][],
  stats: unknown = { completedSplits: 1 }
): void {
  const columns = [
    { name: 'id', type: 'bigint' },
    { name: 'payload', type: 'json' }
  ]
  options.columns?.(null, columns)
  options.data?.(null, rows, columns, stats)
  options.success(null, stats)
}

describe('@xpert-ai/plugin-presto', () => {
  it('exports aligned database plugin metadata', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-presto',
      version: '0.0.1',
      category: 'database'
    })
    expect(plugin.config.schema.safeParse({}).success).toBe(true)
  })

  it('registers the legacy presto strategy and configuration', async () => {
    expect(
      Reflect.getMetadata(DATASOURCE_STRATEGY, PrestoDataSourceStrategy)
    ).toBe(PRESTO_TYPE)

    const strategy = new PrestoDataSourceStrategy()
    await expect(strategy.configurationSchema()).resolves.toMatchObject({
      required: ['host', 'http_path'],
      secret: ['password']
    })
  })

  it('builds compatible JDBC and client settings including SSL', () => {
    let clientOptions: PrestoClientOptions | undefined
    const runner = createRunner(
      (options) => completeQuery(options, []),
      (options) => {
        clientOptions = options
      }
    )

    expect(runner.jdbcUrl('warehouse')).toBe(
      'jdbc:presto://presto.example.com:8443/hive/warehouse?user=analyst&password=secret&SSL=true'
    )
    expect(clientOptions).toEqual({
      host: 'presto.example.com',
      port: 8443,
      user: 'analyst',
      catalog: 'hive',
      schema: 'analytics',
      engine: 'presto',
      basic_auth: {
        user: 'analyst',
        password: 'secret'
      },
      ssl: {
        rejectUnauthorized: true
      }
    })
  })

  it('accumulates result pages and maps Presto types', async () => {
    const runner = createRunner((options) => {
      const columns = [
        { name: 'id', type: 'bigint' },
        { name: 'payload', type: 'json' }
      ]
      options.columns?.(null, columns)
      options.data?.(null, [[1, { event: 'open' }]], columns, {})
      options.data?.(null, [[2, { event: 'close' }]], columns, {})
      options.success(null, { processedRows: 2 })
    })

    await expect(runner.runQuery('SELECT * FROM events')).resolves.toEqual({
      status: 'OK',
      data: [
        { id: 1, payload: { event: 'open' } },
        { id: 2, payload: { event: 'close' } }
      ],
      columns: [
        { name: 'id', type: 'number', dataType: 'bigint' },
        { name: 'payload', type: 'object', dataType: 'json' }
      ],
      stats: { processedRows: 2 }
    })
  })

  it('rejects driver callback errors', async () => {
    const runner = createRunner((options) => {
      options.error(new Error('coordinator unavailable'))
    })

    await expect(runner.runQuery('SELECT 1')).rejects.toThrow(
      'coordinator unavailable'
    )
  })

  it('filters system schemas from SHOW SCHEMAS', async () => {
    const runner = createRunner((options) => {
      const columns = [{ name: 'Schema', type: 'varchar' }]
      options.columns?.(null, columns)
      options.data?.(
        null,
        [['analytics'], ['information_schema'], ['pg_catalog']],
        columns,
        {}
      )
      options.success(null, {})
    })

    await expect(runner.getCatalogs()).resolves.toEqual([
      { schema: 'analytics', name: 'analytics' }
    ])
  })

  it('groups information_schema columns into schemas and tables', async () => {
    const runner = createRunner((options) => {
      const columns = [
        { name: 'table_schema', type: 'varchar' },
        { name: 'table_name', type: 'varchar' },
        { name: 'column_name', type: 'varchar' },
        { name: 'data_type', type: 'varchar' },
        { name: 'ordinal_position', type: 'integer' },
        { name: 'is_nullable', type: 'varchar' }
      ]
      options.columns?.(null, columns)
      options.data?.(
        null,
        [
          ['analytics', 'events', 'id', 'bigint', 1, 'NO'],
          ['analytics', 'events', 'payload', 'json', 2, 'YES']
        ],
        columns,
        {}
      )
      options.success(null, {})
    })

    await expect(runner.getSchema('analytics', 'events')).resolves.toEqual([
      {
        schema: 'analytics',
        name: 'analytics',
        tables: [
          {
            schema: 'analytics',
            name: 'events',
            columns: [
              {
                name: 'id',
                type: 'number',
                dataType: 'bigint',
                nullable: false,
                position: 1
              },
              {
                name: 'payload',
                type: 'object',
                dataType: 'json',
                nullable: true,
                position: 2
              }
            ]
          }
        ]
      }
    ])
  })

  it('describes a statement with one bounded row', async () => {
    let executedQuery = ''
    let executedSchema = ''
    const runner = createRunner((options) => {
      executedQuery = options.query
      executedSchema = options.schema ?? ''
      completeQuery(options, [])
    })

    const result: { columns?: QueryResult['columns'] } =
      await runner.describe('analytics', ' SELECT id FROM events;;; ')

    expect(executedQuery).toBe('SELECT id FROM events LIMIT 1')
    expect(executedSchema).toBe('analytics')
    expect(result.columns).toHaveLength(2)
  })

  it('maps scalar and structural Presto types', () => {
    expect(prestoTypeToColumnType('decimal(18,2)')).toBe('number')
    expect(prestoTypeToColumnType('boolean')).toBe('boolean')
    expect(prestoTypeToColumnType('timestamp with time zone')).toBe(
      'timestamp'
    )
    expect(prestoTypeToColumnType('array(varchar)')).toBe('object')
    expect(prestoTypeToColumnType('varchar')).toBe('string')
  })
})

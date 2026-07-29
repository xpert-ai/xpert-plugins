import 'reflect-metadata'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import plugin, {
  HIVE_TYPE,
  HiveDataSourceStrategy,
  HiveQueryRunner,
  HiveRuntime,
  HiveRuntimeFactory,
  HiveRuntimeResult,
  hiveTypeToColumnType
} from '../index.js'

class FakeHiveRuntime implements HiveRuntime {
  closeCalls = 0

  constructor(
    private readonly result: HiveRuntimeResult = {
      status: 'OK',
      rows: [{ value: 7 }],
      columns: [{ name: 'query.value', type: 'int' }],
      stats: { elapsedTime: 12 }
    }
  ) {}

  async execute(): Promise<HiveRuntimeResult> {
    return this.result
  }

  async schemas() {
    return [
      {
        TABLE_CATALOG: 'hive',
        TABLE_SCHEM: 'analytics',
        REMARKS: 'Analytics'
      }
    ]
  }

  async tables() {
    return [
      {
        TABLE_SCHEM: 'analytics',
        TABLE_NAME: 'events',
        REMARKS: 'Events'
      }
    ]
  }

  async columns() {
    return [
      {
        TABLE_SCHEM: 'analytics',
        TABLE_NAME: 'events',
        COLUMN_NAME: 'id',
        TYPE_NAME: 'BIGINT',
        NULLABLE: 0
      }
    ]
  }

  async close(): Promise<void> {
    this.closeCalls += 1
  }
}

const options = {
  host: 'hive.example.com',
  port: 10000,
  username: 'analyst',
  password: 'secret',
  database: 'analytics',
  http_path: '/gateway/hive',
  http_scheme: 'https'
}

function createRunner(runtime: HiveRuntime): HiveQueryRunner {
  const factory: HiveRuntimeFactory = async () => runtime
  return new HiveQueryRunner(options, factory)
}

describe('@xpert-ai/plugin-hive', () => {
  it('exports aligned database plugin metadata', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-hive',
      version: '0.0.1',
      category: 'database'
    })
  })

  it('registers the legacy hive strategy and configuration', async () => {
    expect(
      Reflect.getMetadata(DATASOURCE_STRATEGY, HiveDataSourceStrategy)
    ).toBe(HIVE_TYPE)
    await expect(
      new HiveDataSourceStrategy().configurationSchema()
    ).resolves.toMatchObject({
      required: ['host', 'http_path'],
      secret: ['password']
    })
  })

  it('builds HiveServer2 JDBC metadata', () => {
    const runner = createRunner(new FakeHiveRuntime())
    expect(runner.jdbcDriver).toBe('org.apache.hive.jdbc.HiveDriver')
    expect(runner.jdbcUrl('warehouse')).toBe(
      'jdbc:hive2://hive.example.com:10000/warehouse;' +
        'transportMode=http;ssl=true;httpPath=/gateway/hive'
    )
  })

  it('maps query results and always closes the runtime', async () => {
    const runtime = new FakeHiveRuntime()
    const runner = createRunner(runtime)
    await expect(runner.runQuery('SELECT 7')).resolves.toEqual({
      status: 'OK',
      data: [{ value: 7 }],
      columns: [
        {
          name: 'value',
          label: undefined,
          position: undefined,
          type: 'number',
          dataType: 'int'
        }
      ],
      stats: { elapsedTime: 12 }
    })
    expect(runtime.closeCalls).toBe(1)
  })

  it('preserves Hive execution error results', async () => {
    const runtime = new FakeHiveRuntime({
      status: 'ERROR',
      error: 'Hive task failed',
      rows: [],
      columns: [],
      stats: { taskState: 'FAILED' }
    })
    await expect(createRunner(runtime).runQuery('broken')).resolves.toEqual({
      status: 'ERROR',
      error: 'Hive task failed',
      stats: { taskState: 'FAILED' }
    })
    expect(runtime.closeCalls).toBe(1)
  })

  it('groups Hive schemas, tables, and columns', async () => {
    const runtime = new FakeHiveRuntime()
    const runner = createRunner(runtime)
    await expect(runner.getCatalogs()).resolves.toEqual([
      {
        catalog: 'hive',
        schema: 'analytics',
        name: 'analytics',
        label: 'Analytics'
      }
    ])
    await expect(runner.getSchema('analytics')).resolves.toEqual([
      {
        schema: 'analytics',
        name: 'analytics',
        tables: [
          {
            schema: 'analytics',
            name: 'events',
            label: 'Events',
            columns: [
              {
                name: 'id',
                dataType: 'bigint',
                type: 'number',
                label: undefined,
                nullable: false
              }
            ]
          }
        ]
      }
    ])
    expect(runtime.closeCalls).toBe(2)
  })

  it('maps structural Hive types', () => {
    expect(hiveTypeToColumnType('array<string>')).toBe('object')
    expect(hiveTypeToColumnType('timestamp')).toBe('timestamp')
    expect(hiveTypeToColumnType('boolean')).toBe('boolean')
  })
})

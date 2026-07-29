import 'reflect-metadata'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import plugin, {
  CLICKHOUSE_TYPE,
  ClickHouseClient,
  ClickHouseDataSourceStrategy,
  ClickHouseImportError,
  ClickHouseRunner,
  typeToClickHouse
} from '../index.js'

class FakeCursor {
  constructor(private readonly rows: object[]) {}

  async toPromise(): Promise<object[]> {
    return this.rows
  }
}

class FakeClickHouseClient implements ClickHouseClient {
  readonly queries: string[] = []
  readonly inserts: Array<{ query: string; data: object }> = []

  constructor(
    private readonly responseForQuery: (query: string) => object[] = () => []
  ) {}

  query(query: string): FakeCursor {
    this.queries.push(query)
    return new FakeCursor(this.responseForQuery(query))
  }

  insert(query: string, data: object): FakeCursor {
    this.inserts.push({ query, data })
    return new FakeCursor([])
  }
}

class TestClickHouseRunner extends ClickHouseRunner {
  constructor(private readonly client: ClickHouseClient) {
    super(options)
  }

  protected override getClient(): ClickHouseClient {
    return this.client
  }
}

const options = {
  host: 'localhost',
  port: 8123,
  username: 'default',
  password: 'secret',
  dbname: 'analytics'
}

describe('@xpert-ai/plugin-clickhouse', () => {
  it('exports aligned database plugin metadata', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-clickhouse',
      version: '0.0.1',
      category: 'database'
    })
    expect(plugin.config.schema.safeParse({}).success).toBe(true)
  })

  it('registers the clickhouse data source strategy', async () => {
    expect(
      Reflect.getMetadata(DATASOURCE_STRATEGY, ClickHouseDataSourceStrategy)
    ).toBe(CLICKHOUSE_TYPE)

    const strategy = new ClickHouseDataSourceStrategy()
    expect(strategy.type).toBe(CLICKHOUSE_TYPE)
    expect(strategy.name).toBe('ClickHouse Data Source')
    await expect(strategy.configurationSchema()).resolves.toMatchObject({
      required: ['dbname'],
      secret: ['password']
    })
  })

  it('runs queries and infers result columns without a live database', async () => {
    const client = new FakeClickHouseClient(() => [
      { id: 42, enabled: true, title: 'answer' }
    ])
    const runner = new TestClickHouseRunner(client)

    await expect(runner.runQuery('SELECT 42')).resolves.toEqual({
      status: 'OK',
      data: [{ id: 42, enabled: true, title: 'answer' }],
      columns: [
        { name: 'id', type: 'number', dataType: 'number' },
        { name: 'enabled', type: 'boolean', dataType: 'boolean' },
        { name: 'title', type: 'string', dataType: 'string' }
      ]
    })
    expect(client.queries).toEqual(['SELECT 42'])
  })

  it('groups ClickHouse schema rows into databases and tables', async () => {
    const client = new FakeClickHouseClient(() => [
      { database: 'analytics', table: 'events', name: 'id', type: 'UInt64' },
      {
        database: 'analytics',
        table: 'events',
        name: 'created_at',
        type: 'DateTime'
      }
    ])
    const runner = new TestClickHouseRunner(client)

    await expect(runner.getSchema('analytics')).resolves.toEqual([
      {
        schema: 'analytics',
        name: 'analytics',
        tables: [
          {
            schema: 'analytics',
            name: 'events',
            columns: [
              { name: 'id', dataType: 'UInt64', type: 'number' },
              {
                name: 'created_at',
                dataType: 'DateTime',
                type: 'timestamp'
              }
            ]
          }
        ]
      }
    ])
    expect(client.queries[0]).toContain("database = 'analytics'")
  })

  it('imports rows in batches and preserves legacy delete semantics', async () => {
    const client = new FakeClickHouseClient()
    const runner = new TestClickHouseRunner(client)

    await runner.import(
      {
        name: 'events',
        mergeType: 'DELETE',
        columns: [
          {
            name: 'id',
            fieldName: 'id',
            type: 'Int',
            isKey: true
          },
          {
            name: 'createdAt',
            fieldName: 'created_at',
            type: 'Datetime',
            isKey: false
          }
        ],
        data: [{ id: 1, createdAt: new Date('2026-01-02T03:04:05.000Z') }]
      },
      { catalog: 'analytics' }
    )

    expect(client.queries).toEqual([
      'DROP TABLE IF EXISTS `analytics`.`events`',
      expect.stringContaining('CREATE TABLE IF NOT EXISTS `analytics`.`events`')
    ])
    expect(client.inserts).toEqual([
      {
        query: 'INSERT INTO `analytics`.`events`',
        data: [[1, '2026-01-02 03:04:05']]
      }
    ])
  })

  it('reports import failures with the attempted statements', async () => {
    const client = new FakeClickHouseClient((query) => {
      if (query.startsWith('CREATE TABLE')) {
        throw new Error('create failed')
      }
      return []
    })
    const runner = new TestClickHouseRunner(client)

    const result = runner.import({
      name: 'events',
      columns: [
        {
          name: 'id',
          fieldName: 'id',
          type: 'Int',
          isKey: true
        }
      ],
      data: [{ id: 1 }]
    })

    await expect(result).rejects.toBeInstanceOf(ClickHouseImportError)
    await expect(result).rejects.toMatchObject({
      message: 'create failed',
      statements: [
        'DROP TABLE IF EXISTS `events`',
        expect.stringContaining('CREATE TABLE IF NOT EXISTS `events`')
      ]
    })
  })

  it('maps legacy column types to ClickHouse types', () => {
    expect(typeToClickHouse('String')).toBe('String')
    expect(typeToClickHouse('Int')).toBe('Int32')
    expect(typeToClickHouse('BigInt')).toBe('Int64')
    expect(typeToClickHouse('Datetime')).toBe('DateTime')
  })
})

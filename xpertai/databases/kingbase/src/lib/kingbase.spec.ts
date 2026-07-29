import 'reflect-metadata'
import { Writable } from 'node:stream'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import type {
  PostgresClient,
  PostgresClientFactory,
  PostgresDriverResult
} from '@xpert-ai/plugin-postgres'
import plugin, {
  KINGBASE_TYPE,
  KingbaseDataSourceStrategy,
  KingbaseRunner
} from '../index.js'

class FakePostgresClient implements PostgresClient {
  connectCalls = 0
  endCalls = 0

  constructor(
    private readonly queryHandler: (
      query: string
    ) => PostgresDriverResult | Promise<PostgresDriverResult>
  ) {}

  async connect(): Promise<void> {
    this.connectCalls += 1
  }

  async query(query: string): Promise<PostgresDriverResult> {
    return this.queryHandler(query)
  }

  copyFrom(): Writable {
    return new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      }
    })
  }

  async end(): Promise<void> {
    this.endCalls += 1
  }
}

const options = {
  host: 'kingbase.internal',
  port: 54321,
  username: 'analytics',
  password: 'secret',
  database: ''
}

function createRunner(client: PostgresClient): KingbaseRunner {
  const factory: PostgresClientFactory = (config) => {
    void config
    return client
  }
  return new KingbaseRunner(options, factory)
}

describe('@xpert-ai/plugin-kingbase', () => {
  it('exports aligned database plugin metadata', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-kingbase',
      version: '0.0.1',
      category: 'database'
    })
  })

  it('registers the kingbase data source strategy', async () => {
    expect(
      Reflect.getMetadata(DATASOURCE_STRATEGY, KingbaseDataSourceStrategy)
    ).toBe(KINGBASE_TYPE)

    const schema = await new KingbaseDataSourceStrategy().configurationSchema()
    expect(schema).toMatchObject({
      properties: {
        database: {
          default: 'kingbase'
        }
      }
    })
  })

  it('applies the legacy database default and Kingbase JDBC driver', () => {
    const runner = createRunner(
      new FakePostgresClient(() => ({ rows: [], fields: [] }))
    )

    expect(runner.type).toBe('kingbase')
    expect(runner.name).toBe('KingbaseES')
    expect(runner.jdbcDriver).toBe('com.kingbase8.Driver')
    expect(runner.jdbcUrl('reporting')).toBe(
      'jdbc:kingbase8://kingbase.internal:54321/kingbase?' +
        'currentSchema=reporting&user=analytics&password=secret'
    )
  })

  it('executes queries through the inherited PostgreSQL runner', async () => {
    const client = new FakePostgresClient(() => ({
      rows: [{ value: 1 }],
      fields: [{ name: 'value', dataTypeId: 23 }]
    }))
    const runner = createRunner(client)

    await expect(runner.runQuery('SELECT 1 AS value')).resolves.toEqual({
      status: 'OK',
      data: [{ value: 1 }],
      columns: [{ name: 'value', type: 'number', dataType: 'int4' }]
    })
    expect(client.connectCalls).toBe(1)
  })

  it('propagates query errors from the compatible driver', async () => {
    const runner = createRunner(
      new FakePostgresClient(() => {
        throw new Error('Kingbase query failed')
      })
    )

    await expect(runner.runQuery('SELECT broken')).rejects.toThrow(
      'Kingbase query failed'
    )
  })
})

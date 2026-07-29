import 'reflect-metadata'
import { Writable } from 'node:stream'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import type {
  PostgresClient,
  PostgresClientFactory,
  PostgresDriverResult
} from '@xpert-ai/plugin-postgres'
import plugin, {
  OPENGAUSS_TYPE,
  OpenGaussDataSourceStrategy,
  OpenGaussRunner
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
  host: 'opengauss.internal',
  port: 5432,
  username: 'analytics',
  password: 'secret',
  database: ''
}

function createRunner(client: PostgresClient): OpenGaussRunner {
  const factory: PostgresClientFactory = (config) => {
    void config
    return client
  }
  return new OpenGaussRunner(options, factory)
}

describe('@xpert-ai/plugin-opengauss', () => {
  it('exports aligned database plugin metadata', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-opengauss',
      version: '0.0.1',
      category: 'database'
    })
  })

  it('registers the opengauss data source strategy', async () => {
    expect(
      Reflect.getMetadata(DATASOURCE_STRATEGY, OpenGaussDataSourceStrategy)
    ).toBe(OPENGAUSS_TYPE)

    const schema = await new OpenGaussDataSourceStrategy().configurationSchema()
    expect(schema).toMatchObject({
      properties: {
        database: {
          default: 'gaussdb'
        }
      }
    })
  })

  it('applies the legacy database default and OpenGauss JDBC driver', () => {
    const runner = createRunner(
      new FakePostgresClient(() => ({ rows: [], fields: [] }))
    )

    expect(runner.type).toBe('opengauss')
    expect(runner.name).toBe('OpenGauss')
    expect(runner.jdbcDriver).toBe('org.opengauss.Driver')
    expect(runner.jdbcUrl('reporting')).toBe(
      'jdbc:opengauss://opengauss.internal:5432/gaussdb?' +
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
        throw new Error('OpenGauss query failed')
      })
    )

    await expect(runner.runQuery('SELECT broken')).rejects.toThrow(
      'OpenGauss query failed'
    )
  })
})

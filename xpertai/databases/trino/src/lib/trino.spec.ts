import 'reflect-metadata'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import type {
  PrestoClient,
  PrestoClientFactory,
  PrestoClientOptions,
  PrestoExecutionOptions
} from '@xpert-ai/plugin-presto'
import plugin, {
  TRINO_TYPE,
  TrinoDataSourceStrategy,
  TrinoQueryRunner
} from '../index.js'

class FakeTrinoClient implements PrestoClient {
  constructor(
    private readonly handler: (options: PrestoExecutionOptions) => void
  ) {}

  execute(options: PrestoExecutionOptions): void {
    this.handler(options)
  }
}

const options = {
  host: 'trino.example.com',
  port: 8443,
  http_path: '/v1/statement',
  username: 'analyst',
  password: 'secret',
  catalog: 'iceberg',
  schema: 'analytics',
  useSSL: true
}

function createRunner(
  handler: (options: PrestoExecutionOptions) => void,
  capture?: (options: PrestoClientOptions) => void
): TrinoQueryRunner {
  const factory: PrestoClientFactory = (clientOptions) => {
    capture?.(clientOptions)
    return new FakeTrinoClient(handler)
  }
  return new TrinoQueryRunner(options, factory)
}

describe('@xpert-ai/plugin-trino', () => {
  it('exports aligned database plugin metadata', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-trino',
      version: '0.0.1',
      category: 'database'
    })
  })

  it('registers the legacy trino strategy and shared configuration', async () => {
    expect(
      Reflect.getMetadata(DATASOURCE_STRATEGY, TrinoDataSourceStrategy)
    ).toBe(TRINO_TYPE)

    await expect(
      new TrinoDataSourceStrategy().configurationSchema()
    ).resolves.toMatchObject({
      required: ['host', 'http_path'],
      secret: ['password']
    })
  })

  it('selects Trino client headers and JDBC metadata', () => {
    let clientOptions: PrestoClientOptions | undefined
    const runner = createRunner(
      (execution) => execution.success(null, {}),
      (configured) => {
        clientOptions = configured
      }
    )

    expect(runner.type).toBe('trino')
    expect(runner.name).toBe('Trino')
    expect(runner.jdbcDriver).toBe('io.trino.jdbc.TrinoDriver')
    expect(runner.jdbcUrl('warehouse')).toBe(
      'jdbc:trino://trino.example.com:8443/iceberg/warehouse?user=analyst&password=secret&SSL=true'
    )
    expect(clientOptions).toMatchObject({
      engine: 'trino',
      catalog: 'iceberg',
      schema: 'analytics',
      ssl: {
        rejectUnauthorized: true
      }
    })
  })

  it('executes queries through the inherited typed runner', async () => {
    const runner = createRunner((execution) => {
      const columns = [{ name: 'value', type: 'integer' }]
      execution.columns?.(null, columns)
      execution.data?.(null, [[7]], columns, {})
      execution.success(null, { processedRows: 1 })
    })

    await expect(runner.runQuery('SELECT 7 AS value')).resolves.toEqual({
      status: 'OK',
      data: [{ value: 7 }],
      columns: [
        { name: 'value', type: 'number', dataType: 'integer' }
      ],
      stats: { processedRows: 1 }
    })
  })

  it('propagates Trino driver errors', async () => {
    const runner = createRunner((execution) => {
      execution.error(new Error('Trino coordinator unavailable'))
    })

    await expect(runner.runQuery('SELECT broken')).rejects.toThrow(
      'Trino coordinator unavailable'
    )
  })
})

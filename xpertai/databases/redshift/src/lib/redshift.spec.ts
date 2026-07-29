import 'reflect-metadata'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import plugin, {
  REDSHIFT_TYPE,
  RedshiftDataApi,
  RedshiftDataApiFactory,
  RedshiftDataApiOptions,
  RedshiftDataSourceStrategy,
  RedshiftDriverResult,
  RedshiftRunner
} from '../index.js'

class FakeRedshiftDataApi implements RedshiftDataApi {
  readonly queries: string[] = []
  destroyCalls = 0

  constructor(
    private readonly handler: (
      query: string
    ) => RedshiftDriverResult | Promise<RedshiftDriverResult>
  ) {}

  async execute(query: string): Promise<RedshiftDriverResult> {
    this.queries.push(query)
    return this.handler(query)
  }

  destroy(): void {
    this.destroyCalls += 1
  }
}

const options = {
  host: 'redshift.example.com',
  port: 5439,
  username: 'analytics',
  password: 'secret',
  database: 'warehouse',
  region: 'us-east-1',
  clusterIdentifier: 'analytics-cluster',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:redshift'
}

function createRunner(
  api: RedshiftDataApi,
  capture?: (options: RedshiftDataApiOptions) => void
): RedshiftRunner {
  const factory: RedshiftDataApiFactory = (apiOptions) => {
    capture?.(apiOptions)
    return api
  }
  return new RedshiftRunner(options, factory)
}

describe('@xpert-ai/plugin-redshift', () => {
  it('exports aligned metadata and strategy configuration', async () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-redshift',
      version: '0.0.1',
      category: 'database'
    })
    expect(
      Reflect.getMetadata(DATASOURCE_STRATEGY, RedshiftDataSourceStrategy)
    ).toBe(REDSHIFT_TYPE)
    await expect(
      new RedshiftDataSourceStrategy().configurationSchema()
    ).resolves.toMatchObject({
      required: ['region'],
      secret: expect.arrayContaining(['password', 'sslrootcertFile'])
    })
  })

  it('builds Data API and JDBC connection settings', () => {
    let apiOptions: RedshiftDataApiOptions | undefined
    const runner = createRunner(
      new FakeRedshiftDataApi(() => ({ rows: [], columns: [] })),
      (configured) => {
        apiOptions = configured
      }
    )
    expect(apiOptions).toEqual({
      region: 'us-east-1',
      clusterIdentifier: 'analytics-cluster',
      database: 'warehouse',
      secretArn:
        'arn:aws:secretsmanager:us-east-1:123:secret:redshift',
      dbUser: 'analytics'
    })
    expect(runner.jdbcUrl('reporting')).toBe(
      'jdbc:redshift://redshift.example.com:5439/warehouse?' +
        'currentSchema=reporting&user=analytics&password=secret'
    )
  })

  it('maps typed Data API results', async () => {
    const api = new FakeRedshiftDataApi(() => ({
      rows: [{ id: 7, active: true }],
      columns: [
        { name: 'id', typeName: 'bigint' },
        { name: 'active', typeName: 'boolean' }
      ]
    }))
    await expect(createRunner(api).runQuery('SELECT 7')).resolves.toEqual({
      status: 'OK',
      data: [{ id: 7, active: true }],
      columns: [
        { name: 'id', type: 'number', dataType: 'bigint' },
        { name: 'active', type: 'boolean', dataType: 'boolean' }
      ]
    })
  })

  it('discovers Redshift schemas from object rows', async () => {
    const api = new FakeRedshiftDataApi(() => ({
      rows: [{ name: 'analytics' }],
      columns: [{ name: 'name', typeName: 'varchar' }]
    }))
    await expect(createRunner(api).getCatalogs()).resolves.toEqual([
      { name: 'analytics' }
    ])
  })

  it('reuses PostgreSQL-compatible schema conversion', async () => {
    const api = new FakeRedshiftDataApi(() => ({
      rows: [
        {
          table_schema: 'public',
          table_name: 'events',
          column_name: 'id',
          data_type: 'bigint',
          is_nullable: 'NO',
          ordinal_position: 1
        }
      ],
      columns: []
    }))
    await expect(
      createRunner(api).getSchema('public', 'events')
    ).resolves.toEqual([
      {
        schema: 'public',
        name: 'public',
        tables: [
          {
            schema: 'public',
            name: 'events',
            label: undefined,
            columns: [
              {
                name: 'id',
                type: 'number',
                label: undefined,
                dataType: 'bigint',
                nullable: false,
                position: 1
              }
            ]
          }
        ]
      }
    ])
  })

  it('propagates Data API errors', async () => {
    const api = new FakeRedshiftDataApi(() => {
      throw new Error('Redshift statement failed')
    })
    await expect(createRunner(api).runQuery('broken')).rejects.toThrow(
      'Redshift statement failed'
    )
  })

  it('quotes describe schema and destroys the Data API client', async () => {
    const api = new FakeRedshiftDataApi(() => ({
      rows: [],
      columns: []
    }))
    const runner = createRunner(api)
    await runner.describe('tenant"schema', 'SELECT 1;')
    expect(api.queries[0]).toBe(
      'SET search_path TO "tenant""schema"; SELECT 1 LIMIT 1'
    )
    await runner.teardown()
    expect(api.destroyCalls).toBe(1)
  })
})

import 'reflect-metadata'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import plugin, {
  MSSQL_TYPE,
  MssqlClient,
  MssqlClientFactory,
  MssqlClientOptions,
  MssqlDataSourceStrategy,
  MssqlDriverResult,
  MssqlImportError,
  MssqlRunner,
  typeToMssql
} from '../index.js'

class FakeMssqlClient implements MssqlClient {
  readonly calls: Array<{
    statement: string
    parameters?: Readonly<Record<string, unknown>>
  }> = []
  closeCalls = 0

  constructor(
    private readonly handler: (
      statement: string
    ) => MssqlDriverResult | Promise<MssqlDriverResult> = () => ({
      recordset: []
    })
  ) {}

  async query(
    statement: string,
    parameters?: Readonly<Record<string, unknown>>
  ): Promise<MssqlDriverResult> {
    this.calls.push({ statement, parameters })
    return this.handler(statement)
  }

  async close(): Promise<void> {
    this.closeCalls += 1
  }
}

const options = {
  host: 'sql.example.com',
  port: 1433,
  username: 'sa',
  password: 'secret',
  database: 'analytics',
  catalog: 'dbo',
  use_ssl: true,
  queryTimeout: 30_000
}

function createRunner(
  client: MssqlClient,
  capture?: (options: MssqlClientOptions) => void
): MssqlRunner {
  const factory: MssqlClientFactory = (clientOptions) => {
    capture?.(clientOptions)
    return client
  }
  return new MssqlRunner(options, factory)
}

describe('@xpert-ai/plugin-mssql', () => {
  it('exports aligned metadata and strategy configuration', async () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-mssql',
      version: '0.0.1',
      category: 'database'
    })
    expect(
      Reflect.getMetadata(DATASOURCE_STRATEGY, MssqlDataSourceStrategy)
    ).toBe(MSSQL_TYPE)
    await expect(
      new MssqlDataSourceStrategy().configurationSchema()
    ).resolves.toMatchObject({
      required: ['username', 'password', 'database'],
      secret: ['password']
    })
  })

  it('builds scoped pool and JDBC settings', () => {
    let clientOptions: MssqlClientOptions | undefined
    const runner = createRunner(new FakeMssqlClient(), (configured) => {
      clientOptions = configured
    })
    expect(runner.jdbcDriver).toBe(
      'com.microsoft.sqlserver.jdbc.SQLServerDriver'
    )
    expect(runner.jdbcUrl()).toBe(
      'jdbc:sqlserver://sql.example.com:1433;' +
        'databaseName=analytics;user=sa;password=secret;encrypt=false;'
    )
    expect(clientOptions).toMatchObject({
      database: 'analytics',
      encrypt: true,
      trustServerCertificate: false,
      requestTimeout: 30_000
    })
  })

  it('maps query rows and SQL Server column values', async () => {
    const client = new FakeMssqlClient(() => ({
      recordset: [
        {
          id: 7,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z')
        }
      ]
    }))
    await expect(createRunner(client).runQuery('SELECT 1')).resolves.toEqual({
      status: 'OK',
      data: [
        {
          id: 7,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z')
        }
      ],
      columns: [
        { name: 'id', type: 'number', dataType: 'number' },
        { name: 'active', type: 'boolean', dataType: 'boolean' },
        { name: 'createdAt', type: 'timestamp', dataType: 'object' }
      ]
    })
  })

  it('groups information schema rows', async () => {
    const client = new FakeMssqlClient(() => ({
      recordset: [
        {
          table_catalog: 'analytics',
          table_schema: 'dbo',
          table_name: 'events',
          column_name: 'id',
          data_type: 'bigint'
        }
      ]
    }))
    await expect(
      createRunner(client).getSchema('dbo', 'events')
    ).resolves.toEqual([
      {
        schema: 'dbo',
        name: 'dbo',
        catalog: 'analytics',
        tables: [
          {
            schema: 'dbo',
            name: 'events',
            columns: [
              { name: 'id', dataType: 'bigint', type: 'number' }
            ]
          }
        ]
      }
    ])
  })

  it('imports rows with parameterized statements', async () => {
    const client = new FakeMssqlClient()
    await createRunner(client).import(
      {
        name: 'events',
        columns: [
          {
            name: 'id',
            fieldName: 'event_id',
            type: 'Number',
            isKey: true
          },
          {
            name: 'title',
            fieldName: 'title',
            type: 'String',
            isKey: false,
            length: 80
          }
        ],
        data: [{ id: 1, title: 'open' }]
      },
      { catalog: 'reporting' }
    )
    expect(client.calls.map(({ statement }) => statement)).toEqual([
      'DROP TABLE IF EXISTS [reporting].[events]',
      expect.stringContaining('CREATE TABLE [reporting].[events]'),
      'INSERT INTO [reporting].[events] ([event_id], [title]) VALUES (@p0, @p1)'
    ])
    expect(client.calls[2].parameters).toEqual({
      p0: 1,
      p1: 'open'
    })
  })

  it('reports executed statements when import fails', async () => {
    const client = new FakeMssqlClient((statement) => {
      if (statement.startsWith('IF OBJECT_ID')) {
        throw new Error('create failed')
      }
      return { recordset: [] }
    })
    const promise = createRunner(client).import({
      name: 'events',
      columns: [
        {
          name: 'id',
          fieldName: 'id',
          type: 'Number',
          isKey: true
        }
      ],
      data: []
    })
    await expect(promise).rejects.toBeInstanceOf(MssqlImportError)
    await expect(promise).rejects.toMatchObject({
      statements: [
        'DROP TABLE IF EXISTS [dbo].[events]',
        expect.stringContaining('CREATE TABLE [dbo].[events]')
      ]
    })
  })

  it('uses SQL Server types, describe syntax, and closes the pool', async () => {
    const client = new FakeMssqlClient()
    const runner = createRunner(client)
    expect(typeToMssql('String', 40)).toBe('VARCHAR(40)')
    await runner.describe('dbo', 'SELECT id FROM events;')
    expect(client.calls[0].statement).toContain('SELECT TOP (1)')
    expect(client.calls[0].statement).not.toContain(' LIMIT ')
    await runner.teardown()
    expect(client.closeCalls).toBe(1)
  })
})

import 'reflect-metadata'
import { Readable, Writable } from 'node:stream'
import {
  DBTableAction,
  DATASOURCE_STRATEGY,
  File
} from '@xpert-ai/plugin-sdk'
import type { ClientConfig } from 'pg'
import plugin, {
  POSTGRES_TYPE,
  PostgresClient,
  PostgresDataSourceStrategy,
  PostgresDriverResult,
  PostgresRunner,
  typeToPostgres
} from '../index.js'

type QueryHandler = (
  query: string,
  values: readonly unknown[]
) => PostgresDriverResult | PostgresDriverResult[] | Promise<PostgresDriverResult | PostgresDriverResult[]>

class FakePostgresClient implements PostgresClient {
  readonly queries: Array<{ query: string; values: readonly unknown[] }> = []
  readonly copyStatements: string[] = []
  readonly copiedChunks: string[] = []
  connectCalls = 0
  endCalls = 0
  connectErrors: Error[] = []

  constructor(private readonly handler: QueryHandler = () => driverResult()) {}

  async connect(): Promise<void> {
    this.connectCalls += 1
    const error = this.connectErrors.shift()
    if (error) {
      throw error
    }
  }

  async query(
    query: string,
    values: readonly unknown[] = []
  ): Promise<PostgresDriverResult | PostgresDriverResult[]> {
    this.queries.push({ query, values })
    return this.handler(query, values)
  }

  copyFrom(statement: string): Writable {
    this.copyStatements.push(statement)
    return new Writable({
      write: (chunk: Buffer | string, _encoding, callback) => {
        this.copiedChunks.push(
          Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
        )
        callback()
      }
    })
  }

  async end(): Promise<void> {
    this.endCalls += 1
  }
}

const options = {
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'secret',
  database: 'analytics'
}

function createRunner(client: PostgresClient): PostgresRunner {
  return new PostgresRunner(
    options,
    (config: ClientConfig): PostgresClient => {
      void config
      return client
    }
  )
}

function driverResult(
  rows: PostgresDriverResult['rows'] = [],
  fields: PostgresDriverResult['fields'] = []
): PostgresDriverResult {
  return { rows, fields }
}

function createCsvFile(content: string): File {
  const buffer = Buffer.from(content)
  return {
    fieldname: 'file',
    originalname: 'data.csv',
    encoding: '7bit',
    mimetype: 'text/csv',
    size: buffer.length,
    stream: Readable.from([buffer]),
    destination: '',
    filename: 'data.csv',
    path: '',
    buffer
  }
}

describe('@xpert-ai/plugin-postgres', () => {
  it('exports aligned database plugin metadata', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-postgres',
      version: '0.0.1',
      category: 'database'
    })
    expect(plugin.config.schema.safeParse({}).success).toBe(true)
  })

  it('registers the pg data source strategy and legacy configuration', async () => {
    expect(
      Reflect.getMetadata(DATASOURCE_STRATEGY, PostgresDataSourceStrategy)
    ).toBe(POSTGRES_TYPE)

    const strategy = new PostgresDataSourceStrategy()
    await expect(strategy.configurationSchema()).resolves.toMatchObject({
      required: ['database'],
      secret: expect.arrayContaining(['password', 'sslrootcertFile'])
    })
  })

  it('runs queries with a safely quoted search path and maps field OIDs', async () => {
    const client = new FakePostgresClient((query) =>
      query.startsWith('SET ')
        ? driverResult()
        : driverResult(
            [{ id: 7, title: 'event' }],
            [
              { name: 'id', dataTypeId: 23 },
              { name: 'title', dataTypeId: 1043 }
            ]
          )
    )
    const runner = createRunner(client)

    await expect(
      runner.runQuery('SELECT id, title FROM events', {
        catalog: 'tenant"schema'
      })
    ).resolves.toEqual({
      status: 'OK',
      data: [{ id: 7, title: 'event' }],
      columns: [
        { name: 'id', type: 'number', dataType: 'int4' },
        { name: 'title', type: 'string', dataType: 'varchar' }
      ]
    })
    expect(client.queries[0].query).toBe(
      'SET search_path TO "tenant""schema"'
    )
  })

  it('retries connection after a failed connection attempt', async () => {
    const client = new FakePostgresClient()
    client.connectErrors.push(new Error('connection refused'))
    const runner = createRunner(client)

    await expect(runner.runQuery('SELECT 1')).rejects.toThrow(
      'connection refused'
    )
    await expect(runner.runQuery('SELECT 1')).resolves.toMatchObject({
      status: 'OK'
    })
    expect(client.connectCalls).toBe(2)
  })

  it('groups PostgreSQL metadata into schemas and tables', async () => {
    const client = new FakePostgresClient(() =>
      driverResult([
        {
          table_schema: 'public',
          table_name: 'events',
          column_name: 'id',
          data_type: 'integer',
          is_nullable: 'NO',
          ordinal_position: 1,
          table_comment: 'Events'
        },
        {
          table_schema: 'public',
          table_name: 'events',
          column_name: 'payload',
          data_type: 'jsonb',
          is_nullable: 'YES',
          ordinal_position: 2,
          table_comment: 'Events'
        }
      ])
    )
    const runner = createRunner(client)

    await expect(runner.getSchema('public', 'events')).resolves.toEqual([
      {
        schema: 'public',
        name: 'public',
        tables: [
          {
            schema: 'public',
            name: 'events',
            label: 'Events',
            columns: [
              {
                name: 'id',
                type: 'number',
                label: undefined,
                dataType: 'integer',
                nullable: false,
                position: 1
              },
              {
                name: 'payload',
                type: 'object',
                label: undefined,
                dataType: 'jsonb',
                nullable: true,
                position: 2
              }
            ]
          }
        ]
      }
    ])
  })

  it('imports rows with parameterized batches and legacy delete semantics', async () => {
    const client = new FakePostgresClient()
    const runner = createRunner(client)

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
        data: [
          {
            id: 1,
            createdAt: new Date('2026-01-02T03:04:05.000Z')
          }
        ]
      },
      { catalog: 'public' }
    )

    expect(client.queries.map(({ query }) => query)).toEqual([
      'DROP TABLE IF EXISTS "public"."events"',
      expect.stringContaining('CREATE TABLE IF NOT EXISTS "public"."events"'),
      'INSERT INTO "public"."events" ("id", "created_at") VALUES ($1, $2)'
    ])
    expect(client.queries[2].values).toEqual([
      1,
      '2026-01-02T03:04:05.000Z'
    ])
  })

  it('streams CSV through COPY FROM STDIN', async () => {
    const client = new FakePostgresClient()
    const runner = createRunner(client)

    await runner.importCsv(
      {
        name: 'sales',
        columns: [
          {
            name: 'id',
            fieldName: 'id',
            type: 'String',
            isKey: true
          },
          {
            name: 'amount',
            fieldName: 'amount',
            type: 'Number',
            isKey: false
          }
        ],
        file: createCsvFile('id,amount\n1,10\n'),
        mergeType: 'DELETE'
      },
      { catalog: 'demo' }
    )

    expect(client.copyStatements).toEqual([
      'COPY "demo"."sales" ("id", "amount") FROM STDIN WITH (FORMAT csv, HEADER true, DELIMITER \',\')'
    ])
    expect(client.copiedChunks.join('')).toBe('id,amount\n1,10\n')
    expect(client.queries[1].query).not.toContain('PRIMARY KEY')
  })

  it('rejects header-only CSV before running SQL', async () => {
    const client = new FakePostgresClient()
    const runner = createRunner(client)

    await expect(
      runner.importCsv({
        name: 'sales',
        columns: [
          {
            name: 'id',
            fieldName: 'id',
            type: 'String',
            isKey: false
          }
        ],
        file: createCsvFile('id\n')
      })
    ).rejects.toThrow('CSV file has header but no data rows')
    expect(client.queries).toHaveLength(0)
  })

  it('supports table creation and reports import statements on failure', async () => {
    const client = new FakePostgresClient((query) => {
      if (query.startsWith('CREATE TABLE')) {
        throw new Error('create failed')
      }
      return driverResult()
    })
    const runner = createRunner(client)

    await expect(
      runner.import({
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
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'PostgresOperationError',
        message: 'create failed',
        statements: [
          'DROP TABLE IF EXISTS "events"',
          'CREATE TABLE IF NOT EXISTS "events" ("id" INTEGER PRIMARY KEY)'
        ]
      })
    )
  })

  it('creates tables through the unified table operation contract', async () => {
    const client = new FakePostgresClient()
    const runner = createRunner(client)

    await runner.tableOp(DBTableAction.CREATE_TABLE, {
      schema: 'public',
      table: 'accounts',
      columns: [
        {
          name: 'id',
          fieldName: 'id',
          type: 'uuid',
          isKey: true,
          required: true
        }
      ]
    })

    expect(client.queries.at(-1)?.query).toBe(
      'CREATE TABLE IF NOT EXISTS "public"."accounts" ("id" UUID PRIMARY KEY NOT NULL)'
    )
  })

  it('maps application column types to PostgreSQL types', () => {
    expect(typeToPostgres('String', 80)).toBe('VARCHAR(80)')
    expect(typeToPostgres('Int')).toBe('INTEGER')
    expect(typeToPostgres('Datetime')).toBe('TIMESTAMP')
    expect(typeToPostgres('object')).toBe('JSONB')
  })
})

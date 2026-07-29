import 'reflect-metadata'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import type {
  QueryOptions,
  QueryResult
} from '@xpert-ai/plugin-sdk'
import plugin, {
  MARIADB_TYPE,
  MariaDbDataSourceStrategy,
  MariaDbRunner
} from '../index.js'

class TestMariaDbRunner extends MariaDbRunner {
  readonly queries: Array<{
    query: string
    options?: QueryOptions
  }> = []

  constructor(private readonly queryError?: Error) {
    super({
      host: 'mariadb.example.com',
      port: 3307,
      username: 'analyst',
      password: 's ecret',
      catalog: 'sales data'
    })
  }

  override async runQuery(
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult> {
    this.queries.push({ query, options })
    if (this.queryError) {
      throw this.queryError
    }
    return {
      status: 'OK',
      data: []
    }
  }
}

describe('@xpert-ai/plugin-mariadb', () => {
  it('exports aligned database plugin metadata', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-mariadb',
      version: '0.0.1',
      category: 'database'
    })
  })

  it('registers the legacy mariadb strategy', async () => {
    expect(
      Reflect.getMetadata(DATASOURCE_STRATEGY, MariaDbDataSourceStrategy)
    ).toBe(MARIADB_TYPE)

    await expect(
      new MariaDbDataSourceStrategy().configurationSchema()
    ).resolves.toMatchObject({
      required: ['username', 'password'],
      secret: ['password']
    })
  })

  it('uses MariaDB identity and safely encoded JDBC metadata', () => {
    const runner = new TestMariaDbRunner()

    expect(runner.type).toBe('mariadb')
    expect(runner.name).toBe('MariaDB')
    expect(runner.jdbcDriver).toBe('org.mariadb.jdbc.Driver')
    expect(runner.jdbcUrl('tenant schema')).toBe(
      'jdbc:mariadb://mariadb.example.com:3307/sales%20data?' +
        'currentSchema=tenant%20schema&user=analyst&password=s%20ecret'
    )
  })

  it('executes inherited MySQL catalog behavior', async () => {
    const runner = new TestMariaDbRunner()

    await runner.createCatalog('new_catalog')
    expect(runner.queries).toEqual([
      {
        query: 'CREATE DATABASE IF NOT EXISTS `new_catalog`',
        options: { catalog: 'new_catalog' }
      }
    ])
  })

  it('propagates inherited query errors', async () => {
    const runner = new TestMariaDbRunner(
      new Error('MariaDB connection refused')
    )

    await expect(runner.createCatalog('new_catalog')).rejects.toThrow(
      'MariaDB connection refused'
    )
  })
})

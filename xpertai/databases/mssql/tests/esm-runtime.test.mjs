import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sql from 'mssql'
import plugin, {
  MSSQL_TYPE,
  MssqlDataSourceStrategy,
  MssqlRunner
} from '@xpert-ai/plugin-mssql'

test('the built ESM entry constructs the real MSSQL client without connecting', async (t) => {
  assert.equal(typeof sql.ConnectionPool, 'function')
  const connect = t.mock.method(sql.ConnectionPool.prototype, 'connect', () => {
    throw new Error('Metadata inspection must not connect to SQL Server')
  })

  const runner = new MssqlRunner()
  t.after(() => runner.teardown())

  assert.equal(plugin.meta.name, '@xpert-ai/plugin-mssql')
  assert.equal(runner.type, MSSQL_TYPE)
  assert.equal(runner.name, 'MSSQL')
  assert.deepEqual(runner.configurationSchema.required, ['username', 'password', 'database'])
  assert.equal(connect.mock.callCount(), 0)
})

test('registered driver enumeration and schema inspection do not open a connection', async (t) => {
  const connect = t.mock.method(sql.ConnectionPool.prototype, 'connect', () => {
    throw new Error('Metadata inspection must not connect to SQL Server')
  })
  const strategy = new MssqlDataSourceStrategy()
  const Runner = strategy.getClassType()
  const runner = new Runner()
  t.after(() => runner.teardown())

  assert.equal(runner.type, strategy.type)
  assert.equal(runner.type, 'mssql')
  assert.deepEqual(await strategy.configurationSchema(), runner.configurationSchema)
  assert.equal(connect.mock.callCount(), 0)
})

import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MySQLRunner } from '../dist/lib/mysql.js'
import { DorisRunner } from '../dist/lib/doris.strategy.js'

for (const [name, Base, create, execute] of [
  ['MySQL', MySQLRunner, 'createConnection', 'query'],
  ['Doris', DorisRunner, '_createConnection', 'queryDoris'],
]) {
  test(`${name} isolates database connections, forwards parameters, and releases every connection`, async () => {
    const connections = []
    class Runner extends Base {
      [create](database) {
        const connection = { database, destroyed: 0, destroy() { this.destroyed++ } }
        connections.push(connection)
        return connection
      }
      async [execute](connection, sql, parameters) {
        return { connection, sql, parameters }
      }
    }
    const runner = new Runner({ host: 'test.invalid', catalog: 'first' })
    const first = await runner.runQuery('SELECT ?', { params: ['one'] })
    const second = await runner.runQuery('SELECT ?', { catalog: 'second', params: ['two'] })
    const again = await runner.runQuery('SELECT ?', { catalog: 'first', params: ['three'] })
    assert.notEqual(first.connection, second.connection)
    assert.equal(first.connection, again.connection)
    assert.equal(first.connection.database, 'first')
    assert.equal(second.connection.database, 'second')
    assert.deepEqual(second.parameters, ['two'])
    await runner.teardown()
    assert.equal(connections.length, 2)
    assert.ok(connections.every((connection) => connection.destroyed === 1))
  })
}

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DorisWorkbenchAdapter, requireDorisReadStatement } from '../dist/doris.js'
import { DorisRunner } from '../dist/lib/doris.strategy.js'
import { StarRocksDataSourceStrategy } from '../dist/lib/starrocks.strategy.js'
const result = (rows = [], columns = []) => ({
  rows,
  columns,
  durationMs: 0,
  hasMore: false,
  truncated: false,
  outcome: 'succeeded',
  diagnostics: []
})
function mock() {
  const calls = [],
    closed = { count: 0 }
  const wire = {
    async execute(sql, parameters, options) {
      calls.push({ sql, parameters, options })
      return /version_comment/.test(sql)
        ? result([['5.7.99']])
        : /INSERT/.test(sql)
        ? { ...result(), affectedRows: 2 }
        : result(Array.from({ length: 1501 }, (_, i) => [i]))
    },
    async close() {
      closed.count++
    },
    async importRows(input) {
      return {
        outcome: 'succeeded',
        label: input.operationId,
        loadedRows: input.rows.length,
        filteredRows: 0,
        diagnostics: []
      }
    }
  }
  return { adapter: new DorisWorkbenchAdapter(wire, { database: 'config' }), calls, closed }
}
test('Doris extends reads only for known time/user functions and table metadata', () => {
  for (const sql of [
    'SELECT CURRENT_USER(),CURRENT_TIME(),UNIX_TIMESTAMP(),NOW()',
    'SHOW TABLETS FROM `sc_task`',
    'SHOW DATA FROM `sc_task`',
    'SHOW CREATE TABLE `sc_task`',
    'SELECT * FROM sc_owner WHERE (`owner_name` = ?)',
    'SELECT COUNT(*) FROM (SELECT * FROM sc_owner WHERE (`owner_name` = ?)) AS n'
  ])
    assert.equal(requireDorisReadStatement(sql), sql)
  for (const sql of [
    'SELECT SLEEP(5)',
    'SELECT * FROM MYSQL("host"="evil")',
    'SELECT 1; DROP TABLE x',
    'SHOW TABLETS FROM x; SELECT 1',
    'SELECT foo.CURRENT_USER()',
    'SELECT `CURRENT_USER`()',
    "SELECT 1 INTO OUTFILE '/tmp/x'",
    'SELECT /*!50000 SLEEP(5) */ 1'
  ])
    assert.throws(() => requireDorisReadStatement(sql))
})
test('Doris query supports >1000 rows and INSERT VALUES without a misleading MySQL version gate', async () => {
  const { adapter, calls, closed } = mock()
  assert.equal((await adapter.query({ mode: 'read', sql: 'SELECT * FROM sc_task', limit: 5000 })).rows.length, 1501)
  assert.equal(calls[0].sql, 'SET query_timeout = 30')
  assert.match(calls[1].sql, /LIMIT 5001 OFFSET 0/)
  assert.equal(
    (await adapter.query({ mode: 'write', sql: 'INSERT INTO sc_task (seq_no) VALUES (?)', parameters: [42] }))
      .affectedRows,
    2
  )
  assert.deepEqual(calls[2].parameters, [42])
  await assert.rejects(
    () => adapter.query({ mode: 'write', sql: 'UPDATE sc_task SET active = TRUE' }),
    /version_writes/
  )
  await assert.rejects(() => adapter.transaction('begin'), /transactions_not_supported/)
  await adapter.close()
  assert.equal(closed.count, 1)
  await assert.rejects(() => adapter.query({ mode: 'read', sql: 'SELECT 1' }), /session_closed/)
})
for (const prefix of ['/* SELECT; user note */ ', '-- user note\n', '# user note\n', ' \n/* note */\n-- note\n']) {
  for (const statement of [
    'SELECT * FROM sc_task WHERE seq_no > ?',
    'WITH tasks AS (SELECT * FROM sc_task WHERE seq_no > ?) SELECT * FROM tasks'
  ]) {
    test(`Doris paginates commented queries: ${JSON.stringify(prefix)} ${statement.split(' ')[0]}`, async () => {
      const calls = []
      const wire = {
        async execute(sql, parameters, options) {
          calls.push({ sql, parameters, options })
          if (sql.startsWith('SET query_timeout')) return result()
          const page = sql.match(/LIMIT (\d+) OFFSET (\d+)$/)
          const start = Number(page?.[2] ?? 0)
          const end = Math.min(1501, start + Number(page?.[1] ?? options.maxRows))
          return result(Array.from({ length: end - start }, (_, i) => [start + i]))
        },
        async close() {}
      }
      const adapter = new DorisWorkbenchAdapter(wire, { database: 'config' })
      const sql = prefix + statement
      const first = await adapter.query({ mode: 'read', sql, parameters: [42], limit: 1000 })
      assert.equal(first.rows.length, 1000)
      assert.equal(first.hasMore, true)
      assert.equal(calls[1].sql, `SELECT * FROM (\n${sql.trim()}\n) AS \`_db_studio_page\` LIMIT 1001 OFFSET 0`)
      const second = await adapter.query({ mode: 'read', sql, parameters: [42], limit: 1000, offset: 1000 })
      assert.deepEqual(second.rows, Array.from({ length: 501 }, (_, i) => [1000 + i]))
      assert.equal(second.hasMore, false)
      assert.equal(calls[3].sql, `SELECT * FROM (\n${sql.trim()}\n) AS \`_db_studio_page\` LIMIT 1001 OFFSET 1000`)
      assert.deepEqual(calls[3].parameters, [42])
      assert.equal(calls[3].options.maxRows, 1001)
      await adapter.close()
    })
  }
}
test('Doris explain accepts leading comments while metadata offsets and unsafe SQL stay rejected', async () => {
  const { adapter, calls } = mock()
  const sql = '/* user note */ SELECT * FROM sc_task'
  await adapter.explain({ sql })
  assert.equal(calls[1].sql, `EXPLAIN ${sql}`)
  for (const source of ['SHOW COLUMNS FROM sc_task', '/* note */ SHOW COLUMNS FROM sc_task'])
    await assert.rejects(() => adapter.query({ mode: 'read', sql: source, offset: 1 }), /cannot_be_paginated/)
  for (const source of [
    '/* note */ SELECT 1; SELECT 2',
    '-- note\nSELECT SLEEP(5)',
    '/*!50000 SELECT */ SELECT 1',
    '/* note */ UPDATE sc_task SET active = TRUE'
  ])
    await assert.rejects(() => adapter.query({ mode: 'read', sql: source }))
  assert.equal(calls.length, 2)
  await adapter.close()
})
test('Doris location checks, import shape and cancellation boundary', async () => {
  const { adapter } = mock()
  await assert.rejects(() => adapter.query({ mode: 'read', sql: 'SELECT 1', database: 'other' }), /new_connection/)
  await assert.rejects(() => adapter.query({ mode: 'read', sql: 'SELECT 1', limit: Infinity }), /query_bound/)
  await assert.rejects(
    () => adapter.importRows({ table: 'x', columns: ['id', 'id'], rows: [[1, 2]], operationId: 'operation' }),
    /invalid_import/
  )
  assert.equal(
    (
      await adapter.importRows({
        table: 'x',
        columns: ['id'],
        rows: Array.from({ length: 10001 }, () => [1]),
        operationId: 'operation'
      })
    ).loadedRows,
    10001
  )
  await adapter.cancel()
})
test('StarRocks keeps the generic adapter, Doris uses its explicit engine implementation', async () => {
  const options = { host: 'localhost', username: 'fixture', password: 'fixture', catalog: 'config' }
  const doris = new DorisRunner(options).getWorkbenchAdapter()
  const starrocks = (await new StarRocksDataSourceStrategy().create(options)).getWorkbenchAdapter()
  assert.ok(doris instanceof DorisWorkbenchAdapter)
  assert.ok(!(starrocks instanceof DorisWorkbenchAdapter))
  await doris.close()
  await starrocks.close()
})

test('optional Doris SHOW server errors do not poison the next metadata query', async () => {
  const { EventEmitter } = await import('node:events')
  const { createDorisConnection } = await import('../dist/doris.js')
  let destroyed = 0
  const driver = {
    destroy: () => destroyed++,
    query(config) {
      const event = new EventEmitter()
      queueMicrotask(() => {
        if (config.sql.startsWith('SHOW TABLETS'))
          event.emit('error', { code: 'ER_TABLEACCESS_DENIED_ERROR', fatal: false })
        else event.emit('end')
      })
      return event
    }
  }
  const adapter = createDorisConnection(
    { host: 'localhost', username: 'fixture', password: 'fixture', catalog: 'config' },
    driver
  )
  await assert.rejects(
    () => adapter.query({ sql: 'SHOW TABLETS FROM sc_task', mode: 'read' }),
    /ER_TABLEACCESS_DENIED_ERROR/
  )
  assert.equal(destroyed, 0)
  assert.equal((await adapter.query({ sql: 'SHOW DATA FROM sc_task', mode: 'read' })).outcome, 'succeeded')
  await adapter.close()
  assert.equal(destroyed, 1)
})

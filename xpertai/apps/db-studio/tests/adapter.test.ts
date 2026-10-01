import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SqlDatabaseWorkbenchAdapter,
  requireReadStatement,
  splitWorkbenchSql,
  quoteDatabaseIdentifier,
  type DatabaseResult,
  type WorkbenchTransport,
} from '@xpert-ai/plugin-sdk/data-workbench'
import { parseStreamLoadReceipt } from '../../../databases/mysql/dist/lib/doris-stream-load.js'
import { parseCsv, parseImport, exportResult } from '../src/lib/transfer.js'
const result = (rows: DatabaseResult['rows'] = [], names = ['value']): DatabaseResult => ({
  columns: names.map((name, i) => ({ id: `c${i}`, name, dataType: 'text' })),
  rows,
  durationMs: 1,
  hasMore: false,
  truncated: false,
  outcome: 'succeeded',
  diagnostics: [],
})
const forbidden = [
  'DELETE FROM t',
  'SELECT 1; UPDATE t SET x=1',
  'WITH t AS (DELETE FROM t RETURNING *) SELECT * FROM t',
  "SELECT * INTO OUTFILE '/tmp/data' FROM t",
  'SELECT pg_sleep(1)',
  'SELECT "pg_sleep"(1)',
  'SELECT my_custom_mutator()',
  'SELECT 1 FOR UPDATE',
  'EXPLAIN ANALYZE SELECT 1',
  'EXPLAIN (ANALYZE true) SELECT 1',
  'CALL p()',
  'SHOW PROCESSLIST',
  'SELECT @x:=1',
  "SELECT 1 /*!50000 INTO OUTFILE 'a' */",
  'SELECT * FROM t FOR SHARE',
  "SELECT * FROM jdbc('external')",
  "SELECT nextval('sequence')",
]
for (const sql of forbidden)
  test(`read-only rejects ${sql.slice(0, 55)}`, () => assert.throws(() => requireReadStatement(sql)))
for (const sql of [
  "SELECT ';DELETE' AS label",
  '/*comment*/ SELECT 1',
  'WITH q AS (SELECT 1) SELECT * FROM q',
  'SELECT COUNT(*) FROM t',
  'SHOW CREATE TABLE `a``b`',
  'EXPLAIN FORMAT=JSON SELECT 1',
  'EXPLAIN (FORMAT JSON) SELECT 1',
  'SELECT $1 AS value',
])
  test(`read-only accepts ${sql.slice(0, 55)}`, () => assert.equal(typeof requireReadStatement(sql), 'string'))
test('lexer does not split quoted literals or comments', () =>
  assert.equal(splitWorkbenchSql("SELECT ';'; -- a ; b\nSELECT $$; DELETE$$").length, 2))
test('identifier quoting prevents scope injection', () => {
  assert.equal(quoteDatabaseIdentifier('a`b', 'doris'), '`a``b`')
  assert.equal(quoteDatabaseIdentifier('a"b', 'postgres'), '"a""b"')
  assert.throws(() => quoteDatabaseIdentifier('bad\nname', 'mysql'))
})
for (const engine of ['mysql', 'postgres', 'doris'] as const)
  test(`${engine}: parameters, precision, duplicate columns, paging and isolation`, async () => {
    const calls: Array<{ sql: string; parameters: unknown[] }> = []
    let closed = 0
    const transport: WorkbenchTransport = {
      execute: async (sql, parameters) => {
        calls.push({ sql, parameters })
        return sql.includes('SELECT ? AS a')
          ? result(
              [
                ['9007199254740993', '0.123456789012345678901'],
                ['2', '3'],
                ['4', '5'],
              ],
              ['duplicate', 'duplicate']
            )
          : result()
      },
      close: async () => {
        closed++
      },
    }
    const adapter = new SqlDatabaseWorkbenchAdapter(engine, transport, {
      database: 'db',
      schema: engine === 'postgres' ? 'public' : undefined,
    })
    const page = await adapter.query({
      database: 'db',
      sql: 'SELECT ? AS a',
      parameters: ["quoted'value"],
      mode: 'read',
      limit: 2,
      offset: 4,
    })
    assert.deepEqual(page.rows[0], ['9007199254740993', '0.123456789012345678901'])
    assert.equal(page.rows.length, 2)
    assert.equal(page.hasMore, true)
    assert.notEqual(page.columns[0].id, page.columns[1].id)
    const executed = calls.find((call) => call.sql.includes('SELECT ? AS a'))!
    assert.match(executed.sql, /LIMIT 3 OFFSET 4/)
    assert.deepEqual(executed.parameters, ["quoted'value"])
    if (engine !== 'doris') {
      assert.match(calls[0].sql, /READ ONLY/)
      assert.equal(calls.at(-1)?.sql, 'ROLLBACK')
    } else assert.equal(calls.length, 1)
    await assert.rejects(() => adapter.query({ sql: 'SELECT 1', database: 'other', mode: 'read' }), /new_connection/)
    await adapter.cancel()
    assert.equal(closed, 1)
  })
for (const version of ['doris-2.1.7', 'doris-3.0.8', 'doris-4.0.0', '5.7.99', 'unavailable'])
  test(`Doris version capability: ${version}`, async () => {
    const adapter = new SqlDatabaseWorkbenchAdapter('doris', {
      execute: async (sql) => {
        assert.match(sql, /@@version_comment/)
        return result([[version]])
      },
      close: async () => {},
    })
    const caps = await adapter.capabilities()
    assert.equal(caps.transactions, false)
    assert.equal(caps.writes, version.startsWith('doris-'))
    assert.equal(caps.nativeReadOnly, false)
  })
for (const engine of ['mysql', 'postgres'] as const)
  test(`${engine}: transaction uses one connection for bounded reads and writes`, async () => {
    const commands: string[] = []
    const adapter = new SqlDatabaseWorkbenchAdapter(engine, {
      execute: async (sql) => {
        commands.push(sql)
        return result()
      },
      close: async () => {},
    })
    await adapter.transaction('begin')
    await adapter.query({ mode: 'read', sql: 'SELECT 1' })
    await adapter.query({ mode: 'write', sql: 'UPDATE t SET v=1' })
    await adapter.transaction('commit')
    assert.equal(commands[0], 'BEGIN')
    assert.match(commands[1], engine === 'mysql' ? /^SELECT 1\nLIMIT 101 OFFSET 0$/ : /_db_studio_page/)
    if (engine === 'mysql') assert.doesNotMatch(commands[1], /FROM \(/)
    assert.equal(commands.filter((sql) => sql === 'BEGIN').length, 1)
    assert.equal(commands.at(-1), 'COMMIT')
  })
test('transaction reservations reject concurrent begins', async () => {
  let release: () => void = () => {}
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const adapter = new SqlDatabaseWorkbenchAdapter('mysql', {
    execute: async () => {
      await waiting
      return result()
    },
    close: async () => {},
  })
  const first = adapter.transaction('begin')
  await assert.rejects(() => adapter.transaction('begin'), /session_busy/)
  release()
  await first
})
test('Doris does not inherit generic transactions', async () => {
  const adapter = new SqlDatabaseWorkbenchAdapter('doris', { execute: async () => result(), close: async () => {} })
  await assert.rejects(() => adapter.transaction('begin'), /not_supported/)
})
test('stream load receipts distinguish commit visibility and duplicate labels', () => {
  assert.deepEqual(
    parseStreamLoadReceipt({ Status: 'Success', NumberLoadedRows: 2, NumberFilteredRows: 0 }, 'stable').loadedRows,
    2
  )
  const pending = parseStreamLoadReceipt({ Status: 'Publish Timeout' }, 'stable')
  assert.equal(pending.outcome, 'pending')
  assert.equal(pending.loadedRows, undefined)
  assert.equal(
    parseStreamLoadReceipt({ Status: 'Label Already Exists', ExistingJobStatus: 'FINISHED' }, 'stable').outcome,
    'succeeded'
  )
  assert.equal(
    parseStreamLoadReceipt({ Status: 'Label Already Exists', ExistingJobStatus: 'RUNNING' }, 'stable').outcome,
    'pending'
  )
  assert.equal(parseStreamLoadReceipt({ Status: 'Fail' }, 'stable').outcome, 'unknown')
})
test('CSV quoting, multiline cells and dangerous spreadsheet formulas', () => {
  assert.deepEqual(parseCsv('a,b\r\n"a,b","line\n2"\r\n"a""b",\r\n'), [
    ['a', 'b'],
    ['a,b', 'line\n2'],
    ['a"b', ''],
  ])
  assert.throws(() => parseImport('a,a\n1,2', 'csv'))
  assert.match(exportResult(result([['=WEBSERVICE("bad")']]), 'csv'), /'=WEBSERVICE/)
  assert.throws(() => parseCsv('"never closed'))
})

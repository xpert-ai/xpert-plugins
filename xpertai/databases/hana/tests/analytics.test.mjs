import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateHanaRead, quoteHanaIdentifier } from '../dist/lib/hana-sql.js'
import { createHanaReadTransport, normalizeHanaCell } from '../dist/lib/hana-transport.js'
import { HanaWorkbenchAdapter } from '../dist/lib/hana-workbench.js'

test('HANA placeholders ignore quoted content/comments and preserve bind values', () => {
  const sql = `WITH x AS (SELECT ? AS "line?" FROM DUMMY) SELECT COALESCE("line?", '?') FROM x -- ?\n`
  assert.equal(validateHanaRead(sql, 1), sql.trim())
  assert.equal(quoteHanaIdentifier('a"b'), '"a""b"')
  assert.throws(() => validateHanaRead('SELECT ? FROM DUMMY', 0), /PARAMETER_COUNT/)
})
for (const sql of [
  'DELETE FROM t', 'SELECT * INTO x FROM t', 'SELECT 1 FROM DUMMY; DELETE FROM t',
  'WITH x AS (DELETE FROM t) SELECT * FROM x', 'CALL foo()', 'DO BEGIN SELECT 1 FROM DUMMY; END',
  'SELECT seq.NEXTVAL FROM DUMMY', 'SELECT * FROM t FOR UPDATE', 'SELECT evil() FROM DUMMY',
  'SELECT "evil"() FROM DUMMY', 'SELECT schema.SUM(x) FROM t', 'SELECT * FROM "func"(?)',
  "SELECT 'unterminated", 'SELECT 1 /* unterminated', 'SELECT 1 /* /* */ ; DELETE FROM t */',
  'SELECT * FROM t; SELECT 2 FROM DUMMY', 'SELECT $$; DELETE FROM t $$ FROM DUMMY'
]) test(`read guard rejects ${sql}`, () => assert.throws(() => validateHanaRead(sql, 0)))

test('HANA analytics preserves exact numeric strings and rejects lossy/unsupported cells', () => {
  assert.equal(normalizeHanaCell('12345678901234567890.12345', 'DECIMAL'), '12345678901234567890.12345')
  assert.equal(normalizeHanaCell('9007199254740993', 'BIGINT'), '9007199254740993')
  assert.equal(normalizeHanaCell(42, 'BIGINT'), '42')
  assert.equal(normalizeHanaCell('2026-10-28 08:00:00.0000001', 'TIMESTAMP'), '2026-10-28 08:00:00.0000001')
  for (const [value, type] of [[0.1, 'DECIMAL'], [9007199254740992, 'BIGINT'], [NaN, 'DOUBLE'], [{}, 'JSON']]) {
    assert.throws(() => normalizeHanaCell(value, type))
  }
})

const options = { host: 'test.invalid', port: 30015, username: 'test', password: 'not-a-secret', database: 'TEST', catalog: 'SALES' }
function wire({ rows = [['1.25']], types = ['DECIMAL'], names = ['amount'], fail, hang, cellSize = 1 } = {}) {
  const calls = [], state = { closed: 0, dropped: 0, cursorClosed: 0, aborted: 0 }
  let row = -1
  const cursor = {
    getColumnInfo: () => names.map((columnName, i) => ({ columnName, nativeTypeName: types[i], nullable: 1 })),
    next: (cb) => { row++; queueMicrotask(() => cb(null, row < rows.length)) },
    getValue: (i) => rows[row][i], getValueLength: () => cellSize,
    close: (cb) => { state.cursorClosed++; cb(null) }
  }
  const statement = {
    setTimeout: (seconds) => calls.push(['timeout', seconds]),
    execQuery: (params, config, cb) => { calls.push(['execute', params, config]); if (hang !== 'query') queueMicrotask(() => cb(fail === 'query' ? new Error('secret details') : null, cursor)) },
    drop: (cb) => { state.dropped++; cb(null) }
  }
  const connection = {
    connect: (config, cb) => { calls.push(['connect', config]); if (hang !== 'connect') queueMicrotask(() => cb(fail === 'connect' ? new Error('secret password') : null)) },
    setAutoCommit: (enabled) => calls.push(['autocommit', enabled]),
    exec: (sql, cb) => { calls.push(['session', sql]); queueMicrotask(() => cb(fail === 'readonly' ? new Error('not supported') : null)) },
    prepare: (sql, cb) => { calls.push(['prepare', sql]); queueMicrotask(() => cb(fail === 'prepare' ? new Error('SQL secret') : null, statement)) },
    abort: (cb) => { state.aborted++; cb(null) }, disconnect: (cb) => { state.closed++; cb(null) }
  }
  return { connection, calls, state }
}

test('native execution establishes read-only session before preparing and binds parameters unchanged', async () => {
  const mock = wire(), transport = createHanaReadTransport(options, mock.connection)
  const result = await transport.execute('SELECT ? FROM DUMMY', ["x' OR 1=1 --"], { maxRows: 5, timeoutMs: 1000 })
  assert.deepEqual(result.rows, [['1.25']])
  assert.equal(result.outcome, 'succeeded')
  assert.deepEqual(mock.calls.map((call) => call[0]), ['connect', 'autocommit', 'session', 'prepare', 'timeout', 'execute'])
  assert.equal(mock.calls[2][1], 'SET TRANSACTION READ ONLY')
  // Connection timeouts use milliseconds; Statement.setTimeout uses seconds.
  assert.ok(mock.calls[0][1].connectTimeout > 500 && mock.calls[0][1].connectTimeout <= 1000)
  assert.ok(mock.calls[0][1].communicationTimeout > 500 && mock.calls[0][1].communicationTimeout <= 1000)
  assert.equal(mock.calls[4][1], 1)
  assert.deepEqual(mock.calls.at(-1)[1], ["x' OR 1=1 --"])
  assert.equal(mock.state.cursorClosed, 1)
  assert.equal(mock.state.dropped, 1)
  await transport.close(); await transport.close()
  assert.equal(mock.state.closed, 1)
})
test('row limit reports truncation after one extra row and keeps empty-result metadata', async () => {
  for (const rows of [[], [['1.25'], ['2.50']]]) {
    const mock = wire({ rows }), transport = createHanaReadTransport(options, mock.connection)
    const result = await transport.execute('SELECT amount FROM t', [], { maxRows: 1, timeoutMs: 1000 })
    assert.equal(result.columns[0].name, 'amount')
    assert.equal(result.rows.length, Math.min(rows.length, 1))
    assert.equal(result.truncated, rows.length > 1)
    await transport.close()
  }
})
for (const fail of ['connect', 'readonly', 'prepare', 'query']) test(`native ${fail} failure is sanitized and releases connection`, async () => {
  const mock = wire({ fail }), transport = createHanaReadTransport(options, mock.connection)
  await assert.rejects(transport.execute('SELECT 1 FROM DUMMY', [], { maxRows: 5, timeoutMs: 1000 }), /^Error: HANA_/)
  await transport.close()
  assert.equal(mock.state.closed, 1)
  if (fail === 'readonly') assert.ok(!mock.calls.some(([op]) => op === 'prepare'))
})
for (const hang of ['connect', 'query']) test(`deadline aborts hanging ${hang}`, async () => {
  const mock = wire({ hang }), transport = createHanaReadTransport(options, mock.connection)
  await assert.rejects(transport.execute('SELECT 1 FROM DUMMY', [], { maxRows: 5, timeoutMs: 20 }), /HANA_QUERY_TIMEOUT/)
  assert.equal(mock.state.aborted, 1)
  await transport.close()
})
test('cancellation closes active I/O and pre-aborted work never connects', async () => {
  for (const before of [true, false]) {
    const mock = wire({ hang: 'query' }), transport = createHanaReadTransport(options, mock.connection), controller = new AbortController()
    if (before) controller.abort()
    const pending = transport.execute('SELECT 1 FROM DUMMY', [], { maxRows: 5, timeoutMs: 1000, signal: controller.signal })
    if (!before) setTimeout(() => controller.abort(), 5)
    await assert.rejects(pending)
    if (before) assert.deepEqual(mock.calls, [])
    else assert.equal(mock.state.aborted, 1)
    await transport.close()
  }
})
test('oversize cell and LOB are rejected before fetching value', async () => {
  for (const spec of [{ cellSize: 2 * 1024 * 1024 }, { types: ['NCLOB'] }]) {
    const mock = wire(spec), transport = createHanaReadTransport(options, mock.connection)
    await assert.rejects(transport.execute('SELECT amount FROM t', [], { maxRows: 5, timeoutMs: 1000 }), /HANA_(CELL_BYTE_LIMIT|COLUMN_TYPE_UNSUPPORTED)/)
    await transport.close()
  }
})
test('driver guard rejects mutation, tenant switch and invalid parameters before transport I/O', async () => {
  const calls = [], adapter = new HanaWorkbenchAdapter({ execute: (...args) => { calls.push(args); throw new Error('unexpected') }, close: async () => {} }, { database: 'TEST', schema: 'SALES' })
  for (const input of [
    { mode: 'write', sql: 'DELETE FROM t' }, { mode: 'read', sql: 'DELETE FROM t' },
    { mode: 'read', sql: 'SELECT 1 FROM DUMMY', database: 'OTHER' },
    { mode: 'read', sql: 'SELECT 1 FROM DUMMY', engineCatalog: 'other' },
    { mode: 'read', sql: 'SELECT 1 FROM DUMMY', schema: 'OTHER' },
    { mode: 'read', sql: 'SELECT ? FROM DUMMY', parameters: [Infinity] }
  ]) await assert.rejects(adapter.query(input))
  assert.equal(calls.length, 0)
})
test('schema/table metadata uses parameters and preserves schema, kind and column comments', async () => {
  const calls = [], adapter = new HanaWorkbenchAdapter({
    execute: async (sql, parameters) => {
      calls.push({ sql, parameters })
      return { rows: sql.includes('TABLE_COLUMNS') ? [['amount', 'DECIMAL', 18, 4, 'TRUE', 1, 'Net sales']] : [['Sales', 'table'], ['SalesView', 'view']], truncated: false }
    }, close: async () => {}
  }, { database: 'TEST', schema: 'SALES' })
  const page = await adapter.objects({ schema: "SALES'", pageSize: 1 })
  assert.equal(page.hasMore, true)
  assert.equal(page.items[0].kind, 'table')
  assert.deepEqual(calls[0].parameters, ["SALES'", "SALES'", '%%'])
  assert.ok(!calls[0].sql.includes("SALES'"))
  const detail = await adapter.describe({ schema: 'SALES', kind: 'table', name: 'Sales' })
  assert.equal(detail.columns[0].dataType, 'DECIMAL(18,4)')
  assert.equal(detail.columns[0].comment, 'Net sales')
  assert.equal(detail.columns[0].nullable, true)
})

test('cleanup is bounded even when abort/disconnect callbacks stall', async () => {
  const mock = wire({ hang: 'query' })
  mock.connection.abort = () => { mock.state.aborted++ }
  mock.connection.disconnect = () => { mock.state.closed++ }
  const transport = createHanaReadTransport(options, mock.connection), started = Date.now()
  await assert.rejects(transport.execute('SELECT 1 FROM DUMMY', [], { maxRows: 1, timeoutMs: 10 }), /TIMEOUT/)
  await transport.close()
  assert.ok(Date.now() - started < 1000)
  assert.equal(mock.state.closed, 1)
})
test('a prepared statement arriving after cancellation is dropped', async () => {
  const mock = wire(), prepare = mock.connection.prepare
  mock.connection.prepare = (sql, done) => setTimeout(() => prepare(sql, done), 30)
  const transport = createHanaReadTransport(options, mock.connection)
  await assert.rejects(transport.execute('SELECT 1 FROM DUMMY', [], { maxRows: 1, timeoutMs: 5 }), /TIMEOUT/)
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(mock.state.dropped, 1)
  assert.ok(!mock.calls.some(([operation]) => operation === 'execute'))
})
test('synchronous native failures do not expose driver SQL or credentials', async () => {
  const mock = wire()
  mock.connection.setAutoCommit = () => { throw new Error('secret SQL and password') }
  const transport = createHanaReadTransport(options, mock.connection)
  await assert.rejects(transport.execute('SELECT 1 FROM DUMMY', [], { maxRows: 1, timeoutMs: 100 }), /^Error: HANA_DRIVER_FAILED$/)
  await transport.close()
})
test('a late successful connect is disconnected after the invocation has timed out', async () => {
  const mock = wire(), connect = mock.connection.connect
  mock.connection.connect = (config, done) => setTimeout(() => connect(config, done), 30)
  const transport = createHanaReadTransport(options, mock.connection)
  await assert.rejects(transport.execute('SELECT 1 FROM DUMMY', [], { maxRows: 1, timeoutMs: 5 }), /TIMEOUT/)
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(mock.state.closed, 2)
  assert.ok(!mock.calls.some(([operation]) => operation === 'prepare'))
})

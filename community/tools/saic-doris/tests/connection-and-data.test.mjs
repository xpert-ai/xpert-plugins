import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SaicConnections } from '../dist/lib/connections.js'
import { SaicDatabase, rowsOf } from '../dist/lib/database.js'
import { SaicWrites, specHash } from '../dist/lib/writes.js'
import { COLSPEC } from '../dist/lib/tables.js'
import { configQuery } from '../dist/lib/query-policy.js'
const makeResult = (rows, columns = []) => ({
  rows,
  columns,
  durationMs: 0,
  hasMore: false,
  truncated: false,
  outcome: 'succeeded',
  diagnostics: []
})
export function adapterFixture(label = 'fixture') {
  const state = {
    closed: 0,
    calls: [],
    imports: [],
    rows: [{ owner_name: label, email: `${label}@example.invalid`, active: 1 }]
  }
  const adapter = {
    engine: 'doris',
    async close() {
      state.closed++
    },
    async query(input) {
      state.calls.push(input)
      if (input.mode === 'write') return { ...makeResult([]), affectedRows: 1 }
      let data = input.sql.includes('CURRENT_USER()')
        ? [{ db: label, usr: 'fixture' }]
        : input.sql.includes('GROUP_CONCAT')
        ? [{ TABLE_NAME: 'sc_owner', TABLE_COMMENT: 'fixture', columns: 'owner_name(varchar),email(varchar)' }]
        : input.sql.includes('NOW() AS n')
        ? [{ n: `2026-10-15 12:34:${label === 'a' ? '01' : '02'}` }]
        : state.rows
      if (input.sql.includes('AS saic_count'))
        return makeResult([[data.length]], [{ id: 'c0', name: 'row_count', dataType: '8' }])
      const columns = Object.keys(data[0] ?? {}).map((name, i) => ({
        id: `c${i}`,
        name,
        dataType: typeof data[0][name] === 'number' ? '8' : '253'
      }))
      return makeResult(
        data.slice(0, input.limit).map((row) => columns.map((c) => row[c.name])),
        columns
      )
    },
    async importRows(input) {
      state.imports.push(input)
      return {
        outcome: 'succeeded',
        label: input.operationId,
        loadedRows: input.rows.length,
        filteredRows: 0,
        diagnostics: []
      }
    }
  }
  return { adapter, state }
}
export function context(config, user = 'user') {
  return {
    source: 'mcp',
    tenantId: 'tenant',
    organizationId: 'org',
    principal: { type: 'user', id: user },
    executionId: 'exec',
    requestId: 'req',
    host: { credentials: { get: async (key) => config[key] ?? null } }
  }
}
const manual = {
  mode: 'manual',
  host: 'localhost',
  username: 'fixture',
  password: 'not-a-real-secret',
  database: 'fixture'
}
test('manual connections preserve empty passwords for passwordless local Doris accounts', async () => {
  const passwords = []
  const connections = new SaicConnections(null, (options) => {
    passwords.push(options.password)
    return adapterFixture().adapter
  })
  await connections.run(context({ ...manual, password: '' }), (s) => s.ping())
  const { password, ...withoutPassword } = manual
  await connections.run(context(withoutPassword), (s) => s.ping())
  assert.deepEqual(passwords, ['', ''])
})
test('platform/manual execution is identical; config, actors, connections and clocks stay isolated', async () => {
  const created = [],
    opens = []
  const factory = (label) => {
    const f = adapterFixture(label)
    created.push(f)
    return f.adapter
  }
  const runtime = {
    require: () => ({
      list: async (actor) => {
        assert.equal(actor.userId, 'user')
        return [
          { id: 'a', name: 'A', engine: 'doris' },
          { id: 'b', name: 'B', engine: 'mysql' }
        ]
      },
      open: async (input) => {
        opens.push(input)
        return factory('a')
      }
    })
  }
  const connections = new SaicConnections(runtime, () => factory('a'))
  const result1 = await connections.run(context({ mode: 'platform', dataSourceId: 'a' }), (s) => s.get_owners())
  const result2 = await connections.run(context(manual), (s) => s.get_owners())
  assert.deepEqual(result1, result2)
  assert.deepEqual(
    created.map((f) => f.state.closed),
    [1, 1]
  )
  assert.equal(opens.length, 1)
  assert.deepEqual(
    (await connections.list({ tenantId: 'tenant', organizationId: 'org', userId: 'user' })).map((s) => s.id),
    ['a']
  )
  const clocks = [new SaicDatabase(adapterFixture('a').adapter), new SaicDatabase(adapterFixture('b').adapter)]
  assert.notEqual(await clocks[0].now(), await clocks[1].now())
  const f = adapterFixture('a'),
    db = new SaicDatabase(f.adapter)
  await db.now()
  await db.now()
  assert.equal(f.state.calls.length, 2)
})
test('missing config, wrong engine, revoked access and platform failures never fall back', async () => {
  let manualCalls = 0,
    closed = 0
  const runtime = {
    require: () => ({
      list: async () => [{ id: 'a', name: 'A', engine: 'doris' }],
      open: async () => {
        throw Error('permission_revoked')
      }
    })
  }
  const connections = new SaicConnections(runtime, () => {
    manualCalls++
    return { engine: 'mysql', close: async () => closed++ }
  })
  await assert.rejects(() => connections.run(context({}), (s) => s.ping()), /connection_config/)
  await assert.rejects(
    () => connections.run(context({ mode: 'platform', dataSourceId: 'missing' }), (s) => s.ping()),
    /unavailable_or_denied/
  )
  await assert.rejects(
    () => connections.run(context({ mode: 'platform', dataSourceId: 'a' }), (s) => s.ping()),
    /permission_revoked/
  )
  assert.equal(manualCalls, 0)
  await assert.rejects(() => connections.run(context(manual), (s) => s.ping()), /doris_engine_required/)
  assert.equal(closed, 1)
  await assert.rejects(
    () => connections.run({ ...context(manual), organizationId: '' }, (s) => s.ping()),
    /platform_scope/
  )
})
test('connection release covers exceptions and concurrent independent toolsets', async () => {
  const fixtures = []
  const connections = new SaicConnections(
    {
      require: () => {
        throw Error('unused')
      }
    },
    (options) => {
      const f = adapterFixture(options.catalog)
      fixtures.push(f)
      return f.adapter
    }
  )
  const [a, b] = await Promise.all(
    ['a', 'b'].map((database) => connections.run(context({ ...manual, database }), (s) => s.ping()))
  )
  assert.equal(a.data[0].db, 'a')
  assert.equal(b.data[0].db, 'b')
  assert.deepEqual(
    fixtures.map((f) => f.state.closed),
    [1, 1]
  )
  await assert.rejects(
    () =>
      connections.run(context(manual), async () => {
        throw Error('fixture_failure')
      }),
    /fixture_failure/
  )
  assert.equal(fixtures[2].state.closed, 1)
})
test('5000-row return cap has exact total without exposing a paging parameter', async () => {
  const f = adapterFixture()
  f.state.rows = Array.from({ length: 6001 }, (_, i) => ({ customer_part_no: `P${i}` }))
  const result = await new SaicDatabase(f.adapter).fetch('SELECT * FROM sc_part_cross_ref', [], 5000)
  assert.equal(result.rowCount, 6001)
  assert.equal(result.truncated, true)
  assert.equal(result.data.length, 5000)
  assert.equal(f.state.calls[0].limit, 1)
  assert.equal(f.state.calls[1].limit, 5000)
  assert.deepEqual(
    rowsOf(
      makeResult(
        [['1', '1', '0.12345678901234567890', '9007199254740993']],
        [
          { name: 'integer', dataType: '3' },
          { name: 'text', dataType: '253' },
          { name: 'decimal', dataType: '246' },
          { name: 'big', dataType: '8' }
        ]
      )
    ),
    [{ integer: 1, text: '1', decimal: '0.12345678901234567890', big: '9007199254740993' }]
  )
})
for (const prefix of ['/* SELECT; user note */ ', '-- user note\n', '# user note\n', ' \n/* note */\n-- note\n']) {
  for (const statement of [
    'SELECT * FROM sc_part_cross_ref WHERE customer_part_no <> ?',
    'WITH parts AS (SELECT * FROM sc_part_cross_ref WHERE customer_part_no <> ?) SELECT * FROM parts'
  ]) {
    test(`commented queries retain exact totals above the adapter cap: ${JSON.stringify(prefix)} ${statement.split(' ')[0]}`, async () => {
      const f = adapterFixture()
      f.state.rows = Array.from({ length: 60001 }, (_, i) => ({ customer_part_no: `P${i}` }))
      const sql = prefix + statement
      const result = await new SaicDatabase(f.adapter).fetch(sql, ['excluded'], 500)
      assert.equal(result.rowCount, 60001)
      assert.equal(result.truncated, true)
      assert.equal(result.data.length, 500)
      assert.deepEqual(result.data[499], { customer_part_no: 'P499' })
      assert.equal(f.state.calls.length, 2)
      assert.equal(f.state.calls[0].sql, `SELECT COUNT(*) AS row_count FROM (\n${sql}\n) AS saic_count`)
      assert.equal(f.state.calls[0].limit, 1)
      assert.equal(f.state.calls[1].sql, sql)
      assert.equal(f.state.calls[1].limit, 500)
      assert.deepEqual(f.state.calls.map((call) => call.parameters), [['excluded'], ['excluded']])
    })
  }
}
test('single-read fallback time is Shanghai and cancellation is not swallowed', async () => {
  const failing = {
    query: async () => {
      throw Error('fixture_error')
    }
  }
  assert.match(await new SaicDatabase(failing).now(), /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => new SaicDatabase(failing, controller.signal).now(), /fixture_error/)
})
for (const [name, receipt, streamExpected] of [
  ['success', { outcome: 'succeeded', loadedRows: 500, filteredRows: 0, diagnostics: [] }, true],
  ['publish timeout', { outcome: 'pending', diagnostics: ['committed_awaiting_visibility_do_not_replay'] }, true],
  [
    'filtered success',
    { outcome: 'succeeded', loadedRows: 499, filteredRows: 1, diagnostics: ['filtered_rows_reported'] },
    false
  ],
  [
    'filtered publish timeout',
    { outcome: 'pending', filteredRows: 1, diagnostics: ['committed_awaiting_visibility_do_not_replay'] },
    false
  ],
  [
    'transport timeout',
    { outcome: 'unknown', diagnostics: ['transport_interrupted_verify_label_before_retry'] },
    false
  ],
  ['duplicate', { outcome: 'succeeded', diagnostics: ['duplicate_label_no_replay'] }, false]
])
  test(`source Stream Load policy: ${name}`, async () => {
    const imports = [],
      writes = []
    const db = {
      fetch: async () => ({ data: [{ owner_name: 'A', email: 'old', scope_note: 'keep', active: false }] }),
      exec: async (sql, params) => {
        writes.push({ sql, params })
        return 100
      },
      adapter: {
        importRows: async (input) => {
          imports.push(input)
          return { ...receipt, label: input.operationId }
        }
      }
    }
    const rows = Array.from({ length: 500 }, (_, i) => ({
      owner_name: i === 0 ? 'A' : `P${i}`,
      email: 'new',
      cc_emails: 'x\ny'
    }))
    const result = await new SaicWrites(db, { enabled: true, minRows: 500, chunkSize: 50000 }).upsert('sc_owner', rows)
    assert.equal(result.rows, 500)
    assert.equal(result.mode === 'stream', streamExpected)
    assert.equal(writes.length, streamExpected ? 0 : 5)
    assert.deepEqual(imports[0].columns, Object.keys(COLSPEC.sc_owner))
    assert.deepEqual(imports[0].rows[0], ['A', 'new', 'x y', 'keep', false])
    assert.equal(imports[0].rows[1].at(-1), true)
  })
test('SQL parser denies system tables, comma joins, nested cross-table reads and metadata leaks', () => {
  const denied = [
    'SELECT * FROM sc_task, mysql.user',
    'SELECT * FROM sc_task JOIN private_table p ON 1=1',
    'SELECT * FROM (SELECT * FROM sc_credential) a',
    'SELECT * FROM information_schema.tables',
    'SELECT * FROM other.sc_task',
    'SELECT * FROM internal.other.sc_task',
    'SELECT * FROM sc_task UNION SELECT * FROM secret',
    'SHOW TABLES',
    'SHOW GRANTS',
    'SHOW CREATE TABLE sc_task',
    'DESCRIBE sc_credential',
    "SELECT LOAD_FILE('/etc/passwd')",
    'SELECT SLEEP(1)',
    "SELECT 1 INTO OUTFILE '/tmp/x'",
    'SELECT 1; DELETE FROM sc_task',
    'SELECT /*!50000 SLEEP(1) */ 1',
    'SELECT /*+ SET_VAR(query_timeout=9999) */ 1'
  ]
  for (const sql of denied) assert.throws(() => configQuery(sql), undefined, sql)
  for (const sql of [
    'SELECT * FROM sc_task',
    'SELECT t.seq_no,o.email FROM sc_task t,sc_owner o WHERE t.owner=o.owner_name',
    'SELECT * FROM (SELECT * FROM sc_task) t',
    'EXPLAIN SELECT * FROM sc_task',
    'SHOW TABLETS FROM sc_task',
    'DESCRIBE sc_owner',
    "SELECT 'DELETE FROM secret' AS harmless"
  ])
    assert.equal(configQuery(sql), sql)
})
test('hash includes both text and URL after trimming', () => {
  assert.equal(specHash(' 需求 ', ' https://example.invalid '), specHash('需求', 'https://example.invalid'))
  assert.notEqual(specHash('需求', 'a'), specHash('需求', 'b'))
})

import 'reflect-metadata'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { describeXpertToolProvider, DecoratedToolsetStrategy } from '@xpert-ai/plugin-sdk'
import { inputs } from '../dist/lib/inputs.js'
import { SaicService } from '../dist/lib/service.js'
import { SaicDorisTools } from '../dist/lib/provider.js'
const contract = JSON.parse(readFileSync(new URL('source-contract.json', import.meta.url)))
function fixture(responses = []) {
  const queue = structuredClone(responses),
    calls = []
  const db = {
    adapter: {
      importRows: async () => {
        throw Error('disabled')
      }
    },
    fetch: async (sql, params = [], cap = 500) => {
      calls.push({ kind: 'fetch', sql, params, cap })
      const data = queue.shift() ?? []
      return { rowCount: data.length, truncated: data.length > cap, data: data.slice(0, cap) }
    },
    exec: async (sql, params) => {
      calls.push({ kind: 'exec', sql, params })
      return 1
    },
    now: async () => '2026-10-15 12:34:56'
  }
  return { service: new SaicService(db, { enabled: false, minRows: 500, chunkSize: 50000 }), db, calls }
}
const normalizeSql = (s) =>
  s
    .replaceAll('%s', '?')
    .replaceAll('`', '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),=])\s*/g, '$1')
    .trim()
function oracle(name, input, responses) {
  const p = spawnSync('python3', [new URL('fixtures/source-oracle.py', import.meta.url).pathname], {
    input: JSON.stringify({ name, input, responses }),
    encoding: 'utf8'
  })
  assert.equal(p.status, 0, p.stderr)
  return JSON.parse(p.stdout)
}
const cases = [
  ['ping', {}, [[{ db: 'saic_fixture', usr: 'fixture' }]]],
  [
    'get_server_time',
    {},
    [
      [
        {
          current_dt: '2026-10-15 12:34:56',
          current_date_val: '2026-10-15',
          current_time_val: '12:34:56',
          current_unix_ts: 1792038896
        }
      ]
    ]
  ],
  ['list_config_tables', {}, [[{ TABLE_NAME: 'sc_owner', TABLE_COMMENT: 'fixture', TABLE_ROWS: 1 }]]],
  [
    'describe_config_table',
    { table_name: 'sc_owner' },
    [
      [{ COLUMN_NAME: 'owner_name', DATA_TYPE: 'varchar', IS_NULLABLE: 'NO', COLUMN_COMMENT: '', COLUMN_KEY: 'PRI' }],
      [{ 'Create Table': 'CREATE TABLE sc_owner (...)' }]
    ]
  ],
  ['describe_config_table', { table_name: 'sc_credential' }, []],
  [
    'show_buckets',
    { table_name: 'sc_owner' },
    [
      [{ 'Create Table': 'DISTRIBUTED BY HASH(`owner_name`) BUCKETS 4' }],
      [{ TabletId: 1 }, { TabletId: 2 }],
      [{ Size: '1 KB' }]
    ]
  ],
  ['show_buckets', { table_name: 'sc_credential' }, []],
  ['query_config', { sql: 'SELECT * FROM sc_owner' }, [[{ owner_name: 'fixture', email: 'fixture@example.invalid' }]]],
  ['query_config', { sql: 'SELECT * FROM sc_credential' }, []],
  ['get_tasks', {}, [[{ seq_no: 1, active: true }]]],
  ['get_tasks', { include_inactive: true }, [[]]],
  [
    'get_tasks_changed_spec',
    {},
    [[{ seq_no: 1, spec_text: ' text ', url: 'https://fixture.invalid', spec_hash: 'old' }]]
  ],
  ['get_tasks_needing_onboarding', {}, [[]]],
  ['get_part_dict', {}, [[]]],
  ['get_owners', {}, [[]]],
  ['get_ship_rules', {}, [[]]],
  [
    'check_dict_issues',
    { part_numbers: ['P1', 'P2', 'P2', ''] },
    [[{ customer_part_no: 'P1', hsac_drawing_no: '', part_name: null, owner: '张三、李四' }], [{ owner_name: '张三' }]]
  ],
  ['get_run_log', { task_code: '12', run_date: '202610150000', limit: 500 }, [[]]],
  ['get_agent_runs', { status: 'running', limit: 1000 }, [[]]],
  [
    'upsert_owners',
    { rows: [{ owner_name: '张三', email: 'new@fixture.invalid', active: false }] },
    [[{ owner_name: '张三', email: 'old@fixture.invalid', scope_note: 'KEEP', cc_emails: null, active: true }]]
  ],
  ['upsert_owners', { rows: [{ owner_name: 'A' }] }, []],
  ['upsert_owners', { rows: [] }, []],
  [
    'upsert_owners',
    {
      rows: [
        {
          owner_name: "\u0085 O'Brien\u0085",
          email: 'a@example.invalid',
          scope_note: { a: [true, null, "x'y"] },
          cc_emails: ['a', 'b']
        }
      ]
    },
    [[]]
  ],
  [
    'upsert_ship_rules',
    { rows: [{ factory_code: 'F1', source_tag: '代工', offset_days: ' -2 ' }] },
    [[{ factory_code: 'F1', source_tag: '代工', offset_days: -1, calendar: 'workday', active: null }]]
  ],
  [
    'upsert_part_refs',
    { rows: [{ customer_part_no: 'P1', owner: 'New', active: false, updated_at: null }] },
    [
      [
        {
          customer_part_no: 'P1',
          owner: 'Old',
          part_name: 'KEEP',
          hsac_drawing_no: 'KEEP',
          active: true,
          updated_at: '2026-01-01 00:00:00'
        }
      ]
    ]
  ],
  [
    'create_task',
    { task_seq: 1, task_code: 'T1', task_name: 'Task', site_code: 'SITE', spec_text: 'spec' },
    [[{ seq_no: 1 }]]
  ],
  [
    'create_task',
    { task_seq: 1, task_code: 'T1', task_name: 'Task', site_code: 'SITE', spec_text: 'spec' },
    [[], [{ task_code: 'T1' }]]
  ],
  [
    'update_task',
    { task_seq: 1, url: 'https://new.invalid', active: false },
    [
      [{ spec_text: ' original ', url: 'https://old.invalid' }],
      [
        {
          seq_no: 1,
          task_code: 'T1',
          spec_text: ' original ',
          url: 'https://old.invalid',
          active: true,
          agent_attempts: 2,
          parse_result: null
        }
      ]
    ]
  ],
  ['update_task', { task_seq: 1, new_task_code: 'NEW' }, [[], [{ seq_no: 1, task_code: 'OLD', task_name: 'keep' }]]],
  ['update_task', { task_seq: 1 }, []],
  [
    'set_task_agent_state',
    { task_seq: 1, status: 'need_info', question: 'Which?' },
    [
      [{ agent_attempts: 2 }],
      [{ thread_id: 'thread-waiting' }],
      [{ seq_no: 1, active_thread_id: 'debug-thread', agent_attempts: 2, agent_status: 'running' }]
    ]
  ],
  ['set_task_agent_state', { task_seq: 1, status: 'running' }, [[{ seq_no: 1, active_thread_id: 'keep' }]]],
  ['set_task_agent_state', { task_seq: 1, status: 'done' }, []],
  [
    'set_task_agent_state',
    {
      task_seq: 1,
      status: 'failed',
      parse_result_json: JSON.stringify({
        intent: 'x',
        before_hash: 'a',
        after_hash: 'b',
        gate: {},
        promoted: false,
        files_changed: []
      })
    },
    [[{ seq_no: 1, active_thread_id: 'keep' }]]
  ],
  [
    'insert_run_log',
    { run_date: '20261015', task_seq: 1, status: 'done', task_code: 'Old', row_count: 0, byte_count: 0, error_msg: '' },
    []
  ],
  [
    'insert_agent_run',
    { run_id: 'r1', triggered_by: 'user', task_seqs: '1', kind: 'autorun', thread_id: 't1', summary: 'Summary' },
    []
  ],
  [
    'update_agent_run',
    { run_id: 'r1', status: 'done', mark_finished: true, summary: 'new' },
    [[{ run_id: 'r1', summary: 'old', result_json: null, thread_id: 'keep' }]]
  ],
  ['update_agent_run', { run_id: 'r1' }, []],
  ['update_agent_run', { run_id: 'r1', status: 'bad' }, []]
]
for (const [name, input, responses] of cases)
  test(`source oracle: ${name} ${JSON.stringify(input).slice(0, 80)}`, async () => {
    const reference = oracle(name, input, responses),
      f = fixture(responses)
    assert.deepEqual(await f.service[name](inputs[name].parse(input)), reference.result)
    const normalize = (c) => ({
      ...c,
      sql: normalizeSql(c.sql),
      params: name === 'list_config_tables' ? [...c.params].sort() : c.params
    })
    const ours = f.calls.map(normalize),
      theirs = reference.calls.map(normalize)
    // Single-key batch IN and OR are equivalent; compare the emitted full-row writes.
    if (name.startsWith('upsert_')) {
      assert.equal(ours.length, theirs.length)
      assert.deepEqual(
        ours.filter((c) => c.kind === 'exec'),
        theirs.filter((c) => c.kind === 'exec')
      )
    } else assert.deepEqual(ours, theirs)
  })
test('24 native names, exact parameters/defaults, schema resource and write policy', async () => {
  const provider = new SaicDorisTools({
      run: () => {
        throw Error('unused')
      }
    }),
    descriptor = describeXpertToolProvider(provider)
  assert.deepEqual(
    descriptor.tools.map((t) => t.options.name),
    contract.tools.map((t) => t.name)
  )
  for (const [index, tool] of descriptor.tools.entries()) {
    const expected = contract.tools[index],
      schema = tool.options.inputSchema
    assert.deepEqual(Object.keys(schema.shape), expected.parameters)
    assert.deepEqual(
      Object.values(schema.shape).map((v) => v.isOptional()),
      expected.parameters.map((_, i) => i >= expected.required)
    )
    for (let i = expected.required; i < expected.parameters.length; i++)
      assert.deepEqual(schema.shape[expected.parameters[i]].parse(undefined), expected.defaults[i - expected.required])
    assert.equal(tool.options.mcp.defaultApprovalMode, 'allow')
    assert.equal(tool.options.mcp.behavior.risk, index < 15 ? 'read' : 'write')
    if (index >= 15) assert.equal(tool.options.mcp.behavior.idempotency, 'non_idempotent')
  }
  const toolset = await new DecoratedToolsetStrategy(provider).create({
    id: 'fixture',
    name: 'fixture',
    type: 'builtin',
    credentials: {}
  })
  assert.deepEqual(
    toolset.getMcpCapabilityDefinitions().resources.map((r) => r.uri),
    [contract.resource]
  )
})
test('column/limit/status errors reject before mutation', async () => {
  const f = fixture()
  assert.match((await f.service.upsert_owners({ rows: [{ owner_name: 'a', email: 'b', evil: 'x' }] })).error, /未知列/)
  assert.match(
    (await f.service.upsert_owners({ rows: Array.from({ length: 501 }, () => ({ owner_name: 'a', email: 'b' })) }))
      .error,
    /单次最多 500/
  )
  assert.match(
    (await f.service.set_task_agent_state(inputs.set_task_agent_state.parse({ task_seq: 1, status: 'evil' }))).error,
    /status 必须/
  )
  assert.equal(f.calls.length, 0)
})

test('create_task success preserves SQL column order, defaults and state literals', async () => {
  const input = {
    task_seq: 8,
    task_code: 'T8',
    task_name: 'Task',
    site_code: 'SITE',
    spec_text: '\u0085 spec \u0085',
    enters_matrix: false
  }
  const reference = oracle('create_task', input, [[], []]),
    f = fixture([[], []])
  assert.deepEqual(await f.service.create_task(inputs.create_task.parse(input)), reference.result)
  const actual = f.calls.find((c) => c.kind === 'exec'),
    expected = reference.calls.find((c) => c.kind === 'exec')
  assert.deepEqual(actual.params, [...expected.params, 'pending', 'queued'])
  assert.match(actual.sql, /collector_status.*,.*agent_status/)
})
test('optional SHOW failure keeps other metadata available and resource is limited to six tables', async () => {
  const f = fixture(),
    fetch = f.db.fetch
  f.db.fetch = async (sql, params, cap) => {
    if (sql.startsWith('SHOW CREATE')) throw Error('ER_TABLEACCESS_DENIED_ERROR')
    if (sql.startsWith('SHOW TABLETS')) throw Error('ER_TABLEACCESS_DENIED_ERROR')
    return fetch(sql, params, cap)
  }
  const buckets = await f.service.show_buckets({ table_name: 'sc_task' })
  assert.equal(buckets.tablet_count, null)
  assert.deepEqual(buckets.size, [])
  assert.equal(buckets.create_table_error, 'ER_TABLEACCESS_DENIED_ERROR')
  await f.service.get_config_schema()
  const call = f.calls.at(-1)
  assert.match(call.sql, /TABLE_SCHEMA = DATABASE\(\)/)
  assert.equal(call.params.length, 6)
  assert.ok(!call.params.includes('sc_credential'))
})
test('query database errors and failed task gates preserve business error objects', async () => {
  const f = fixture()
  f.db.fetch = async () => {
    throw Error('ER_PARSE_ERROR')
  }
  assert.deepEqual(await f.service.query_config({ sql: 'SELECT * FROM sc_task' }), {
    error: 'Query Error: ER_PARSE_ERROR'
  })
  const input = inputs.set_task_agent_state.parse({
    task_seq: 1,
    status: 'done',
    parse_result_json: JSON.stringify({
      intent: 'update',
      before_hash: 'a',
      after_hash: 'b',
      gate: { verify: true, golden_pivot: false },
      promoted: false,
      files_changed: []
    })
  })
  assert.deepEqual(await f.service.set_task_agent_state(input), oracle('set_task_agent_state', input, []).result)
})

// JavaScript must never round an integer primary key before sending it to Doris.
test('unsafe integer tool parameters fail before database execution', () => {
  for (const name of ['create_task', 'update_task', 'set_task_agent_state', 'insert_run_log']) {
    assert.equal(inputs[name].shape.task_seq.safeParse(Number.MAX_SAFE_INTEGER + 1).success, false)
  }
})

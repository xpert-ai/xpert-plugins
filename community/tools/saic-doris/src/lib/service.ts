import type { DatabaseValue } from '@xpert-ai/plugin-sdk/data-workbench'
import type { Inputs } from './inputs.js'
import { SaicDatabase, type Row } from './database.js'
import {
  SaicWrites,
  clean,
  integer,
  isObject,
  pyList,
  pyString,
  pyStrip,
  specHash,
  truthy,
  trueValue
} from './writes.js'
import { AGENT_STATUS, MCP_BUILD, READ_TABLES, isTable } from './tables.js'
import { configQuery } from './query-policy.js'
const ALLOWED = `只允许查看 ${pyList([...READ_TABLES].sort())}`
const STATUS_ERROR = `status 必须是 ${pyList(AGENT_STATUS)}`
const taskColumns =
  'task_code, seq_no, task_name, site_code, url, spec_text, spec_hash, freq, output_pattern, enters_matrix, collector_status, collector_module, consecutive_failures, last_error, agent_status, agent_question, active_thread_id, active'
const placeholders = (size: number) => Array(size).fill('?').join(',')
const nonNull = (row: Record<string, DatabaseValue | undefined>): Row =>
  Object.fromEntries(Object.entries(row).filter((entry): entry is [string, DatabaseValue] => entry[1] != null))
const text = (v: DatabaseValue | undefined) => (v == null ? '' : String(v))
const slice = (s: string, length: number) => [...s].slice(0, length).join('')
export class SaicService {
  private readonly writes: SaicWrites
  constructor(readonly db: SaicDatabase, stream = { enabled: true, minRows: 500, chunkSize: 50000 }) {
    this.writes = new SaicWrites(db, stream)
  }
  async ping() {
    const r = await this.db.fetch('SELECT DATABASE() AS db, CURRENT_USER() AS usr')
    r.data[0].mcp_build = MCP_BUILD
    return r
  }
  get_server_time() {
    return this.db.fetch(
      'SELECT NOW() AS current_dt, CURRENT_DATE() AS current_date_val, CURRENT_TIME() AS current_time_val, UNIX_TIMESTAMP() AS current_unix_ts',
      [],
      1
    )
  }
  list_config_tables() {
    return this.db.fetch(
      `SELECT TABLE_NAME, TABLE_COMMENT, TABLE_ROWS FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders(
        READ_TABLES.length
      )}) ORDER BY TABLE_NAME`,
      READ_TABLES
    )
  }
  async describe_config_table({ table_name }: Inputs['describe_config_table']) {
    if (!isTable(table_name)) return { error: ALLOWED }
    const columns = await this.db.fetch(
      'SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT, COLUMN_KEY FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
      [table_name],
      200
    )
    const ddl = await this.db.fetch(`SHOW CREATE TABLE \`${table_name}\``, [], 1)
    return { table: table_name, columns: columns.data, create_statement: ddl.data[0]?.['Create Table'] ?? '' }
  }
  async show_buckets({ table_name }: Inputs['show_buckets']) {
    if (!isTable(table_name)) return { error: ALLOWED }
    const out: Record<string, unknown> = {
      table: table_name,
      distribution_key: null,
      buckets_in_ddl: null,
      tablet_count: null,
      size: null
    }
    try {
      const ddl = text((await this.db.fetch(`SHOW CREATE TABLE \`${table_name}\``, [], 1)).data[0]?.['Create Table'])
      const match = ddl.match(/DISTRIBUTED BY HASH\(([^)]*)\) BUCKETS (\d+)/)
      if (match) {
        out.distribution_key = match[1]
        out.buckets_in_ddl = Number(match[2])
      }
    } catch (error) {
      out.create_table_error = error instanceof Error ? error.message.slice(0, 150) : 'database_execution_failed'
    }
    for (const [key, sql] of [
      ['tablet_count', `SHOW TABLETS FROM \`${table_name}\``],
      ['size', `SHOW DATA FROM \`${table_name}\``]
    ]) {
      try {
        const r = await this.db.fetch(sql, [], 50000)
        out[key] = key === 'tablet_count' ? r.rowCount : r.data
      } catch (error) {
        if (this.db.signal?.aborted) throw error
        out[key] = null
      }
    }
    out.note = '配置表数据量极小，BUCKETS 2~4 足够；tablet/size 为 null 表示账号无 SHOW TABLET 权限'
    return out
  }
  get_tasks({ include_inactive }: Inputs['get_tasks']) {
    return this.db.fetch(
      `SELECT ${taskColumns} FROM sc_task${include_inactive ? '' : ' WHERE active = TRUE'} ORDER BY seq_no`,
      [],
      100
    )
  }
  async get_tasks_changed_spec() {
    const r = await this.db.fetch(
      'SELECT seq_no, task_code, task_name, site_code, url, spec_text, spec_hash, collector_status FROM sc_task WHERE active = TRUE ORDER BY seq_no',
      [],
      100
    )
    const data = r.data.flatMap((row) => {
      const h = specHash(text(row.spec_text), text(row.url))
      return !row.spec_hash || row.spec_hash !== h ? [{ ...row, expected_hash: h }] : []
    })
    return { rowCount: data.length, data }
  }
  get_tasks_needing_onboarding() {
    return this.db.fetch(
      "SELECT seq_no, task_code, task_name, site_code, url, spec_text, collector_status, consecutive_failures, last_error, agent_status, agent_question FROM sc_task WHERE active = TRUE AND (collector_status IN ('pending','broken') OR consecutive_failures >= 3) ORDER BY consecutive_failures DESC, seq_no",
      [],
      100
    )
  }
  get_part_dict() {
    return this.db.fetch(
      'SELECT customer_part_no, hsac_drawing_no, part_name, owner FROM sc_part_cross_ref WHERE active = TRUE ORDER BY customer_part_no',
      [],
      5000
    )
  }
  get_owners() {
    return this.db.fetch(
      'SELECT owner_name, email, cc_emails, scope_note FROM sc_owner WHERE active = TRUE ORDER BY owner_name',
      [],
      500
    )
  }
  get_ship_rules() {
    return this.db.fetch(
      'SELECT factory_code, source_tag, offset_days, calendar FROM sc_ship_rule WHERE active = TRUE ORDER BY factory_code, source_tag',
      [],
      100
    )
  }
  async check_dict_issues({ part_numbers }: Inputs['check_dict_issues']) {
    const parts = part_numbers
      .map((p) => pyStrip(pyString(p)))
      .filter(Boolean)
      .slice(0, 3000)
    if (!parts.length) return { error: 'part_numbers 为空' }
    const data = (
      await this.db.fetch(
        `SELECT customer_part_no, hsac_drawing_no, part_name, owner FROM sc_part_cross_ref WHERE customer_part_no IN (${placeholders(
          parts.length
        )})`,
        parts,
        3000
      )
    ).data
    const existing = new Set(data.map((r) => text(r.customer_part_no))),
      owners = new Set<string>()
    const blank_hsac: string[] = [],
      blank_name: string[] = [],
      blank_owner: string[] = []
    for (const row of data) {
      const part = text(row.customer_part_no)
      if (!row.hsac_drawing_no) blank_hsac.push(part)
      if (!row.part_name) blank_name.push(part)
      if (!row.owner) blank_owner.push(part)
      else
        for (const name of text(row.owner)
          .split(/[,，、;；/|\s]+/)
          .filter(Boolean))
          owners.add(name)
    }
    const active = new Set(
      (await this.db.fetch('SELECT owner_name FROM sc_owner WHERE active = TRUE', [], 500)).data.map((r) =>
        text(r.owner_name)
      )
    )
    return {
      checked: parts.length,
      missing_in_dict: [...new Set(parts.filter((p) => !existing.has(p)))].sort(),
      blank_hsac: blank_hsac.sort(),
      blank_name: blank_name.sort(),
      blank_owner: blank_owner.sort(),
      owners_missing_email: [...owners].filter((o) => !active.has(o)).sort()
    }
  }
  get_run_log({ run_date, task_code, limit }: Inputs['get_run_log']) {
    const where: string[] = [],
      params: DatabaseValue[] = []
    if (run_date) {
      where.push('run_date = ?')
      params.push(slice(run_date, 8))
    }
    if (task_code) {
      where.push('task_seq = ?')
      params.push(integer(task_code))
    }
    return this.db.fetch(
      `SELECT run_date, task_seq, task_code, status, output_file, row_count, byte_count, factory_check, error_msg, started_at, finished_at FROM sc_run_log${
        where.length ? ' WHERE ' + where.join(' AND ') : ''
      } ORDER BY run_date DESC, task_code LIMIT ${Math.min(limit, 200)}`,
      params,
      200
    )
  }
  get_agent_runs({ status, limit }: Inputs['get_agent_runs']) {
    return this.db.fetch(
      `SELECT run_id, kind, task_seqs, task_codes, thread_id, conversation_id, triggered_by, principal_user, status, summary, started_at, finished_at FROM sc_agent_run${
        status ? ' WHERE status = ?' : ''
      } ORDER BY started_at DESC LIMIT ${Math.min(limit, 100)}`,
      status ? [status] : [],
      100
    )
  }
  async query_config({ sql }: Inputs['query_config']) {
    let safe: string
    try {
      safe = configQuery(sql)
    } catch (e) {
      return { error: e instanceof Error ? e.message : '只允许只读查询' }
    }
    try {
      return await this.db.fetch(safe, [], 500)
    } catch (error) {
      if (this.db.signal?.aborted) throw error
      return {
        error: `Query Error: ${error instanceof Error ? error.message.slice(0, 300) : 'database_execution_failed'}`
      }
    }
  }
  async upsert_part_refs({ rows }: Inputs['upsert_part_refs']) {
    const timestamp = rows.length ? await this.db.now() : ''
    return this.writes.upsert(
      'sc_part_cross_ref',
      rows.map((r) => (isObject(r) ? { updated_at: timestamp, ...r } : r))
    )
  }
  upsert_owners({ rows }: Inputs['upsert_owners']) {
    return this.writes.upsert('sc_owner', rows)
  }
  upsert_ship_rules({ rows }: Inputs['upsert_ship_rules']) {
    return this.writes.upsert('sc_ship_rule', rows)
  }
  async create_task(input: Inputs['create_task']) {
    const { task_seq, task_code, task_name, site_code, spec_text, url, freq, output_pattern, enters_matrix } = input
    if ((await this.db.fetch('SELECT seq_no FROM sc_task WHERE seq_no = ?', [task_seq], 1)).data.length)
      return { error: `序号 ${task_seq} 已被占用（序号为主键，需唯一）` }
    if ((await this.db.fetch('SELECT task_code FROM sc_task WHERE task_code = ?', [task_code], 1)).data.length)
      return { error: `task_code 已存在：${task_code}` }
    const spec_hash = specHash(spec_text, url)
    const affected = await this.writes.insert('sc_task', {
      seq_no: task_seq,
      task_code,
      task_name,
      site_code,
      url,
      spec_text,
      spec_hash,
      freq,
      output_pattern,
      enters_matrix,
      active: true,
      collector_status: 'pending',
      agent_status: 'queued'
    })
    return { seq_no: task_seq, task_code, affected, spec_hash, agent_status: 'queued' }
  }
  async update_task(input: Inputs['update_task']) {
    const { task_seq, spec_text, url, new_task_code } = input
    if (
      new_task_code &&
      (
        await this.db.fetch(
          'SELECT seq_no FROM sc_task WHERE task_code = ? AND seq_no <> ?',
          [new_task_code, task_seq],
          1
        )
      ).data.length
    )
      return { error: `task_code 已存在：${new_task_code}` }
    const changes: Row = {}
    if (new_task_code) changes.task_code = new_task_code
    if (spec_text != null || url != null) {
      const old = (await this.db.fetch('SELECT spec_text, url FROM sc_task WHERE seq_no = ?', [task_seq], 1)).data[0]
      if (spec_text != null) changes.spec_text = spec_text
      if (url != null) changes.url = url
      Object.assign(changes, {
        spec_hash: specHash(spec_text ?? text(old?.spec_text), url ?? text(old?.url)),
        agent_status: 'queued',
        spec_updated_at: await this.db.now()
      })
    }
    for (const key of ['freq', 'task_name', 'output_pattern'] as const)
      if (input[key] != null) changes[key] = input[key]
    for (const key of ['enters_matrix', 'active'] as const) if (input[key] != null) changes[key] = trueValue(input[key])
    return Object.keys(changes).length
      ? this.writes.merge('sc_task', { seq_no: task_seq }, changes)
      : { error: '没有要更新的字段' }
  }
  async set_task_agent_state(input: Inputs['set_task_agent_state']) {
    const { task_seq, status, question, answer, session_id, parse_result_json } = input
    if (!AGENT_STATUS.includes(status)) return { error: STATUS_ERROR }
    const now = await this.db.now(),
      changes: Row = { agent_status: status }
    if (question != null) changes.agent_question = slice(question, 8000)
    if (answer != null) changes.agent_answer = slice(answer, 8000)
    if (session_id != null) changes.agent_session_id = slice(session_id, 64)
    if (parse_result_json != null) changes.parse_result = parse_result_json
    if (status === 'done' || status === 'failed') {
      let result: unknown = null
      try {
        result = parse_result_json ? JSON.parse(parse_result_json) : null
      } catch {
        /* original invalid JSON is a business error */
      }
      const need = ['intent', 'before_hash', 'after_hash', 'gate', 'promoted', 'files_changed']
      if (!isObject(result) || need.some((k) => !Object.hasOwn(result, k)))
        return {
          error: `status=${status} 需要 result_json 含键 ${pyList(need)}（见 build_context.py 验证清单 f）；当前: ${
            isObject(result)
              ? pyList(Object.keys(result).sort())
              : result === null
              ? 'NoneType'
              : Array.isArray(result)
              ? 'list'
              : typeof result === 'boolean'
              ? 'bool'
              : typeof result === 'number'
              ? Number.isInteger(result)
                ? 'int'
                : 'float'
              : 'str'
          }`
        }
      const gate = result.gate
      if (
        isObject(gate) &&
        truthy(gate) &&
        !(truthy(gate.verify) && (truthy(gate.golden_pivot) || truthy(gate.verify_only)))
      )
        return { error: 'result_json.gate 未全过（verify 与 golden_pivot/verify_only 必须为真）' }
      changes.agent_finished_at = now
    }
    if (status === 'need_info') {
      const current = (await this.db.fetch('SELECT agent_attempts FROM sc_task WHERE seq_no = ?', [task_seq], 1))
        .data[0]
      changes.agent_attempts = integer(current?.agent_attempts || 0) + 1
      const run = (
        await this.db.fetch(
          "SELECT thread_id FROM sc_agent_run WHERE (task_seqs LIKE ? OR task_codes LIKE ?) AND status = 'running' ORDER BY started_at DESC LIMIT 1",
          [`%${task_seq}%`, `%${task_seq}%`],
          1
        )
      ).data[0]
      if (run?.thread_id) changes.active_thread_id = run.thread_id
    }
    if (status === 'running') changes.agent_started_at = now
    return { ...(await this.writes.merge('sc_task', { seq_no: task_seq }, changes)), seq_no: task_seq, status }
  }
  async insert_run_log(input: Inputs['insert_run_log']) {
    const { run_date, task_seq, error_msg, ...rest } = input
    const row = clean(
      'sc_run_log',
      nonNull({
        ...rest,
        run_date,
        task_seq,
        error_msg: error_msg ? slice(error_msg, 1000) : null,
        finished_at: await this.db.now()
      })
    )
    return { affected: await this.writes.insert('sc_run_log', row), run_date, task_seq }
  }
  async insert_agent_run(input: Inputs['insert_agent_run']) {
    const { summary, ...rest } = input
    const row = clean(
      'sc_agent_run',
      nonNull({ ...rest, summary: summary ? slice(summary, 500) : null, started_at: await this.db.now() })
    )
    return { affected: await this.writes.insert('sc_agent_run', row), run_id: input.run_id }
  }
  async update_agent_run(input: Inputs['update_agent_run']) {
    const { run_id, status, result_json, mark_finished, summary, thread_id } = input
    const changes: Row = {}
    if (summary != null) changes.summary = slice(summary, 500)
    if (thread_id != null) changes.thread_id = slice(thread_id, 64)
    if (status != null) {
      if (!AGENT_STATUS.includes(status)) return { error: STATUS_ERROR }
      changes.status = status
    }
    if (result_json != null) changes.result_json = result_json
    if (mark_finished) changes.finished_at = await this.db.now()
    return Object.keys(changes).length
      ? this.writes.merge('sc_agent_run', { run_id }, changes)
      : { error: '没有要更新的字段' }
  }
  async get_config_schema() {
    return (
      await this.db.fetch(
        `SELECT t.TABLE_NAME, t.TABLE_COMMENT, GROUP_CONCAT(CONCAT(c.COLUMN_NAME, '(', c.DATA_TYPE, ')') ORDER BY c.ORDINAL_POSITION SEPARATOR ', ') AS columns FROM information_schema.tables t LEFT JOIN information_schema.columns c ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME IN (${placeholders(
          READ_TABLES.length
        )}) GROUP BY t.TABLE_NAME, t.TABLE_COMMENT ORDER BY t.TABLE_NAME`,
        READ_TABLES,
        50
      )
    ).data
  }
}

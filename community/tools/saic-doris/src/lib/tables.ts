// Column order, coercion and keys mirror the supplied v5.3-bool-default server.
export type ColumnType = 'str' | 'int' | 'bool' | 'dt' | 'jsonstr'
export const COLSPEC: Record<Table, Record<string, readonly [ColumnType, boolean, number]>> = {
  sc_part_cross_ref: {
    customer_part_no: ['str', true, 32],
    hsac_drawing_no: ['str', false, 16],
    part_name: ['str', false, 128],
    owner: ['str', false, 256],
    active: ['bool', false, 0],
    updated_by: ['str', false, 64],
    updated_at: ['dt', false, 0],
    note: ['str', false, 256]
  },
  sc_owner: {
    owner_name: ['str', true, 64],
    email: ['str', true, 128],
    cc_emails: ['str', false, 512],
    scope_note: ['str', false, 256],
    active: ['bool', false, 0]
  },
  sc_ship_rule: {
    factory_code: ['str', true, 16],
    source_tag: ['str', true, 16],
    offset_days: ['int', true, 0],
    calendar: ['str', false, 16],
    active: ['bool', false, 0],
    updated_by: ['str', false, 64],
    updated_at: ['dt', false, 0]
  },
  sc_task: {
    seq_no: ['int', true, 0],
    task_code: ['str', true, 48],
    task_name: ['str', true, 128],
    site_code: ['str', true, 32],
    spec_text: ['str', true, 60000],
    spec_hash: ['str', false, 16],
    url: ['str', false, 256],
    freq: ['str', false, 16],
    output_pattern: ['str', false, 128],
    enters_matrix: ['bool', false, 0],
    active: ['bool', false, 0],
    owner: ['str', false, 64],
    collector_status: ['str', false, 16],
    collector_module: ['str', false, 128],
    consecutive_failures: ['int', false, 0],
    last_error: ['str', false, 1000],
    agent_status: ['str', false, 16],
    agent_question: ['str', false, 8000],
    agent_answer: ['str', false, 8000],
    agent_session_id: ['str', false, 64],
    agent_attempts: ['int', false, 0],
    agent_started_at: ['dt', false, 0],
    agent_finished_at: ['dt', false, 0],
    spec_updated_at: ['dt', false, 0],
    parse_result: ['jsonstr', false, 1000000],
    clarify_json: ['jsonstr', false, 1000000],
    last_success_at: ['dt', false, 0],
    active_thread_id: ['str', false, 64]
  },
  sc_run_log: {
    run_date: ['str', true, 8],
    task_seq: ['int', true, 0],
    task_code: ['str', false, 48],
    status: ['str', false, 16],
    output_file: ['str', false, 256],
    row_count: ['int', false, 0],
    byte_count: ['int', false, 0],
    factory_check: ['str', false, 64],
    error_msg: ['str', false, 1000],
    started_at: ['dt', false, 0],
    finished_at: ['dt', false, 0]
  },
  sc_agent_run: {
    run_id: ['str', true, 64],
    kind: ['str', false, 16],
    task_seqs: ['str', false, 200],
    task_codes: ['str', false, 500],
    thread_id: ['str', false, 64],
    conversation_id: ['str', false, 64],
    triggered_by: ['str', true, 32],
    principal_user: ['str', false, 64],
    status: ['str', false, 16],
    summary: ['str', false, 500],
    result_json: ['jsonstr', false, 1000000],
    started_at: ['dt', false, 0],
    finished_at: ['dt', false, 0]
  }
}
export const KEY_COLS = {
  sc_part_cross_ref: ['customer_part_no'],
  sc_owner: ['owner_name'],
  sc_ship_rule: ['factory_code', 'source_tag'],
  sc_task: ['seq_no'],
  sc_run_log: ['run_date', 'task_seq'],
  sc_agent_run: ['run_id']
} as const
export type Table = keyof typeof KEY_COLS
export const READ_TABLES = Object.keys(KEY_COLS) as Table[]
export function isTable(value: string): value is Table {
  return Object.hasOwn(KEY_COLS, value)
}
export const AGENT_STATUS = ['done', 'failed', 'idle', 'need_info', 'queued', 'running']
export const MCP_BUILD = 'v5.3-bool-default'

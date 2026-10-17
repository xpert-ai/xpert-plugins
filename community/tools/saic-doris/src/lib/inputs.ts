import { z } from 'zod/v3'
export const inputs = {
  ping: z.object({}).strict(),
  get_server_time: z.object({}).strict(),
  list_config_tables: z.object({}).strict(),
  describe_config_table: z.object({ table_name: z.string() }).strict(),
  show_buckets: z.object({ table_name: z.string() }).strict(),
  get_tasks: z.object({ include_inactive: z.boolean().default(false) }).strict(),
  get_tasks_changed_spec: z.object({}).strict(),
  get_tasks_needing_onboarding: z.object({}).strict(),
  get_part_dict: z.object({}).strict(),
  get_owners: z.object({}).strict(),
  get_ship_rules: z.object({}).strict(),
  check_dict_issues: z.object({ part_numbers: z.array(z.unknown()) }).strict(),
  get_run_log: z
    .object({
      run_date: z.string().nullable().default(null),
      task_code: z.string().nullable().default(null),
      limit: z.number().int().safe().default(50)
    })
    .strict(),
  get_agent_runs: z
    .object({ status: z.string().nullable().default(null), limit: z.number().int().safe().default(20) })
    .strict(),
  query_config: z.object({ sql: z.string() }).strict(),
  upsert_part_refs: z.object({ rows: z.array(z.unknown()) }).strict(),
  upsert_owners: z.object({ rows: z.array(z.unknown()) }).strict(),
  upsert_ship_rules: z.object({ rows: z.array(z.unknown()) }).strict(),
  create_task: z
    .object({
      task_seq: z.number().int().safe(),
      task_code: z.string(),
      task_name: z.string(),
      site_code: z.string(),
      spec_text: z.string(),
      url: z.string().nullable().default(null),
      freq: z.string().default('daily'),
      output_pattern: z.string().nullable().default(null),
      enters_matrix: z.boolean().default(true)
    })
    .strict(),
  update_task: z
    .object({
      task_seq: z.number().int().safe(),
      spec_text: z.string().nullable().default(null),
      url: z.string().nullable().default(null),
      freq: z.string().nullable().default(null),
      task_name: z.string().nullable().default(null),
      output_pattern: z.string().nullable().default(null),
      enters_matrix: z.boolean().nullable().default(null),
      active: z.boolean().nullable().default(null),
      new_task_code: z.string().nullable().default(null)
    })
    .strict(),
  set_task_agent_state: z
    .object({
      task_seq: z.number().int().safe(),
      status: z.string(),
      question: z.string().nullable().default(null),
      answer: z.string().nullable().default(null),
      session_id: z.string().nullable().default(null),
      parse_result_json: z.string().nullable().default(null)
    })
    .strict(),
  insert_run_log: z
    .object({
      run_date: z.string(),
      task_seq: z.number().int().safe(),
      status: z.string(),
      task_code: z.string().nullable().default(null),
      output_file: z.string().nullable().default(null),
      row_count: z.number().int().safe().nullable().default(null),
      byte_count: z.number().int().safe().nullable().default(null),
      factory_check: z.string().nullable().default(null),
      error_msg: z.string().nullable().default(null)
    })
    .strict(),
  insert_agent_run: z
    .object({
      run_id: z.string(),
      triggered_by: z.string(),
      task_seqs: z.string().nullable().default(null),
      status: z.string().default('running'),
      kind: z.string().nullable().default(null),
      thread_id: z.string().nullable().default(null),
      principal_user: z.string().nullable().default(null),
      summary: z.string().nullable().default(null),
      task_codes: z.string().nullable().default(null)
    })
    .strict(),
  update_agent_run: z
    .object({
      run_id: z.string(),
      status: z.string().nullable().default(null),
      result_json: z.string().nullable().default(null),
      mark_finished: z.boolean().default(false),
      summary: z.string().nullable().default(null),
      thread_id: z.string().nullable().default(null)
    })
    .strict()
} as const
export type Inputs = { [K in keyof typeof inputs]: z.infer<(typeof inputs)[K]> }
export const descriptions = {
  ping: 'Health check: verify Doris connectivity and current database.',
  get_server_time:
    'Authoritative Doris server time. 🔴 Daily-run rule: the agent MUST call this\nFIRST (step 1) and use current_date_val as the run date — never trust the local clock.',
  list_config_tables: 'List the supply-chain config tables (sc_*) visible to this MCP account, with row estimates.',
  describe_config_table:
    'Schema of one config table (columns/types/comments + CREATE statement).\n\nArgs:\n    table_name: one of sc_task / sc_part_cross_ref / sc_owner / sc_ship_rule / sc_run_log / sc_agent_run',
  show_buckets:
    'Show the bucket (tablet) layout of one config table: BUCKETS n from the DDL\nplus the live tablet count and size (null if the account lacks SHOW TABLET priv).\n\nArgs:\n    table_name: one of the sc_* config tables',
  get_tasks:
    "Today's task list: task_code/seq/site/spec_text/freq/output_pattern/enters_matrix/collector_status/agent_status.\nEquivalent to queries.sql Q1.1 (frequency filtering is done by the caller).",
  get_tasks_changed_spec:
    'Tasks whose spec_text changed but spec_hash was not refreshed (sha256[:16] computed server-side).\nEquivalent to queries.sql Q1.2 -> triggers saic-task-onboarding.',
  get_tasks_needing_onboarding:
    'Tasks pending generation or broken (collector_status in pending/broken or consecutive_failures>=3).\nEquivalent to queries.sql Q1.3.',
  get_part_dict:
    'Full customer-part cross reference incl. owner (the field that decides scope & mail routing).\nEquivalent to queries.sql Q2.1. Call ONCE per run and cache in memory.',
  get_owners: 'Owner -> email mapping for mail delivery. Equivalent to queries.sql Q2.2.',
  get_ship_rules: 'Factory shipping offset days (offset_days = -1/-2). Equivalent to queries.sql Q2.3.',
  check_dict_issues:
    "Dictionary health-check for today's part numbers (queries.sql Q3.1-Q3.5 in one call).\n\nArgs:\n    part_numbers: list of customer part numbers appearing in today's raw files (max 3000)\nReturns: missing_in_dict / blank_hsac / blank_name / blank_owner / owners_missing_email",
  get_run_log: 'Recent collection run records (queries.sql Q4.1/Q4.2).',
  get_agent_runs: 'Instruction queue / agent run history (v4 contract). status e.g. queued/need_info/running.',
  query_config:
    'Guarded READ-ONLY query over config tables. Only SELECT/WITH/SHOW/DESCRIBE/EXPLAIN;\nevery referenced table must be one of sc_task/sc_part_cross_ref/sc_owner/sc_ship_rule/\nsc_run_log/sc_agent_run; sc_credential is unreachable; max 500 rows.\n\nArgs:\n    sql: a single read-only SQL statement',
  upsert_part_refs:
    'Insert/update customer-part cross reference (business fills owner/hsac/name here).\nEach row: {customer_part_no*, hsac_drawing_no, part_name, owner, active, note, updated_by}.\nSame customer_part_no = overwrite (Doris UNIQUE KEY). Max 500 rows.',
  upsert_owners: 'Insert/update owner -> email. Each row: {owner_name*, email*, cc_emails, scope_note, active}.',
  upsert_ship_rules:
    'Insert/update shipping offset rules. Each row: {factory_code*, source_tag*(生产/代工), offset_days*(-1/-2), calendar, active}.',
  create_task:
    'Register a NEW collection task (v5.0: seq_no = primary key, required & unique).\ntask_code is an editable business label (also uniqueness-checked).',
  update_task:
    "Business edits a task (v5.0: by seq_no primary key).\nChanging spec_text recomputes spec_hash and sets agent_status='queued'.\nnew_task_code: 仅改业务标签；历史 run 行保留旧标签快照，无需级联。",
  set_task_agent_state:
    'Write back the agent-side state machine (v4.4).\nstatus in idle/queued/running/need_info/done/failed.\nneed_info -> agent_question holds the question for a human; attempts += 1.\ndone/failed -> agent_finished_at stamped. Read-merge-insert, no UPDATE.\n🔴 v4.4：无 thread_id 参数。sc_task.active_thread_id 是【任务工作会话】指针。\nv4.7 写入者仅两处：① BFF：onboard 族触发时领养其运行 thread；\n② MCP：status=need_info 时领养"在等人的那个运行"的 thread（唯一豁免）。\n普通 autorun 正常结束不写指针。',
  insert_run_log:
    'Append one collection-run result row (v5.0: UNIQUE(run_date, task_seq);\ntask_code = label snapshot of this run; renaming does not rewrite history).',
  insert_agent_run:
    "Open an episode/autorun ledger row (v4.3).\nkind: debug(页面调试会话,thread=active_thread_id) / autorun(每日定时运行) /\nonboard(新增/改描述的执行)。🔴 autorun/onboard 的 thread 只记在本表，不写 active_thread_id。\n（历史值 'episode' 等价于 debug。）\nthread_id = ChatKit thread 指针。🔴 对话原文由平台 thread 保存，本表不存副本\n（无 payload/question/answer 列）。",
  update_agent_run:
    'Close/update an episode/autorun ledger row (v4.3).\nresult_json = 机器结论(gate/shadow/verify)。🔴 无 question/answer 参数：\n问答原文在平台 thread，本表只存状态/指针/结论。\nRead-merge-insert, no UPDATE statement.'
} as const

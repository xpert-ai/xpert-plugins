import { z } from 'zod/v3'
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const row = z.record(scalar),
  data = z.array(row)
const fetched = z.object({ rowCount: z.number().int(), truncated: z.boolean(), data }).strict()
/** Business errors remain ordinary JSON objects. Root schemas are strict objects;
 * optional success fields allow the original {error} branch without an MCP envelope.
 */
function result<S extends z.ZodRawShape>(shape: S) {
  const required = Object.entries(shape)
    .filter(([, schema]) => !schema.isOptional())
    .map(([name]) => name)
  return z
    .object({ ...shape, error: z.string().optional() })
    .partial()
    .strict()
    .superRefine((value, ctx) => {
      if (!('error' in value) || value.error === undefined)
        for (const name of required)
          if (!(name in value) || value[name as keyof typeof value] === undefined)
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: 'Required success field' })
    })
}
const batch = result({
  table: z.string(),
  rows: z.number().int(),
  affected: z.number().int(),
  mode: z.string().optional(),
  note: z.string()
})
const merged = { table: z.string(), affected: z.number().int(), mode: z.string() }
export const outputs = {
  ping: fetched,
  get_server_time: fetched,
  list_config_tables: fetched,
  describe_config_table: result({ table: z.string(), columns: data, create_statement: z.string() }),
  show_buckets: result({
    table: z.string(),
    distribution_key: z.string().nullable(),
    buckets_in_ddl: z.number().nullable(),
    tablet_count: z.number().nullable(),
    size: data.nullable(),
    create_table_error: z.string().optional(),
    note: z.string()
  }),
  get_tasks: fetched,
  get_tasks_changed_spec: z.object({ rowCount: z.number().int(), data }).strict(),
  get_tasks_needing_onboarding: fetched,
  get_part_dict: fetched,
  get_owners: fetched,
  get_ship_rules: fetched,
  check_dict_issues: result({
    checked: z.number().int(),
    missing_in_dict: z.array(z.string()),
    blank_hsac: z.array(z.string()),
    blank_name: z.array(z.string()),
    blank_owner: z.array(z.string()),
    owners_missing_email: z.array(z.string())
  }),
  get_run_log: fetched,
  get_agent_runs: fetched,
  query_config: result(fetched.shape),
  upsert_part_refs: batch,
  upsert_owners: batch,
  upsert_ship_rules: batch,
  create_task: result({
    seq_no: z.number().int(),
    task_code: z.string(),
    affected: z.number().int(),
    spec_hash: z.string(),
    agent_status: z.string()
  }),
  update_task: result(merged),
  set_task_agent_state: result({ ...merged, seq_no: z.number().int(), status: z.string() }),
  insert_run_log: z.object({ affected: z.number().int(), run_date: z.string(), task_seq: z.number().int() }).strict(),
  insert_agent_run: z.object({ affected: z.number().int(), run_id: z.string() }).strict(),
  update_agent_run: result(merged)
} as const

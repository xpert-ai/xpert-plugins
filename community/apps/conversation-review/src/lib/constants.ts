export const CONVERSATION_REVIEW_PLUGIN_NAME = '@community/apps-conversation-review'

/**
 * Single source of truth for every process-global artifact this plugin owns: table names,
 * provider key and feature key all derive from it. Must stay stable after release.
 * Declared in both the runtime `meta` and `package.json` under `xpert.plugin`.
 */
export const CONVERSATION_REVIEW_ARTIFACT_NAMESPACE = 'conversation_review'
export const CONVERSATION_REVIEW_PROVIDER_KEY = CONVERSATION_REVIEW_ARTIFACT_NAMESPACE
export const CONVERSATION_REVIEW_VIEW_KEY = 'workbench'
export const CONVERSATION_REVIEW_PUBLIC_VIEW_KEY = `${CONVERSATION_REVIEW_PROVIDER_KEY}__${CONVERSATION_REVIEW_VIEW_KEY}`
export const CONVERSATION_REVIEW_REMOTE_ENTRY_KEY = 'conversation-review'
export const CONVERSATION_REVIEW_FEATURE = CONVERSATION_REVIEW_ARTIFACT_NAMESPACE
export const CONVERSATION_REVIEW_RECORD_TABLE_KEY = 'record'
export const CONVERSATION_REVIEW_MIDDLEWARE_NAME = 'ConversationReviewMiddleware'
export const CONVERSATION_REVIEW_TEMPLATE_PROVIDER_KEY = 'conversationReviewTemplates'
export const CONVERSATION_REVIEW_TEMPLATE_KEY = 'conversation-review-assistant'

export const CONVERSATION_REVIEW_GET_RECORD_TOOL_NAME = 'conversation_review_get_record'
export const CONVERSATION_REVIEW_GET_HISTORY_TOOL_NAME = 'conversation_review_get_customer_history'
export const CONVERSATION_REVIEW_CHECK_RULES_TOOL_NAME = 'conversation_review_check_rules'
export const CONVERSATION_REVIEW_SAVE_ANALYSIS_TOOL_NAME = 'conversation_review_save_analysis'
export const CONVERSATION_REVIEW_REPORT_FAILURE_TOOL_NAME = 'conversation_review_report_failure'
/**
 * General-purpose chat tools, independent of any one record under review: team-level stats and
 * a customer-name lookup the salesperson can ask about mid-conversation, not just from the
 * workbench form. Neither takes recordId, so `wrapToolCall`'s silent-context injection does not
 * apply to them — see CONTEXTUAL_TOOL_NAMES in conversation-review.middleware.ts.
 */
export const CONVERSATION_REVIEW_GET_STATS_TOOL_NAME = 'conversation_review_get_stats'
export const CONVERSATION_REVIEW_SEARCH_CUSTOMER_TOOL_NAME = 'conversation_review_search_customer'
/**
 * The tools the workbench listens for. Only these two change a record, so only these are worth a
 * view refresh — subscribing to the read tools as well would reload the whole workbench in the
 * middle of the agent's own lookup, before there is anything new to show.
 */
export const CONVERSATION_REVIEW_REFRESH_TOOL_NAMES = [
  CONVERSATION_REVIEW_SAVE_ANALYSIS_TOOL_NAME,
  CONVERSATION_REVIEW_REPORT_FAILURE_TOOL_NAME
] as const

/**
 * How many previous conversations with the same customer the agent may pull in one lookup.
 * Enough to see a promise repeat across a few calls, small enough that the history cannot crowd
 * out the conversation actually under review.
 */
export const CUSTOMER_HISTORY_DEFAULT_LIMIT = 5
export const CUSTOMER_HISTORY_MAX_LIMIT = 10

/**
 * How many distinct customers a name search may return. Search is a discovery tool — unlike
 * `getCustomerHistory`'s strict exact-identity match, it deliberately matches by substring so a
 * partial or misremembered name still finds the customer, then leaves grouping by exact identity
 * so a genuine same-name-different-account mixup is still visible as two separate results.
 */
export const CUSTOMER_SEARCH_DEFAULT_LIMIT = 5
export const CUSTOMER_SEARCH_MAX_LIMIT = 10

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

/** Guardrails that keep one conversation record small enough for a single model turn. */
export const CONVERSATION_MAX_LENGTH = 8000
export const CUSTOMER_NAME_MAX_LENGTH = 100

/**
 * Ingestion guardrails.
 *
 * The batch cap is not about parsing — it is about what happens next. Every imported record
 * eventually costs one real model call, so an unbounded import is an unbounded bill and an
 * un-reviewable queue. A rejected oversized file with a clear count is better than a half-finished
 * import the user cannot reason about.
 */
export const IMPORT_MAX_ROWS = 200
export const IMPORT_MAX_FILE_CHARS = 2_000_000

/**
 * How many records one "analyse all pending" click will run. Each is a real model call made one
 * at a time, so this is the number the salesperson is willing to sit and watch.
 */
export const BATCH_ANALYSIS_MAX = 20

/**
 * Controlled vocabulary for the two kinds of issue the analysis reports.
 *
 * Free text cannot be aggregated: "价格偏高" and "报价比竞品贵" are the same business problem but
 * two different strings, so a dashboard built on free text can only ever count rows, not problems.
 * Every issue therefore has to land in one of these buckets.
 *
 * `other` is deliberately kept in both lists so the model is never forced to mislabel something to
 * satisfy the enum — and a large `other` share on the dashboard is itself the signal that the
 * vocabulary needs another entry.
 *
 * Keys are stored, labels are for display only, so a label can be reworded without migrating rows.
 * The keys are duplicated in the remote component (`remote-components/.../app.js`), which is plain
 * browser JS and cannot import from here; changing a key means changing it in both places.
 */
export const CONCERN_CATEGORIES = [
  'price',
  'delivery',
  'integration',
  'competitor',
  'decision_process',
  'product_capability',
  'service_support',
  'trust',
  'other'
] as const

export const RISK_CATEGORIES = [
  'over_promise',
  'vague_commitment',
  'unconfirmed_delivery',
  'unauthorized_discount',
  'unverified_claim',
  'missing_followup',
  'other'
] as const

export const ISSUE_SEVERITIES = ['high', 'medium', 'low'] as const

/**
 * The six-dimension QC scorecard behind the radar chart.
 *
 * A radar needs axes that mean something on their own, so these are the things a sales manager
 * already reviews a call for, not a reshuffling of the fields above. Scores are 0-100 and are
 * produced by the model, which makes them uncalibrated by construction — they are comparable
 * between conversations scored by the same prompt, not against any external standard. The
 * salesperson can overwrite every one of them, and the accuracy panel counts how often they do.
 *
 * `complianceRisk` is scored so that HIGH IS GOOD (few risky promises), like every other axis;
 * a radar where one axis inverts is unreadable.
 */
export const SCORE_DIMENSIONS = [
  'needDiscovery',
  'budgetHandling',
  'decisionMapping',
  'objectionHandling',
  'nextStepClarity',
  'complianceRisk'
] as const

export const SCORE_DIMENSION_LABELS: Record<string, string> = {
  needDiscovery: '需求挖掘',
  budgetHandling: '价格与预算',
  decisionMapping: '决策链把握',
  objectionHandling: '异议处理',
  nextStepClarity: '下一步推进',
  complianceRisk: '承诺合规'
}

/** How many days the dashboard trend covers. Short enough that a sparse week still reads. */
export const TREND_DAYS = 14

export const CONCERN_CATEGORY_LABELS: Record<string, string> = {
  price: '价格与预算',
  delivery: '交付与上线时间',
  integration: '集成与技术对接',
  competitor: '竞品对比',
  decision_process: '内部决策流程',
  product_capability: '产品功能不满足',
  service_support: '服务与售后支持',
  trust: '厂商信任与案例',
  other: '其他'
}

export const RISK_CATEGORY_LABELS: Record<string, string> = {
  over_promise: '过度承诺',
  vague_commitment: '含糊承诺',
  unconfirmed_delivery: '未经确认的交付承诺',
  unauthorized_discount: '越权价格让步',
  unverified_claim: '未经验证的能力宣称',
  missing_followup: '关键问题未跟进',
  other: '其他'
}

export const CONVERSATION_REVIEW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="36" fill="transparent"/>
  <path d="M46 62C46 51 55 42 66 42H190C201 42 210 51 210 62V150C210 161 201 170 190 170H104L62 204V170H66C55 170 46 161 46 150V62Z" fill="#FFFFFF" stroke="#1D4ED8" stroke-width="8" stroke-linejoin="round"/>
  <path d="M84 84H172" stroke="#1D4ED8" stroke-width="10" stroke-linecap="round"/>
  <path d="M84 112H146" stroke="#93C5FD" stroke-width="9" stroke-linecap="round"/>
  <path d="M84 138H120" stroke="#93C5FD" stroke-width="9" stroke-linecap="round"/>
  <circle cx="178" cy="136" r="30" fill="#DBEAFE" stroke="#1D4ED8" stroke-width="8"/>
  <path d="M166 136L175 145L191 128" stroke="#1D4ED8" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

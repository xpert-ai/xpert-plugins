export const SQL_REVIEW_FEATURE = 'sql-review'
export const SQL_REVIEW_PLUGIN_NAME = '@xpert-ai/plugin-sql-review'
export const SQL_REVIEW_REMOTE_ENTRY_KEY = 'main'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const SQL_REVIEW_ICON = 'https://api.iconify.design/mdi/file-table-outline.svg'
export const SQL_REVIEW_PROVIDER_KEY = 'SQL_REVIEW'
export const SQL_REVIEW_TEMPLATE_PROVIDER_KEY = 'SQL_REVIEW_TEMPLATES'

export const SQL_REVIEW_MIDDLEWARE_NAME = 'SqlReviewMiddleware'
export const SQL_REVIEW_SUBMIT_CASE_TOOL_NAME = 'sql_review_submit_case'
export const SQL_REVIEW_GET_RULE_FINDINGS_TOOL_NAME = 'sql_review_get_rule_findings'
export const SQL_REVIEW_SAVE_AI_REPORT_TOOL_NAME = 'sql_review_save_ai_report'
export const SQL_REVIEW_GET_CASE_TOOL_NAME = 'sql_review_get_case'

export const SQL_REVIEW_WORKBENCH_VIEW_KEY = 'sql-review-workbench'

export const SQL_REVIEW_ALL_TOOL_NAMES = [
  SQL_REVIEW_SUBMIT_CASE_TOOL_NAME,
  SQL_REVIEW_GET_RULE_FINDINGS_TOOL_NAME,
  SQL_REVIEW_SAVE_AI_REPORT_TOOL_NAME,
  SQL_REVIEW_GET_CASE_TOOL_NAME
] as const

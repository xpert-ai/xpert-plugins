export const CONTRACT_REVIEW_PLUGIN_NAME = '@xpert-ai/plugin-contract-review'

/** 数据契约：实体表名前缀与 artifactNamespace 都由此固定，发布后不可更改 */
export const CONTRACT_REVIEW_ARTIFACT_NAMESPACE = 'contract_review'

export const CONTRACT_REVIEW_FEATURE = 'contract-review-cases'
export const CONTRACT_REVIEW_PROVIDER_KEY = 'contract-review'
export const CONTRACT_REVIEW_TEMPLATE_PROVIDER_KEY = 'contract-review-template-provider'
export const CONTRACT_REVIEW_MIDDLEWARE_NAME = 'ContractReviewMiddleware'
export const CONTRACT_REVIEW_WORKBENCH_VIEW_KEY = 'contract_review_workbench'
export const CONTRACT_REVIEW_REMOTE_ENTRY_KEY = 'contract-review-workbench'

/** Agent 工具名 —— 前端 hostEvents 过滤、模板声明都要与之保持一致 */
export const CONTRACT_LIST_CASES_TOOL_NAME = 'contract_review_list_cases'
export const CONTRACT_GET_CASE_TOOL_NAME = 'contract_review_get_case'
export const CONTRACT_RECORD_CLAUSE_TOOL_NAME = 'contract_review_record_clause'
export const CONTRACT_MARK_EXTRACTION_TOOL_NAME = 'contract_review_mark_extraction'

export const CONTRACT_REVIEW_TOOL_NAMES = [
  CONTRACT_LIST_CASES_TOOL_NAME,
  CONTRACT_GET_CASE_TOOL_NAME,
  CONTRACT_RECORD_CLAUSE_TOOL_NAME,
  CONTRACT_MARK_EXTRACTION_TOOL_NAME
] as const

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

/** 工作台视图 action key */
export const ACTION_CREATE_CASE = 'create_case'
export const ACTION_BEGIN_EXTRACTION = 'begin_extraction'
export const ACTION_SAVE_REVIEW = 'save_review'
export const ACTION_DELETE_CASE = 'delete_case'

export const CONTRACT_REVIEW_ICON = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="8" width="44" height="48" rx="8" fill="#1d4ed8"/>
  <path d="M20 22h24M20 30h24M20 38h14" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  <circle cx="44" cy="44" r="9" fill="#f59e0b"/>
  <path d="M40 44l3 3 6-6" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

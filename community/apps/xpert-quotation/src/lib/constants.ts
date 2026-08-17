import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'

export const XPERT_QUOTATION_PLUGIN_NAME = '@xpert-ai/plugin-xpert-quotation'
export const XPERT_QUOTATION_ARTIFACT_NAMESPACE = 'xpert_quotation'
export const XPERT_QUOTATION_FEATURE = 'xpert-quotation'
export const XPERT_QUOTATION_WORKBENCH_CAPABILITY = 'xpert-quotation-workbench'
export const XPERT_QUOTATION_PATCH_CAPABILITY = 'faithful-xlsx-patch'
export const XPERT_QUOTATION_PROVIDER_KEY = 'xpert-quotation-view-provider'
export const XPERT_QUOTATION_TEMPLATE_PROVIDER_KEY = 'xpert-quotation-template-provider'
export const XPERT_QUOTATION_MIDDLEWARE_NAME = 'XpertQuotationMiddleware'
export const XPERT_QUOTATION_COORDINATOR_MIDDLEWARE_NAME = 'XpertQuotationCoordinatorMiddleware'
export const XPERT_QUOTATION_LINE_WORKER_MIDDLEWARE_NAME = 'XpertQuotationLineWorkerMiddleware'
export const XPERT_QUOTATION_CONSUMPTION_MIDDLEWARE_NAME = 'XpertQuotationConsumptionMiddleware'
export const XPERT_QUOTATION_PRICE_MIDDLEWARE_NAME = 'XpertQuotationPriceMiddleware'
export const XPERT_QUOTATION_VIEW_KEY = 'xpert_quotation'
export const XPERT_QUOTATION_REMOTE_ENTRY_KEY = 'xpert-quotation-workbench'
export const XPERT_QUOTATION_REMOTE_COMPONENT_DIR = 'xpert-quotation-workbench'
export const XPERT_QUOTATION_ASSISTANT_TEMPLATE_KEY = 'xpert-quotation-assistant'
export const WEB_TOOLS_PLUGIN_NAME = '@xpert-ai/plugin-web-tools'
export const OFFICE_CLI_PLUGIN_NAME = '@xpert-ai/plugin-office-cli'
export const VIEW_IMAGE_PLUGIN_NAME = '@xpert-ai/plugin-view-image'
export const TOOL_RETRY_PLUGIN_NAME = '@xpert-ai/plugin-tool-retry'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'

export const XPERT_QUOTATION_TOOL_NAMES = [
  'xpert_quotation_get_current_workbench_context',
  'xpert_quotation_get_summary',
  'xpert_quotation_inspect_workbook',
  'xpert_quotation_start_matching',
  'xpert_quotation_list_issues',
  'xpert_quotation_search_quota_components',
  'xpert_quotation_propose_quota_breakdown',
  'xpert_quotation_recommend_web_quota_breakdown',
  'xpert_quotation_review_quota_breakdown',
  'xpert_quotation_search_resource_prices',
  'xpert_quotation_recommend_resource_price',
  'xpert_quotation_recommend_web_resource_price',
  'xpert_quotation_review_resource_price',
  'xpert_quotation_calculate_comprehensive_rate',
  'xpert_quotation_search_knowledge_prices',
  'xpert_quotation_recommend_knowledge_price',
  'xpert_quotation_mark_knowledge_no_match',
  'xpert_quotation_recommend_web_price',
  'xpert_quotation_apply_patch'
] as const

export type XpertQuotationToolName = typeof XPERT_QUOTATION_TOOL_NAMES[number]

export const XPERT_QUOTATION_COORDINATOR_TOOL_NAMES = [
  'xpert_quotation_get_current_workbench_context',
  'xpert_quotation_get_summary',
  'xpert_quotation_inspect_workbook',
  'xpert_quotation_start_matching',
  'xpert_quotation_list_issues',
  'xpert_quotation_review_quota_breakdown',
  'xpert_quotation_review_resource_price',
  'xpert_quotation_calculate_comprehensive_rate',
  'xpert_quotation_apply_patch'
] as const satisfies readonly XpertQuotationToolName[]

export const XPERT_QUOTATION_LINE_WORKER_TOOL_NAMES = [
  'xpert_quotation_propose_quota_breakdown',
  'xpert_quotation_recommend_web_quota_breakdown'
] as const satisfies readonly XpertQuotationToolName[]

export const XPERT_QUOTATION_CONSUMPTION_TOOL_NAMES = [
  'xpert_quotation_search_quota_components'
] as const satisfies readonly XpertQuotationToolName[]

export const XPERT_QUOTATION_PRICE_TOOL_NAMES = [
  'xpert_quotation_search_resource_prices',
  'xpert_quotation_recommend_resource_price',
  'xpert_quotation_recommend_web_resource_price',
  'xpert_quotation_search_knowledge_prices',
  'xpert_quotation_recommend_knowledge_price',
  'xpert_quotation_mark_knowledge_no_match',
  'xpert_quotation_recommend_web_price'
] as const satisfies readonly XpertQuotationToolName[]

export const XPERT_QUOTATION_MIDDLEWARE_PROVIDER_NAMES = [
  XPERT_QUOTATION_COORDINATOR_MIDDLEWARE_NAME,
  XPERT_QUOTATION_LINE_WORKER_MIDDLEWARE_NAME,
  XPERT_QUOTATION_CONSUMPTION_MIDDLEWARE_NAME,
  XPERT_QUOTATION_PRICE_MIDDLEWARE_NAME,
  XPERT_QUOTATION_MIDDLEWARE_NAME
] as const

export const XPERT_TARGET_SHEETS = [
  { discipline: 'building', kind: 'bill', name: '3.2E.2.1 分部分项工程项目清单计价表', range: 'A1:K160' },
  { discipline: 'building', kind: 'material', name: '3.3E.2.3 材料暂估单价及调整表', range: 'A1:O45' },
  { discipline: 'building', kind: 'measure', name: '3.4E.3.1 措施项目清单计价表', range: 'A1:I70' },
  { discipline: 'installation', kind: 'bill', name: '4.2E.2.1 分部分项工程项目清单计价表', range: 'A1:K50' },
  { discipline: 'installation', kind: 'material', name: '4.3E.2.3 材料暂估单价及调整表', range: 'A1:O45' },
  { discipline: 'installation', kind: 'measure', name: '4.4E.3.1 措施项目清单计价表', range: 'A1:I70' }
] as const

export const XPERT_QUOTATION_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Xpert Quotation"><rect x="7" y="8" width="50" height="48" rx="6" fill="#176b45"/><path d="M17 19h30v7H17zm0 12h17v5H17zm0 10h17v5H17z" fill="#ecfdf5"/><circle cx="44" cy="40" r="9" fill="#f5b942"/><path d="M44 34v12m-4-9h6m-6 6h7" stroke="#17352a" stroke-width="2" stroke-linecap="round"/></svg>`

export function xpertQuotationTable(key: string) {
  return pluginArtifactTableName(XPERT_QUOTATION_ARTIFACT_NAMESPACE, key)
}

import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'

/**
 * Single source of truth for every plugin-owned artifact identifier.
 * Physical entity tables resolve to `plugin_ecn_impact_<tableKey>`.
 */
export const ECN_IMPACT_PLUGIN_NAME = '@xpert-ai/plugin-ecn-impact-analysis' as const
export const ECN_IMPACT_INSTALL_LEVEL = 'organization' as const
export const PLUGIN_ARTIFACT_NAMESPACE = 'ecn_impact' as const

export const pluginArtifactKey = (localKey: string) => `${PLUGIN_ARTIFACT_NAMESPACE}.${localKey}`

export const ECN_ASSESSMENT_TABLE = pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'assessment')
export const ECN_IMPACT_ITEM_TABLE = pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'item')
export const ECN_ASSESSMENT_LOG_TABLE = pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'log')

export const ECN_IMPACT_PROVIDER_KEY = 'ecn_impact'
export const ECN_IMPACT_WORKBENCH_VIEW_KEY = 'workbench'
export const ECN_IMPACT_PUBLIC_VIEW_KEY = `${ECN_IMPACT_PROVIDER_KEY}__${ECN_IMPACT_WORKBENCH_VIEW_KEY}`
export const ECN_IMPACT_REMOTE_ENTRY_KEY = 'ecn-workbench'
export const ECN_IMPACT_FEATURE = 'ecn_impact'
export const ECN_IMPACT_MIDDLEWARE_NAME = 'EcnImpactMiddleware'
export const ECN_IMPACT_TEMPLATE_PROVIDER_KEY = 'ecnImpactTemplates'
export const ECN_IMPACT_TEMPLATE_KEY = 'ecn-impact-assistant'
export const ECN_IMPACT_TEMPLATE_FILE = 'xpert-ecn-impact-assistant.yaml'

export const ECN_IMPACT_CONTROLLER_ROUTE = `${PLUGIN_ARTIFACT_NAMESPACE}/assessments`

export const ECN_IMPACT_CREATE_TOOL_NAME = 'ecn_impact_create_assessment'
export const ECN_IMPACT_GET_MATERIAL_TOOL_NAME = 'ecn_impact_get_material'
export const ECN_IMPACT_SEARCH_BOM_PARENTS_TOOL_NAME = 'ecn_impact_search_bom_parents'
export const ECN_IMPACT_SEARCH_ROUTINGS_TOOL_NAME = 'ecn_impact_search_routings'
export const ECN_IMPACT_SEARCH_PRODUCTION_ORDERS_TOOL_NAME = 'ecn_impact_search_production_orders'
export const ECN_IMPACT_SEARCH_INVENTORY_TOOL_NAME = 'ecn_impact_search_inventory'
export const ECN_IMPACT_SAVE_ANALYSIS_TOOL_NAME = 'ecn_impact_save_analysis'
export const ECN_IMPACT_GET_ASSESSMENT_TOOL_NAME = 'ecn_impact_get_assessment'
export const ECN_IMPACT_REPORT_FAILURE_TOOL_NAME = 'ecn_impact_report_analysis_failure'

export const ECN_IMPACT_MIDDLEWARE_TOOL_NAMES = [
  ECN_IMPACT_CREATE_TOOL_NAME,
  ECN_IMPACT_GET_MATERIAL_TOOL_NAME,
  ECN_IMPACT_SEARCH_BOM_PARENTS_TOOL_NAME,
  ECN_IMPACT_SEARCH_ROUTINGS_TOOL_NAME,
  ECN_IMPACT_SEARCH_PRODUCTION_ORDERS_TOOL_NAME,
  ECN_IMPACT_SEARCH_INVENTORY_TOOL_NAME,
  ECN_IMPACT_SAVE_ANALYSIS_TOOL_NAME,
  ECN_IMPACT_GET_ASSESSMENT_TOOL_NAME,
  ECN_IMPACT_REPORT_FAILURE_TOOL_NAME
] as const

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const ECN_IMPACT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="36" fill="transparent"/>
  <rect x="48" y="44" width="160" height="168" rx="18" fill="#FFFFFF" stroke="#1D4ED8" stroke-width="8"/>
  <path d="M84 84H172" stroke="#1D4ED8" stroke-width="10" stroke-linecap="round"/>
  <path d="M84 116H148" stroke="#94A3B8" stroke-width="8" stroke-linecap="round"/>
  <path d="M84 148H136" stroke="#94A3B8" stroke-width="8" stroke-linecap="round"/>
  <circle cx="168" cy="164" r="26" stroke="#2563EB" stroke-width="10" fill="#DBEAFE"/>
  <path d="M186 182L206 202" stroke="#2563EB" stroke-width="12" stroke-linecap="round"/>
  <path d="M96 190L128 158L148 178" stroke="#1D4ED8" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

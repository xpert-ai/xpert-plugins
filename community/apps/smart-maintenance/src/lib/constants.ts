export const SMART_MAINTENANCE_PLUGIN_NAME = '@xpert-ai/plugin-smart-maintenance'
export const SMART_MAINTENANCE_PROVIDER_KEY = 'smart_maintenance'
export const SMART_MAINTENANCE_WORKBENCH_VIEW_KEY = 'workbench'
export const SMART_MAINTENANCE_REPORT_VIEW_KEY = 'report_entry'
export const SMART_MAINTENANCE_REVIEW_VIEW_KEY = 'review_desk'
export const SMART_MAINTENANCE_WORKBENCH_PUBLIC_VIEW_KEY = `${SMART_MAINTENANCE_PROVIDER_KEY}__${SMART_MAINTENANCE_WORKBENCH_VIEW_KEY}`
export const SMART_MAINTENANCE_REPORT_PUBLIC_VIEW_KEY = `${SMART_MAINTENANCE_PROVIDER_KEY}__${SMART_MAINTENANCE_REPORT_VIEW_KEY}`
export const SMART_MAINTENANCE_REVIEW_PUBLIC_VIEW_KEY = `${SMART_MAINTENANCE_PROVIDER_KEY}__${SMART_MAINTENANCE_REVIEW_VIEW_KEY}`
export const SMART_MAINTENANCE_REMOTE_ENTRY_KEY = 'smart-maintenance'
export const SMART_MAINTENANCE_FEATURE = 'smart_maintenance'
export const SMART_MAINTENANCE_MIDDLEWARE_NAME = 'SmartMaintenanceMiddleware'
export const SMART_MAINTENANCE_SAVE_TOOL_NAME = 'smart_maintenance_save_generated_work_order'
export const SMART_MAINTENANCE_IMPORT_SERVICE_DATA_TOOL_NAME = 'smart_maintenance_import_service_data'
export const SMART_MAINTENANCE_GET_CATALOG_TOOL_NAME = 'smart_maintenance_get_catalog'
export const SMART_MAINTENANCE_SEARCH_TOOL_NAME = 'smart_maintenance_search_work_orders'
export const SMART_MAINTENANCE_DETAIL_TOOL_NAME = 'smart_maintenance_get_work_order_detail'
export const SMART_MAINTENANCE_SUPPLEMENT_DRAFT_TOOL_NAME = 'smart_maintenance_prepare_supplement_draft'
export const SMART_MAINTENANCE_MIDDLEWARE_TOOL_NAMES = [
  SMART_MAINTENANCE_SAVE_TOOL_NAME,
  SMART_MAINTENANCE_IMPORT_SERVICE_DATA_TOOL_NAME,
  SMART_MAINTENANCE_GET_CATALOG_TOOL_NAME,
  SMART_MAINTENANCE_SEARCH_TOOL_NAME,
  SMART_MAINTENANCE_DETAIL_TOOL_NAME,
  SMART_MAINTENANCE_SUPPLEMENT_DRAFT_TOOL_NAME
] as const
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const SMART_MAINTENANCE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="36" fill="transparent"/>
  <rect x="52" y="42" width="152" height="172" rx="18" fill="#FFFFFF" stroke="#0F766E" stroke-width="8"/>
  <path d="M92 72H164" stroke="#0F766E" stroke-width="10" stroke-linecap="round"/>
  <path d="M86 118H132" stroke="#94A3B8" stroke-width="8" stroke-linecap="round"/>
  <path d="M86 150H122" stroke="#94A3B8" stroke-width="8" stroke-linecap="round"/>
  <path d="M144 132L172 104" stroke="#14B8A6" stroke-width="12" stroke-linecap="round"/>
  <path d="M162 150L190 122" stroke="#14B8A6" stroke-width="12" stroke-linecap="round"/>
  <circle cx="128" cy="74" r="18" fill="#CCFBF1" stroke="#0F766E" stroke-width="8"/>
  <path d="M76 198L110 164L132 186L180 138" stroke="#0F766E" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

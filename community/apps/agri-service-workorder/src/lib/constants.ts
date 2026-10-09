export const AGRI_SERVICE_PLUGIN_NAME = '@xpert-ai/plugin-agri-service-workorder'
export const AGRI_SERVICE_PROVIDER_KEY = 'agri_service'
export const AGRI_SERVICE_WORKBENCH_VIEW_KEY = 'workbench'
export const AGRI_SERVICE_REPORT_VIEW_KEY = 'report_entry'
export const AGRI_SERVICE_REVIEW_VIEW_KEY = 'review_desk'
export const AGRI_SERVICE_WORKBENCH_PUBLIC_VIEW_KEY = `${AGRI_SERVICE_PROVIDER_KEY}__${AGRI_SERVICE_WORKBENCH_VIEW_KEY}`
export const AGRI_SERVICE_REPORT_PUBLIC_VIEW_KEY = `${AGRI_SERVICE_PROVIDER_KEY}__${AGRI_SERVICE_REPORT_VIEW_KEY}`
export const AGRI_SERVICE_REVIEW_PUBLIC_VIEW_KEY = `${AGRI_SERVICE_PROVIDER_KEY}__${AGRI_SERVICE_REVIEW_VIEW_KEY}`
export const AGRI_SERVICE_REMOTE_ENTRY_KEY = 'agri-service-workorder'
export const AGRI_SERVICE_FEATURE = 'agri_service'
export const AGRI_SERVICE_MIDDLEWARE_NAME = 'AgriServiceMiddleware'
export const AGRI_SERVICE_TEMPLATE_PROVIDER_KEY = 'agriServiceTemplates'
export const AGRI_SERVICE_SAVE_TOOL_NAME = 'agri_service_save_generated_work_order'
export const AGRI_SERVICE_IMPORT_SERVICE_DATA_TOOL_NAME = 'agri_service_import_service_data'
export const AGRI_SERVICE_GET_CATALOG_TOOL_NAME = 'agri_service_get_catalog'
export const AGRI_SERVICE_SEARCH_TOOL_NAME = 'agri_service_search_work_orders'
export const AGRI_SERVICE_DETAIL_TOOL_NAME = 'agri_service_get_work_order_detail'
export const AGRI_SERVICE_SUPPLEMENT_DRAFT_TOOL_NAME = 'agri_service_prepare_supplement_draft'
export const AGRI_SERVICE_MIDDLEWARE_TOOL_NAMES = [
  AGRI_SERVICE_SAVE_TOOL_NAME,
  AGRI_SERVICE_IMPORT_SERVICE_DATA_TOOL_NAME,
  AGRI_SERVICE_GET_CATALOG_TOOL_NAME,
  AGRI_SERVICE_SEARCH_TOOL_NAME,
  AGRI_SERVICE_DETAIL_TOOL_NAME,
  AGRI_SERVICE_SUPPLEMENT_DRAFT_TOOL_NAME
] as const
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const AGRI_SERVICE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="36" fill="transparent"/>
  <rect x="48" y="48" width="160" height="160" rx="28" fill="#FFFFFF" stroke="#3F6212" stroke-width="8"/>
  <path d="M88 168C104 136 120 112 128 96C136 112 152 136 168 168" stroke="#65A30D" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M128 96V168" stroke="#3F6212" stroke-width="8" stroke-linecap="round"/>
  <circle cx="168" cy="88" r="14" fill="#BEF264" stroke="#3F6212" stroke-width="6"/>
</svg>`

export const CRM_PLUGIN_NAME = '@xpert-ai/plugin-crm'
export const CRM_FEATURE = 'crm-records'
export const CRM_PROVIDER_KEY = 'crm'
export const CRM_TEMPLATE_PROVIDER_KEY = 'crm-template-provider'
export const CRM_MIDDLEWARE_NAME = 'crm'
export const CRM_WORKBENCH_VIEW_KEY = 'crm_workbench'
export const CRM_REMOTE_ENTRY_KEY = 'crm-workbench'

export const CRM_LIST_OBJECTS_TOOL_NAME = 'crm_list_objects'
export const CRM_SEARCH_RECORDS_TOOL_NAME = 'crm_search_records'
export const CRM_GET_RECORD_TOOL_NAME = 'crm_get_record'
export const CRM_CREATE_RECORD_TOOL_NAME = 'crm_create_record'
export const CRM_UPDATE_RECORD_TOOL_NAME = 'crm_update_record'

export const CRM_MIDDLEWARE_TOOL_NAMES = [
  CRM_LIST_OBJECTS_TOOL_NAME,
  CRM_SEARCH_RECORDS_TOOL_NAME,
  CRM_GET_RECORD_TOOL_NAME,
  CRM_CREATE_RECORD_TOOL_NAME,
  CRM_UPDATE_RECORD_TOOL_NAME
] as const

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const CRM_ICON = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="10" width="48" height="44" rx="10" fill="#0f766e"/>
  <path d="M20 25h24M20 33h24M20 41h14" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  <circle cx="46" cy="43" r="5" fill="#facc15"/>
</svg>`

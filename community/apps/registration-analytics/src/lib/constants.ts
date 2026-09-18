export const PLUGIN_NAME = '@community/apps-registration-analytics'
export const FEATURE = 'registration-analytics'
export const PROVIDER_KEY = 'registration-analytics'
export const TEMPLATE_PROVIDER_KEY = 'registration-template-provider'
export const MIDDLEWARE_NAME = 'registration-analytics'
export const WORKBENCH_VIEW_KEY = 'registration_workbench'
export const REMOTE_ENTRY = 'registration-console'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const LIST_ACTIVITIES_TOOL_NAME = 'registration_list_activities'
export const QUERY_REGISTRATIONS_TOOL_NAME = 'registration_query'
export const SAVE_QUERY_TOOL_NAME = 'registration_save_query'
export const LIST_SAVED_QUERIES_TOOL_NAME = 'registration_list_saved_queries'

export const MIDDLEWARE_TOOL_NAMES = [
  LIST_ACTIVITIES_TOOL_NAME,
  QUERY_REGISTRATIONS_TOOL_NAME,
  SAVE_QUERY_TOOL_NAME,
  LIST_SAVED_QUERIES_TOOL_NAME
] as const

export const ICON = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="10" width="48" height="44" rx="10" fill="#0e7490"/>
  <path d="M18 20h28M18 28h28M18 36h16" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  <circle cx="46" cy="44" r="6" fill="#facc15"/>
  <path d="M46 40v8M42 44h8" stroke="#0e7490" stroke-width="2" stroke-linecap="round"/>
</svg>`

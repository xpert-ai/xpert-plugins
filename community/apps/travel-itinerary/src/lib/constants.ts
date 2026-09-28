export const TRAVEL_PLUGIN_NAME = '@xpert-ai/plugin-travel-itinerary'
export const TRAVEL_FEATURE = 'travel-itinerary'
export const TRAVEL_PROVIDER_KEY = 'travel-itinerary'
export const TRAVEL_TEMPLATE_PROVIDER_KEY = 'travel-itinerary-template-provider'
export const TRAVEL_MIDDLEWARE_NAME = 'travel-itinerary'
export const TRAVEL_WORKBENCH_VIEW_KEY = 'travel_itinerary_workbench'
export const TRAVEL_REMOTE_ENTRY_KEY = 'travel-workbench'

export const TRAVEL_CREATE_PLAN_TOOL_NAME = 'travel_create_plan'
export const TRAVEL_GENERATE_PLAN_TOOL_NAME = 'travel_generate_itinerary'
export const TRAVEL_VALIDATE_PLAN_TOOL_NAME = 'travel_validate_itinerary'
export const TRAVEL_CONFIRM_PLAN_TOOL_NAME = 'travel_confirm_plan'

export const TRAVEL_MIDDLEWARE_TOOL_NAMES = [
  TRAVEL_CREATE_PLAN_TOOL_NAME,
  TRAVEL_GENERATE_PLAN_TOOL_NAME,
  TRAVEL_VALIDATE_PLAN_TOOL_NAME,
  TRAVEL_CONFIRM_PLAN_TOOL_NAME
] as const

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const TRAVEL_ICON = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="7" width="52" height="50" rx="13" fill="#0f766e"/>
  <path d="M15 38c8-10 17-14 34-14" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  <path d="M15 45h34" stroke="#facc15" stroke-width="4" stroke-linecap="round"/>
  <circle cx="20" cy="20" r="5" fill="#fff"/>
</svg>`

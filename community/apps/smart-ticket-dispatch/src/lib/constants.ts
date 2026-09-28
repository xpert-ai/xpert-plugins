export const SMART_TICKET_PLUGIN_NAME = '@xpert-ai/plugin-smart-ticket-dispatch'
export const SMART_TICKET_PROVIDER_KEY = 'smart_ticket_dispatch'
export const SMART_TICKET_WORKBENCH_VIEW_KEY = 'workbench'
export const SMART_TICKET_WORKBENCH_PUBLIC_VIEW_KEY = `${SMART_TICKET_PROVIDER_KEY}__${SMART_TICKET_WORKBENCH_VIEW_KEY}`
export const SMART_TICKET_REMOTE_ENTRY_KEY = 'smart-ticket-dispatch'
export const SMART_TICKET_FEATURE = 'smart_ticket_dispatch'
export const SMART_TICKET_MIDDLEWARE_NAME = 'SmartTicketDispatchMiddleware'
export const SMART_TICKET_TEMPLATE_PROVIDER_KEY = 'smartTicketDispatchTemplates'

export const SMART_TICKET_SAVE_TOOL_NAME = 'smart_ticket_save_triaged_ticket'
export const SMART_TICKET_SEARCH_TOOL_NAME = 'smart_ticket_search_tickets'
export const SMART_TICKET_DETAIL_TOOL_NAME = 'smart_ticket_get_ticket_detail'
export const SMART_TICKET_MIDDLEWARE_TOOL_NAMES = [
  SMART_TICKET_SAVE_TOOL_NAME,
  SMART_TICKET_SEARCH_TOOL_NAME,
  SMART_TICKET_DETAIL_TOOL_NAME
] as const

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const SMART_TICKET_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="36" fill="transparent"/>
  <path d="M52 78C52 67 61 58 72 58H184C195 58 204 67 204 78V110C192 110 182 120 182 132C182 144 192 154 204 154V186C204 197 195 206 184 206H72C61 206 52 197 52 186V154C64 154 74 144 74 132C74 120 64 110 52 110V78Z" fill="#FFFFFF" stroke="#1D4ED8" stroke-width="9"/>
  <path d="M128 58V206" stroke="#1D4ED8" stroke-width="9" stroke-dasharray="4 14" stroke-linecap="round"/>
  <path d="M90 96H114" stroke="#93C5FD" stroke-width="10" stroke-linecap="round"/>
  <path d="M90 132H110" stroke="#93C5FD" stroke-width="10" stroke-linecap="round"/>
  <path d="M144 108L162 126L186 96" stroke="#2563EB" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

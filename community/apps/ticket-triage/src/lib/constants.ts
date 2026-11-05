export const PLUGIN_NAME = '@community/apps-ticket-triage'
export const PLUGIN_NAMESPACE = 'ticket_triage'
export const PROVIDER_KEY = 'ticket_triage.board'
export const VIEW_KEY = 'ticket_triage.board-view'
export const REMOTE_ENTRY = 'ticket_triage.remote'
export const FEATURE = 'ticket_triage.board'
export const MIDDLEWARE_NAME = 'TicketTriageMiddleware'
export const TEMPLATE_KEY = 'ticket-triage-assistant'
export const ACTIONS = {
  seed: 'seed_tickets',
  confirm: 'confirm_triage',
  reject: 'reject_triage',
  reset: 'reset_ticket'
} as const
export const ACTION_KEYS = [ACTIONS.seed, ACTIONS.confirm, ACTIONS.reject, ACTIONS.reset] as const
export const TOOL_LIST_TICKETS = 'list_pending_tickets'
export const TOOL_PROPOSE_TRIAGE = 'propose_ticket_triage'

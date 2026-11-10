export const PLUGIN_NAME = '@community/apps-smart-ticket'
export const PLUGIN_NAMESPACE = 'smart_ticket'
export const FEATURE = 'smart-ticket-workbench'
export const PROVIDER_KEY = 'smart-ticket.workbench.provider'
export const VIEW_KEY = 'smart-ticket.workbench'
export const MIDDLEWARE_NAME = 'SmartTicketMiddleware'
export const TEMPLATE_KEY = 'smart-ticket-assistant'
export const REMOTE_ENTRY = 'smart_ticket__remote'

export const ANALYZE_TICKET_TOOL = 'ticket_analyze_and_draft'
export const CONFIRM_TICKET_TOOL = 'ticket_confirm_and_save'
export const LIST_TICKETS_TOOL = 'ticket_list_records'

export const ACTION_KEYS = [
  'save_ticket',
  'analyze_ticket',
  'confirm_ticket',
  'delete_ticket',
  'retry_ticket'
] as const

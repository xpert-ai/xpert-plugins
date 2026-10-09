import type { SupportTicketCategory, SupportTicketChannel, SupportTicketPriority, SupportTicketStatus } from './types'

export const SUPPORT_TICKET_PLUGIN_NAME = '@xpert-ai/plugin-support-ticket'
export const SUPPORT_TICKET_PROVIDER_KEY = 'support_ticket'
export const SUPPORT_TICKET_WORKBENCH_VIEW_KEY = 'workbench'
export const SUPPORT_TICKET_REMOTE_ENTRY_KEY = 'support-ticket'
export const SUPPORT_TICKET_FEATURE = 'support_ticket'
export const SUPPORT_TICKET_MIDDLEWARE_NAME = 'SupportTicketMiddleware'
export const SUPPORT_TICKET_TEMPLATE_PROVIDER_KEY = 'supportTicketTemplates'
export const SUPPORT_TICKET_SAVE_TRIAGE_TOOL_NAME = 'support_ticket_save_triage'
export const SUPPORT_TICKET_SEARCH_TOOL_NAME = 'support_ticket_search_tickets'
export const SUPPORT_TICKET_DETAIL_TOOL_NAME = 'support_ticket_get_ticket_detail'
export const SUPPORT_TICKET_MIDDLEWARE_TOOL_NAMES = [
  SUPPORT_TICKET_SAVE_TRIAGE_TOOL_NAME,
  SUPPORT_TICKET_SEARCH_TOOL_NAME,
  SUPPORT_TICKET_DETAIL_TOOL_NAME
] as const

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

/** View action keys. Shared by the server-side view provider and the remote component. */
export const SUPPORT_TICKET_ACTIONS = {
  refresh: 'refresh',
  submitTicket: 'submit_ticket',
  retryTicket: 'retry_ticket',
  markTicketFailed: 'mark_ticket_failed',
  saveDraft: 'save_draft',
  confirmTicket: 'confirm_ticket'
} as const

/** Machine-readable failure / outcome codes returned to the workbench instead of prose matching. */
export const SUPPORT_TICKET_CODES = {
  invalidInput: 'invalid_input',
  aiTimeout: 'ai_timeout',
  aiToolError: 'ai_tool_error',
  alreadyConfirmed: 'already_confirmed',
  revisionConflict: 'revision_conflict',
  ticketNotFound: 'ticket_not_found',
  unsupportedAction: 'unsupported_action'
} as const

export type SupportTicketCode = (typeof SUPPORT_TICKET_CODES)[keyof typeof SUPPORT_TICKET_CODES]

/** Client command key declared in the view manifest and used by the workbench to hand a message to the Assistant chat. */
export const ASSISTANT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

/** Longest accepted customer message. Longer input is rejected with an actionable reason instead of being truncated. */
export const SUPPORT_TICKET_MAX_MESSAGE_LENGTH = 2000

export const SUPPORT_TICKET_STATUSES: Array<{ value: SupportTicketStatus; en_US: string; zh_Hans: string }> = [
  { value: 'processing', en_US: 'AI processing', zh_Hans: 'AI 处理中' },
  { value: 'pending_review', en_US: 'Awaiting review', zh_Hans: '待人工确认' },
  { value: 'confirmed', en_US: 'Confirmed', zh_Hans: '已确认' },
  { value: 'failed', en_US: 'Failed', zh_Hans: '处理失败' }
]

export const SUPPORT_TICKET_CATEGORIES: Array<{ value: SupportTicketCategory; en_US: string; zh_Hans: string }> = [
  { value: 'product_issue', en_US: 'Product issue', zh_Hans: '产品故障' },
  { value: 'billing', en_US: 'Billing', zh_Hans: '计费与账单' },
  { value: 'delivery', en_US: 'Delivery', zh_Hans: '物流与交付' },
  { value: 'account_access', en_US: 'Account access', zh_Hans: '账号与权限' },
  { value: 'how_to', en_US: 'How to use', zh_Hans: '使用咨询' },
  { value: 'complaint', en_US: 'Complaint', zh_Hans: '投诉与建议' },
  { value: 'other', en_US: 'Other', zh_Hans: '其他' }
]

export const SUPPORT_TICKET_PRIORITIES: Array<{ value: SupportTicketPriority; en_US: string; zh_Hans: string }> = [
  { value: 'p0', en_US: 'P0 - Blocking', zh_Hans: 'P0 - 业务中断' },
  { value: 'p1', en_US: 'P1 - High', zh_Hans: 'P1 - 高' },
  { value: 'p2', en_US: 'P2 - Normal', zh_Hans: 'P2 - 中' },
  { value: 'p3', en_US: 'P3 - Low', zh_Hans: 'P3 - 低' }
]

export const SUPPORT_TICKET_CHANNELS: Array<{ value: SupportTicketChannel; en_US: string; zh_Hans: string }> = [
  { value: 'email', en_US: 'Email', zh_Hans: '邮件' },
  { value: 'im', en_US: 'Instant message', zh_Hans: '在线 IM' },
  { value: 'phone', en_US: 'Phone note', zh_Hans: '电话记录' },
  { value: 'other', en_US: 'Other', zh_Hans: '其他' }
]

export const SUPPORT_TICKET_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="36" fill="transparent"/>
  <rect x="46" y="56" width="164" height="118" rx="20" fill="#FFFFFF" stroke="#2563EB" stroke-width="8"/>
  <path d="M46 96C46 84 56 74 68 74H188C200 74 210 84 210 96" stroke="#2563EB" stroke-width="8" stroke-linecap="round"/>
  <path d="M84 122H150" stroke="#94A3B8" stroke-width="9" stroke-linecap="round"/>
  <path d="M84 148H128" stroke="#94A3B8" stroke-width="9" stroke-linecap="round"/>
  <circle cx="172" cy="174" r="34" fill="#DBEAFE" stroke="#2563EB" stroke-width="8"/>
  <path d="M160 174L169 183L186 164" stroke="#2563EB" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

export type SmartTicketStatus = 'pending_confirmation' | 'dispatched' | 'resolved' | 'rejected'
export type SmartTicketUrgency = 'low' | 'medium' | 'high'
export type SmartTicketCategory = 'technical' | 'billing' | 'logistics' | 'consult' | 'complaint' | 'other'
export type SmartTicketTeam = 'technical_support' | 'billing' | 'logistics' | 'after_sales' | 'customer_success' | 'other'
export type SmartTicketSourceType = 'agent_chat' | 'workbench_form'

export interface SmartTicketScope {
  tenantId?: string
  organizationId?: string
  userId?: string
  assistantId?: string
  conversationId?: string
}

export interface SmartTicketTriageInput {
  sourceType?: SmartTicketSourceType
  title?: string
  originalContent: string
  customerName?: string
  customerContact?: string
  channel?: string
  category?: SmartTicketCategory
  urgency?: SmartTicketUrgency
  aiSummary?: string
  aiSuggestedTeam?: SmartTicketTeam
  aiSuggestedOwner?: string
  aiDispatchAdvice?: string
  aiConfidence?: number
  completenessTips?: string[]
  aiRawResult?: unknown
}

export interface SmartTicketDispatchConfirmInput {
  confirmedTeam?: SmartTicketTeam
  confirmedOwner?: string
  dispatchRemark?: string
}

export interface SmartTicketSearchParams {
  status?: SmartTicketStatus
  urgency?: SmartTicketUrgency
  search?: string
  page?: number
  pageSize?: number
}

export interface SmartTicketOperationLogSummary {
  id?: string
  action?: string
  operator?: string
  detail?: string
  createdAt?: Date
}

export const SMART_TICKET_STATUS_LABELS: Record<SmartTicketStatus, string> = {
  pending_confirmation: '待确认',
  dispatched: '已分派',
  resolved: '已解决',
  rejected: '已驳回'
}

export const SMART_TICKET_URGENCY_LABELS: Record<SmartTicketUrgency, string> = {
  low: '低',
  medium: '中',
  high: '高'
}

export const SMART_TICKET_CATEGORY_LABELS: Record<SmartTicketCategory, string> = {
  technical: '技术问题',
  billing: '账务问题',
  logistics: '物流问题',
  consult: '使用咨询',
  complaint: '投诉',
  other: '其他'
}

export const SMART_TICKET_TEAM_LABELS: Record<SmartTicketTeam, string> = {
  technical_support: '技术支持组',
  billing: '账务组',
  logistics: '物流组',
  after_sales: '售后组',
  customer_success: '客户成功组',
  other: '其他'
}

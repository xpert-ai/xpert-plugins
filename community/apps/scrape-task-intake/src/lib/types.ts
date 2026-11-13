export type ScrapeTaskStatus =
  | 'pending_confirmation'
  | 'needs_supplement'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'rejected'

export type ScrapeTaskPriority = 'low' | 'medium' | 'high'

export type ScrapeTaskSourceType = 'agent_chat' | 'workbench_form'

export type ScrapeTaskCrawlFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'manual'

export type ScrapeTaskDeliveryFormat = 'csv' | 'json' | 'excel' | 'database'

export type ScrapeTaskPagesScope = 'list' | 'detail' | 'search' | 'full_site'

export interface ScrapeDataFieldSpec {
  name: string
  description?: string
  example?: string
  required?: boolean
}

export interface ScrapeTaskScope {
  tenantId?: string
  organizationId?: string
  userId?: string
  assistantId?: string
  conversationId?: string
}

export interface ScrapeTaskGeneratedInput {
  sourceType?: ScrapeTaskSourceType
  title?: string
  originalContent: string
  requesterName?: string
  requesterDepartment?: string
  requesterContact?: string
  targetUrl?: string
  targetSite?: string
  pagesScope?: ScrapeTaskPagesScope
  dataFields?: ScrapeDataFieldSpec[]
  crawlFrequency?: ScrapeTaskCrawlFrequency
  deliveryFormat?: ScrapeTaskDeliveryFormat
  estimatedVolume?: string
  authRequired?: boolean
  priority?: ScrapeTaskPriority
  antiBotNotes?: string
  complianceNotes?: string
  completenessTips?: string[]
  aiConfidence?: number
  aiRawResult?: unknown
}

export interface ScrapeTaskUpdateInput {
  title?: string
  requesterName?: string
  requesterDepartment?: string
  requesterContact?: string
  targetUrl?: string
  targetSite?: string
  pagesScope?: ScrapeTaskPagesScope
  dataFields?: ScrapeDataFieldSpec[]
  crawlFrequency?: ScrapeTaskCrawlFrequency
  deliveryFormat?: ScrapeTaskDeliveryFormat
  estimatedVolume?: string
  authRequired?: boolean
  priority?: ScrapeTaskPriority
  antiBotNotes?: string
  complianceNotes?: string
  assigneeName?: string
  remark?: string
}

export interface ScrapeTaskSearchInput {
  status?: ScrapeTaskStatus
  priority?: ScrapeTaskPriority
  search?: string
  page?: number
  pageSize?: number
}

export interface ScrapeTaskSupplementDraftInput {
  supplementContent?: string
  title?: string
  targetUrl?: string
  targetSite?: string
  pagesScope?: ScrapeTaskPagesScope
  dataFields?: ScrapeDataFieldSpec[]
  crawlFrequency?: ScrapeTaskCrawlFrequency
  deliveryFormat?: ScrapeTaskDeliveryFormat
  estimatedVolume?: string
  authRequired?: boolean
  priority?: ScrapeTaskPriority
  antiBotNotes?: string
  complianceNotes?: string
  confidence?: number
  rationale?: string
}

export interface ScrapeTaskSupplementDraft {
  supplementContent?: string
  title?: string
  targetUrl?: string
  targetSite?: string
  pagesScope?: ScrapeTaskPagesScope
  dataFields?: ScrapeDataFieldSpec[]
  crawlFrequency?: ScrapeTaskCrawlFrequency
  deliveryFormat?: ScrapeTaskDeliveryFormat
  estimatedVolume?: string
  authRequired?: boolean
  priority?: ScrapeTaskPriority
  antiBotNotes?: string
  complianceNotes?: string
  confidence?: number
  rationale?: string
}

export type ScrapeTaskLogAction =
  | 'ai_generated'
  | 'updated'
  | 'needs_supplement'
  | 'supplement_draft'
  | 'supplement_saved'
  | 'confirmed'
  | 'started'
  | 'completed'
  | 'rejected'
  | 'dedupe_skipped'

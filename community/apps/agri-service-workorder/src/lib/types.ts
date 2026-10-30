export type AgriServiceWorkOrderStatus =
  | 'pending_confirmation'
  | 'needs_supplement'
  | 'processing'
  | 'processed'
  | 'rejected'
export type AgriServiceSourceType = 'agent_chat' | 'workbench_form'
export type AgriServiceUrgency = 'low' | 'medium' | 'high'
export type AgriServiceServiceType = 'repair' | 'inspection' | 'after_sales' | 'other'
export type AgriServiceProcessingResult = 'fixed' | 'temporarily_restored' | 'unable_to_process'
export type AgriServiceLogAction =
  | 'ai_generated'
  | 'field_updated'
  | 'mark_needs_supplement'
  | 'supplement_draft_prepared'
  | 'supplement_saved'
  | 'confirm_processing'
  | 'mark_processed'
  | 'reject_closed'

export interface AgriServiceScope {
  tenantId: string
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export type AgriServiceServiceDataImportMode = 'replace' | 'merge'

export type AgriServiceServiceDataRecord = Record<string, unknown>

export interface AgriServiceServiceDataPayload {
  customers?: AgriServiceServiceDataRecord[]
  projects?: AgriServiceServiceDataRecord[]
  locations?: AgriServiceServiceDataRecord[]
  deviceTypes?: AgriServiceServiceDataRecord[]
  devices?: AgriServiceServiceDataRecord[]
  faultCategories?: AgriServiceServiceDataRecord[]
  departments?: AgriServiceServiceDataRecord[]
  roles?: AgriServiceServiceDataRecord[]
  personnel?: AgriServiceServiceDataRecord[]
  parts?: AgriServiceServiceDataRecord[]
  serviceTypes?: AgriServiceServiceDataRecord[]
  urgencies?: AgriServiceServiceDataRecord[]
  businessContexts?: AgriServiceServiceDataRecord[]
  similarCases?: AgriServiceServiceDataRecord[]
  workOrderSeeds?: AgriServiceServiceDataRecord[]
}

export interface AgriServiceServiceDataSummary {
  customers: number
  projects: number
  locations: number
  deviceTypes: number
  devices: number
  faultCategories: number
  departments: number
  roles: number
  personnel: number
  parts: number
  serviceTypes: number
  urgencies: number
  similarCases: number
  workOrderSeeds: number
}

export interface AgriServiceServiceDataImportInput {
  importDraftId?: string
  fileName?: string
  importMode?: AgriServiceServiceDataImportMode
  serviceData?: AgriServiceServiceDataPayload
}

export interface AgriServiceServiceDataImportDraft {
  importDraftId: string
  fileName: string
  mimeType?: string
  size?: number
  importMode: AgriServiceServiceDataImportMode
  summary: AgriServiceServiceDataSummary
  serviceData: AgriServiceServiceDataPayload
}

export interface AgriServiceSimilarWorkOrderSummary {
  id: string
  workOrderNo?: string
  title?: string
  status?: AgriServiceWorkOrderStatus
  deviceType?: string
  location?: string
  faultCategory?: string
  faultPhenomenon?: string
  createdAt?: string
}

export interface AgriServiceGeneratedWorkOrderInput {
  sourceType?: AgriServiceSourceType
  title?: string
  originalContent: string
  customerName?: string
  projectName?: string
  siteName?: string
  reporterName?: string
  reporterDepartment?: string
  reporterContact?: string
  deviceType?: string
  deviceName?: string
  deviceNo?: string
  faultCategory?: string
  faultPhenomenon?: string
  faultCode?: string
  location?: string
  impactScope?: string
  urgency?: AgriServiceUrgency
  serviceType?: AgriServiceServiceType
  needOnsite?: boolean
  aiDiagnosis?: string
  possibleCauses?: string[]
  suggestedAction?: string
  completenessTips?: string[]
  aiConfidence?: number
  aiRawResult?: unknown
  recommendedDepartment?: string
  recommendedRole?: string
  recommendedDispatchAdvice?: string
  suggestedParts?: string[]
  hasMultipleIssues?: boolean
  multipleIssueTip?: string
}

export interface AgriServiceUpdateInput {
  customerName?: string
  projectName?: string
  siteName?: string
  reporterName?: string
  reporterDepartment?: string
  reporterContact?: string
  title?: string
  deviceType?: string
  deviceName?: string
  deviceNo?: string
  faultCategory?: string
  faultPhenomenon?: string
  faultCode?: string
  location?: string
  impactScope?: string
  urgency?: AgriServiceUrgency
  serviceType?: AgriServiceServiceType
  needOnsite?: boolean
  confirmedDepartment?: string
  confirmedRole?: string
  confirmedDispatchAdvice?: string
  confirmedParts?: string[]
  processingRemark?: string
}

export interface AgriServiceSearchInput {
  status?: AgriServiceWorkOrderStatus
  deviceType?: string
  urgency?: AgriServiceUrgency
  search?: string
  page?: number
  pageSize?: number
}

export interface AgriServiceSupplementDraft {
  supplementContent?: string
  customerName?: string
  projectName?: string
  siteName?: string
  reporterName?: string
  reporterDepartment?: string
  reporterContact?: string
  title?: string
  deviceType?: string
  deviceName?: string
  deviceNo?: string
  faultCategory?: string
  faultPhenomenon?: string
  faultCode?: string
  location?: string
  impactScope?: string
  urgency?: AgriServiceUrgency
  serviceType?: AgriServiceServiceType
  needOnsite?: boolean
  confirmedDepartment?: string
  confirmedRole?: string
  confirmedDispatchAdvice?: string
  confirmedParts?: string[]
  processingRemark?: string
  confidence?: number
  rationale?: string
}

export interface AgriServiceSupplementDraftInput extends AgriServiceUpdateInput {
  supplementContent?: string
  draft?: AgriServiceSupplementDraft
  confidence?: number
  rationale?: string
}

export interface AgriServiceCatalogOption {
  code: string
  label: string
  deviceType?: string
  departmentCode?: string
  location?: string
  name?: string
  [key: string]: unknown
}

export type SmartMaintenanceWorkOrderStatus =
  | 'pending_confirmation'
  | 'needs_supplement'
  | 'processing'
  | 'processed'
  | 'rejected'
export type SmartMaintenanceSourceType = 'agent_chat' | 'workbench_form'
export type SmartMaintenanceUrgency = 'low' | 'medium' | 'high'
export type SmartMaintenanceServiceType = 'repair' | 'inspection' | 'after_sales' | 'other'
export type SmartMaintenanceProcessingResult = 'fixed' | 'temporarily_restored' | 'unable_to_process'
export type SmartMaintenanceLogAction =
  | 'ai_generated'
  | 'field_updated'
  | 'mark_needs_supplement'
  | 'supplement_draft_prepared'
  | 'supplement_saved'
  | 'confirm_processing'
  | 'mark_processed'
  | 'reject_closed'

export interface SmartMaintenanceScope {
  tenantId: string
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export type SmartMaintenanceServiceDataImportMode = 'replace' | 'merge'

export type SmartMaintenanceServiceDataRecord = Record<string, unknown>

export interface SmartMaintenanceServiceDataPayload {
  customers?: SmartMaintenanceServiceDataRecord[]
  projects?: SmartMaintenanceServiceDataRecord[]
  locations?: SmartMaintenanceServiceDataRecord[]
  deviceTypes?: SmartMaintenanceServiceDataRecord[]
  devices?: SmartMaintenanceServiceDataRecord[]
  faultCategories?: SmartMaintenanceServiceDataRecord[]
  departments?: SmartMaintenanceServiceDataRecord[]
  roles?: SmartMaintenanceServiceDataRecord[]
  personnel?: SmartMaintenanceServiceDataRecord[]
  parts?: SmartMaintenanceServiceDataRecord[]
  serviceTypes?: SmartMaintenanceServiceDataRecord[]
  urgencies?: SmartMaintenanceServiceDataRecord[]
  businessContexts?: SmartMaintenanceServiceDataRecord[]
  similarCases?: SmartMaintenanceServiceDataRecord[]
  workOrderSeeds?: SmartMaintenanceServiceDataRecord[]
}

export interface SmartMaintenanceServiceDataSummary {
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

export interface SmartMaintenanceServiceDataImportInput {
  importDraftId?: string
  fileName?: string
  importMode?: SmartMaintenanceServiceDataImportMode
  serviceData?: SmartMaintenanceServiceDataPayload
}

export interface SmartMaintenanceServiceDataImportDraft {
  importDraftId: string
  fileName: string
  mimeType?: string
  size?: number
  importMode: SmartMaintenanceServiceDataImportMode
  summary: SmartMaintenanceServiceDataSummary
  serviceData: SmartMaintenanceServiceDataPayload
}

export interface SmartMaintenanceSimilarWorkOrderSummary {
  id: string
  workOrderNo?: string
  title?: string
  status?: SmartMaintenanceWorkOrderStatus
  deviceType?: string
  location?: string
  faultCategory?: string
  faultPhenomenon?: string
  createdAt?: string
}

export interface SmartMaintenanceGeneratedWorkOrderInput {
  sourceType?: SmartMaintenanceSourceType
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
  urgency?: SmartMaintenanceUrgency
  serviceType?: SmartMaintenanceServiceType
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

export interface SmartMaintenanceUpdateInput {
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
  urgency?: SmartMaintenanceUrgency
  serviceType?: SmartMaintenanceServiceType
  needOnsite?: boolean
  confirmedDepartment?: string
  confirmedRole?: string
  confirmedDispatchAdvice?: string
  confirmedParts?: string[]
  processingRemark?: string
}

export interface SmartMaintenanceSearchInput {
  status?: SmartMaintenanceWorkOrderStatus
  deviceType?: string
  urgency?: SmartMaintenanceUrgency
  search?: string
  page?: number
  pageSize?: number
}

export interface SmartMaintenanceSupplementDraft {
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
  urgency?: SmartMaintenanceUrgency
  serviceType?: SmartMaintenanceServiceType
  needOnsite?: boolean
  confirmedDepartment?: string
  confirmedRole?: string
  confirmedDispatchAdvice?: string
  confirmedParts?: string[]
  processingRemark?: string
  confidence?: number
  rationale?: string
}

export interface SmartMaintenanceSupplementDraftInput extends SmartMaintenanceUpdateInput {
  supplementContent?: string
  draft?: SmartMaintenanceSupplementDraft
  confidence?: number
  rationale?: string
}

export interface SmartMaintenanceCatalogOption {
  code: string
  label: string
  deviceType?: string
  departmentCode?: string
  location?: string
  name?: string
  [key: string]: unknown
}

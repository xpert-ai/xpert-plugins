import type {
  EcnAssessmentStatus,
  EcnChangeType,
  EcnImpactDomain,
  EcnImpactItemStatus,
  EcnRiskLevel
} from './types'

export type { EcnAssessmentStatus, EcnChangeType, EcnImpactDomain, EcnImpactItemStatus, EcnRiskLevel }

/** Language-neutral DTOs shared by the view provider and the remote component. */

export interface AssessmentSummaryDto {
  id: string
  changeNo: string
  materialNo: string
  materialName?: string
  changeType: EcnChangeType
  changeDescription: string
  status: EcnAssessmentStatus
  riskLevel?: EcnRiskLevel
  itemCount: number
  pendingCount: number
  createdAt: string
  updatedAt: string
}

export interface ImpactItemDto {
  id: string
  impactKey: string
  domain: EcnImpactDomain
  targetNo: string
  targetName?: string
  relationPath?: string
  impactDescription: string
  suggestedAction?: string
  riskLevel?: EcnRiskLevel
  confidence?: number
  evidence?: Record<string, unknown>
  status: EcnImpactItemStatus
  reviewNote?: string
}

export interface AssessmentDetailDto extends AssessmentSummaryDto {
  changeReason?: string
  expectedEffectDate?: string
  aiSummary?: string
  lastError?: string
  retryCount: number
  confirmedBy?: string
  confirmedAt?: string
  items: ImpactItemDto[]
  logs: Array<{
    id: string
    type: string
    detail?: string
    createdAt: string
  }>
}

export interface AssessmentListData {
  items: AssessmentSummaryDto[]
  total: number
  page: number
  pageSize: number
  selected?: AssessmentDetailDto
}

export interface ViewQuery {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  selectionId?: string
}

export type ViewActionInput = Record<string, unknown>

export interface ActionReceipt {
  success: boolean
  code?: string
  message?: string
  assessmentId?: string
}

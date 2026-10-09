export type InspectionSeverity = 'low' | 'medium' | 'high' | 'critical'
export type InspectionStatus =
  | 'draft'
  | 'analyzing'
  | 'analyzed'
  | 'reviewing'
  | 'confirmed'
  | 'closed'
  | 'failed'

export interface InspectionScope {
  tenantId: string
  organizationId: string | null
  workspaceId: string | null
  projectId: string | null
  userId: string
}

/** AI 结构化解析结果（inspection_analyze_fault 写入） */
export interface InspectionAiAnalysis {
  deviceType?: string
  faultCategory?: string
  faultSummary?: string
  severity?: InspectionSeverity
  impact?: string
  possibleCauses?: string[]
}

/** 历史方案引用（inspection_search_history 写入） */
export interface InspectionHistoryReference {
  id: string
  deviceType: string
  faultCategory: string
  description: string
  resolution: string
  effectiveness?: string
  sourceCaseNo?: string
  matchedKeywords: string[]
}

export interface CreateInspectionCaseInput {
  title: string
  deviceType?: string
  faultDescription: string
  severity?: InspectionSeverity
  impact?: string
  createdBy?: string
}

export interface ConfirmResolutionInput {
  resolution: string
  resolvedBy?: string
  close?: boolean
}

export interface InspectionCaseView {
  id: string
  caseNo: string
  title: string
  deviceType: string | null
  faultDescription: string
  severity: InspectionSeverity | null
  impact: string | null
  status: InspectionStatus
  aiAnalysis: InspectionAiAnalysis | null
  recommendedAction: string | null
  historyReferences: InspectionHistoryReference[]
  failureReason: string | null
  retryCount: number
  resolution: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

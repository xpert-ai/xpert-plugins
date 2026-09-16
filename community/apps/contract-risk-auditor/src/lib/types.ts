export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW'

export type ClauseRiskStatus = 'PENDING' | 'ACCEPTED' | 'IGNORED'

export interface ClauseRiskItem {
  id: string
  originalText: string
  category: string
  riskLevel: RiskLevel
  riskAnalysis: string
  suggestedRevision: string
  status: ClauseRiskStatus
}

export interface ContractAuditRecord {
  id: string
  title: string
  originalContent: string
  revisedContent: string
  risks: ClauseRiskItem[]
  summary: string
  createdAt: string
  updatedAt: string
}

export interface ContractAuditorScope {
  tenantId?: string
  organizationId?: string
  userId?: string
}

export interface WorkbenchData {
  records: ContractAuditRecord[]
  activeRecordId?: string
  activeRecord?: ContractAuditRecord
  sampleContracts: Array<{
    title: string
    content: string
  }>
}

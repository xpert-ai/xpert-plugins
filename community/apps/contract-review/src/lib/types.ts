/** 四类关键条款 —— 这是本应用的全部审查范围，不做扩展 */
export type ContractClauseType = 'payment' | 'delivery' | 'warranty' | 'liability'

export const CONTRACT_CLAUSE_TYPES: ContractClauseType[] = ['payment', 'delivery', 'warranty', 'liability']

export const CONTRACT_CLAUSE_TYPE_LABELS: Record<ContractClauseType, { en: string; zh: string }> = {
  payment: { en: 'Payment terms', zh: '付款条件' },
  delivery: { en: 'Delivery', zh: '交付' },
  warranty: { en: 'Warranty', zh: '质保' },
  liability: { en: 'Liability', zh: '违约责任' }
}

export type ContractRiskLevel = 'high' | 'medium' | 'low'

export const CONTRACT_RISK_LEVELS: ContractRiskLevel[] = ['high', 'medium', 'low']

/** 人工对一条 AI 建议的处置 */
export type ContractHumanDecision = 'pending' | 'confirmed' | 'edited' | 'rejected'

/** 审查单状态 */
export type ContractReviewCaseStatus = 'draft' | 'extracting' | 'extracted' | 'confirmed'

/** 从视图上下文解析出的作用域 */
export interface ContractReviewScope {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
}

export interface ContractReviewClauseInput {
  clauseType: ContractClauseType
  excerpt: string
  conclusion: string
  riskLevel: ContractRiskLevel
  reason: string
}

export interface ContractReviewClauseDecision {
  clauseId: string
  decision: ContractHumanDecision
  conclusion?: string | null
  note?: string | null
}

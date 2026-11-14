export type JsonObject = Record<string, unknown>

export interface BridgeMessage {
  channel?: string
  protocolVersion?: number
  instanceId?: string | null
  type: string
  requestId?: string
  message?: string
  result?: unknown
  data?: unknown
  [key: string]: unknown
}

export interface HostContext {
  manifest?: JsonObject
  payload?: unknown
  initialQuery?: JsonObject
  locale?: string
  theme?: string
}

// ---- 与插件后端 types.ts 对应的前端视图模型 ----

export type ClauseType = 'payment' | 'delivery' | 'warranty' | 'liability'
export type RiskLevel = 'high' | 'medium' | 'low'
export type HumanDecision = 'pending' | 'confirmed' | 'edited' | 'rejected'
export type CaseStatus = 'draft' | 'extracting' | 'extracted' | 'confirmed'

export interface ClauseView {
  id: string
  caseId: string
  sequence: number
  clauseType: ClauseType
  excerpt: string
  aiConclusion: string | null
  aiRiskLevel: RiskLevel
  aiReason: string | null
  humanDecision: HumanDecision
  humanConclusion: string | null
  humanNote: string | null
  decidedAt: string | null
}

export interface CaseView {
  id: string
  title: string
  counterparty: string | null
  contractText: string
  status: CaseStatus
  extractionAttempts: number
  lastExtractionAt: string | null
  lastExtractionError: string | null
  confirmedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  clauseCount: number
  pendingCount: number
  clauses?: ClauseView[]
}

export interface CaseListResult {
  items: CaseView[]
  total: number
  page: number
  pageSize: number
}

export interface ViewData {
  selected: CaseView | null
  list: CaseListResult
}

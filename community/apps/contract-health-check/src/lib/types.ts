export type ContractReviewStatus =
  | 'draft'
  | 'processing'
  | 'needs_review'
  | 'completed'
  | 'failed'

export type ContractType = 'sales' | 'purchase' | 'cooperation'
export type ContractRiskLevel = 'high' | 'medium' | 'low'
export type ContractRiskDecision = 'pending' | 'accepted' | 'ignored' | 'custom'
export type ContractReviewJobType = 'extract' | 'review' | 'draft' | 'summary'
export type ContractReviewJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted'

export interface ContractScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface CreateContractReviewInput {
  contractName: string
  contractType: ContractType
  rawText: string
  counterparty?: string
  xpertId?: string
  agentKey?: string
}

export interface SaveExtractionInput {
  reviewId: string
  elements: ContractElements
}

export interface ContractElements {
  parties?: string[]
  amount?: string
  paymentTerms?: string
  deliveryTerms?: string
  liabilityClause?: string
  jurisdiction?: string
  confidentiality?: string
  ipClause?: string
  termination?: string
  notes?: string[]
}

export interface RiskItemInput {
  level: ContractRiskLevel
  clauseRef?: string
  title: string
  issue: string
  basis?: string
}

export interface SaveRiskItemsInput {
  reviewId: string
  risks: RiskItemInput[]
}

export interface SuggestionInput {
  clauseRef?: string
  riskTitle: string
  originalText?: string
  suggestedText: string
  rationale?: string
}

export interface SaveSuggestionsInput {
  reviewId: string
  suggestions: SuggestionInput[]
}

export interface SaveSummaryInput {
  reviewId: string
  score: number
  summary: string
  highlights?: string[]
  pendingQuestions?: string[]
}

export interface ConfirmRiskDecisionInput {
  reviewId: string
  riskId: string
  decision: ContractRiskDecision
  customText?: string
  note?: string
}

export interface RetryPipelineInput {
  reviewId: string
  stage?: ContractReviewJobType
}

export interface ReportProcessingFailureInput {
  reviewId: string
  stage: ContractReviewJobType
  errorMessage: string
}

export interface ContractWorkbenchQuery {
  reviewId?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface ContractAssistantChatCommand {
  commandKey: 'assistant.chat.send_message'
  payload: {
    text: string
    clientMessageId?: string
    state?: Record<string, unknown>
  }
  reviewId: string
  stage: ContractReviewJobType
}

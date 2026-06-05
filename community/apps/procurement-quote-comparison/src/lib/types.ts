export type ProcurementComparisonStatus =
  | 'draft'
  | 'files_uploaded'
  | 'parsing'
  | 'parsed'
  | 'reviewing'
  | 'completed'
  | 'failed'

export type ProcurementDocumentRole = 'requirement' | 'supplier_quote' | 'other'
export type ProcurementDocumentStatus = 'uploaded' | 'queued' | 'parsing' | 'parsed' | 'failed'
export type ProcurementDocumentExtractionStatus = 'extracted' | 'unsupported' | 'failed'
export type ProcurementParseJobType = 'requirement' | 'supplier_quote' | 'comparison'
export type ProcurementParseJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted'
export type ProcurementMatchStatus = 'exact' | 'similar' | 'spec_mismatch' | 'quantity_mismatch' | 'missing' | 'uncertain'
export type ProcurementRiskSeverity = 'low' | 'medium' | 'high'

export interface ProcurementScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface CreateComparisonCaseInput {
  title: string
  purchaseNo: string
  applicant?: string
  department?: string
  budgetAmount?: string
  expectedDeliveryDate?: string
  description?: string
  xpertId?: string
  agentKey?: string
}

export interface CreateCaseFromRequirementDocumentInput {
  name: string
  fileAssetId?: string
  fileId?: string
  storageFileId?: string
  mimeType?: string
  size?: number
  extractedContent?: string
  extractionStatus?: ProcurementDocumentExtractionStatus
  extractionErrorMessage?: string
  xpertId?: string
  agentKey?: string
}

export interface RequirementProjectFields {
  title?: string
  purchaseNo?: string
  applicant?: string
  department?: string
  budgetAmount?: string
  expectedDeliveryDate?: string
  description?: string
}

export interface RequirementItemInput {
  name: string
  specification?: string
  quantity?: number
  unit?: string
  budgetAmount?: string
  expectedDeliveryDate?: string
  requirements?: string
  rawText?: string
}

export interface SaveRequirementExtractionInput {
  caseId: string
  project?: RequirementProjectFields
  items: RequirementItemInput[]
}

export interface ProcurementFieldConflict {
  field: string
  manualValue: string
  parsedValue: string
}

export interface SupplierQuoteItemInput {
  requirementItemId?: string
  productName: string
  brand?: string
  model?: string
  specification?: string
  quantity?: number
  unit?: string
  unitPrice?: string
  totalPrice?: string
  taxIncluded?: boolean
  taxRate?: string
  deliveryTime?: string
  paymentTerms?: string
  warranty?: string
  remarks?: string
  rawText?: string
}

export interface SaveSupplierQuoteExtractionInput {
  caseId: string
  documentId?: string
  supplierName: string
  supplierContact?: string
  taxIncluded?: boolean
  deliveryTime?: string
  paymentTerms?: string
  warranty?: string
  remarks?: string
  items: SupplierQuoteItemInput[]
}

export interface SaveItemMatchInput {
  caseId: string
  requirementItemId?: string
  quoteItemId?: string
  supplierQuoteId?: string
  status: ProcurementMatchStatus
  confidence?: number
  explanation?: string
}

export interface SaveItemMatchesInput {
  caseId: string
  matches: Array<Omit<SaveItemMatchInput, 'caseId'>>
}

export interface SaveRiskItemInput {
  caseId: string
  supplierQuoteId?: string
  requirementItemId?: string
  quoteItemId?: string
  type: string
  severity: ProcurementRiskSeverity
  title: string
  description: string
  suggestion?: string
}

export interface SaveRiskItemsInput {
  caseId: string
  risks: Array<Omit<SaveRiskItemInput, 'caseId'>>
}

export interface FinalizeRecommendationInput {
  caseId: string
  summary: string
  recommendedSupplier?: string
  recommendedPlan?: string
  explanation?: string
  reportDraft?: string
  pendingQuestions?: string[]
}

export interface ReportParseFailureInput {
  caseId: string
  parseJobId?: string
  documentId?: string
  errorMessage: string
}

export interface StartParseInput {
  caseId: string
  xpertId: string
  agentKey?: string
  maxConcurrency?: number
}

export interface ProcurementAssistantTaskInput {
  xpertId: string
  agentKey?: string
  conversationId?: string | null
  projectId?: string | null
  taskId?: string
  clientMessageId?: string
  prompt: string
  files?: ProcurementAssistantChatCommand['payload']['files']
  context?: {
    plugin: 'procurement_quote_comparison'
    caseId: string
    documentId?: string | null
    parseJobId?: string | null
  }
}

export interface ProcurementAssistantTaskResult {
  taskId?: string
  executionId?: string
  conversationId?: string
  threadId?: string
  status?: string
  errorMessage?: string
}

export interface ProcurementAssistantTaskApi {
  startTask(input: ProcurementAssistantTaskInput): ProcurementAssistantTaskResult | Promise<ProcurementAssistantTaskResult>
}

export interface StartParseOptions {
  assistantTask?: ProcurementAssistantTaskApi
  startTask?: ProcurementAssistantTaskApi['startTask']
}

export interface ProcurementAssistantChatCommand {
  commandKey: 'assistant.chat.send_message'
  payload: {
    text: string
    clientMessageId: string
    files: Array<{
      id?: string
      fileId?: string
      fileAssetId?: string
      storageFileId?: string
      originalName?: string
      name?: string
      mimeType?: string
      mimetype?: string
      size?: number
      role?: string
    }>
    attachments: Array<{
      type: 'file'
      id: string
      name: string
      mime_type: string
    }>
    references: Array<{
      type: 'quote'
      label: string
      source: string
      text: string
    }>
    followUpMode: 'queue'
    state: {
      procurementQuoteComparison: {
        action: string
        caseId: string
        documentId?: string
        parseJobId?: string
      }
    }
  }
  caseId: string
  documentId?: string
  parseJobId?: string
  role: ProcurementParseJobType
}

export interface PreparedSupplierQuoteParseMessages {
  total: number
  prepared: number
  skipped: number
  maxConcurrency: number
  messages: ProcurementAssistantChatCommand[]
}

export interface ProcurementWorkbenchQuery {
  caseId?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface RegisterSourceDocumentInput {
  caseId: string
  role: ProcurementDocumentRole
  supplierName?: string
  name: string
  fileAssetId?: string
  fileId?: string
  storageFileId?: string
  mimeType?: string
  size?: number
  extractedContent?: string
  extractionStatus?: ProcurementDocumentExtractionStatus
  extractionErrorMessage?: string
}

export type XpertScope = {
  tenantId?: string | null
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export type QuotationWorkbenchContextInput = {
  quotationId?: string
  quotationTitle?: string
  fileName?: string
  officeVersionNumber?: number
  activeView?: 'quotation' | 'review' | 'approved' | 'knowledge'
  activeSheetName?: string
  selectedRange?: string
  dirty?: boolean
  currentSnapshotId?: string
}

export type QuotationStatus = 'uploaded' | 'matched' | 'review_required' | 'ready_to_apply' | 'applied' | 'failed'
export type QuotationLineKind = 'bill' | 'material' | 'measure'
export type PriceItemKind = 'project_rate' | 'material' | 'measure'
export type MatchStatus = 'matched' | 'review_required' | 'unmatched' | 'confirmed' | 'ignored' | 'applied'
export type LineReviewState = 'pending' | 'approved' | 'applied' | 'skipped'

export type AiMatchRecommendationInput = {
  priceItemId: string
  confidence: number
  rationale: string
  differences: string[]
}

export type ResourceCategory = 'labor' | 'material' | 'machine' | 'unclassified'

export type ResourcePriceItem = {
  id?: string
  resourceCategory?: ResourceCategory
  code?: string
  name: string
  aliases?: string[]
  unit: string
  unitPrice: string
  workdayHours?: number
  workdayEvidenceQuote?: string
  region?: string
  pricePeriod?: string
  evidenceQuote: string
}

export type UnitConversionTrace = {
  sourceUnit: string
  targetUnit: string
  factor: string
  method: 'identity' | 'metric' | 'workday_hours'
  formula: string
}

export type KnowledgePriceCandidate = {
  id: string
  knowledgebaseId: string
  documentId?: string
  chunkId?: string
  documentName?: string
  pageContent: string
  score?: number
  relevanceScore?: number
  sourcePages: number[]
  priceItems: ResourcePriceItem[]
  query: string
  retrievedAt: string
}

export type QuotaResourceConsumption = {
  category: '人工' | '材料' | '机械' | '未分类'
  code: string
  name: string
  unit: string
  consumption: string
  /** True when OCR did not expose a trustworthy quantity and a reviewer must fill it. */
  consumptionPending?: boolean
}

export type QuotaKnowledgeCandidate = {
  id: string
  knowledgebaseId: string
  documentId?: string
  chunkId?: string
  documentName?: string
  pageContent: string
  score?: number
  relevanceScore?: number
  quotaCode?: string
  quotaName?: string
  quotaUnit?: string
  region?: string
  edition?: string
  discipline?: string
  extractionStatus: 'structured' | 'partial' | 'raw_evidence'
  extractedQuotaCodes: string[]
  reviewStatus: string
  ingestionReady?: boolean
  workContents: string[]
  resources: QuotaResourceConsumption[]
  adjustments: string[]
  formulas?: string[]
  sourceFile?: string
  sourcePages: number[]
  query: string
  retrievedAt: string
  sourceKind?: 'knowledgebase' | 'web'
  externalSources?: ExternalEvidenceSource[]
}

export type QuotaBreakdownComponentInput = {
  candidateId: string
  quotaCode?: string
  coveredWorkScopes: string[]
  confidence: number
  rationale: string
  differences: string[]
}

export type QuotaBreakdownComponent = QuotaBreakdownComponentInput & {
  quotaCode?: string
  quotaName?: string
  quotaUnit?: string
  knowledgebaseId: string
  documentId?: string
  chunkId?: string
  sourcePages: number[]
  sourceReviewStatus: string
  sourceIngestionReady?: boolean
  directMaterial?: boolean
  resources: QuotaResourceConsumption[]
  formulas?: string[]
  sourceKind?: 'knowledgebase' | 'web' | 'direct_material'
  externalSources?: ExternalEvidenceSource[]
}

export type WebQuotaResourceInput = {
  category: QuotaResourceConsumption['category']
  code?: string
  name: string
  unit: string
  consumption: string
  consumptionPending?: boolean
}

export type WebQuotaBreakdownComponentInput = {
  quotaCode?: string
  quotaName: string
  quotaUnit: string
  coveredWorkScopes: string[]
  confidence: number
  rationale: string
  differences: string[]
  resources: WebQuotaResourceInput[]
  sources: ExternalEvidenceSource[]
}

export type WebQuotaBreakdownProposalInput = {
  components: WebQuotaBreakdownComponentInput[]
  uncoveredWorkScopes: string[]
  rationale: string
}

export type QuotaBreakdownProposalInput = {
  components: QuotaBreakdownComponentInput[]
  uncoveredWorkScopes: string[]
  rationale: string
}

export type QuotaBreakdownProposal = {
  coverageStatus: 'complete' | 'partial'
  mappingStatus: 'proposed' | 'approved' | 'rejected'
  components: QuotaBreakdownComponent[]
  uncoveredWorkScopes: string[]
  skippedUncoveredWorkScopes?: string[]
  pricingFormulaRules?: QuotaPricingFormulaRule[]
  blockingReasons: string[]
  automaticPricingAllowed: false
  rationale: string
  proposedAt: string
  reviewedAt?: string
  reviewComment?: string
}

export type QuotaPricingFormulaRule = PricingFeeRuleInput & {
  id: string
  componentCandidateId: string
  sourceText?: string
  status: 'enabled' | 'skipped'
  updatedAt?: string
}

export type QuotaPricingResource = {
  id: string
  componentCandidateId: string
  quotaCode?: string
  quotaName?: string
  quotaUnit: string
  category: QuotaResourceConsumption['category']
  code: string
  name: string
  aliases: string[]
  unit: string
  consumption: string
  consumptionPending?: boolean
}

export type ResourcePriceCandidate = KnowledgePriceCandidate & {
  resourceMatchScore: number
  matchedPriceItemIds: string[]
}

export type QuotaResourcePriceRecommendation = {
  candidateId: string
  priceItemId: string
  matchedName: string
  sourceUnit: string
  sourceUnitPrice: string
  normalizedUnitPrice: string
  unitConversion?: UnitConversionTrace
  sourceWorkdayHours?: number
  quotaWorkdayHours?: number
  workdayEvidenceQuote?: string
  requiresResourceUnitReview?: boolean
  evidenceQuote: string
  confidence: number
  rationale: string
  differences: string[]
  recommendedAt: string
  sourceKind?: 'knowledgebase' | 'web'
  sources?: ExternalEvidenceSource[]
}

export type QuotaResourcePriceState = {
  resourceId: string
  status: 'not_searched' | 'searched' | 'recommended' | 'approved' | 'rejected' | 'no_match'
  query?: string
  candidates: ResourcePriceCandidate[]
  searchedAt?: string
  failedKnowledgebaseIds?: string[]
  recommendation?: QuotaResourcePriceRecommendation
  reviewedAt?: string
  reviewComment?: string
}

export type PricingFeeBase =
  | 'direct_cost'
  | 'labor_cost'
  | 'material_cost'
  | 'machine_cost'
  | 'labor_plus_machine'
  | 'running_total'

export type PricingFeeRuleInput = {
  code: string
  name: string
  ratePercent: string
  base: PricingFeeBase
}

export type QuotationLinePricingCalculation = {
  status: 'calculated'
  engineVersion: string
  quotaBreakdownProposedAt: string
  quantity: string
  billUnit: string
  resourceCosts: Array<{
    resourceId: string
    quotaCode?: string
    category: QuotaResourceConsumption['category']
    code: string
    name: string
    quotaUnit: string
    quotaBase: string
    consumption: string
    normalizedUnitPrice: string
    costPerQuotaUnit: string
    costPerBillUnit: string
    priceStatus?: 'approved' | 'missing' | 'invalid'
    warning?: string
    priceUnitConversion?: UnitConversionTrace
    quotaUnitConversion?: UnitConversionTrace
  }>
  directCosts: {
    labor: string
    material: string
    machine: string
    total: string
  }
  fees: Array<PricingFeeRuleInput & { baseAmount: string; amount: string }>
  calculationWarnings?: string[]
  unpricedResourceIds?: string[]
  comprehensiveUnitPrice: string
  totalAmount: string
  unitPriceScale: number
  calculatedAt: string
}

export type AiKnowledgePriceRecommendationInput = {
  candidateId: string
  unitPrice: string
  sourceUnit: string
  matchedMaterialName: string
  matchedSpecification?: string
  evidenceQuote: string
  confidence: number
  rationale: string
  differences: string[]
}

export type ExternalEvidenceSource = {
  title: string
  url: string
  quote: string
  publishedAt?: string
}

export type ExternalPriceSource = ExternalEvidenceSource

export type AiWebPriceRecommendationInput = {
  unitPrice: string
  sourceUnit: string
  currency: 'CNY'
  confidence: number
  rationale: string
  sources: ExternalPriceSource[]
}

export type AiWebResourcePriceRecommendationInput = {
  resourceId: string
  unitPrice: string
  sourceUnit: string
  currency: 'CNY'
  sourceWorkdayHours?: number
  quotaWorkdayHours?: number
  confidence: number
  rationale: string
  differences: string[]
  sources: ExternalPriceSource[]
}

export type AiRecommendationKind = 'knowledge' | 'web'

export type XpertQuotationHistoryAction =
  | 'import_quotation'
  | 'import_price_book'
  | 'delete_quotation'
  | 'delete_price_book'
  | 'match_quotation'
  | 'search_quota_components'
  | 'select_quota_candidate'
  | 'propose_quota_breakdown'
  | 'recommend_web_quota_breakdown'
  | 'review_quota_breakdown'
  | 'update_pricing_review'
  | 'search_resource_prices'
  | 'recommend_resource_price'
  | 'recommend_web_resource_price'
  | 'review_resource_price'
  | 'calculate_comprehensive_rate'
  | 'search_knowledge_prices'
  | 'mark_knowledge_no_match'
  | 'ai_recommend_knowledge_price'
  | 'ai_recommend_candidate'
  | 'ai_recommend_web_price'
  | 'confirm_match'
  | 'accept_ai_recommendation'
  | 'accept_ai_recommendations'
  | 'set_manual_price'
  | 'skip_line'
  | 'reopen_line'
  | 'save_workbook'
  | 'apply_workbook'

export type SheetSubtotalMapping = {
  startRow: number
  endRow: number
  targetRow: number
}

export type XpertSheetMapping = {
  sheetName: string
  discipline: 'building' | 'installation'
  kind: QuotationLineKind
  headerRow: number
  dataStartRow: number
  dataEndRow: number
  columns: {
    code?: string
    name: string
    specification?: string[]
    unit?: string
    quantity?: string
    unitPrice: string
    amount?: string
  }
  totals?: {
    subtotals?: SheetSubtotalMapping[]
    finalTotalRow?: number
  }
  confidence: number
  rationale: string
  evidence: string[]
}

export type WorkbookRecognitionInput = {
  sheetMappings: XpertSheetMapping[]
  recognitionConfidence: number
  recognitionRationale: string
  changeSummary: string
}

export type PriceItem = {
  id: string
  kind: PriceItemKind
  code?: string
  name: string
  specification?: string
  unit?: string
  unitPrice: string
  sourceSheet: string
  sourceRow: number
}

export type WorkbookCell = {
  address: string
  value: string | number | boolean | null
  formula?: string
  numberFormat?: string
}

export type OfficeReadResult = {
  documentId: string
  fileVersionId: string
  versionNumber: number
  fileName: string
  workbook: {
    sheets: Array<{ name: string; range?: string | null; hidden?: boolean }>
    sheetName?: string
    range?: string
    rows?: WorkbookCell[][]
  }
}

export type OfficeImportResult = {
  document: { id: string; title: string; currentFileVersionNumber?: number | null }
  fileVersion?: { id: string; versionNumber: number; fileName: string } | null
  convertedFromLegacyXls?: boolean
}

export type OfficePatchResult = {
  fileVersion: { id: string; versionNumber: number; fileName: string }
  file: { fileName: string; filePath: string; fileUrl: string; mimeType: string; extension: 'xlsx' }
  replayed: boolean
}

export type OfficeDocumentDetail = {
  item?: {
    id?: string
    title?: string
    documentType?: string
    currentVersionNumber?: number | null
    currentFileVersionId?: string | null
    currentFileVersionNumber?: number | null
  }
  currentSnapshot?: { id?: string; snapshot?: unknown } | null
}

export type OfficeSnapshotSaveResult = {
  document: { id?: string; currentVersionNumber?: number | null }
  snapshot: { id?: string; versionNumber?: number | null; snapshot?: unknown }
  fileVersion?: { id?: string; versionNumber?: number | null; fileName?: string } | null
}

export type OfficeExcelCellPatch = {
  sheetName: string
  address: string
  kind: 'number'
  value: string
  expectedCellState: { kind: 'empty' | 'any' }
  evidenceId?: string | null
} | {
  sheetName: string
  address: string
  kind: 'formula'
  value: string
  cachedValue: string
  expectedCellState: { kind: 'empty' | 'any' }
  evidenceId?: string | null
}

export type OfficeExcelPatchTarget = {
  sheetName: string
  address: string
}

export type XpertQuotationStateSnapshot = {
  id: string
  officeDocumentId: string
  officeFileVersionId?: string | null
  officeVersionNumber: number
  priceBookId?: string | null
  status: QuotationStatus
  matchedCount: number
  reviewCount: number
  unmatchedCount: number
  totalAmount?: string | null
  warnings?: string[] | null
  sheetMappings?: XpertSheetMapping[] | null
  recognitionConfidence?: number | null
  recognitionRationale?: string | null
  recognizedAt?: string | null
}

export type XpertQuotationLineStateSnapshot = {
  id: string
  tenantId: string
  organizationId?: string | null
  quotationId: string
  sheetName: string
  rowNumber: number
  discipline: 'building' | 'installation'
  kind: QuotationLineKind
  materialReferenceOnly?: boolean | null
  code?: string | null
  name: string
  specification?: string | null
  unit?: string | null
  quantity?: string | null
  quantityAddress?: string | null
  targetPriceAddress: string
  targetAmountAddress?: string | null
  matchStatus: MatchStatus
  matchedPriceItemId?: string | null
  matchedUnitPrice?: string | null
  calculatedAmount?: string | null
  candidateIds?: string[] | null
  matchEvidence?: string | null
  aiRecommendedPriceItemId?: string | null
  knowledgeCandidates?: KnowledgePriceCandidate[] | null
  knowledgeSearchedAt?: string | null
  knowledgeNoMatchReason?: string | null
  knowledgeNoMatchAt?: string | null
  quotaWorkScopes?: string[] | null
  quotaCandidates?: QuotaKnowledgeCandidate[] | null
  quotaSearchedAt?: string | null
  quotaBreakdown?: QuotaBreakdownProposal | null
  quotaPricingResources?: QuotaPricingResource[] | null
  quotaResourcePrices?: QuotaResourcePriceState[] | null
  pricingCalculation?: QuotationLinePricingCalculation | null
  aiRecommendedKnowledgeCandidateId?: string | null
  aiRecommendedKnowledgebaseId?: string | null
  aiRecommendedDocumentId?: string | null
  aiRecommendedChunkId?: string | null
  aiMatchedMaterialName?: string | null
  aiMatchedSpecification?: string | null
  aiKnowledgeEvidence?: string | null
  aiRecommendedUnitPrice?: string | null
  aiRecommendedSourceUnitPrice?: string | null
  aiRecommendedSourceUnit?: string | null
  aiUnitConversion?: UnitConversionTrace | null
  aiConfidence?: number | null
  aiRationale?: string | null
  aiDifferences?: string[] | null
  aiSources?: ExternalPriceSource[] | null
  aiRecommendedAt?: string | null
}

export type XpertQuotationUndoSnapshot = {
  quotation: XpertQuotationStateSnapshot
  lines: XpertQuotationLineStateSnapshot[]
  replaceAllLines: boolean
}

export type RecognizedLine = {
  sheetName: string
  rowNumber: number
  discipline: 'building' | 'installation'
  kind: QuotationLineKind
  code?: string
  name: string
  specification?: string
  unit?: string
  quantity?: string
  quantityAddress?: string
  targetPriceAddress: string
  targetAmountAddress?: string
}

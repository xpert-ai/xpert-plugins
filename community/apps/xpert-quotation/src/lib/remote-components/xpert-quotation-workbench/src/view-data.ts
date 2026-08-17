export type MatchStatus = 'matched' | 'review_required' | 'unmatched' | 'confirmed' | 'ignored' | 'applied'

export type KnowledgePriceCandidate = {
  id: string
  knowledgebaseId: string
  knowledgebaseName?: string
  documentId?: string
  chunkId?: string
  documentName?: string
  pageContent: string
  score?: number
  relevanceScore?: number
  query: string
  retrievedAt: string
}

export type QuotaBreakdownComponent = {
  candidateId: string
  coveredWorkScopes: string[]
  confidence: number
  rationale: string
  differences: string[]
  quotaCode?: string
  quotaName?: string
  quotaUnit?: string
  knowledgebaseId: string
  documentId?: string
  chunkId?: string
  sourcePages: number[]
  sourceReviewStatus: string
  sourceIngestionReady?: boolean
  resources?: Array<{ category: string; code: string; name: string; unit: string; consumption: string; consumptionPending?: boolean }>
  formulas?: string[]
  sourceKind?: 'knowledgebase' | 'web' | 'direct_material'
  externalSources?: ExternalEvidenceSource[]
}

export type ExternalEvidenceSource = { title: string; url: string; quote: string; publishedAt?: string }

export type QuotaKnowledgeCandidate = {
  id: string
  knowledgebaseId: string
  documentId?: string
  chunkId?: string
  documentName?: string
  quotaCode?: string
  quotaName?: string
  quotaUnit?: string
  extractionStatus?: string
  workContents?: string[]
  adjustments?: string[]
  sourcePages?: number[]
  resources?: Array<{ category: string; code: string; name: string; unit: string; consumption: string; consumptionPending?: boolean }>
  sourceKind?: 'knowledgebase' | 'web'
  externalSources?: ExternalEvidenceSource[]
}

export type QuotaPricingResource = {
  id: string; componentCandidateId: string; quotaCode?: string; quotaName?: string; quotaUnit: string
  category: string; code: string; name: string; aliases: string[]; unit: string; consumption: string; consumptionPending?: boolean
}

export type ResourcePriceItem = {
  id?: string; resourceCategory?: string; code?: string; name: string; aliases?: string[]
  unit: string; unitPrice: string; workdayHours?: number; region?: string; pricePeriod?: string; evidenceQuote: string
}

export type ResourcePriceCandidate = {
  id: string; knowledgebaseId: string; documentId?: string; chunkId?: string; documentName?: string
  score?: number; relevanceScore?: number; sourcePages: number[]; resourceMatchScore: number
  matchedPriceItemIds: string[]; priceItems: ResourcePriceItem[]
}

export type QuotaResourcePriceState = {
  resourceId: string
  status: 'not_searched' | 'searched' | 'recommended' | 'approved' | 'rejected' | 'no_match'
  candidates: ResourcePriceCandidate[]
  searchedAt?: string
  failedKnowledgebaseIds?: string[]
  recommendation?: {
    candidateId: string; priceItemId: string
    matchedName: string; sourceUnit: string; sourceUnitPrice: string; normalizedUnitPrice: string
    sourceWorkdayHours?: number; quotaWorkdayHours?: number; workdayEvidenceQuote?: string; evidenceQuote: string
    requiresResourceUnitReview?: boolean
    unitConversion?: { sourceUnit: string; targetUnit: string; factor: string; method: string; formula: string }
    confidence: number; rationale: string; differences: string[]; recommendedAt: string
    sourceKind?: 'knowledgebase' | 'web'; sources?: ExternalEvidenceSource[]
  }
  reviewedAt?: string
  reviewComment?: string
}

export type PricingCalculation = {
  engineVersion: string
  directCosts: { labor: string; material: string; machine: string; total: string }
  fees: Array<{ code: string; name: string; ratePercent: string; base: string; baseAmount: string; amount: string }>
  resourceCosts?: Array<{ resourceId: string; category: string; name: string; normalizedUnitPrice: string; costPerBillUnit: string; priceStatus?: string; warning?: string }>
  comprehensiveUnitPrice: string
  totalAmount: string
  calculationWarnings?: string[]
  unpricedResourceIds?: string[]
  calculatedAt: string
}

export type QuotaBreakdown = {
  coverageStatus: 'complete' | 'partial'
  mappingStatus: 'proposed' | 'approved' | 'rejected'
  components: QuotaBreakdownComponent[]
  uncoveredWorkScopes: string[]
  skippedUncoveredWorkScopes?: string[]
  pricingFormulaRules?: PricingFormulaRule[]
  blockingReasons: string[]
  automaticPricingAllowed: false
  rationale: string
  proposedAt: string
  reviewedAt?: string
  reviewComment?: string
}

export type PricingFormulaRule = {
  id: string
  componentCandidateId: string
  code: string
  name: string
  ratePercent: string
  base: 'direct_cost' | 'labor_cost' | 'material_cost' | 'machine_cost' | 'labor_plus_machine' | 'running_total'
  status: 'enabled' | 'skipped'
  sourceText?: string
  updatedAt?: string
}

export type Line = {
  id: string; sheetName: string; rowNumber: number; discipline: 'building' | 'installation'; kind: 'bill' | 'material' | 'measure'
  materialReferenceOnly?: boolean
  code?: string; name: string; specification?: string; unit?: string; quantity?: string; matchedUnitPrice?: string; calculatedAmount?: string
  matchStatus: MatchStatus; reviewState?: 'pending' | 'approved' | 'applied' | 'skipped'; matchEvidence?: string
  knowledgeCandidates?: KnowledgePriceCandidate[]; knowledgeSearchedAt?: string; knowledgeNoMatchReason?: string; knowledgeNoMatchAt?: string
  quotaWorkScopes?: string[]; quotaSearchedAt?: string; quotaBreakdown?: QuotaBreakdown
  quotaCandidates?: QuotaKnowledgeCandidate[]
  quotaPricingResources?: QuotaPricingResource[]; quotaResourcePrices?: QuotaResourcePriceState[]; pricingCalculation?: PricingCalculation
  aiRecommendedKnowledgeCandidateId?: string; aiRecommendedKnowledgebaseId?: string; aiRecommendedDocumentId?: string; aiRecommendedChunkId?: string
  aiMatchedMaterialName?: string; aiMatchedSpecification?: string; aiKnowledgeEvidence?: string
  aiRecommendedUnitPrice?: string; aiRecommendedSourceUnit?: string; aiConfidence?: number; aiRationale?: string
  aiRecommendedSourceUnitPrice?: string; aiUnitConversion?: { sourceUnit: string; targetUnit: string; factor: string; method: string; formula: string }
  aiDifferences?: string[]; aiSources?: Array<{ title: string; url?: string; quote: string; publishedAt?: string }>; aiRecommendedAt?: string
}

export type Quotation = { id: string; title: string; status: string; officeVersionNumber: number; matchedCount: number; reviewCount: number; unmatchedCount: number; totalAmount?: string; warnings?: string[] }
export type Knowledgebase = { id: string; name?: string; description?: string | null; documentNum?: number | null; chunkNum?: number | null }
export type KnowledgeSearchData = {
  items: KnowledgePriceCandidate[]
  summary: { knowledgebases: Knowledgebase[]; activeKnowledgebaseId?: string; queryRequired: boolean; errorCode?: string }
}
export type WorkbenchData = {
  quotations: Quotation[]
  undo: { available: boolean; action?: string | null; createdAt?: string | null }
  detail: null | {
    quotation: Quotation
    lines: Line[]
    officeFile?: { fileName: string; filePath?: string; fileUrl: string; versionNumber?: number } | null
    officeDocument?: {
      item?: { id?: string; title?: string; documentType?: string; currentVersionNumber?: number; currentFileVersionNumber?: number } | null
      currentSnapshot?: { id?: string; snapshot?: unknown } | null
    } | null
  }
}

export type QuotaResource = { category: string; code: string; name: string; unit: string; consumption: string; consumptionPending?: boolean }
export type QuotaItem = {
  id: string
  sourceVersionId: string
  quotaCode: string
  quotaName: string
  quotaUnit: string
  chapter?: string | null
  workContents: string[]
  adjustments: string[]
  reviewStatus: 'unreviewed' | 'approved' | 'rejected'
  ingestionReady: boolean
  revision: number
  resources: QuotaResource[]
  evidence?: { pdfPages: number[]; printedPages: string[]; excerpt: string } | null
}
export type QuotaVersion = {
  id: string; sourceId: string; versionNumber: number; originalFileName: string; status: string; size: number; pageCount: number
  quotaItemCount: number; resourceCount: number; warningCount: number; readyCount: number; reviewRequiredCount: number; publishedAt?: string | null
}
export type QuotaJob = {
  id: string; sourceVersionId: string; status: string; stage: string; progress: number; currentPage: number; totalPages: number
  itemCount: number; resourceCount: number; warningCount: number; errorCode?: string | null; errorMessage?: string | null
}
export type QuotaSyncJob = {
  id: string; sourceVersionId: string; knowledgebaseId: string; status: string; stage: string; progress: number
  total: number; processed: number; synced: number; skipped: number; failed: number; errorCode?: string | null; errorMessage?: string | null
}
export type QuotaKnowledgeData = {
  sources: Array<{ id: string; displayName: string; activeVersionId?: string | null }>
  versions: QuotaVersion[]
  jobs: QuotaJob[]
  syncJobs: QuotaSyncJob[]
  selectedVersionId?: string | null
  items: QuotaItem[]
  total: number
  page: number
  pageSize: number
  hasMore?: boolean
}

export function normalizeWorkbenchData(value: unknown): WorkbenchData {
  const source = responseValue(value)
  const undo = recordValue(source.undo)
  return {
    quotations: arrayValue<Quotation>(source.quotations),
    undo: { available: undo.available === true, action: firstText(undo.action) ?? null, createdAt: firstText(undo.createdAt) ?? null },
    detail: boundaryValue<WorkbenchData['detail']>(source.detail, null)
  }
}

export function normalizeKnowledgeData(value: unknown): KnowledgeSearchData {
  const source = responseValue(value)
  const summary = recordValue(source.summary)
  return {
    items: arrayValue<KnowledgePriceCandidate>(source.items).slice(0, 5),
    summary: {
      knowledgebases: arrayValue<Knowledgebase>(summary.knowledgebases),
      activeKnowledgebaseId: firstText(summary.activeKnowledgebaseId),
      queryRequired: summary.queryRequired === true,
      errorCode: firstText(summary.errorCode)
    }
  }
}

export function normalizeQuotaKnowledgeData(value: unknown): QuotaKnowledgeData {
  const source = responseValue(value)
  return {
    sources: arrayValue<QuotaKnowledgeData['sources'][number]>(source.sources),
    versions: arrayValue<QuotaVersion>(source.versions),
    jobs: arrayValue<QuotaJob>(source.jobs),
    syncJobs: arrayValue<QuotaSyncJob>(source.syncJobs),
    selectedVersionId: firstText(source.selectedVersionId) ?? null,
    items: arrayValue<QuotaItem>(source.items),
    total: finiteNumber(source.total, 0),
    page: finiteNumber(source.page, 1),
    pageSize: finiteNumber(source.pageSize, 20),
    hasMore: source.hasMore === true
  }
}

function responseValue(value: unknown) { const source = recordValue(value); return recordValue(source.data ?? value) }
function recordValue(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function arrayValue<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : [] }
function boundaryValue<T>(value: unknown, fallback: T): T { return value == null ? fallback : value as T }
function finiteNumber(value: unknown, fallback: number) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
function firstText(...values: unknown[]) { for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim(); return undefined }

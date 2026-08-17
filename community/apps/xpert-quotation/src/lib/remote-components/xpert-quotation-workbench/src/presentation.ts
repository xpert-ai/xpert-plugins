import type { translator } from './i18n.js'
import type {
  KnowledgePriceCandidate,
  Line,
  QuotaKnowledgeCandidate,
  QuotaResourcePriceState
} from './view-data.js'

export type Translate = ReturnType<typeof translator>
export type WorkbenchTab = 'quotation' | 'review' | 'approved' | 'knowledge'
export type DeleteTarget = { id: string; label: string }
export type ResourcePriceTarget = {
  lineId: string
  resourceId: string
  candidateId: string
  priceItemId: string
  label: string
  sourceWorkdayHours?: number
}
export type CalculationTarget = { lineId: string; label: string }
export type ExcelOverwriteTarget = {
  lineId?: string
  changeSummary: string
  expectedVersionNumber: number
  occupiedCellCount: number
  occupiedCells: Array<{ sheetName: string; address: string }>
  occupiedCellsTruncated: boolean
}
export type OfficeSpreadsheetHandle = {
  getSnapshot(): unknown
  getActiveSheetName?(): string | undefined
  getSelectedRange?(): string | undefined
}

export function statusLabel(status: string, t: Translate) {
  if (status === 'matched') return t('matched')
  if (status === 'confirmed') return t('confirmed')
  if (status === 'review_required') return t('review')
  if (status === 'unmatched') return t('unmatched')
  if (status === 'ignored') return t('skipped')
  if (status === 'applied') return t('applied')
  if (status === 'ready_to_apply') return t('readyToApply')
  if (status === 'uploaded') return t('uploaded')
  return status
}

export function resourcePriceStatusLabel(status: QuotaResourcePriceState['status'], t: Translate) {
  if (status === 'searched') return t('resourceSearched')
  if (status === 'recommended') return t('resourceRecommended')
  if (status === 'approved') return t('resourceApproved')
  if (status === 'rejected') return t('resourceRejected')
  if (status === 'no_match') return t('resourceNoMatch')
  return t('resourceNotSearched')
}

export function shortSheetName(name: string, t: Translate) {
  if (name.includes('分部分项')) return t('bill')
  if (name.includes('材料暂估')) return t('material')
  if (name.includes('措施项目')) return t('measure')
  return name
}

export function isPendingLine(line: Line) {
  return line.reviewState
    ? line.reviewState === 'pending'
    : isUnresolvedLine(line) && !isReviewedLine(line)
}

export function isApprovedLine(line: Line) {
  return line.reviewState
    ? ['approved', 'applied', 'skipped'].includes(line.reviewState)
    : isReviewedLine(line)
}

export function canApplyLineToExcel(line: Line) {
  return ['matched', 'confirmed'].includes(line.matchStatus) && !lineExcelApplyBlockReason(line)
}

export function lineComprehensiveUnitPrice(line: Line) {
  if (line.pricingCalculation?.comprehensiveUnitPrice) return line.pricingCalculation.comprehensiveUnitPrice
  return line.matchEvidence?.includes('确定性计价引擎') ? line.matchedUnitPrice : undefined
}

export function hasComprehensiveRateCalculation(line: Line) {
  return Boolean(lineComprehensiveUnitPrice(line))
}

export function lineExcelApplyBlockReason(line: Line) {
  const unitPrice = lineComprehensiveUnitPrice(line)
  if (!unitPrice) return null
  if (!isPositiveDecimalText(unitPrice)) return 'zero_comprehensive_unit_price'
  return null
}

export function lineExcelApplyBlockText(reason: string | null) {
  if (reason === 'zero_comprehensive_unit_price') return '综合单价仍为 0，不能写入 Excel。'
  return ''
}

export function hasKnowledgeRecommendation(line: Line) {
  return isUnresolvedLine(line)
    && (line.kind === 'material' || line.materialReferenceOnly === true)
    && Boolean(line.aiRecommendedKnowledgeCandidateId)
    && Boolean(recommendedKnowledgeCandidate(line))
    && Boolean(line.aiKnowledgeEvidence)
    && Boolean(line.aiRecommendedUnitPrice)
    && Boolean(line.aiRecommendedSourceUnit)
}

export function hasWebRecommendation(line: Line) {
  return isUnresolvedLine(line)
    && (line.kind === 'material' || line.materialReferenceOnly === true)
    && !line.aiRecommendedKnowledgeCandidateId
    && Boolean(line.aiRecommendedUnitPrice)
    && Boolean(line.aiRecommendedSourceUnit)
    && Boolean(line.aiSources?.some((source) => isHttpUrl(source.url)))
}

export function resolveLineKnowledgeEvidence(line: Line): {
  knowledgebaseId?: string
  documentId?: string
  chunkId?: string
  documentName?: string
  quote?: string
  score?: number
} | null {
  const candidate = recommendedKnowledgeCandidate(line)
  const knowledgebaseId = firstText(line.aiRecommendedKnowledgebaseId, candidate?.knowledgebaseId)
  const documentId = firstText(line.aiRecommendedDocumentId, candidate?.documentId)
  const chunkId = firstText(line.aiRecommendedChunkId, candidate?.chunkId)
  const documentName = firstText(candidate?.documentName)
  const quote = firstText(line.aiKnowledgeEvidence)
  const score = firstNumber(candidate?.relevanceScore, candidate?.score)
  return firstText(knowledgebaseId, documentId, chunkId, documentName, quote) || score != null
    ? { knowledgebaseId, documentId, chunkId, documentName, quote, score }
    : null
}

export function consumptionCandidatesForResource(
  line: Line,
  resource: NonNullable<Line['quotaPricingResources']>[number]
): QuotaKnowledgeCandidate[] {
  return (line.quotaCandidates ?? [])
    .filter((candidate) => (candidate.resources ?? []).some((item) => resourceMatches(item, resource)))
    .slice(0, 5)
}

type QuotaCandidateResource = NonNullable<QuotaKnowledgeCandidate['resources']>[number]

export function resourceMatches(
  item: QuotaCandidateResource,
  resource: NonNullable<Line['quotaPricingResources']>[number]
) {
  const itemCode = item.code.trim().toLowerCase()
  const resourceCode = resource.code.trim().toLowerCase()
  if (itemCode && resourceCode && itemCode === resourceCode) return true
  const itemName = normalizeResourceText(item.name)
  const resourceName = normalizeResourceText(resource.name)
  return itemName === resourceName || itemName.includes(resourceName) || resourceName.includes(itemName)
}

export function knowledgeResultKey(item: KnowledgePriceCandidate, index: number) {
  return firstText(item.chunkId, item.id, item.documentId) || `knowledge-result-${index}`
}

export function isHttpUrl(value?: string) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function isValidWorkdayHours(value: string) {
  const hours = Number(value)
  return /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$/.test(value.trim()) && hours > 0 && hours <= 24
}

export function formatScore(value: number) {
  return value >= 0 && value <= 1 ? `${Math.round(value * 100)}%` : value.toFixed(2)
}

export function firstText(...values: unknown[]) {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

export function firstNumber(...values: unknown[]) {
  for (const value of values) if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

export function resolveText(value: unknown, locale: unknown) {
  if (typeof value === 'string') return value
  const source = recordValue(value)
  return String(locale ?? '').toLowerCase().startsWith('en')
    ? firstText(source.en_US, source.zh_Hans) ?? ''
    : firstText(source.zh_Hans, source.en_US) ?? ''
}

function isUnresolvedLine(line: Line) {
  return line.matchStatus === 'review_required' || line.matchStatus === 'unmatched'
}

function isReviewedLine(line: Line) {
  if (line.pricingCalculation || ['matched', 'confirmed', 'applied', 'ignored'].includes(line.matchStatus)) return true
  const resources = line.quotaPricingResources ?? []
  if (line.kind !== 'bill' || resources.length === 0) return false
  const states = new Map((line.quotaResourcePrices ?? []).map((state) => [state.resourceId, state.status]))
  return resources.every((resource) => ['approved', 'rejected', 'no_match'].includes(states.get(resource.id) ?? ''))
}

function isPositiveDecimalText(value?: string | null) {
  const normalized = value?.trim() ?? ''
  return /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(normalized) && /[1-9]/.test(normalized.replace('.', ''))
}

function recommendedKnowledgeCandidate(line: Line) {
  return line.knowledgeCandidates?.find((candidate) => candidate.id === line.aiRecommendedKnowledgeCandidateId)
}

function normalizeResourceText(value: string) {
  return value.replace(/[\s（）()【】\[\]，、,.:：+＋\-]/g, '').toLowerCase()
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

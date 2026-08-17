import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { KnowledgebaseApi, KnowledgebaseDocument } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { XpertQuotation, XpertQuotationLine } from './entities/index.js'
import { toKnowledgePriceCandidates } from './xpert-quotation-knowledge.js'
import { XpertQuotationKnowledgebaseAdapter } from './xpert-quotation-knowledgebase.adapter.js'
import {
  buildResourcePriceFallbackQuery,
  buildResourcePriceDeepQuery,
  buildResourcePriceQuery,
  buildResourcePriceSectionQuery,
  calculateComprehensiveRate,
  findResourcePriceItem,
  MAX_RESOURCE_PRICE_CANDIDATES,
  normalizeSelectedResourcePrice,
  rankResourcePriceCandidates
} from './xpert-quotation-resource-pricing.js'
import { XpertQuotationHistoryService } from './xpert-quotation-history.service.js'
import type { PricingFeeRuleInput, QuotaResourcePriceState, XpertScope } from './types.js'

@Injectable()
export class XpertQuotationResourcePricingService {
  constructor(
    @InjectRepository(XpertQuotation) private readonly quotationRepository: Repository<XpertQuotation>,
    @InjectRepository(XpertQuotationLine) private readonly lineRepository: Repository<XpertQuotationLine>,
    private readonly history: XpertQuotationHistoryService,
    private readonly knowledgebaseAdapter: XpertQuotationKnowledgebaseAdapter
  ) {}

  async searchResourcePrices(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    resourceId: string,
    knowledgebaseIds: string[],
    knowledgebase: KnowledgebaseApi | null | undefined,
    topK = MAX_RESOURCE_PRICE_CANDIDATES
  ) {
    await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    const resource = requireResource(line, resourceId)
    if (!line.quotaBreakdown || !['proposed', 'approved'].includes(line.quotaBreakdown.mappingStatus)) {
      throw new BadRequestException('A current proposed or approved quota breakdown is required before resource-price search.')
    }
    const query = buildResourcePriceQuery(resource, { region: '南京市', pricePeriod: '2026-06' })
    const fallbackQuery = buildResourcePriceFallbackQuery(resource, { region: '南京市', pricePeriod: '2026-06' })
    const sectionQuery = buildResourcePriceSectionQuery(resource, { region: '南京市', pricePeriod: '2026-06' })
    const boundedTopK = Math.max(1, Math.min(MAX_RESOURCE_PRICE_CANDIDATES, Math.floor(topK)))
    const retrievalTopK = Math.max(20, boundedTopK)
    const retrieval = await this.knowledgebaseAdapter.searchConnected({
      scope,
      knowledgebase,
      knowledgebaseIds,
      query,
      topK: retrievalTopK,
      source: 'xpert-quotation-resource-price',
      requestId: `${quotationId}:${lineId}:${resourceId}:${Date.now()}`,
      role: 'price'
    })
    const primaryDocuments = retrieval.documents
    const fallback = await this.knowledgebaseAdapter.searchConnected({
      scope,
      knowledgebase,
      knowledgebaseIds,
      query: fallbackQuery,
      topK: retrievalTopK,
      source: 'xpert-quotation-resource-price-fallback',
      requestId: `${quotationId}:${lineId}:${resourceId}:${Date.now()}:fallback`,
      role: 'price'
    }).catch(() => ({ documents: [] as KnowledgebaseDocument[], knowledgebaseIds, failedKnowledgebaseIds: knowledgebaseIds }))
    const section = await this.knowledgebaseAdapter.searchConnected({
      scope,
      knowledgebase,
      knowledgebaseIds,
      query: sectionQuery,
      topK: retrievalTopK,
      source: 'xpert-quotation-resource-price-section',
      requestId: `${quotationId}:${lineId}:${resourceId}:${Date.now()}:section`,
      role: 'price'
    }).catch(() => ({ documents: [] as KnowledgebaseDocument[], knowledgebaseIds, failedKnowledgebaseIds: knowledgebaseIds }))
    let documents = mergeKnowledgeDocuments(primaryDocuments, fallback.documents, section.documents)
    const searchedAt = new Date()
    let candidates = rankResourcePriceCandidates(
      toKnowledgePriceCandidates(documents, retrieval.knowledgebaseIds, query, searchedAt),
      resource
    ).slice(0, boundedTopK)
    let hasStructuredMatch = candidates.some((candidate) => candidate.matchedPriceItemIds.length)
    let deepQuery: string | undefined
    let deepFailedKnowledgebaseIds: string[] = []
    if (!hasStructuredMatch) {
      deepQuery = buildResourcePriceDeepQuery(resource, { region: '南京市', pricePeriod: '2026-06' })
      const deep = await this.knowledgebaseAdapter.searchConnected({
        scope,
        knowledgebase,
        knowledgebaseIds,
        query: deepQuery,
        topK: 80,
        retrievalMode: 'vector',
        source: 'xpert-quotation-resource-price-deep',
        requestId: `${quotationId}:${lineId}:${resourceId}:${Date.now()}:deep`,
        role: 'price'
      }).catch(() => ({ documents: [] as KnowledgebaseDocument[], knowledgebaseIds, failedKnowledgebaseIds: knowledgebaseIds }))
      deepFailedKnowledgebaseIds = deep.failedKnowledgebaseIds
      documents = mergeKnowledgeDocuments(documents, deep.documents)
      candidates = rankResourcePriceCandidates(
        toKnowledgePriceCandidates(documents, retrieval.knowledgebaseIds, query, searchedAt),
        resource
      ).slice(0, boundedTopK)
      hasStructuredMatch = candidates.some((candidate) => candidate.matchedPriceItemIds.length)
    }
    const failedKnowledgebaseIds = [...new Set([
      ...retrieval.failedKnowledgebaseIds,
      ...fallback.failedKnowledgebaseIds,
      ...section.failedKnowledgebaseIds,
      ...deepFailedKnowledgebaseIds
    ])]
    const before = await this.history.captureQuotation(scope, quotationId, [lineId])
    const states = upsertResourceState(line.quotaResourcePrices ?? [], {
      resourceId,
      status: hasStructuredMatch ? 'searched' : 'no_match',
      query,
      candidates,
      searchedAt: searchedAt.toISOString(),
      failedKnowledgebaseIds
    })
    await this.lineRepository.save({ ...line, quotaResourcePrices: states, pricingCalculation: null })
    await this.history.recordState(scope, 'search_resource_prices', quotationId, before)
    return {
      quotationId,
      lineId,
      resource,
      query,
      candidateCount: candidates.length,
      candidates,
      failedKnowledgebaseIds,
      fallbackQuery,
      sectionQuery,
      ...(deepQuery ? { deepQuery } : {}),
      nextAction: hasStructuredMatch
        ? 'Choose one matched structured priceItemId from this exact resource search and call xpert_quotation_recommend_resource_price.'
        : 'No structured price item matches this resource name and unit. Correct the price source or record a manual review; do not calculate the bill rate.'
    }
  }

  async recommendResourcePrice(scope: XpertScope, quotationId: string, lineId: string, input: {
    resourceId: string
    candidateId: string
    priceItemId: string
    quotaWorkdayHours?: number
    confidence: number
    rationale: string
    differences: string[]
  }) {
    await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    const resource = requireResource(line, input.resourceId)
    const current = requireResourceState(line, input.resourceId)
    if (!['searched', 'recommended', 'approved', 'rejected'].includes(current.status)) {
      throw new BadRequestException('A current resource-price search with structured candidates is required before recommendation.')
    }
    const candidate = current.candidates.find((item) => item.id === input.candidateId)
    if (!candidate) throw new BadRequestException('Resource price candidate is not in the latest search for this exact resource.')
    if (!candidate.matchedPriceItemIds.includes(input.priceItemId)) {
      throw new BadRequestException('Price item is not a name-and-unit match for this exact quota resource.')
    }
    const priceItem = findResourcePriceItem(candidate, input.priceItemId)
    if (!priceItem) throw new BadRequestException('Structured price item is not present in the selected candidate.')
    requireConfidence(input.confidence)
    let normalized
    try {
      normalized = normalizeSelectedResourcePrice({ resource, priceItem, quotaWorkdayHours: input.quotaWorkdayHours })
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Resource price unit normalization failed.')
    }
    const before = await this.history.captureQuotation(scope, quotationId, [lineId])
    const recommendedAt = new Date().toISOString()
    const next: QuotaResourcePriceState = {
      ...current,
      status: 'recommended',
      recommendation: {
        candidateId: candidate.id,
        priceItemId: input.priceItemId,
        matchedName: priceItem.name,
        sourceUnit: priceItem.unit,
        sourceUnitPrice: priceItem.unitPrice,
        normalizedUnitPrice: normalized.normalizedUnitPrice,
        unitConversion: normalized.unitConversion,
        ...(priceItem.workdayHours !== undefined ? { sourceWorkdayHours: priceItem.workdayHours } : {}),
        ...(input.quotaWorkdayHours !== undefined ? { quotaWorkdayHours: input.quotaWorkdayHours } : {}),
        ...(priceItem.workdayEvidenceQuote ? { workdayEvidenceQuote: priceItem.workdayEvidenceQuote } : {}),
        ...(normalized.requiresResourceUnitReview ? { requiresResourceUnitReview: true } : {}),
        evidenceQuote: priceItem.evidenceQuote,
        confidence: input.confidence,
        rationale: requiredText(input.rationale, 'Resource-price rationale').slice(0, 600),
        differences: uniqueText(input.differences, 8, 200),
        recommendedAt
      },
      reviewedAt: undefined,
      reviewComment: undefined
    }
    await this.lineRepository.save({
      ...line,
      quotaResourcePrices: upsertResourceState(line.quotaResourcePrices ?? [], next),
      pricingCalculation: null
    })
    await this.history.recordState(scope, 'recommend_resource_price', quotationId, before)
    return {
      quotationId,
      lineId,
      resourceId: resource.id,
      persisted: true,
      recommendation: next.recommendation,
        nextAction: 'Ask the user to approve or reject this resource price with xpert_quotation_review_resource_price. Missing prices remain zero-cost warnings and do not block a later calculation.'
    }
  }

  async reviewResourcePrice(scope: XpertScope, quotationId: string, lineId: string, input: {
    resourceId: string
    decision: 'approve' | 'reject'
    comment: string
  }) {
    await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    const resource = requireResource(line, input.resourceId)
    const current = requireResourceState(line, input.resourceId)
    if (current.status !== 'recommended' || !current.recommendation) {
      throw new BadRequestException('Only a current resource-price recommendation can be approved or rejected.')
    }
    const before = await this.history.captureQuotation(scope, quotationId, [lineId])
    const next: QuotaResourcePriceState = {
      ...current,
      status: input.decision === 'approve' ? 'approved' : 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewComment: requiredText(input.comment, 'Resource-price review comment').slice(0, 600)
    }
    const resourcesById = new Map((line.quotaPricingResources ?? []).map((item) => [item.id, item]))
    const currentStates = input.decision === 'approve'
      ? (line.quotaResourcePrices ?? []).map((state) => {
          if (state.resourceId === input.resourceId || state.status !== 'approved') return state
          const previousResource = resourcesById.get(state.resourceId)
          if (previousResource?.category !== resource.category) return state
          return {
            ...state,
            status: 'recommended' as const,
            reviewedAt: undefined,
            reviewComment: undefined
          }
        })
      : line.quotaResourcePrices ?? []
    const states = upsertResourceState(currentStates, next)
    await this.lineRepository.save({ ...line, quotaResourcePrices: states, pricingCalculation: null })
    await this.history.recordState(scope, 'review_resource_price', quotationId, before)
    return {
      quotationId,
      lineId,
      resourceId: input.resourceId,
      decision: input.decision,
      status: next.status,
      approvedCount: approvedResourceCategoryCount(line.quotaPricingResources ?? [], states),
      requiredCount: requiredResourceCategoryCount(line.quotaPricingResources ?? []),
      nextAction: input.decision === 'approve'
        ? 'Choose at most one approved resource in each remaining labor, machine, or material category, then calculate the comprehensive rate.'
        : 'Search this quota resource again and persist a replacement recommendation.'
    }
  }

  async acceptResourcePrice(scope: XpertScope, quotationId: string, lineId: string, input: {
    resourceId: string
    candidateId: string
    priceItemId: string
    quotaWorkdayHours?: number
    confidence: number
    rationale: string
    differences: string[]
    comment: string
  }) {
    await this.recommendResourcePrice(scope, quotationId, lineId, input)
    const review = await this.reviewResourcePrice(scope, quotationId, lineId, {
      resourceId: input.resourceId,
      decision: 'approve',
      comment: input.comment
    })
    return {
      ...review,
      persisted: true,
      nextAction: review.approvedCount === review.requiredCount
        ? 'One resource is selected in every available labor, machine, and material category. Calculate the comprehensive rate after reviewing the choices.'
        : 'The selected price is approved. Choose at most one resource in each remaining category.'
    }
  }

  async calculateComprehensiveRate(scope: XpertScope, quotationId: string, lineId: string, input: {
    fees: PricingFeeRuleInput[]
    unitPriceScale?: number
  }) {
    const quotation = await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    if (!line.quantity || !line.unit) throw new BadRequestException('Bill quantity and unit are required before calculation.')
    const resources = line.quotaPricingResources ?? []
    const resourcePrices = line.quotaResourcePrices ?? []
    if (!line.quotaBreakdown) throw new BadRequestException('A quota breakdown is required before calculation.')
    let calculation
    try {
      calculation = calculateComprehensiveRate({
        proposal: line.quotaBreakdown,
        resources,
        resourcePrices,
        quantity: line.quantity,
        billUnit: line.unit,
        // Formula rules are intentionally not part of the review page or the
        // default calculation. Explicit fee input remains available for API
        // callers that need a separately reviewed adjustment.
        fees: input.fees,
        unitPriceScale: input.unitPriceScale
      })
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Comprehensive-rate calculation failed.')
    }
    const before = await this.history.captureQuotation(scope, quotationId, [lineId])
    await this.lineRepository.update({ ...scopeWhere(scope), id: lineId, quotationId }, {
      pricingCalculation: calculation,
      matchedPriceItemId: null,
      matchedUnitPrice: calculation.comprehensiveUnitPrice,
      calculatedAmount: calculation.totalAmount,
      matchStatus: 'confirmed',
      matchEvidence: `确定性计价引擎 ${calculation.engineVersion} 已按批准的消耗量、人材机价格和费用规则计算综合单价。`
    })
    const refreshed = await this.refreshCounts(quotation)
    await this.history.recordState(scope, 'calculate_comprehensive_rate', quotationId, before)
    const excelApplyBlockReason = calculationExcelBlockReason(calculation)
    const hasUnpricedResources = Boolean(calculation.unpricedResourceIds?.length)
    return {
      quotationId,
      lineId,
      persisted: true,
      calculation,
      matchedUnitPrice: calculation.comprehensiveUnitPrice,
      calculatedAmount: calculation.totalAmount,
      excelReady: !excelApplyBlockReason,
      excelApplyBlockReason,
      quotationStatus: refreshed.status,
      nextAction: excelApplyBlockReason
        ? 'The calculation is visible for review, but Excel apply is blocked until the comprehensive unit price is positive.'
        : hasUnpricedResources
          ? 'The non-zero partial calculation is ready for explicit Excel apply. Unpriced resources remain zero-cost warnings and should be reviewed later.'
          : 'The confirmed comprehensive unit price is ready for explicit Excel apply. Review the calculation trace before writing.'
    }
  }

  private async refreshCounts(quotation: XpertQuotation) {
    const quotationId = requiredId(quotation.id, 'Quotation id')
    const lines = await this.lineRepository.find({ where: { ...scopeWhere(quotation), quotationId } })
    const matchedCount = lines.filter((line) => ['matched', 'confirmed', 'applied'].includes(line.matchStatus)).length
    const reviewCount = lines.filter((line) => line.matchStatus === 'review_required').length
    const unmatchedCount = lines.filter((line) => line.matchStatus === 'unmatched').length
    return this.quotationRepository.save({
      ...quotation,
      matchedCount,
      reviewCount,
      unmatchedCount,
      status: reviewCount || unmatchedCount ? 'review_required' : 'ready_to_apply'
    })
  }

  private async requireQuotation(scope: XpertScope, id: string) {
    const quotation = await this.quotationRepository.findOne({ where: { ...scopeWhere(scope), id } })
    if (!quotation) throw new NotFoundException('Quotation was not found.')
    return quotation
  }

  private async requireLine(scope: XpertScope, quotationId: string, lineId: string) {
    const line = await this.lineRepository.findOne({ where: { ...scopeWhere(scope), quotationId, id: lineId } })
    if (!line) throw new NotFoundException('Quotation line was not found.')
    return line
  }
}

function approvedResourceCategoryCount(
  resources: NonNullable<XpertQuotationLine['quotaPricingResources']>,
  states: QuotaResourcePriceState[]
) {
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]))
  return new Set(states
    .filter((state) => state.status === 'approved' && state.recommendation)
    .flatMap((state) => {
      const category = resourcesById.get(state.resourceId)?.category
      return category ? [category] : []
    }))
    .size
}

function requiredResourceCategoryCount(resources: NonNullable<XpertQuotationLine['quotaPricingResources']>) {
  return new Set(resources.map((resource) => resource.category).filter((category) => ['人工', '机械', '材料'].includes(category))).size
}

function mergeFeeRules(persisted: PricingFeeRuleInput[], explicit: PricingFeeRuleInput[]) {
  const merged = new Map<string, PricingFeeRuleInput>()
  for (const rule of [...persisted, ...explicit]) merged.set(rule.code, rule)
  return [...merged.values()]
}

function mergeKnowledgeDocuments(...groups: KnowledgebaseDocument[][]) {
  const seen = new Set<string>()
  return groups.flat().filter((document) => {
    const metadata = document.metadata && typeof document.metadata === 'object' ? document.metadata as Record<string, unknown> : {}
    const key = `${String(metadata.knowledgebaseId ?? '')}:${String(metadata.documentId ?? '')}:${String(metadata.chunkId ?? document.id ?? '')}:${document.pageContent}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function requireResource(line: XpertQuotationLine, resourceId: string) {
  const resource = (line.quotaPricingResources ?? []).find((item) => item.id === resourceId)
  if (!resource) throw new BadRequestException('Quota resource is not in the current persisted breakdown snapshot.')
  return resource
}

function requireResourceState(line: XpertQuotationLine, resourceId: string) {
  const state = (line.quotaResourcePrices ?? []).find((item) => item.resourceId === resourceId)
  if (!state) throw new BadRequestException('Quota resource-price state is unavailable. Persist a new quota breakdown first.')
  return state
}

function calculationExcelBlockReason(calculation: { comprehensiveUnitPrice: string; unpricedResourceIds?: string[] }) {
  if (!isPositiveDecimalText(calculation.comprehensiveUnitPrice)) return 'zero_comprehensive_unit_price'
  return null
}

function isPositiveDecimalText(value?: string | null) {
  const normalized = value?.trim() ?? ''
  return /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(normalized) && /[1-9]/.test(normalized.replace('.', ''))
}

function upsertResourceState(states: QuotaResourcePriceState[], next: QuotaResourcePriceState) {
  const current = states.findIndex((state) => state.resourceId === next.resourceId)
  if (current === -1) return [...states, next]
  return states.map((state, index) => index === current ? next : state)
}

function scopeWhere(scope: Pick<XpertScope, 'tenantId' | 'organizationId'>) {
  return {
    tenantId: normalizeOptional(scope.tenantId) ?? '',
    organizationId: normalizeOptional(scope.organizationId) ?? null
  }
}

function requireConfidence(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new BadRequestException('Confidence must be between 0 and 1.')
}

function uniqueText(values: string[], maximum: number, maximumLength: number) {
  return [...new Set(values.map((value) => requiredText(value, 'Difference').slice(0, maximumLength)))].slice(0, maximum)
}

function requiredText(value: string, label: string) {
  const normalized = value?.trim()
  if (!normalized) throw new BadRequestException(`${label} is required.`)
  return normalized
}

function normalizeOptional(value?: string | null) {
  const normalized = value?.trim()
  return normalized || null
}

function requiredId(value: string | null | undefined, label: string) {
  if (!value) throw new BadRequestException(`${label} is required.`)
  return value
}

import { createHash } from 'node:crypto'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertQuotation, XpertQuotationLine } from './entities/index.js'
import { XpertQuotationHistoryService } from './xpert-quotation-history.service.js'
import { extractQuotaWorkScopes, isDirectMaterialLine } from './xpert-quotation-quota.js'
import {
  extractQuotaPricingResources,
  initializeQuotaResourcePrices,
  normalizeSelectedResourcePrice
} from './xpert-quotation-resource-pricing.js'
import type {
  AiWebResourcePriceRecommendationInput,
  QuotaKnowledgeCandidate,
  QuotaResourcePriceState,
  ResourceCategory,
  ResourcePriceCandidate,
  ResourcePriceItem,
  WebQuotaBreakdownProposalInput,
  XpertScope
} from './types.js'
import {
  buildWebQuotaBreakdownProposal,
  normalizeWebPriceSources
} from './xpert-quotation-web-fallback.js'

@Injectable()
export class XpertQuotationWebFallbackService {
  constructor(
    @InjectRepository(XpertQuotation) private readonly quotationRepository: Repository<XpertQuotation>,
    @InjectRepository(XpertQuotationLine) private readonly lineRepository: Repository<XpertQuotationLine>,
    private readonly history: XpertQuotationHistoryService
  ) {}

  async recommendWebQuotaBreakdown(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    input: WebQuotaBreakdownProposalInput
  ) {
    await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    if (line.kind !== 'bill' || !['unmatched', 'review_required'].includes(line.matchStatus)) {
      throw new BadRequestException('Web quota breakdowns are allowed only for unresolved bill rows.')
    }
    if (isDirectMaterialLine(line)) {
      throw new BadRequestException('Direct material rows must use resource-price search or web resource-price fallback, not a construction quota breakdown.')
    }
    const workScopes = line.quotaWorkScopes?.length
      ? line.quotaWorkScopes
      : extractQuotaWorkScopes(line.name, line.specification)
    let proposal
    try {
      proposal = buildWebQuotaBreakdownProposal(line.discipline, workScopes, input)
    } catch (error) {
      throw new BadRequestException(`Web quota breakdown for line ${lineId}: ${error instanceof Error ? error.message : 'Invalid web quota breakdown.'}`)
    }
    const quotaPricingResources = extractQuotaPricingResources(proposal)
    const quotaResourcePrices = initializeQuotaResourcePrices(quotaPricingResources)
    const searchedAt = new Date()
    const quotaCandidates = webQuotaCandidates(proposal, searchedAt)
    const before = await this.history.captureQuotation(scope, quotationId, [lineId])
    await this.lineRepository.save({
      ...line,
      materialReferenceOnly: false,
      quotaWorkScopes: workScopes,
      quotaCandidates,
      quotaSearchedAt: searchedAt,
      quotaBreakdown: proposal,
      quotaPricingResources,
      quotaResourcePrices,
      pricingCalculation: null
    })
    await this.history.recordState(scope, 'recommend_web_quota_breakdown', quotationId, before)
    return {
      quotationId,
      lineId,
      persisted: true,
      evidenceKind: 'web' as const,
      proposal,
      resourcePricing: { resourceCount: quotaPricingResources.length, resources: quotaPricingResources },
      nextAction: 'Ask the user to review the web-supported breakdown. Then search each returned labor, material, and machine resource price; use web fallback again when no price knowledgebase is available.'
    }
  }

  async recommendWebResourcePrice(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    input: AiWebResourcePriceRecommendationInput
  ) {
    await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    if (!line.quotaBreakdown || !['proposed', 'approved'].includes(line.quotaBreakdown.mappingStatus)) {
      throw new BadRequestException('A current proposed or approved quota breakdown is required before web resource pricing.')
    }
    const resource = (line.quotaPricingResources ?? []).find((item) => item.id === input.resourceId)
    if (!resource) throw new BadRequestException('Quota resource is not in the current persisted breakdown snapshot.')
    const unitPrice = normalizeUnitPrice(input.unitPrice)
    const sourceUnit = requiredText(input.sourceUnit, 'Web resource-price source unit', 40)
    const sources = (() => {
      try {
        return normalizeWebPriceSources(input.sources, unitPrice, sourceUnit)
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Invalid web price evidence.')
      }
    })()
    requireConfidence(input.confidence)
    if (input.sourceWorkdayHours !== undefined && !sources.some((source) => source.quote.includes(String(input.sourceWorkdayHours)))) {
      throw new BadRequestException('Web source evidence must contain the stated source workday-hour basis.')
    }
    const priceItemId = webId('price_item', [resource.id, unitPrice, sourceUnit, sources])
    const candidateId = webId('web_price', [resource.id, unitPrice, sourceUnit, sources])
    const evidenceQuote = sources[0].quote
    const priceItem: ResourcePriceItem = {
      id: priceItemId,
      resourceCategory: resourceCategory(resource.category),
      code: resource.code,
      name: resource.name,
      aliases: resource.aliases,
      unit: sourceUnit,
      unitPrice,
      ...(input.sourceWorkdayHours !== undefined ? { workdayHours: input.sourceWorkdayHours, workdayEvidenceQuote: evidenceQuote } : {}),
      evidenceQuote
    }
    let normalized
    try {
      normalized = normalizeSelectedResourcePrice({ resource, priceItem, quotaWorkdayHours: input.quotaWorkdayHours })
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Web resource-price unit normalization failed.')
    }
    const searchedAt = new Date().toISOString()
    const candidate: ResourcePriceCandidate = {
      id: candidateId,
      knowledgebaseId: 'web',
      documentId: sources[0].url,
      documentName: sources[0].title,
      pageContent: sources.map((source) => `${source.title}\n${source.quote}\n${source.url}`).join('\n\n'),
      sourcePages: [],
      priceItems: [priceItem],
      query: `${resource.name} ${resource.aliases.join(' ')} ${resource.unit} 价格`,
      retrievedAt: searchedAt,
      resourceMatchScore: 100,
      matchedPriceItemIds: [priceItemId]
    }
    const recommendedAt = new Date().toISOString()
    const nextState: QuotaResourcePriceState = {
      resourceId: resource.id,
      status: 'recommended',
      query: candidate.query,
      candidates: [candidate],
      searchedAt,
      failedKnowledgebaseIds: [],
      recommendation: {
        candidateId,
        priceItemId,
        matchedName: resource.name,
        sourceUnit,
        sourceUnitPrice: unitPrice,
        normalizedUnitPrice: normalized.normalizedUnitPrice,
        unitConversion: normalized.unitConversion,
        ...(input.sourceWorkdayHours !== undefined ? { sourceWorkdayHours: input.sourceWorkdayHours, workdayEvidenceQuote: evidenceQuote } : {}),
        ...(input.quotaWorkdayHours !== undefined ? { quotaWorkdayHours: input.quotaWorkdayHours } : {}),
        ...(normalized.requiresResourceUnitReview ? { requiresResourceUnitReview: true } : {}),
        evidenceQuote,
        confidence: input.confidence,
        rationale: requiredText(input.rationale, 'Web resource-price rationale', 600),
        differences: uniqueStrings(input.differences.map((difference) => requiredText(difference, 'Web resource-price difference', 200))).slice(0, 8),
        recommendedAt,
        sourceKind: 'web',
        sources
      }
    }
    const before = await this.history.captureQuotation(scope, quotationId, [lineId])
    const states = upsertResourceState(line.quotaResourcePrices ?? [], nextState)
    await this.lineRepository.save({ ...line, quotaResourcePrices: states, pricingCalculation: null })
    await this.history.recordState(scope, 'recommend_web_resource_price', quotationId, before)
    return {
      quotationId,
      lineId,
      resourceId: resource.id,
      persisted: true,
      evidenceKind: 'web' as const,
      candidate,
      recommendation: nextState.recommendation,
      nextAction: 'The web price is a recommendation only. Ask the user to approve or reject it before comprehensive-rate calculation.'
    }
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

function webQuotaCandidates(proposal: ReturnType<typeof buildWebQuotaBreakdownProposal>, searchedAt: Date): QuotaKnowledgeCandidate[] {
  return proposal.components.map((component) => ({
    id: component.candidateId,
    knowledgebaseId: 'web',
    documentId: component.externalSources?.[0]?.url,
    documentName: component.externalSources?.[0]?.title,
    pageContent: (component.externalSources ?? []).map((source) => `${source.title}\n${source.quote}\n${source.url}`).join('\n\n'),
    quotaCode: component.quotaCode,
    quotaName: component.quotaName,
    quotaUnit: component.quotaUnit,
    extractionStatus: component.resources.some((resource) => resource.consumptionPending) ? 'partial' : 'structured',
    extractedQuotaCodes: component.quotaCode ? [component.quotaCode] : [],
    reviewStatus: 'web_evidence_unreviewed',
    ingestionReady: false,
    workContents: component.coveredWorkScopes,
    resources: component.resources,
    adjustments: component.differences,
    sourcePages: [],
    query: component.rationale,
    retrievedAt: searchedAt.toISOString(),
    sourceKind: 'web',
    externalSources: component.externalSources ?? []
  }))
}

function upsertResourceState(states: QuotaResourcePriceState[], next: QuotaResourcePriceState) {
  return states.some((state) => state.resourceId === next.resourceId)
    ? states.map((state) => state.resourceId === next.resourceId ? next : state)
    : [...states, next]
}

function resourceCategory(category: string): ResourceCategory {
  if (category === '人工') return 'labor'
  if (category === '材料') return 'material'
  if (category === '机械') return 'machine'
  return 'unclassified'
}

function webId(prefix: string, values: unknown[]) {
  return `${prefix}_${createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 32)}`
}

function normalizeUnitPrice(value: string) {
  const normalized = value.trim()
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(normalized)) {
    throw new BadRequestException('Unit price must be a non-negative decimal with at most 6 decimal places.')
  }
  return normalized
}

function requireConfidence(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new BadRequestException('Confidence must be between 0 and 1.')
}

function requiredText(value: string, label: string, maximum: number) {
  const normalized = value.replace(/\u0000/g, '').trim()
  if (!normalized) throw new BadRequestException(`${label} is required.`)
  return normalized.slice(0, maximum)
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)]
}

function scopeWhere(scope: Pick<XpertScope, 'tenantId' | 'organizationId'>) {
  return {
    tenantId: scope.tenantId?.trim() ?? '',
    organizationId: scope.organizationId?.trim() ?? null
  }
}

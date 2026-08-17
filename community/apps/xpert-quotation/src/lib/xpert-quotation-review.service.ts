import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertQuotation, XpertQuotationLine } from './entities/index.js'
import { evidenceAppearsInCandidate, evidenceSupportsUnitPrice, isMaterialPricingLine, priceEvidenceSupports } from './xpert-quotation-knowledge.js'
import { buildUnitConversion, convertUnitPrice } from './xpert-quotation-resource-pricing.js'
import { XpertQuotationHistoryService } from './xpert-quotation-history.service.js'
import { multiplyAmount } from './pricing.js'
import type {
  AiKnowledgePriceRecommendationInput,
  AiRecommendationKind,
  AiWebPriceRecommendationInput,
  ExternalPriceSource,
  XpertScope,
  KnowledgePriceCandidate
} from './types.js'

function isKnowledgeSearchableLine(line: XpertQuotationLine) {
  return isMaterialPricingLine(line)
}

@Injectable()
export class XpertQuotationReviewService {
  constructor(
    @InjectRepository(XpertQuotation) private readonly quotationRepository: Repository<XpertQuotation>,
    @InjectRepository(XpertQuotationLine) private readonly lineRepository: Repository<XpertQuotationLine>,
    private readonly history: XpertQuotationHistoryService
  ) {}

  async recommendKnowledgePrice(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    recommendation: AiKnowledgePriceRecommendationInput
  ) {
    const [quotation, line, before] = await Promise.all([
      this.requireQuotation(scope, quotationId),
      this.requireLine(scope, quotationId, lineId),
      this.history.captureQuotation(scope, quotationId, [lineId])
    ])
    if (!isKnowledgeSearchableLine(line) || (line.matchStatus !== 'unmatched' && line.matchStatus !== 'review_required')) {
      throw new BadRequestException('Knowledgebase recommendations are allowed only for unresolved kind=material rows.')
    }
    const candidate = requireKnowledgeCandidate(line, recommendation.candidateId)
    const sourceUnitPrice = normalizeUnitPrice(recommendation.unitPrice)
    const sourceUnit = normalizeRequired(recommendation.sourceUnit, 'Knowledge recommendation source unit is required.').slice(0, 40)
    const unitConversion = requireMatchingUnit(line.unit, sourceUnit, 'Knowledge recommendation')
    const unitPrice = line.unit ? convertUnitPrice(sourceUnitPrice, sourceUnit, line.unit).unitPrice : sourceUnitPrice
    const evidenceQuote = normalizeRequired(recommendation.evidenceQuote, 'Knowledge recommendation evidence quote is required.').slice(0, 500)
    if (!evidenceAppearsInCandidate(candidate, evidenceQuote)) {
      throw new BadRequestException('Knowledge evidence quote is not present in the selected current chunk.')
    }
    if (!evidenceSupportsUnitPrice(candidate, evidenceQuote, sourceUnitPrice, sourceUnit)) {
      throw new BadRequestException('Knowledge evidence quote does not contain the recommended unit price and source unit.')
    }
    requireConfidence(recommendation.confidence)
    const rationale = normalizeRequired(recommendation.rationale, 'Knowledge recommendation rationale is required.').slice(0, 600)
    const differences = normalizeDifferences(recommendation.differences)
    const matchedMaterialName = normalizeRequired(recommendation.matchedMaterialName, 'Matched material name is required.').slice(0, 240)
    const matchedSpecification = normalizeOptional(recommendation.matchedSpecification)?.slice(0, 600) ?? null
    const recommendedAt = new Date()
    const savedLine = await this.lineRepository.save({
      ...line,
      matchStatus: 'unmatched',
      aiRecommendedPriceItemId: null,
      aiRecommendedKnowledgeCandidateId: candidate.id,
      aiRecommendedKnowledgebaseId: candidate.knowledgebaseId,
      aiRecommendedDocumentId: candidate.documentId ?? null,
      aiRecommendedChunkId: candidate.chunkId ?? null,
      aiMatchedMaterialName: matchedMaterialName,
      aiMatchedSpecification: matchedSpecification,
      aiKnowledgeEvidence: evidenceQuote,
      aiRecommendedUnitPrice: unitPrice,
      aiRecommendedSourceUnitPrice: sourceUnitPrice,
      aiRecommendedSourceUnit: sourceUnit,
      aiUnitConversion: unitConversion.factor === '1' ? null : unitConversion,
      aiConfidence: recommendation.confidence,
      aiRationale: rationale,
      aiDifferences: differences,
      aiSources: null,
      aiRecommendedAt: recommendedAt,
      knowledgeNoMatchReason: null,
      knowledgeNoMatchAt: null,
      matchEvidence: `AI 已从知识库片段 ${candidate.chunkId ?? candidate.id} 推荐材料价格，等待人工审核。`
    })
    await this.history.recordState(scope, 'ai_recommend_knowledge_price', quotationId, before)
    return {
      quotationId: requireId(quotation.id, 'Quotation id'),
      lineId,
      persisted: true,
      reviewField: {
        aiRecommendedUnitPrice: savedLine.aiRecommendedUnitPrice,
        aiRecommendedSourceUnit: savedLine.aiRecommendedSourceUnit,
        aiRecommendedKnowledgeCandidateId: savedLine.aiRecommendedKnowledgeCandidateId,
        aiKnowledgeEvidence: savedLine.aiKnowledgeEvidence
      },
      recommendation: {
        kind: 'knowledge' as const,
        candidateId: candidate.id,
        knowledgebaseId: candidate.knowledgebaseId,
        documentId: candidate.documentId ?? null,
        chunkId: candidate.chunkId ?? null,
        unitPrice,
        sourceUnitPrice,
        sourceUnit,
        unitConversion,
        matchedMaterialName,
        matchedSpecification,
        evidenceQuote,
        confidence: recommendation.confidence,
        rationale,
        differences,
        recommendedAt
      }
    }
  }

  async markKnowledgeNoMatch(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    reviewedCandidateIds: string[],
    rationale: string
  ) {
    const [quotation, line, before] = await Promise.all([
      this.requireQuotation(scope, quotationId),
      this.requireLine(scope, quotationId, lineId),
      this.history.captureQuotation(scope, quotationId, [lineId])
    ])
    if (!isKnowledgeSearchableLine(line) || line.matchStatus !== 'unmatched' || !line.knowledgeSearchedAt) {
      throw new BadRequestException('A current knowledgebase search for this unresolved material reference is required.')
    }
    const currentIds = (line.knowledgeCandidates ?? []).map((candidate) => candidate.id).sort()
    const reviewedIds = [...new Set(reviewedCandidateIds)].sort()
    if (!sameStrings(currentIds, reviewedIds)) {
      throw new BadRequestException('reviewedCandidateIds must include every current knowledge candidate exactly once.')
    }
    const reason = normalizeRequired(rationale, 'Knowledge no-match rationale is required.').slice(0, 600)
    const noMatchAt = new Date()
    const savedLine = await this.lineRepository.save({
      ...line,
      knowledgeNoMatchReason: reason,
      knowledgeNoMatchAt: noMatchAt,
      aiRecommendedKnowledgeCandidateId: null,
      aiRecommendedKnowledgebaseId: null,
      aiRecommendedDocumentId: null,
      aiRecommendedChunkId: null,
      aiMatchedMaterialName: null,
      aiMatchedSpecification: null,
      aiKnowledgeEvidence: null,
      aiRecommendedUnitPrice: null,
      aiRecommendedSourceUnitPrice: null,
      aiRecommendedSourceUnit: null,
      aiUnitConversion: null,
      aiConfidence: null,
      aiRationale: null,
      aiDifferences: null,
      aiRecommendedAt: null,
      matchEvidence: 'AI 已逐项审核当前知识库候选，未发现规格和单位均可成立的材料价格，可进入联网询价。'
    })
    await this.history.recordState(scope, 'mark_knowledge_no_match', quotationId, before)
    return {
      quotationId: requireId(quotation.id, 'Quotation id'),
      lineId,
      knowledgeNoMatchRecorded: true,
      reviewedCandidateCount: reviewedIds.length,
      rationale: savedLine.knowledgeNoMatchReason,
      nextAction: 'Use web search for this material, then persist the sourced price with xpert_quotation_recommend_web_price.'
    }
  }

  async recommendWebPrice(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    recommendation: AiWebPriceRecommendationInput
  ) {
    const [quotation, line, before] = await Promise.all([
      this.requireQuotation(scope, quotationId),
      this.requireLine(scope, quotationId, lineId),
      this.history.captureQuotation(scope, quotationId, [lineId])
    ])
    if (!isKnowledgeSearchableLine(line)) throw new BadRequestException('Web price recommendations are allowed only for kind=material rows.')
    if (line.matchStatus !== 'unmatched' || !line.knowledgeSearchedAt || !line.knowledgeNoMatchAt) {
      throw new BadRequestException('Web fallback requires a completed knowledgebase search and a persisted no-match decision.')
    }
    const sourceUnitPrice = normalizeUnitPrice(recommendation.unitPrice)
    const sourceUnit = normalizeRequired(recommendation.sourceUnit, 'Web recommendation source unit is required.').slice(0, 40)
    const unitConversion = requireMatchingUnit(line.unit, sourceUnit, 'Web recommendation')
    const unitPrice = line.unit ? convertUnitPrice(sourceUnitPrice, sourceUnit, line.unit).unitPrice : sourceUnitPrice
    if (recommendation.currency !== 'CNY') throw new BadRequestException('Web recommendation currency must be CNY.')
    requireConfidence(recommendation.confidence)
    const rationale = normalizeRequired(recommendation.rationale, 'Web recommendation rationale is required.').slice(0, 600)
    const sources = normalizeSources(recommendation.sources, sourceUnitPrice, sourceUnit)
    const recommendedAt = new Date()
    const savedLine = await this.lineRepository.save({
      ...line,
      aiRecommendedKnowledgeCandidateId: null,
      aiRecommendedKnowledgebaseId: null,
      aiRecommendedDocumentId: null,
      aiRecommendedChunkId: null,
      aiMatchedMaterialName: null,
      aiMatchedSpecification: null,
      aiKnowledgeEvidence: null,
      aiRecommendedPriceItemId: null,
      aiRecommendedUnitPrice: unitPrice,
      aiRecommendedSourceUnitPrice: sourceUnitPrice,
      aiRecommendedSourceUnit: sourceUnit,
      aiUnitConversion: unitConversion.factor === '1' ? null : unitConversion,
      aiConfidence: recommendation.confidence,
      aiRationale: rationale,
      aiDifferences: [],
      aiSources: sources,
      aiRecommendedAt: recommendedAt,
      matchEvidence: '知识库无可靠匹配；AI 已保存带来源的联网材料价格，等待人工审核。'
    })
    await this.history.recordState(scope, 'ai_recommend_web_price', quotationId, before)
    return {
      quotationId: requireId(quotation.id, 'Quotation id'),
      lineId,
      persisted: true,
      reviewField: {
        aiRecommendedUnitPrice: savedLine.aiRecommendedUnitPrice,
        aiRecommendedSourceUnit: savedLine.aiRecommendedSourceUnit,
        sourceCount: savedLine.aiSources?.length ?? 0
      },
      recommendation: {
        kind: 'web' as const,
        unitPrice,
        sourceUnitPrice,
        sourceUnit,
        unitConversion,
        currency: 'CNY' as const,
        confidence: recommendation.confidence,
        rationale,
        sources,
        recommendedAt
      }
    }
  }

  async acceptAiRecommendation(scope: XpertScope, quotationId: string, lineId: string) {
    const quotation = await this.requireQuotation(scope, quotationId)
    const [line, before] = await Promise.all([
      this.requireLine(scope, quotationId, lineId),
      this.history.captureQuotation(scope, quotationId, [lineId])
    ])
    const recommendationKind: AiRecommendationKind = line.aiRecommendedKnowledgeCandidateId ? 'knowledge' : 'web'
    const savedLine = await this.lineRepository.save(this.buildConfirmedAiLine(line, recommendationKind))
    const updated = await this.refreshCounts(quotation)
    await this.history.recordState(scope, 'accept_ai_recommendation', quotationId, before)
    return { quotation: updated, line: savedLine }
  }

  async acceptAiRecommendations(scope: XpertScope, quotationId: string, recommendationKind: AiRecommendationKind) {
    const quotation = await this.requireQuotation(scope, quotationId)
    const lines = await this.lineRepository.find({
      where: { ...scopeWhere(scope), quotationId },
      order: { sheetName: 'ASC', rowNumber: 'ASC' }
    })
    const applicableLines = lines.filter((line) => recommendationKind === 'knowledge'
      ? line.matchStatus === 'unmatched' && isKnowledgeSearchableLine(line) && Boolean(line.aiRecommendedKnowledgeCandidateId) && line.aiRecommendedUnitPrice != null
      : line.matchStatus === 'unmatched' && isKnowledgeSearchableLine(line) && line.aiRecommendedUnitPrice != null && Boolean(line.aiSources?.length))
    if (!applicableLines.length) {
      throw new BadRequestException(`There are no applicable ${recommendationKind === 'knowledge' ? 'knowledgebase' : 'web-price'} AI recommendations.`)
    }
    if (applicableLines.length > 1000) throw new BadRequestException('At most 1000 AI recommendations can be accepted in one operation.')
    const confirmedLines = applicableLines.map((line) => this.buildConfirmedAiLine(line, recommendationKind))
    const lineIds = applicableLines.map((line) => requireId(line.id, 'Quotation line id'))
    const before = await this.history.captureQuotation(scope, quotationId, lineIds)
    await this.lineRepository.save(confirmedLines)
    const updated = await this.refreshCounts(quotation)
    await this.history.recordState(scope, 'accept_ai_recommendations', quotationId, before)
    return { quotation: updated, acceptedCount: confirmedLines.length, recommendationKind }
  }

  async setManualPrice(scope: XpertScope, quotationId: string, lineId: string, unitPrice: string) {
    const [quotation, line, before] = await Promise.all([
      this.requireQuotation(scope, quotationId),
      this.requireLine(scope, quotationId, lineId),
      this.history.captureQuotation(scope, quotationId, [lineId])
    ])
    const normalizedPrice = normalizeUnitPrice(unitPrice)
    const savedLine = await this.lineRepository.save(this.buildConfirmedPrice(line, normalizedPrice, '人工录入单价（未引用知识库或联网来源）'))
    const updated = await this.refreshCounts(quotation)
    await this.history.recordState(scope, 'set_manual_price', quotationId, before)
    return { quotation: updated, line: savedLine }
  }

  async skipLine(scope: XpertScope, quotationId: string, lineId: string) {
    const [quotation, line, before] = await Promise.all([
      this.requireQuotation(scope, quotationId),
      this.requireLine(scope, quotationId, lineId),
      this.history.captureQuotation(scope, quotationId, [lineId])
    ])
    if (line.matchStatus === 'applied') throw new BadRequestException('An applied quotation line cannot be skipped.')
    const savedLine = await this.lineRepository.save({
      ...line,
      matchStatus: 'ignored',
      matchedPriceItemId: null,
      matchedUnitPrice: null,
      calculatedAmount: null,
      matchEvidence: `人工跳过；原匹配依据：${line.matchEvidence ?? '无'}`
    })
    const updated = await this.refreshCounts(quotation)
    await this.history.recordState(scope, 'skip_line', quotationId, before)
    return { quotation: updated, line: savedLine }
  }

  async reopenLine(scope: XpertScope, quotationId: string, lineId: string) {
    const [quotation, line, before] = await Promise.all([
      this.requireQuotation(scope, quotationId),
      this.requireLine(scope, quotationId, lineId),
      this.history.captureQuotation(scope, quotationId, [lineId])
    ])
    if (line.matchStatus !== 'ignored') throw new BadRequestException('Only a skipped quotation line can be reopened.')
    const savedLine = await this.lineRepository.save({
      ...line,
      matchStatus: 'unmatched',
      matchEvidence: line.kind === 'material'
        ? line.knowledgeSearchedAt
          ? '已重新打开：可复用当前知识库检索证据或重新检索。'
          : '已重新打开：等待检索当前 Agent 连接的材料价格知识库。'
        : line.kind === 'bill'
          ? '已重新打开：等待消耗量拆分、公式/调整说明和人材机资源价格检索。'
          : '已重新打开：措施单价需要人工填写或跳过。'
    })
    const updated = await this.refreshCounts(quotation)
    await this.history.recordState(scope, 'reopen_line', quotationId, before)
    return { quotation: updated, line: savedLine }
  }

  private buildConfirmedAiLine(line: XpertQuotationLine, recommendationKind: AiRecommendationKind) {
    if (recommendationKind === 'knowledge') {
      if (line.matchStatus !== 'unmatched' || !isMaterialPricingLine(line) || !line.aiRecommendedKnowledgeCandidateId || !line.aiRecommendedUnitPrice || !line.aiKnowledgeEvidence) {
        throw new BadRequestException('This line has no applicable AI knowledgebase recommendation.')
      }
      const candidate = requireKnowledgeCandidate(line, line.aiRecommendedKnowledgeCandidateId)
      if (!evidenceAppearsInCandidate(candidate, line.aiKnowledgeEvidence) || !evidenceSupportsUnitPrice(candidate, line.aiKnowledgeEvidence, line.aiRecommendedSourceUnitPrice ?? line.aiRecommendedUnitPrice, line.aiRecommendedSourceUnit ?? '')) {
        throw new BadRequestException('The AI knowledgebase recommendation is no longer supported by its current evidence snapshot.')
      }
      requireMatchingUnit(line.unit, line.aiRecommendedSourceUnit, 'Knowledge recommendation')
      const source = [candidate.knowledgebaseId, candidate.documentId, candidate.chunkId].filter(Boolean).join('/')
      return this.buildConfirmedPrice(line, line.aiRecommendedUnitPrice, `一键应用 AI 知识库推荐；来源：${source}`)
    }
    if (line.matchStatus !== 'unmatched' || !isMaterialPricingLine(line) || line.aiRecommendedUnitPrice == null || !(line.aiSources?.length)) {
      throw new BadRequestException('This line has no applicable AI web-price recommendation.')
    }
    requireMatchingUnit(line.unit, line.aiRecommendedSourceUnit, 'Web recommendation')
    const evidence = line.aiSources.slice(0, 3).map((source) => source.url).join('；')
    return this.buildConfirmedPrice(line, line.aiRecommendedUnitPrice, `一键应用 AI 联网推荐；来源：${evidence}`)
  }

  private buildConfirmedPrice(line: XpertQuotationLine, unitPrice: string, evidence: string) {
    const calculatedAmount = line.quantity ? multiplyAmount(line.quantity, unitPrice) : unitPrice
    return {
      ...line,
      matchStatus: 'confirmed' as const,
      matchedPriceItemId: null,
      matchedUnitPrice: unitPrice,
      calculatedAmount,
      candidateIds: [],
      matchEvidence: evidence
    }
  }

  private async refreshCounts(quotation: XpertQuotation) {
    const quotationId = requireId(quotation.id, 'Quotation id')
    const lines = await this.lineRepository.find({ where: { ...scopeWhere(quotation), quotationId } })
    const matchedCount = lines.filter((line) => line.matchStatus === 'matched' || line.matchStatus === 'confirmed' || line.matchStatus === 'applied').length
    const reviewCount = lines.filter((line) => line.matchStatus === 'review_required').length
    const unmatchedCount = lines.filter((line) => line.matchStatus === 'unmatched').length
    return this.quotationRepository.save({
      ...quotation,
      matchedCount,
      reviewCount,
      unmatchedCount,
      status: reviewCount || unmatchedCount
        ? 'review_required'
        : lines.some((line) => line.matchStatus === 'matched' || line.matchStatus === 'confirmed')
          ? 'ready_to_apply'
          : lines.some((line) => line.matchStatus === 'applied')
            ? 'applied'
            : 'ready_to_apply'
    })
  }

  private async requireLine(scope: XpertScope, quotationId: string, lineId: string) {
    const line = await this.lineRepository.findOne({ where: { ...scopeWhere(scope), quotationId, id: lineId } })
    if (!line) throw new NotFoundException('Quotation line was not found.')
    return line
  }

  private async requireQuotation(scope: XpertScope, id: string) {
    const item = await this.quotationRepository.findOne({ where: { ...scopeWhere(scope), id } })
    if (!item) throw new NotFoundException('Quotation was not found.')
    return item
  }
}

function requireKnowledgeCandidate(line: XpertQuotationLine, candidateId: string): KnowledgePriceCandidate {
  const candidate = (line.knowledgeCandidates ?? []).find((item) => item.id === candidateId)
  if (!candidate) throw new BadRequestException('Selected knowledge candidate is not part of the current line search result.')
  return candidate
}

function normalizeSources(input: ExternalPriceSource[], unitPrice: string, sourceUnit: string) {
  if (!input.length) throw new BadRequestException('At least one web price source is required.')
  const urls = new Set<string>()
  return input.slice(0, 5).map((source) => {
    const title = normalizeRequired(source.title, 'Web source title is required.').slice(0, 160)
    const url = normalizeWebUrl(source.url)
    if (urls.has(url)) throw new BadRequestException('Web recommendation sources must have unique URLs.')
    urls.add(url)
    const quote = normalizeRequired(source.quote, 'Web source price evidence is required.').slice(0, 500)
    if (!priceEvidenceSupports(quote, unitPrice, sourceUnit)) {
      throw new BadRequestException('Every web source quote must explicitly contain the recommended unit price and source unit.')
    }
    return {
      title,
      url,
      quote,
      ...(source.publishedAt?.trim() ? { publishedAt: source.publishedAt.trim().slice(0, 80) } : {})
    }
  })
}

function normalizeWebUrl(value: string) {
  const normalized = normalizeRequired(value, 'Web source URL is required.')
  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new BadRequestException('Web source URL is invalid.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BadRequestException('Web source URL must use HTTP or HTTPS.')
  return url.toString()
}

function normalizeUnitPrice(value: string) {
  const normalized = value.trim()
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(normalized)) {
    throw new BadRequestException('Unit price must be a non-negative decimal with at most 6 decimal places.')
  }
  return normalized
}

function requireMatchingUnit(lineUnit: string | null | undefined, sourceUnit: string | null | undefined, label: string) {
  if (!sourceUnit) throw new BadRequestException(`${label} source unit is required.`)
  if (!lineUnit) return { sourceUnit, targetUnit: sourceUnit, factor: '1', method: 'identity' as const, formula: `${sourceUnit} 单价无需换算。` }
  try { return buildUnitConversion(sourceUnit, lineUnit) }
  catch { throw new BadRequestException(`${label} unit ${sourceUnit} does not match quotation unit ${lineUnit}; no deterministic unit conversion is available.`) }
}

function normalizeDifferences(input: string[]) {
  return input.map((difference) => normalizeRequired(difference, 'AI candidate differences cannot be empty.').slice(0, 160)).slice(0, 8)
}

function normalizeRequired(value: string, message: string) {
  const normalized = value.trim()
  if (!normalized) throw new BadRequestException(message)
  return normalized
}

function normalizeOptional(value?: string | null) {
  const normalized = value?.trim()
  return normalized || null
}

function requireConfidence(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new BadRequestException('AI recommendation confidence must be between 0 and 1.')
  }
}

function sameStrings(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function scopeWhere(scope: Pick<XpertScope, 'tenantId' | 'organizationId'>) {
  return {
    tenantId: scope.tenantId?.trim() ?? '',
    organizationId: scope.organizationId?.trim() ?? null
  }
}

function requireId(value: string | undefined, label: string) {
  if (!value) throw new BadRequestException(`${label} is required.`)
  return value
}

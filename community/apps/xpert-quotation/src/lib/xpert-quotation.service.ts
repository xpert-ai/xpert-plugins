import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { In, Repository } from 'typeorm'
import type { KnowledgebaseApi } from '@xpert-ai/plugin-sdk'
import { XpertQuotation, XpertQuotationLine } from './entities/index.js'
import { XpertQuotationHistoryService } from './xpert-quotation-history.service.js'
import { buildKnowledgePriceQuery, isMaterialPricingLine, toKnowledgePriceCandidates } from './xpert-quotation-knowledge.js'
import {
  buildQuotaBreakdownProposal,
  buildQuotaCandidateSelectionProposal,
  buildQuotaKnowledgeQuery,
  buildDirectMaterialQuotaProposal,
  buildQuotaSearchPreview,
  expandPersistedQuotaCandidates,
  hasConcreteQuotaResources,
  isDirectMaterialLine,
  repairPersistedQuotaCandidate,
  selectPersistedQuotaCandidate,
  toQuotaKnowledgeCandidates
} from './xpert-quotation-quota.js'
import { XpertQuotationReviewService } from './xpert-quotation-review.service.js'
import { XpertQuotationResourcePricingService } from './xpert-quotation-resource-pricing.service.js'
import {
  extractQuotaPricingResources,
  initializeQuotaResourcePrices,
  MAX_RESOURCE_PRICE_CANDIDATES,
  resolvedQuotaPricingFormulaRules,
  reconcileQuotaResourcePrices
} from './xpert-quotation-resource-pricing.js'
import { XpertQuotationWorkbookService } from './xpert-quotation-workbook.service.js'
import { XpertQuotaKnowledgeService } from './knowledge-ingestion/xpert-quota-knowledge.service.js'
import { XpertQuotationKnowledgebaseAdapter } from './xpert-quotation-knowledgebase.adapter.js'
import { parseXpertSheetMappings } from './xpert-workbook.mapping.js'
import { columnToIndex, inspectXpertWorkbook } from './xpert-workbook.parser.js'
import { sumAmounts } from './pricing.js'
import type {
  AiKnowledgePriceRecommendationInput,
  AiWebPriceRecommendationInput,
  QuotaKnowledgeCandidate,
  QuotaBreakdownProposalInput,
  PricingFeeBase,
  XpertSheetMapping,
  XpertScope,
  OfficeExcelCellPatch,
  OfficeReadResult,
  PricingFeeRuleInput,
  RecognizedLine,
  QuotationWorkbenchContextInput,
  WorkbookCell,
  WorkbookRecognitionInput
} from './types.js'

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const XLS_MIME_TYPE = 'application/vnd.ms-excel'
const MAX_INSPECTED_SHEETS = 60
const MAX_RETURNED_SAMPLES = 18
const MAX_MAPPING_READ_CELLS = 100_000
const MAX_OFFICE_READ_CELLS = 10_000
const MAX_SEARCH_CANDIDATES = MAX_RESOURCE_PRICE_CANDIDATES

@Injectable()
export class XpertQuotationService {
  constructor(
    @InjectRepository(XpertQuotation) private readonly quotationRepository: Repository<XpertQuotation>,
    @InjectRepository(XpertQuotationLine) private readonly lineRepository: Repository<XpertQuotationLine>,
    private readonly reviewService: XpertQuotationReviewService,
    private readonly historyService: XpertQuotationHistoryService,
    private readonly workbookService: XpertQuotationWorkbookService,
    private readonly knowledgebaseAdapter: XpertQuotationKnowledgebaseAdapter = new XpertQuotationKnowledgebaseAdapter(),
    private readonly quotaKnowledge?: XpertQuotaKnowledgeService,
    private readonly resourcePricing?: XpertQuotationResourcePricingService
  ) {}

  async importSourceXlsx(scope: XpertScope, file: { fileName: string; mimeType?: string; buffer: Buffer }) {
    const scoped = requireScope(scope)
    requireExcelWorkbook(file.fileName, file.mimeType)
    const title = file.fileName.replace(/\.xlsx?$/i, '').trim() || 'Xpert报价'
    const quotationId = randomUUID()
    let quotation = await this.quotationRepository.save(this.quotationRepository.create({
      id: quotationId,
      ...scoped,
      assistantId: normalizeOptional(scope.assistantId),
      createdById: normalizeOptional(scope.userId),
      title,
      officeDocumentId: quotationId,
      officeFileVersionId: null,
      officeVersionNumber: 0,
      status: 'uploaded',
      matchedCount: 0,
      reviewCount: 0,
      unmatchedCount: 0,
      sheetMappings: null,
      recognitionConfidence: null,
      recognitionRationale: null,
      recognizedAt: null,
      warnings: []
    }))
    let imported
    try {
      imported = await this.workbookService.importWorkbook(scope, {
        quotationId,
        title,
        fileName: file.fileName,
        mimeType: file.mimeType ?? XLSX_MIME_TYPE,
        buffer: file.buffer
      })
      const versionNumber = imported.fileVersion?.versionNumber ?? imported.document.currentFileVersionNumber
      if (!versionNumber || !imported.fileVersion?.id) throw new BadRequestException('Quotation workbook version was not created.')
      quotation = await this.quotationRepository.save({
        ...quotation,
        officeFileVersionId: imported.fileVersion.id,
        officeVersionNumber: versionNumber
      })
    } catch (error) {
      await this.quotationRepository.delete({ ...scopeWhere(scope), id: quotationId })
      throw error
    }
    await this.historyService.recordResource(scope, 'import_quotation', { quotationId: requireId(quotation.id, 'Quotation id') })
    return {
      quotation,
      officeDocument: imported.document,
      fileVersion: imported.fileVersion,
      convertedFromLegacyXls: imported.convertedFromLegacyXls === true
    }
  }

  async inspectWorkbook(scope: XpertScope, quotationId: string) {
    const quotation = await this.requireQuotation(scope, quotationId)
    const catalog = await this.readCurrentCatalog(scope, quotation)
    const sourceSheets = catalog.workbook.sheets.slice(0, MAX_INSPECTED_SHEETS)
    const samples: WorkbookSample[] = []
    for (let index = 0; index < sourceSheets.length; index += 4) {
      const batch = sourceSheets.slice(index, index + 4)
      samples.push(...await Promise.all(batch.map(async (sheet) => {
        try {
          const reads = await Promise.all(boundedSampleRanges(sheet.range).map((range) => this.workbookService.readExcel(scope, {
            documentId: quotation.officeDocumentId,
            sheetName: sheet.name,
            range
          })))
          return toWorkbookSample(sheet, reads.flatMap((read) => read.workbook.rows ?? []))
        } catch {
          return {
            name: sheet.name,
            range: sheet.range ?? null,
            hidden: Boolean(sheet.hidden),
            score: 0,
            sampleRows: [],
            observedHeaderCells: [],
            observedTotalLabels: [],
            readError: 'sample_read_failed'
          }
        }
      })))
    }
    const ranked = [...samples].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    const likely = ranked.filter((sample) => sample.score > 0)
    const selected = (likely.length ? likely : ranked).slice(0, MAX_RETURNED_SAMPLES)
    return {
      quotationId,
      officeVersionNumber: quotation.officeVersionNumber,
      sheetsExamined: sourceSheets.length,
      sheetsReturned: selected.length,
      truncated: catalog.workbook.sheets.length > MAX_INSPECTED_SHEETS || (likely.length ? likely.length : ranked.length) > MAX_RETURNED_SAMPLES,
      sheets: selected.map(({ score, ...sample }) => sample),
      mappingContract: workbookMappingContract(),
      nextAction: 'Map only relevant quotation tables from these exact sheet names and sampled cell addresses. Apply mappingContract exactly, omit uncertain totals, then call xpert_quotation_start_matching once.'
    }
  }

  async matchQuotation(
    scope: XpertScope,
    quotationId: string,
    recognition: WorkbookRecognitionInput
  ) {
    const quotation = await this.requireQuotation(scope, quotationId)
    const before = await this.historyService.captureQuotation(scope, quotationId)
    normalizeRequired(recognition.changeSummary, 'Recognition change summary is required.')
    requireConfidence(recognition.recognitionConfidence, 'Recognition confidence')
    const catalog = await this.readCurrentCatalog(scope, quotation)
    const mappings = validateWorkbookMappings(catalog.workbook.sheets, recognition.sheetMappings)
    const reads: OfficeReadResult[] = []
    for (const mapping of mappings) {
      reads.push(await this.readMappedSheet(scope, quotation, mapping))
    }
    const readMap = new Map(reads.map((read) => [read.workbook.sheetName ?? '', read]))
    const resolvedMappings = mappings.map((mapping) => deriveLabeledTotals(mapping, readMap.get(mapping.sheetName)?.workbook.rows ?? []))
    resolvedMappings.forEach(validateTotals)
    validateMappedHeaders(resolvedMappings, readMap)
    const inspection = inspectXpertWorkbook(resolvedMappings, readMap)
    const scoped = requireScope(scope)
    const quotationKey = requireId(quotation.id, 'Quotation id')
    await this.lineRepository.delete({ ...scopeWhere(scope), quotationId: quotationKey })
    const records = inspection.lines.map((line) => this.createUnmatchedLine(scoped, quotationKey, line))
    const lines = records.length ? await this.lineRepository.save(records) : []
    const matchedCount = 0
    const reviewCount = 0
    const unmatchedCount = lines.length
    const status = unmatchedCount ? 'review_required' : 'ready_to_apply'
    const saved = await this.quotationRepository.save({
      ...quotation,
      priceBookId: null,
      matchedCount,
      reviewCount,
      unmatchedCount,
      status,
      warnings: inspection.warnings,
      sheetMappings: resolvedMappings,
      recognitionConfidence: recognition.recognitionConfidence,
      recognitionRationale: normalizeRequired(recognition.recognitionRationale, 'Recognition rationale is required.').slice(0, 800),
      recognizedAt: new Date()
    })
    await this.historyService.recordState(scope, 'match_quotation', quotationId, before)
    return {
      quotationId,
      status: saved.status,
      matchedCount,
      reviewCount,
      unmatchedCount,
      recognizedSheets: inspection.recognizedSheets,
      warnings: inspection.warnings,
      nextAction: unmatchedCount ? 'Call xpert_quotation_list_issues, search quota components for every bill row, and search prices for material rows.' : 'Wait for explicit user approval before applying workbook patches.'
    }
  }

  async searchKnowledgePrices(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    knowledgebaseIds: string[],
    knowledgebase?: KnowledgebaseApi | null,
    topK = MAX_SEARCH_CANDIDATES
  ) {
    await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    if (!isMaterialPricingLine(line)) {
      throw new BadRequestException('The connected knowledgebase contains material prices only; material-price search is only allowed for kind=material rows. Bill rows must use quota decomposition and resource-price search.')
    }
    if (line.matchStatus !== 'unmatched' && line.matchStatus !== 'review_required') {
      throw new BadRequestException('Knowledgebase search is allowed only for unresolved material rows.')
    }
    const before = await this.historyService.captureQuotation(scope, quotationId, [lineId])
    const query = buildKnowledgePriceQuery(line)
    const boundedTopK = Math.max(1, Math.min(MAX_SEARCH_CANDIDATES, Math.floor(topK)))
    const retrieval = await this.knowledgebaseAdapter.searchConnected({
      scope,
      knowledgebase,
      knowledgebaseIds,
      query,
      topK: boundedTopK,
      source: 'xpert-quotation',
      requestId: randomUUID(),
      role: 'price'
    })
    const searchedAt = new Date()
    const candidates = toKnowledgePriceCandidates(
      retrieval.documents,
      retrieval.knowledgebaseIds,
      query,
      searchedAt
    ).slice(0, boundedTopK)
    const savedLine = await this.lineRepository.save({
      ...line,
      materialReferenceOnly: line.materialReferenceOnly ?? isMaterialPricingLine(line),
      matchStatus: 'unmatched',
      knowledgeCandidates: candidates,
      knowledgeSearchedAt: searchedAt,
      knowledgeNoMatchReason: candidates.length ? null : 'No material price chunk was returned by the connected knowledgebases.',
      knowledgeNoMatchAt: candidates.length ? null : searchedAt,
      aiRecommendedKnowledgeCandidateId: null,
      aiRecommendedKnowledgebaseId: null,
      aiRecommendedDocumentId: null,
      aiRecommendedChunkId: null,
      aiMatchedMaterialName: null,
      aiMatchedSpecification: null,
      aiKnowledgeEvidence: null,
      aiRecommendedPriceItemId: null,
      aiRecommendedUnitPrice: null,
      aiRecommendedSourceUnitPrice: null,
      aiRecommendedSourceUnit: null,
      aiUnitConversion: null,
      aiConfidence: null,
      aiRationale: null,
      aiDifferences: null,
      aiSources: null,
      aiRecommendedAt: null,
      matchEvidence: candidates.length
        ? `知识库返回 ${candidates.length} 个材料价格片段，等待 AI 按项目特征规格和单位推荐。`
        : '已检索当前 Agent 连接的知识库，未返回材料价格片段，可进入联网询价。'
    })
    await this.historyService.recordState(scope, 'search_knowledge_prices', quotationId, before)
    return {
      quotationId,
      line: {
        id: lineId,
        kind: savedLine.kind,
        code: savedLine.code ?? null,
        name: savedLine.name,
        specification: savedLine.specification ?? null,
        unit: savedLine.unit ?? null
      },
      query,
      candidateCount: candidates.length,
      candidates,
      failedKnowledgebaseIds: retrieval.failedKnowledgebaseIds,
      knowledgeNoMatchRecorded: candidates.length === 0,
      nextAction: candidates.length
        ? 'Compare every candidate against the material name, full project feature/specification, and unit; then recommend one candidate or explicitly mark all as no match.'
        : 'No knowledge candidate was found. Web-price fallback is now allowed for this material line.'
    }
  }

  async searchQuotaComponents(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    knowledgebaseIds: string[],
    knowledgebase: KnowledgebaseApi | null | undefined,
    topK = MAX_SEARCH_CANDIDATES
  ) {
    const quotation = await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    if (line.kind !== 'bill') {
      throw new BadRequestException('Quota component search is allowed only for bill rows.')
    }
    if (line.matchStatus !== 'unmatched' && line.matchStatus !== 'review_required') {
      throw new BadRequestException('Quota component search is allowed only for unresolved bill rows.')
    }
    const before = await this.historyService.captureQuotation(scope, quotationId, [lineId])
    if (isDirectMaterialLine(line)) {
      const searchedAt = new Date()
      const proposal = buildDirectMaterialQuotaProposal(line, searchedAt)
      const resources = extractQuotaPricingResources(proposal)
      const savedLine = await this.lineRepository.save({
        ...line,
        // Preserve the row-level classification so the review UI and the
        // price worker know this bill row is a direct material purchase and
        // must not run construction-consumption lookup again.
        materialReferenceOnly: true,
        quotaWorkScopes: [line.name],
        quotaCandidates: [],
        quotaSearchedAt: searchedAt,
        quotaBreakdown: proposal,
        quotaPricingResources: resources,
        quotaResourcePrices: initializeQuotaResourcePrices(resources),
        pricingCalculation: null
      })
      await this.historyService.recordState(scope, 'search_quota_components', quotationId, before)
      return {
        quotationId,
        line: { id: lineId, discipline: savedLine.discipline, code: savedLine.code ?? null, name: savedLine.name, specification: savedLine.specification ?? null, unit: savedLine.unit ?? null, quantity: savedLine.quantity ?? null },
        query: `直接材料采购：${line.name} ${line.specification ?? ''} ${line.unit ?? ''}`.trim(),
        searchSnapshotId: randomUUID(),
        quotaSourceVersionId: quotation.quotaSourceVersionId ?? null,
        workScopes: [line.name],
        candidateCount: 0,
        candidates: [],
        failedKnowledgebaseIds: [],
        directMaterial: true,
        resourcePricing: { resourceCount: resources.length, resources },
        nextAction: 'This is a direct material row. Search the returned material resource prices and choose a candidate; do not propose a construction quota.'
      }
    }
    const { query, workScopes } = buildQuotaKnowledgeQuery(line)
    const boundedTopK = Math.max(1, Math.min(MAX_SEARCH_CANDIDATES, Math.floor(topK)))
    const searchSnapshotId = randomUUID()
    const retrieval = await this.knowledgebaseAdapter.searchConnected({
      scope,
      knowledgebase,
      knowledgebaseIds,
      query,
      topK: boundedTopK,
      source: 'xpert-quotation-quota',
      requestId: searchSnapshotId,
      role: 'consumption'
    })
    const searchedAt = new Date()
    const nativeCandidates = toQuotaKnowledgeCandidates(
      retrieval.documents,
      retrieval.knowledgebaseIds,
      query,
      searchedAt
    )
    const legacyStructuredCandidates = this.quotaKnowledge
      ? await this.quotaKnowledge.hydrateKnowledgeCandidates(
          scope,
          retrieval.documents,
          retrieval.knowledgebaseIds,
          query,
          boundedTopK,
          quotation.quotaSourceVersionId
        )
      : []
    // The platform vector result may contain only a quota summary. Once the
    // connected knowledgebase search has succeeded, use the tenant-isolated
    // normalized quota tables as a recovery source so the candidate carries
    // real 人材机 consumption instead of a pending placeholder.
    const hasConcreteRetrievedCandidate = [...legacyStructuredCandidates, ...nativeCandidates]
      .some((candidate) => candidate.quotaCode && hasConcreteQuotaResources(candidate.resources))
    const recoveryQuotaCodes = [...new Set([...legacyStructuredCandidates, ...nativeCandidates]
      .map((candidate) => candidate.quotaCode)
      .filter((code): code is string => Boolean(code)))].slice(0, boundedTopK)
    // The connected knowledgebase is the source of truth. The normalized
    // tenant-isolated quota tables may only hydrate a concrete code already
    // returned by that search; a broad database search would silently bypass
    // the Agent's connection and can select an unrelated quota item.
    const databaseCandidates = this.quotaKnowledge && !hasConcreteRetrievedCandidate &&
      retrieval.failedKnowledgebaseIds.length < retrieval.knowledgebaseIds.length && recoveryQuotaCodes.length
      ? (await Promise.all(recoveryQuotaCodes.map((quotaCode) => this.quotaKnowledge!.searchActiveQuota(scope, {
          query,
          quotaCode,
          limit: 1,
          sourceVersionId: quotation.quotaSourceVersionId
        })))).flat()
      : []
    const candidates = scopeQuotaCandidateSnapshot(
      mergeQuotaCandidates([...legacyStructuredCandidates, ...databaseCandidates, ...nativeCandidates], boundedTopK),
      lineId,
      searchSnapshotId
    ).map((candidate) => repairPersistedQuotaCandidate(candidate))
    const preview = buildQuotaSearchPreview(line.discipline, workScopes, candidates, searchedAt)
    const previewResources = preview ? extractQuotaPricingResources(preview) : []
    const savedLine = await this.lineRepository.save({
      ...line,
      // Workbook kind is table-level. Row-level direct material purchases are
      // persisted as material resources; construction bill rows remain quota
      // priced even when their specification mentions sand, steel, or gravel.
      materialReferenceOnly: false,
      quotaWorkScopes: workScopes,
      quotaCandidates: candidates,
      quotaSearchedAt: searchedAt,
      // Keep a resource-bearing proposed preview when retrieval succeeded.
      // The worker's explicit xpert_quotation_propose_quota_breakdown call
      // replaces it with the audited candidate selection.
      quotaBreakdown: preview,
      quotaPricingResources: previewResources,
      quotaResourcePrices: initializeQuotaResourcePrices(previewResources),
      pricingCalculation: null
    })
    await this.historyService.recordState(scope, 'search_quota_components', quotationId, before)
    return {
      quotationId,
      line: {
        id: lineId,
        discipline: savedLine.discipline,
        code: savedLine.code ?? null,
        name: savedLine.name,
        specification: savedLine.specification ?? null,
        unit: savedLine.unit ?? null,
        quantity: savedLine.quantity ?? null
      },
      query,
      searchSnapshotId,
      quotaSourceVersionId: quotation.quotaSourceVersionId ?? null,
      workScopes,
      candidateCount: candidates.length,
      candidates,
      failedKnowledgebaseIds: retrieval.failedKnowledgebaseIds,
      previewApplied: Boolean(preview),
      resourcePricing: { resourceCount: previewResources.length, resources: previewResources },
      nextAction: candidates.length
        ? 'Candidates come from the current Agent knowledgebase search and retain quota number, unit, resource category/code/name/unit/consumption, and source pages. Keep this response paired with its line.id and searchSnapshotId; immediately compare every candidate against each persisted work scope, then call xpert_quotation_propose_quota_breakdown using only candidateId values from this response.'
        : 'The connected knowledgebase returned no usable quota evidence with a concrete quota number and resource consumption. Do not invent a quota or use an unrelated database item. Use web_search/web_fetch for auditable engineering and consumption evidence, then let the line Worker persist it with xpert_quotation_recommend_web_quota_breakdown; if web evidence also fails, record every persisted work scope as uncovered.'
    }
  }

  async proposeQuotaBreakdown(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    input: QuotaBreakdownProposalInput
  ) {
    await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    if (line.kind !== 'bill' || (line.matchStatus !== 'unmatched' && line.matchStatus !== 'review_required')) {
      throw new BadRequestException('Quota breakdown proposals are allowed only for unresolved bill rows.')
    }
    if (isDirectMaterialLine(line)) {
      const proposal = buildDirectMaterialQuotaProposal(line)
      const quotaPricingResources = extractQuotaPricingResources(proposal)
      const quotaResourcePrices = initializeQuotaResourcePrices(quotaPricingResources)
      const before = await this.historyService.captureQuotation(scope, quotationId, [lineId])
      const savedLine = await this.lineRepository.save({ ...line, materialReferenceOnly: true, quotaWorkScopes: [line.name], quotaBreakdown: proposal, quotaPricingResources, quotaResourcePrices, pricingCalculation: null })
      await this.historyService.recordState(scope, 'propose_quota_breakdown', quotationId, before)
      return { quotationId, lineId, persisted: true, proposal, resourcePricing: { resourceCount: quotaPricingResources.length, resources: quotaPricingResources }, directMaterial: true, nextAction: 'Search and review the material resource price, then calculate the comprehensive rate.' }
    }
    if (!line.quotaSearchedAt || !line.quotaWorkScopes?.length) {
      throw new BadRequestException('A current quota component search is required before proposing a breakdown.')
    }
    let proposal
    try {
      // Search responses created before the OCR resource repair pass can have
      // empty `resources`. Re-expand the exact persisted snapshot before
      // validating the proposal so the reviewer sees人/机/材 candidates now.
      const repairedCandidates = expandPersistedQuotaCandidates(line.quotaCandidates ?? [])
      if (repairedCandidates.length) {
        line.quotaCandidates = repairedCandidates
      }
      proposal = buildQuotaBreakdownProposal(
        line.discipline,
        line.quotaWorkScopes,
        line.quotaCandidates ?? [],
        input
      )
    } catch (error) {
      throw new BadRequestException(`Quota breakdown for line ${lineId}: ${error instanceof Error ? error.message : 'Invalid quota breakdown proposal.'}`)
    }
    const quotaPricingResources = extractQuotaPricingResources(proposal)
    const quotaResourcePrices = initializeQuotaResourcePrices(quotaPricingResources)
    const before = await this.historyService.captureQuotation(scope, quotationId, [lineId])
    const savedLine = await this.lineRepository.save({
      ...line,
      quotaBreakdown: proposal,
      quotaPricingResources,
      quotaResourcePrices,
      pricingCalculation: null
    })
    await this.historyService.recordState(scope, 'propose_quota_breakdown', quotationId, before)
    return {
      quotationId,
      lineId,
      persisted: true,
      quotaSearchedAt: savedLine.quotaSearchedAt,
      proposal,
      resourcePricing: {
        resourceCount: quotaPricingResources.length,
        resources: quotaPricingResources
      },
      nextAction: '请审核下方人工、机械、材料候选；缺少消耗量或价格的资源可保留为 0，并在计算结果中显示警告。'
    }
  }

  async reviewQuotaBreakdown(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    decision: 'approve' | 'reject',
    comment: string
  ) {
    await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    if (line.kind !== 'bill' || !line.quotaBreakdown) {
      throw new BadRequestException('A persisted bill quota breakdown is required before review.')
    }
    if (line.quotaBreakdown.mappingStatus !== 'proposed') {
      throw new BadRequestException('Only a proposed quota breakdown can be approved or rejected.')
    }
    const reviewComment = normalizeRequired(comment, 'Quota breakdown review comment is required.').slice(0, 600)
    const before = await this.historyService.captureQuotation(scope, quotationId, [lineId])
    const quotaBreakdown = {
      ...line.quotaBreakdown,
      mappingStatus: decision === 'approve' ? 'approved' as const : 'rejected' as const,
      reviewedAt: new Date().toISOString(),
      reviewComment
    }
    await this.lineRepository.save({ ...line, quotaBreakdown })
    await this.historyService.recordState(scope, 'review_quota_breakdown', quotationId, before)
    return {
      quotationId,
      lineId,
      decision,
      mappingStatus: quotaBreakdown.mappingStatus,
      blockingReasons: quotaBreakdown.blockingReasons,
      automaticPricingAllowed: false as const,
      nextAction: decision === 'approve'
        ? 'The quota mapping is approved for later pricing review; continue reviewing 人工、机械、材料 resource prices before calculating.'
        : 'Run a new quota search and persist a replacement proposal before further review.'
    }
  }

  async recommendKnowledgePrice(scope: XpertScope, quotationId: string, lineId: string, recommendation: AiKnowledgePriceRecommendationInput) {
    return this.reviewService.recommendKnowledgePrice(scope, quotationId, lineId, recommendation)
  }

  async selectQuotaCandidate(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    candidateId: string
  ) {
    await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    if (line.kind !== 'bill' || isDirectMaterialLine(line)) {
      throw new BadRequestException('Quota candidate selection is allowed only for construction bill rows.')
    }
    if (!line.quotaSearchedAt || !line.quotaWorkScopes?.length) {
      throw new BadRequestException('A current quota component search is required before selecting a candidate.')
    }
    const candidates = expandPersistedQuotaCandidates(line.quotaCandidates ?? [])
    let proposal
    try {
      proposal = buildQuotaCandidateSelectionProposal(line.discipline, line.quotaWorkScopes, candidates, candidateId)
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid quota candidate selection.')
    }
    const quotaPricingResources = extractQuotaPricingResources(proposal)
    const before = await this.historyService.captureQuotation(scope, quotationId, [lineId])
    await this.lineRepository.save({
      ...line,
      quotaCandidates: candidates,
      quotaBreakdown: proposal,
      quotaPricingResources,
      quotaResourcePrices: initializeQuotaResourcePrices(quotaPricingResources),
      pricingCalculation: null
    })
    await this.historyService.recordState(scope, 'select_quota_candidate', quotationId, before)
    return {
      quotationId,
      lineId,
      candidateId,
      persisted: true,
      quotaBreakdown: proposal,
      resourcePricing: { resourceCount: quotaPricingResources.length, resources: quotaPricingResources },
      nextAction: '已切换消耗量候选；请审核消耗量组成，再重新选择并批准人工、机械、材料价格后计算综合单价。'
    }
  }

  async searchResourcePrices(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    resourceId: string,
    knowledgebaseIds: string[],
    knowledgebase: KnowledgebaseApi | null | undefined,
    topK?: number
  ) {
    return this.requireResourcePricing().searchResourcePrices(
      scope, quotationId, lineId, resourceId, knowledgebaseIds, knowledgebase, topK
    )
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
    return this.requireResourcePricing().recommendResourcePrice(scope, quotationId, lineId, input)
  }

  async reviewResourcePrice(scope: XpertScope, quotationId: string, lineId: string, input: {
    resourceId: string
    decision: 'approve' | 'reject'
    comment: string
  }) {
    return this.requireResourcePricing().reviewResourcePrice(scope, quotationId, lineId, input)
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
    return this.requireResourcePricing().acceptResourcePrice(scope, quotationId, lineId, input)
  }

  async setUncoveredWorkSkipped(
    scope: XpertScope,
    quotationId: string,
    lineId: string,
    workScope: string,
    skipped: boolean
  ) {
    await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    if (!line.quotaBreakdown?.uncoveredWorkScopes.includes(workScope)) {
      throw new BadRequestException('Uncovered work scope is not in the current quota breakdown.')
    }
    const before = await this.historyService.captureQuotation(scope, quotationId, [lineId])
    const current = new Set(line.quotaBreakdown.skippedUncoveredWorkScopes ?? [])
    if (skipped) current.add(workScope)
    else current.delete(workScope)
    const quotaBreakdown = {
      ...line.quotaBreakdown,
      skippedUncoveredWorkScopes: line.quotaBreakdown.uncoveredWorkScopes.filter((scope) => current.has(scope))
    }
    await this.lineRepository.save({ ...line, quotaBreakdown, pricingCalculation: null })
    await this.historyService.recordState(scope, 'update_pricing_review', quotationId, before)
    return { quotationId, lineId, workScope, skipped, persisted: true }
  }

  async updatePricingFormulaRule(scope: XpertScope, quotationId: string, lineId: string, input: {
    ruleId: string
    name: string
    ratePercent: string
    base: PricingFeeBase
    status: 'enabled' | 'skipped'
  }) {
    await this.requireQuotation(scope, quotationId)
    const line = await this.requireLine(scope, quotationId, lineId)
    if (!line.quotaBreakdown) throw new BadRequestException('A persisted quota breakdown is required.')
    const rules = resolvedQuotaPricingFormulaRules(line.quotaBreakdown)
    const current = rules.find((rule) => rule.id === input.ruleId)
    if (!current) throw new BadRequestException('Pricing formula rule is not in the current quota breakdown.')
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/.test(input.ratePercent)) {
      throw new BadRequestException('Formula rate percent must be a non-negative decimal.')
    }
    const name = normalizeRequired(input.name, 'Formula name is required.').slice(0, 120)
    const next = rules.map((rule) => rule.id === input.ruleId ? {
      ...rule,
      name,
      ratePercent: input.ratePercent,
      base: input.base,
      status: input.status,
      updatedAt: new Date().toISOString()
    } : rule)
    const before = await this.historyService.captureQuotation(scope, quotationId, [lineId])
    const quotaBreakdown = { ...line.quotaBreakdown, pricingFormulaRules: next }
    await this.lineRepository.save({ ...line, quotaBreakdown, pricingCalculation: null })
    await this.historyService.recordState(scope, 'update_pricing_review', quotationId, before)
    return { quotationId, lineId, rule: next.find((rule) => rule.id === input.ruleId), persisted: true }
  }

  async calculateComprehensiveRate(scope: XpertScope, quotationId: string, lineId: string, input: {
    fees: PricingFeeRuleInput[]
    unitPriceScale?: number
  }) {
    return this.requireResourcePricing().calculateComprehensiveRate(scope, quotationId, lineId, input)
  }

  async markKnowledgeNoMatch(scope: XpertScope, quotationId: string, lineId: string, candidateIds: string[], rationale: string) {
    return this.reviewService.markKnowledgeNoMatch(scope, quotationId, lineId, candidateIds, rationale)
  }

  async recommendWebPrice(scope: XpertScope, quotationId: string, lineId: string, recommendation: AiWebPriceRecommendationInput) {
    return this.reviewService.recommendWebPrice(scope, quotationId, lineId, recommendation)
  }

  async acceptAiRecommendation(scope: XpertScope, quotationId: string, lineId: string) {
    return this.reviewService.acceptAiRecommendation(scope, quotationId, lineId)
  }

  async acceptAiRecommendations(scope: XpertScope, quotationId: string, recommendationKind: 'knowledge' | 'web') {
    return this.reviewService.acceptAiRecommendations(scope, quotationId, recommendationKind)
  }

  async setManualPrice(scope: XpertScope, quotationId: string, lineId: string, unitPrice: string) {
    return this.reviewService.setManualPrice(scope, quotationId, lineId, unitPrice)
  }

  async skipLine(scope: XpertScope, quotationId: string, lineId: string) {
    return this.reviewService.skipLine(scope, quotationId, lineId)
  }

  async reopenLine(scope: XpertScope, quotationId: string, lineId: string) {
    return this.reviewService.reopenLine(scope, quotationId, lineId)
  }

  async deleteQuotation(scope: XpertScope, quotationId: string) {
    return this.historyService.deleteQuotation(scope, quotationId)
  }

  async undoLast(scope: XpertScope) {
    return this.historyService.undoLast(scope)
  }

  async saveWorkbookSnapshot(scope: XpertScope, quotationId: string, snapshot: unknown, changeSummary: string) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new BadRequestException('Workbook snapshot is required.')
    }
    const quotation = await this.requireQuotation(scope, quotationId)
    const before = await this.historyService.captureQuotation(scope, quotationId)
    const result = await this.workbookService.saveSnapshot(scope, {
      documentId: quotation.officeDocumentId,
      snapshot,
      source: 'workbench',
      changeSummary: normalizeRequired(changeSummary, 'Change summary is required.').slice(0, 240)
    })
    const versionNumber = result.fileVersion?.versionNumber
    if (!versionNumber) throw new BadRequestException('Quotation workbook did not create an XLSX version for the saved workbook.')
    const saved = await this.quotationRepository.save({
      ...quotation,
      officeFileVersionId: result.fileVersion?.id ?? null,
      officeVersionNumber: versionNumber,
      status: 'uploaded',
      matchedCount: 0,
      reviewCount: 0,
      unmatchedCount: 0,
      totalAmount: null,
      sheetMappings: null,
      recognitionConfidence: null,
      recognitionRationale: null,
      recognizedAt: null,
      warnings: ['工作簿已人工编辑，请重新执行自动识别并匹配。']
    })
    await this.historyService.recordState(scope, 'save_workbook', quotationId, before)
    return { quotation: saved, officeDocument: sanitizeOfficeDocument(result) }
  }

  async applyQuotation(
    scope: XpertScope,
    quotationId: string,
    changeSummary: string,
    lineId?: string,
    options: { overwriteExisting?: boolean; expectedVersionNumber?: number } = {}
  ) {
    const quotation = await this.requireQuotation(scope, quotationId)
    const allLines = await this.lineRepository.find({
      where: { ...scopeWhere(scope), quotationId },
      order: { sheetName: 'ASC', rowNumber: 'ASC' }
    })
    const targetLines = lineId
      ? allLines.filter((line) => line.id === lineId)
      : allLines
    if (lineId && targetLines.length === 0) throw new NotFoundException('Quotation line was not found.')
    const unresolved = allLines.filter((line) => line.matchStatus === 'unmatched' || line.matchStatus === 'review_required')
    const priced = targetLines.filter((line) => line.matchStatus === 'matched' || line.matchStatus === 'confirmed')
    if (!priced.length) throw new BadRequestException('Quotation has no newly approved prices to apply.')
    const blocked = priced
      .map((line) => ({ line, reason: comprehensiveRateExcelBlockReason(line) }))
      .filter((item): item is { line: XpertQuotationLine; reason: string } => Boolean(item.reason))
    if (blocked.length) {
      throw new BadRequestException(blocked.map(({ line, reason }) => `第 ${line.rowNumber} 行：${reason}`).join('；'))
    }
    const approved = allLines.filter((line) => line.matchStatus === 'matched' || line.matchStatus === 'confirmed' || line.matchStatus === 'applied')
    const remainingApproved = lineId && allLines.some((line) => line.id !== lineId && (line.matchStatus === 'matched' || line.matchStatus === 'confirmed'))
    const patches = buildLinePatches(priced)
    const totalPatches = lineId || unresolved.length ? [] : buildTotalPatches(approved, quotation.sheetMappings ?? [])
    patches.push(...totalPatches)
    if (options.overwriteExisting) {
      if (options.expectedVersionNumber == null) {
        throw new BadRequestException('Expected workbook version is required when overwriting existing Excel values.')
      }
      if (options.expectedVersionNumber !== quotation.officeVersionNumber) {
        throw new ConflictException(`Excel file version conflict: expected ${options.expectedVersionNumber}, current version is ${quotation.officeVersionNumber}.`)
      }
      for (const patch of patches) patch.expectedCellState = { kind: 'any' }
    } else {
      const inspection = await this.workbookService.findOccupiedPatchTargets(scope, {
        documentId: quotation.officeDocumentId,
        expectedVersionNumber: quotation.officeVersionNumber,
        patches
      })
      if (inspection.targets.length) {
        return {
          status: 'overwrite_required' as const,
          expectedVersionNumber: inspection.versionNumber,
          occupiedCellCount: inspection.targets.length,
          occupiedCells: inspection.targets.slice(0, 50),
          occupiedCellsTruncated: inspection.targets.length > 50
        }
      }
    }
    const summary = normalizeRequired(changeSummary, 'Change summary is required.').slice(0, 240)
    const before = await this.historyService.captureQuotation(scope, quotationId, lineId ? [lineId] : undefined)
    const result = await this.workbookService.patchExcelPreservingFormat(scope, {
      documentId: quotation.officeDocumentId,
      expectedVersionNumber: quotation.officeVersionNumber,
      patches,
      changeSummary: summary,
      idempotencyKey: `xpert-quotation:${quotationId}:v${quotation.officeVersionNumber}${lineId ? `:line:${lineId}` : ''}`
    })
    await this.lineRepository.save(priced.map((line) => ({ ...line, matchStatus: 'applied' as const })))
    const totalAmount = lineId || unresolved.length
      ? null
      : sumAmounts(approved.filter((line) => line.kind !== 'material').map((line) => line.calculatedAmount ?? '0'))
    const saved = await this.quotationRepository.save({
      ...quotation,
      officeFileVersionId: result.fileVersion.id,
      officeVersionNumber: result.fileVersion.versionNumber,
      status: unresolved.length ? 'review_required' : remainingApproved ? 'ready_to_apply' : 'applied',
      ...(lineId || unresolved.length ? {} : { totalAmount })
    })
    await this.historyService.recordState(scope, 'apply_workbook', quotationId, before)
    return {
      status: 'applied' as const,
      quotation: saved,
      appliedLineCount: priced.length,
      unresolvedCount: unresolved.length,
      skippedCount: allLines.filter((line) => line.matchStatus === 'ignored').length,
      patchCount: patches.length,
      totalsWritten: totalPatches.length > 0,
      totalsSkippedReason: unresolved.length
        ? 'unresolved_lines'
        : totalPatches.length
          ? null
          : 'no_validated_total_mapping',
      file: sanitizeOfficeFile(result.file),
      replayed: result.replayed
    }
  }

  async getWorkbenchData(scope: XpertScope, quotationId?: string | null) {
    const [quotations, undo] = await Promise.all([
      this.quotationRepository.find({ where: scopeWhere(scope), order: { updatedAt: 'DESC' }, take: 50 }),
      this.historyService.getUndoAvailability(scope)
    ])
    let selected = quotationId
      ? quotations.find((item) => item.id === quotationId) ?? await this.requireQuotation(scope, quotationId)
      : quotations[0] ?? null
    let lines = selected?.id ? await this.lineRepository.find({
      where: { ...scopeWhere(scope), quotationId: selected.id },
      order: { sheetName: 'ASC', rowNumber: 'ASC' },
      take: 1_000
    }) : []
    if (selected?.id && lines.some((line) =>
      line.quotaBreakdown?.components?.length ||
      (line.kind !== 'material' && line.materialReferenceOnly === true)
    )) {
      lines = await this.repairPersistedQuotaResources(scope, selected.id, lines)
    }
    const [officeFile, officeDocument] = selected ? await Promise.all([
      this.workbookService.getExcelFile(scope, selected.officeDocumentId).catch(() => null),
      this.workbookService.openDocument(scope, selected.officeDocumentId).catch(() => null)
    ]) : [null, null]
    if (selected && officeFile?.fileVersionId && (
      selected.officeFileVersionId !== officeFile.fileVersionId || selected.officeVersionNumber !== officeFile.versionNumber
    )) {
      selected = await this.quotationRepository.save({
        ...selected,
        officeFileVersionId: officeFile.fileVersionId,
        officeVersionNumber: officeFile.versionNumber
      })
    }
    return {
      quotations: quotations.map(toQuotationDto),
      undo,
      detail: selected ? {
        quotation: toQuotationDto(selected),
        lines: lines.map(toQuotationLineDto),
        officeFile: officeFile ? sanitizeOfficeFile(officeFile) : null,
        officeDocument: officeDocument ? sanitizeOfficeDocument(officeDocument) : null
      } : null
    }
  }

  private async repairPersistedQuotaResources(scope: XpertScope, quotationId: string, lines: XpertQuotationLine[]) {
    const repaired: XpertQuotationLine[] = []
    for (const line of lines) {
      const normalizedMaterialFlag = line.kind === 'material' || isDirectMaterialLine(line)
      const hasLegacyMaterialFlag = line.materialReferenceOnly !== normalizedMaterialFlag
      if (isDirectMaterialLine(line)) {
        const proposal = buildDirectMaterialQuotaProposal(line)
        const resources = extractQuotaPricingResources(proposal)
        const previousResources = line.quotaPricingResources ?? []
        const nextStates = reconcileQuotaResourcePrices(previousResources, line.quotaResourcePrices ?? [], resources)
        // buildDirectMaterialQuotaProposal() stamps the current time. Compare
        // the stable proposal payload so a Workbench refresh does not look like
        // a new proposal and erase an already calculated material price.
        const stableProposal = (value: XpertQuotationLine['quotaBreakdown']) => {
          if (!value) return value
          const { proposedAt: _proposedAt, ...rest } = value
          return rest
        }
        const needsRepair = JSON.stringify(stableProposal(line.quotaBreakdown)) !== JSON.stringify(stableProposal(proposal)) || JSON.stringify(previousResources) !== JSON.stringify(resources)
        repaired.push(needsRepair || hasLegacyMaterialFlag
          ? await this.lineRepository.save({ ...line, materialReferenceOnly: true, quotaWorkScopes: [line.name], quotaCandidates: [], quotaBreakdown: proposal, quotaPricingResources: resources, quotaResourcePrices: nextStates, pricingCalculation: JSON.stringify(previousResources) !== JSON.stringify(resources) ? null : line.pricingCalculation })
          : line)
        continue
      }
      if (!line.quotaBreakdown?.components?.length) {
        repaired.push(hasLegacyMaterialFlag
          ? await this.lineRepository.save({ ...line, materialReferenceOnly: normalizedMaterialFlag })
          : line)
        continue
      }
      const expandedCandidates = expandPersistedQuotaCandidates(line.quotaCandidates ?? [])
      const candidateById = new Map(expandedCandidates.map((candidate) => [candidate.id, candidate]))
      let changed = false
      const components = line.quotaBreakdown.components.map((component) => {
        // A component with persisted resources is already a review snapshot.
        // View refreshes may repair legacy empty components, but must never
        // reselect a sibling quota and change the proposal under the reviewer.
        if (hasConcreteQuotaResources(component.resources)) return component
        const originalCandidate = (line.quotaCandidates ?? []).find((candidate) => candidate.id === component.candidateId)
        const repairedCurrent = originalCandidate ? repairPersistedQuotaCandidate(originalCandidate) : candidateById.get(component.candidateId)
        if (repairedCurrent) candidateById.set(repairedCurrent.id, repairedCurrent)
        const nextCandidate = selectPersistedQuotaCandidate(line, component, [...candidateById.values()])
        if (!nextCandidate || !hasConcreteQuotaResources(nextCandidate.resources)) return component
        const componentChanged = nextCandidate.id !== component.candidateId ||
          nextCandidate.quotaCode !== component.quotaCode ||
          nextCandidate.quotaName !== component.quotaName ||
          nextCandidate.quotaUnit !== component.quotaUnit ||
          JSON.stringify(nextCandidate.resources) !== JSON.stringify(component.resources)
        if (!componentChanged) return component
        changed = true
        return {
          ...component,
          candidateId: nextCandidate.id,
          ...(nextCandidate.quotaCode ? { quotaCode: nextCandidate.quotaCode } : {}),
          ...(nextCandidate.quotaName ? { quotaName: nextCandidate.quotaName } : {}),
          ...(nextCandidate.quotaUnit ? { quotaUnit: nextCandidate.quotaUnit } : {}),
          knowledgebaseId: nextCandidate.knowledgebaseId,
          ...(nextCandidate.documentId ? { documentId: nextCandidate.documentId } : {}),
          ...(nextCandidate.chunkId ? { chunkId: nextCandidate.chunkId } : {}),
          sourcePages: nextCandidate.sourcePages,
          sourceReviewStatus: nextCandidate.reviewStatus,
          ...(nextCandidate.ingestionReady !== undefined ? { sourceIngestionReady: nextCandidate.ingestionReady } : {}),
          resources: nextCandidate.resources.map((resource) => ({ ...resource }))
        }
      })
      const expectedQuotaPricingResources = extractQuotaPricingResources({ ...line.quotaBreakdown, components })
      const resourceSnapshotChanged = JSON.stringify(expectedQuotaPricingResources) !== JSON.stringify(line.quotaPricingResources ?? [])
      const pricingFormulaRules = resolvedQuotaPricingFormulaRules({ ...line.quotaBreakdown, components })
      const skippedUncoveredWorkScopes = line.quotaBreakdown.uncoveredWorkScopes.filter((scope) =>
        (line.quotaBreakdown?.skippedUncoveredWorkScopes ?? []).includes(scope)
      )
      const reviewStateChanged = JSON.stringify(pricingFormulaRules) !== JSON.stringify(line.quotaBreakdown.pricingFormulaRules ?? []) ||
        JSON.stringify(skippedUncoveredWorkScopes) !== JSON.stringify(line.quotaBreakdown.skippedUncoveredWorkScopes ?? [])
      if (!changed && !resourceSnapshotChanged && !reviewStateChanged && !hasLegacyMaterialFlag) {
        repaired.push(line)
        continue
      }
      const quotaBreakdown = {
        ...line.quotaBreakdown,
        components,
        pricingFormulaRules,
        skippedUncoveredWorkScopes,
        ...(changed ? {
          mappingStatus: 'proposed' as const,
          reviewedAt: undefined,
          reviewComment: undefined,
          blockingReasons: [...new Set([...line.quotaBreakdown.blockingReasons, 'unreviewed_quota_source'])]
        } : {})
      }
      const quotaPricingResources = changed || resourceSnapshotChanged
        ? expectedQuotaPricingResources
        : line.quotaPricingResources ?? []
      const quotaResourcePrices = changed || resourceSnapshotChanged
        ? reconcileQuotaResourcePrices(
            line.quotaPricingResources ?? [],
            line.quotaResourcePrices ?? [],
            quotaPricingResources
          )
        : line.quotaResourcePrices ?? []
      const saved = await this.lineRepository.save({
        ...line,
        materialReferenceOnly: normalizedMaterialFlag,
        quotaCandidates: [...candidateById.values()],
        quotaBreakdown,
        quotaPricingResources,
        quotaResourcePrices,
        // Reconciliation may only be normalizing legacy review metadata (for
        // example formula rules or skipped scopes). That does not change the
        // selected quota consumption or adopted resource prices, so an
        // already calculated result remains valid and must stay visible until
        // the reviewer explicitly applies it to Excel. Invalidate only when
        // the quota/resource snapshot itself changed.
        pricingCalculation: changed || resourceSnapshotChanged ? null : line.pricingCalculation
      })
      repaired.push(saved)
    }
    return repaired
  }

  async getAgentSummary(scope: XpertScope, quotationId: string) {
    const quotation = await this.requireQuotation(scope, quotationId)
    return {
      quotationId,
      title: quotation.title,
      status: quotation.status,
      officeVersionNumber: quotation.officeVersionNumber,
      pricingSource: 'connected_knowledgebases',
      counts: {
        matched: quotation.matchedCount,
        reviewRequired: quotation.reviewCount,
        unmatched: quotation.unmatchedCount
      },
      totalAmount: quotation.totalAmount ?? null,
      warnings: (quotation.warnings ?? []).slice(0, 20),
      recognition: quotation.sheetMappings?.length ? {
        confidence: quotation.recognitionConfidence ?? null,
        rationale: quotation.recognitionRationale ?? null,
        recognizedAt: quotation.recognizedAt ?? null,
        sheets: quotation.sheetMappings.map((mapping) => ({
          sheetName: mapping.sheetName,
          discipline: mapping.discipline,
          kind: mapping.kind,
          confidence: mapping.confidence
        }))
      } : null,
      availableReads: ['xpert_quotation_inspect_workbook', 'xpert_quotation_list_issues', 'xpert_quotation_search_quota_components', 'xpert_quotation_search_resource_prices']
    }
  }

  async getCurrentWorkbenchContext(scope: XpertScope, context: QuotationWorkbenchContextInput) {
    const quotationId = context.quotationId?.trim()
    // The Workbench context is authoritative when present. When a view was
    // opened before the Assistant initialized, resolve the most recently
    // updated quotation in the same tenant/organization scope instead of
    // making the user repeat an id that the platform already knows.
    const workbench = await this.getWorkbenchData(scope, quotationId || undefined)
    const detail = workbench.detail
    if (!detail) {
      return {
        code: 'workbench_context_unavailable',
        message: 'The selected quotation is no longer available in the current tenant and organization scope.',
        ...(quotationId ? { quotationId } : {}),
        nextAction: 'Open or import a quotation workbook in the Xpert Quotation Workbench, then retry.'
      }
    }

    const snapshot = detail.officeDocument?.currentSnapshot?.snapshot
    const snapshotNames = snapshot && typeof snapshot === 'object'
      ? snapshotSheetNames(snapshot)
      : []
    const activeSheetName = context.activeSheetName?.trim() || snapshotNames[0]
    const lines = detail.lines
    const statusCounts = {
      total: lines.length,
      pending: lines.filter((line) => line.matchStatus === 'review_required' || line.matchStatus === 'unmatched').length,
      approved: lines.filter((line) => line.matchStatus === 'confirmed' || line.matchStatus === 'applied' || line.matchStatus === 'matched').length,
      skipped: lines.filter((line) => line.matchStatus === 'ignored').length
    }
    const snapshotId = detail.officeDocument?.currentSnapshot?.id ?? undefined
    return {
      code: 'ok',
      quotation: {
        quotationId: detail.quotation.id,
        title: detail.quotation.title,
        status: detail.quotation.status,
        officeVersionNumber: detail.quotation.officeVersionNumber,
        fileName: detail.officeFile?.fileName ?? null,
        currentSnapshotId: snapshotId ?? null
      },
      scope: {
        workspaceId: scope.workspaceId ?? null,
        projectId: scope.projectId ?? null,
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null
      },
      workbench: {
        activeView: context.activeView ?? 'quotation',
        activeSheetName: activeSheetName ?? null,
        selectedRange: context.selectedRange ?? null,
        dirty: context.dirty === true,
        contentFreshness: 'not_loaded',
        warning: context.dirty === true
          ? 'Workbench contains unsaved edits; no workbook content is included in this context.'
          : 'Workbook content is not included in this context. Use the returned file path with file tools or use xpert_quotation_inspect_workbook for structured workbook inspection.',
        sheetNames: snapshotNames,
        file: detail.officeFile ? {
          documentId: detail.officeDocument?.item?.id ?? null,
          fileName: detail.officeFile.fileName,
          filePath: detail.officeFile.filePath ?? null,
          mimeType: detail.officeFile.mimeType,
          extension: detail.officeFile.extension,
          versionNumber: detail.officeFile.versionNumber ?? null,
          size: detail.officeFile.size ?? null
        } : null
      },
      review: statusCounts,
      nextAction: 'Use the quotationId and workbench.file.filePath from this context as locators. Use parsed_file_list/search/read/table_query or sandbox file tools to inspect content when available; use xpert_quotation_inspect_workbook for authoritative XLSX mapping. Do not expect file content in this context response.'
    }
  }

  async getIssues(scope: XpertScope, quotationId: string, page = 1, pageSize = 50) {
    await this.requireQuotation(scope, quotationId)
    const boundedPage = Math.max(1, Math.floor(page))
    const boundedPageSize = Math.max(1, Math.min(100, Math.floor(pageSize)))
    const [items, total] = await this.lineRepository.findAndCount({
      where: { ...scopeWhere(scope), quotationId, matchStatus: In(['review_required', 'unmatched']) },
      order: { sheetName: 'ASC', rowNumber: 'ASC' },
      skip: (boundedPage - 1) * boundedPageSize,
      take: boundedPageSize
    })
    return {
      quotationId,
      page: boundedPage,
      pageSize: boundedPageSize,
      total,
      hasNext: boundedPage * boundedPageSize < total,
      items: items.map(toQuotationLineDto)
    }
  }

  private createUnmatchedLine(
    scoped: ReturnType<typeof requireScope>,
    quotationId: string,
    line: RecognizedLine
  ) {
    return this.lineRepository.create({
      ...scoped,
      quotationId,
      ...line,
      code: line.code ?? null,
      specification: line.specification ?? null,
      unit: line.unit ?? null,
      quantity: line.quantity ?? null,
      quantityAddress: line.quantityAddress ?? null,
      targetAmountAddress: line.targetAmountAddress ?? null,
      matchStatus: 'unmatched',
      matchedPriceItemId: null,
      matchedUnitPrice: null,
      calculatedAmount: null,
      candidateIds: [],
      materialReferenceOnly: line.kind === 'material',
      matchEvidence: line.kind === 'material'
        ? '待检索当前 Agent 连接的材料价格知识库。'
        : line.kind === 'bill'
          ? '待检索当前 Agent 连接的消耗量知识并拆分工作组成；拆分建议不会直接形成或写入综合单价。'
          : '措施单价尚无消耗量拆分流程，需人工填写或跳过。',
      aiRecommendedPriceItemId: null,
      knowledgeCandidates: [],
      knowledgeSearchedAt: null,
      knowledgeNoMatchReason: null,
      knowledgeNoMatchAt: null,
      quotaWorkScopes: [],
      quotaCandidates: [],
      quotaSearchedAt: null,
      quotaBreakdown: null,
      quotaPricingResources: [],
      quotaResourcePrices: [],
      pricingCalculation: null,
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
      aiSources: null,
      aiRecommendedAt: null
    })
  }

  private requireResourcePricing() {
    if (!this.resourcePricing) throw new BadRequestException('Quota resource pricing service is unavailable.')
    return this.resourcePricing
  }

  private async readCurrentCatalog(scope: XpertScope, quotation: XpertQuotation) {
    const catalog = await this.workbookService.readExcel(scope, { documentId: quotation.officeDocumentId })
    if (catalog.versionNumber !== quotation.officeVersionNumber) {
      throw new BadRequestException(`Quotation workbook version changed from ${quotation.officeVersionNumber} to ${catalog.versionNumber}; refresh before matching.`)
    }
    if (catalog.fileVersionId !== quotation.officeFileVersionId) {
      quotation.officeFileVersionId = catalog.fileVersionId
      await this.quotationRepository.save(quotation)
    }
    return catalog
  }

  private async readMappedSheet(scope: XpertScope, quotation: XpertQuotation, mapping: XpertSheetMapping) {
    const maxColumn = maxMappedColumn(mapping)
    const width = columnToIndex(maxColumn) + 1
    const lastRow = Math.max(
      mapping.dataEndRow,
      mapping.totals?.finalTotalRow ?? 0,
      ...(mapping.totals?.subtotals ?? []).map((subtotal) => subtotal.targetRow)
    )
    const rowsPerRead = Math.max(1, Math.floor(MAX_OFFICE_READ_CELLS / width))
    const reads: OfficeReadResult[] = []
    for (let startRow = 1; startRow <= lastRow; startRow += rowsPerRead) {
      const endRow = Math.min(lastRow, startRow + rowsPerRead - 1)
      const read = await this.workbookService.readExcel(scope, {
        documentId: quotation.officeDocumentId,
        sheetName: mapping.sheetName,
        range: `A${startRow}:${maxColumn}${endRow}`
      })
      if (read.versionNumber !== quotation.officeVersionNumber) {
        throw new BadRequestException(`Quotation workbook version changed while reading ${mapping.sheetName}.`)
      }
      reads.push(read)
    }
    const first = reads[0]
    if (!first) throw new BadRequestException(`Workbook data for ${mapping.sheetName} was not loaded.`)
    return {
      ...first,
      workbook: {
        ...first.workbook,
        sheetName: mapping.sheetName,
        range: `A1:${maxColumn}${lastRow}`,
        rows: reads.flatMap((read) => read.workbook.rows ?? [])
      }
    }
  }

  private async requireQuotation(scope: XpertScope, id: string) {
    const item = await this.quotationRepository.findOne({ where: { ...scopeWhere(scope), id } })
    if (!item) throw new NotFoundException('Quotation was not found.')
    return item
  }

  private async requireLine(scope: XpertScope, quotationId: string, id: string) {
    const item = await this.lineRepository.findOne({ where: { ...scopeWhere(scope), quotationId, id } })
    if (!item) throw new NotFoundException('Quotation line was not found.')
    return item
  }
}

function buildLinePatches(lines: XpertQuotationLine[]) {
  const patches: OfficeExcelCellPatch[] = []
  for (const line of lines) {
    if (!line.matchedUnitPrice || !line.calculatedAmount || !line.id) continue
    patches.push({
      sheetName: line.sheetName,
      address: line.targetPriceAddress,
      kind: 'number',
      value: line.matchedUnitPrice,
      expectedCellState: { kind: 'empty' },
      evidenceId: line.id
    })
    if (line.targetAmountAddress && line.quantity && line.quantityAddress) {
      patches.push({
        sheetName: line.sheetName,
        address: line.targetAmountAddress,
        kind: 'formula',
        value: `=ROUND(${line.quantityAddress}*${line.targetPriceAddress},2)`,
        cachedValue: line.calculatedAmount,
        expectedCellState: { kind: 'empty' },
        evidenceId: line.id
      })
    }
  }
  return patches
}

function comprehensiveRateExcelBlockReason(line: XpertQuotationLine) {
  const calculation = line.pricingCalculation
  if (!calculation) return null
  if (!isPositiveDecimalText(calculation.comprehensiveUnitPrice)) {
    return '综合单价为 0，不能写入 Excel；请先选择有效资源价格后重新计算。'
  }
  return null
}

function isPositiveDecimalText(value?: string | null) {
  const normalized = value?.trim() ?? ''
  return /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(normalized) && /[1-9]/.test(normalized.replace('.', ''))
}

function buildTotalPatches(lines: XpertQuotationLine[], mappings: XpertSheetMapping[]) {
  const patches: OfficeExcelCellPatch[] = []
  for (const mapping of mappings) {
    if (!mapping.totals?.finalTotalRow) continue
    const sheetLines = lines.filter((line) => line.sheetName === mapping.sheetName)
    if (!sheetLines.length || mapping.kind === 'material') continue
    const totalColumn = mapping.columns.amount ?? mapping.columns.unitPrice
    const subtotalAddresses: string[] = []
    for (const subtotal of mapping.totals.subtotals ?? []) {
      const pageLines = sheetLines.filter((line) => line.rowNumber >= subtotal.startRow && line.rowNumber <= subtotal.endRow)
      const address = `${totalColumn}${subtotal.targetRow}`
      subtotalAddresses.push(address)
      patches.push({
        sheetName: mapping.sheetName,
        address,
        kind: 'formula',
        value: `=SUM(${totalColumn}${subtotal.startRow}:${totalColumn}${subtotal.endRow})`,
        cachedValue: sumAmounts(pageLines.map((line) => line.calculatedAmount ?? '0')),
        expectedCellState: { kind: 'empty' }
      })
    }
    const finalAddress = `${totalColumn}${mapping.totals.finalTotalRow}`
    patches.push({
      sheetName: mapping.sheetName,
      address: finalAddress,
      kind: 'formula',
      value: subtotalAddresses.length
        ? `=SUM(${subtotalAddresses.join(',')})`
        : `=SUM(${totalColumn}${mapping.dataStartRow}:${totalColumn}${mapping.dataEndRow})`,
      cachedValue: sumAmounts(sheetLines.map((line) => line.calculatedAmount ?? '0')),
      expectedCellState: { kind: 'empty' }
    })
  }
  return patches
}

type WorkbookSample = {
  name: string
  range: string | null
  hidden: boolean
  score: number
  sampleRows: Array<{ rowNumber: number; cells: Array<{ address: string; value: string | number | boolean }> }>
  observedHeaderCells: Array<{ address: string; value: string | number | boolean }>
  observedTotalLabels: Array<{ rowNumber: number; addresses: string[]; label: string }>
  readError?: string
}

function boundedSampleRanges(range?: string | null) {
  const bounds = parseSheetRange(range)
  const lastColumn = columnFromIndex(Math.min(bounds.endColumn, 15))
  const topEnd = Math.min(bounds.endRow, 24)
  const ranges = [`A1:${lastColumn}${topEnd}`]
  if (bounds.endRow > topEnd) ranges.push(`A${Math.max(topEnd + 1, bounds.endRow - 11)}:${lastColumn}${bounds.endRow}`)
  return ranges
}

function toWorkbookSample(
  sheet: { name: string; range?: string | null; hidden?: boolean },
  rows: WorkbookCell[][]
): WorkbookSample {
  const sampleRows = rows.flatMap((row) => {
    const cells = row.flatMap((cell) => cell.value === null || cell.value === undefined || cell.value === ''
      ? []
      : [{ address: cell.address, value: cell.value }])
    const rowNumber = Number(row[0]?.address.match(/(\d+)$/)?.[1])
    return cells.length && Number.isInteger(rowNumber) ? [{ rowNumber, cells }] : []
  })
  const searchable = `${sheet.name} ${sampleRows.flatMap((row) => row.cells.map((cell) => String(cell.value))).join(' ')}`
    .replace(/\s+/g, '')
  const keywordGroups = [
    /分部分项|工程量清单|项目编码/,
    /项目名称|材料名称|设备名称/,
    /综合单价|暂估单价|单价\(?元?\)?|价格\(?元?\)?/,
    /工程量|数量|计量单位/,
    /措施项目|材料暂估|合价|金额/
  ]
  const score = keywordGroups.reduce((total, pattern) => total + (pattern.test(searchable) ? 1 : 0), 0)
  const observedHeaderCells = sampleRows
    .flatMap((row) => row.cells)
    .filter((cell) => /项目编码|项目名称|材料名称|设备名称|项目特征|规格|型号|材质|计量单位|单位|工程量|数量|综合单价|暂估单价|单价|合价|金额/.test(String(cell.value).replace(/\s+/g, '')))
    .slice(0, 40)
  const observedTotalLabels = sampleRows.flatMap((row) => {
    const labels = row.cells.filter((cell) => /^(?:本页|页)?小计[:：]?$|^(?:合计|总计)[:：]?$/.test(String(cell.value).replace(/\s+/g, '')))
    return labels.length ? [{ rowNumber: row.rowNumber, addresses: labels.map((cell) => cell.address), label: labels.map((cell) => String(cell.value)).join(' / ') }] : []
  })
  return {
    name: sheet.name,
    range: sheet.range ?? null,
    hidden: Boolean(sheet.hidden),
    score,
    sampleRows,
    observedHeaderCells,
    observedTotalLabels
  }
}

function workbookMappingContract() {
  return {
    bill: {
      requiredColumns: ['name', 'quantity', 'unitPrice', 'amount'],
      targetRule: 'unitPrice and amount must be two distinct blank target columns.'
    },
    material: {
      requiredColumns: ['name', 'quantity', 'unitPrice', 'amount'],
      targetRule: 'unitPrice and amount must be two distinct blank target columns.'
    },
    measure: {
      requiredColumns: ['name', 'unitPrice'],
      targetRule: 'When only one blank price column exists, map it as unitPrice and omit amount.'
    },
    totals: {
      evidenceRule: 'Map totals only for explicit observed 小计/合计/总计 labels; otherwise omit totals.',
      subtotalRule: 'Each startRow..endRow must stay inside dataStartRow..dataEndRow, ranges cannot overlap, and targetRow must be outside its own range. For a trailing subtotal, endRow = targetRow - 1.',
      finalTotalRule: 'A direct finalTotalRow must be outside the data rows it sums; normally dataEndRow = finalTotalRow - 1.'
    }
  }
}

function validateWorkbookMappings(
  sheets: Array<{ name: string; range?: string | null }>,
  input: XpertSheetMapping[]
) {
  let parsed: XpertSheetMapping[]
  try {
    parsed = parseXpertSheetMappings(input)
  } catch (error) {
    throw new BadRequestException(`Invalid AI sheet mapping: ${error instanceof Error ? error.message : 'invalid mapping'}`)
  }
  const catalog = new Map(sheets.map((sheet) => [sheet.name, sheet]))
  const sheetNames = new Set<string>()
  const roles = new Set<string>()
  let totalCells = 0
  for (const mapping of parsed) {
    if (sheetNames.has(mapping.sheetName)) throw new BadRequestException(`Worksheet ${mapping.sheetName} is mapped more than once.`)
    sheetNames.add(mapping.sheetName)
    const role = `${mapping.discipline}:${mapping.kind}`
    if (roles.has(role)) throw new BadRequestException(`Quotation role ${role} is mapped more than once.`)
    roles.add(role)
    const sheet = catalog.get(mapping.sheetName)
    if (!sheet) throw new BadRequestException(`AI mapped worksheet "${mapping.sheetName}", but that exact sheet does not exist in the current workbook.`)
    const bounds = parseSheetRange(sheet.range)
    const maxColumnIndex = columnToIndex(maxMappedColumn(mapping))
    const maxRow = Math.max(mapping.dataEndRow, mapping.totals?.finalTotalRow ?? 0, ...(mapping.totals?.subtotals ?? []).map((subtotal) => subtotal.targetRow))
    if (mapping.headerRow > bounds.endRow || maxRow > bounds.endRow) {
      throw new BadRequestException(`AI mapping for ${mapping.sheetName} points outside used row ${bounds.endRow}.`)
    }
    if (maxColumnIndex > bounds.endColumn) {
      throw new BadRequestException(`AI mapping for ${mapping.sheetName} points outside used column ${columnFromIndex(bounds.endColumn)}.`)
    }
    validateTotals(mapping)
    totalCells += (maxColumnIndex + 1) * maxRow
  }
  if (totalCells > MAX_MAPPING_READ_CELLS) {
    throw new BadRequestException(`AI mappings would read ${totalCells} cells; the limit is ${MAX_MAPPING_READ_CELLS}.`)
  }
  return parsed
}

function validateTotals(mapping: XpertSheetMapping) {
  const intervals = [...(mapping.totals?.subtotals ?? [])].sort((left, right) => left.startRow - right.startRow)
  const targetRows = new Set<number>()
  intervals.forEach((subtotal, index) => {
    if (subtotal.startRow < mapping.dataStartRow || subtotal.endRow > mapping.dataEndRow) {
      throw new BadRequestException(`Subtotal range in ${mapping.sheetName} must stay inside the mapped data rows.`)
    }
    if (subtotal.targetRow >= subtotal.startRow && subtotal.targetRow <= subtotal.endRow) {
      throw new BadRequestException(`Subtotal target row ${subtotal.targetRow} in ${mapping.sheetName} cannot be inside its own SUM range.`)
    }
    if (targetRows.has(subtotal.targetRow)) throw new BadRequestException(`Duplicate subtotal target row in ${mapping.sheetName}.`)
    targetRows.add(subtotal.targetRow)
    if (index && subtotal.startRow <= intervals[index - 1].endRow) {
      throw new BadRequestException(`Subtotal source ranges overlap in ${mapping.sheetName}.`)
    }
  })
  if (mapping.totals?.finalTotalRow && targetRows.has(mapping.totals.finalTotalRow)) {
    throw new BadRequestException(`Final total row duplicates a subtotal target in ${mapping.sheetName}.`)
  }
  if (mapping.totals?.finalTotalRow && !intervals.length && mapping.totals.finalTotalRow >= mapping.dataStartRow && mapping.totals.finalTotalRow <= mapping.dataEndRow) {
    throw new BadRequestException(`Final total row in ${mapping.sheetName} cannot be inside its own direct SUM range.`)
  }
}

function deriveLabeledTotals(mapping: XpertSheetMapping, rows: WorkbookCell[][]): XpertSheetMapping {
  if (mapping.kind === 'material' || mapping.totals?.finalTotalRow) return mapping
  const subtotalRows: number[] = []
  let finalTotalRow: number | undefined
  for (let rowNumber = mapping.dataStartRow; rowNumber <= mapping.dataEndRow; rowNumber += 1) {
    const values = (rows[rowNumber - 1] ?? []).flatMap((cell) => typeof cell.value === 'string' ? [cell.value.replace(/\s+/g, '')] : [])
    if (values.some((value) => /^(?:本页|页)?小计[:：]?$/.test(value))) subtotalRows.push(rowNumber)
    if (values.some((value) => /^(?:合计|总计)[:：]?$/.test(value))) finalTotalRow = rowNumber
  }
  if (!finalTotalRow) return mapping
  const subtotals = subtotalRows.map((targetRow, index) => ({
    startRow: index ? subtotalRows[index - 1] + 1 : mapping.dataStartRow,
    endRow: targetRow - 1,
    targetRow
  })).filter((subtotal) => subtotal.endRow >= subtotal.startRow && subtotal.targetRow !== finalTotalRow)
  return {
    ...mapping,
    dataEndRow: Math.min(mapping.dataEndRow, finalTotalRow - 1),
    totals: {
      ...(subtotals.length ? { subtotals } : {}),
      finalTotalRow
    },
    evidence: [...mapping.evidence, `后端依据明确合计标签识别最终合计行 ${finalTotalRow}${subtotals.length ? `，并识别 ${subtotals.length} 个分页小计` : ''}。`].slice(0, 12)
  }
}

function validateMappedHeaders(mappings: XpertSheetMapping[], reads: Map<string, OfficeReadResult>) {
  for (const mapping of mappings) {
    const rows = reads.get(mapping.sheetName)?.workbook.rows ?? []
    const columns = [mapping.columns.name, mapping.columns.quantity, mapping.columns.unitPrice, mapping.columns.amount]
      .filter((column): column is string => Boolean(column))
    for (const column of columns) {
      let found = false
      for (let rowNumber = mapping.headerRow; rowNumber < mapping.dataStartRow; rowNumber += 1) {
        const value = rows[rowNumber - 1]?.[columnToIndex(column)]?.value
        if (value !== null && value !== undefined && String(value).trim()) found = true
      }
      if (!found) throw new BadRequestException(`AI mapping for ${mapping.sheetName}!${column} has no header evidence between rows ${mapping.headerRow} and ${mapping.dataStartRow - 1}.`)
    }
  }
}

function maxMappedColumn(mapping: XpertSheetMapping) {
  const columns = [
    mapping.columns.code,
    mapping.columns.name,
    ...(mapping.columns.specification ?? []),
    mapping.columns.unit,
    mapping.columns.quantity,
    mapping.columns.unitPrice,
    mapping.columns.amount
  ].filter((column): column is string => Boolean(column))
  return columns.reduce((maximum, column) => columnToIndex(column) > columnToIndex(maximum) ? column : maximum, 'A')
}

function parseSheetRange(range?: string | null) {
  const match = range?.match(/(?:[^!]+!)?\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)/i)
  if (!match) return { endColumn: 0, endRow: 1 }
  return { endColumn: columnToIndex(match[3]), endRow: Number(match[4]) }
}

function columnFromIndex(index: number) {
  let value = index + 1
  let result = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

function mergeQuotaCandidates(candidates: QuotaKnowledgeCandidate[], limit: number) {
  const merged = new Map<string, QuotaKnowledgeCandidate>()
  for (const candidate of candidates) {
    // A platform OCR chunk may contain several packed quota subitems. Keep
    // each parsed quota code as a separate candidate; merging only by chunk
    // would discard all but the highest-ranked subitem and leave the review
    // proposal without the corresponding resources.
    const sourceKey = [candidate.knowledgebaseId, candidate.documentId ?? '', candidate.chunkId ?? candidate.id, candidate.quotaCode ?? ''].join('\u0000')
    const current = merged.get(sourceKey)
    if (!current || quotaCandidateQuality(candidate) > quotaCandidateQuality(current)) merged.set(sourceKey, candidate)
  }
  return [...merged.values()]
    .sort((left, right) => quotaCandidateQuality(right) - quotaCandidateQuality(left) || left.id.localeCompare(right.id))
    .slice(0, limit)
}

function scopeQuotaCandidateSnapshot(candidates: QuotaKnowledgeCandidate[], lineId: string, searchSnapshotId: string) {
  return candidates.map((candidate) => ({
    ...candidate,
    id: `quota_${createHash('sha256')
      .update([lineId, searchSnapshotId, candidate.id].join('\u0000'))
      .digest('hex')
      .slice(0, 40)}`
  }))
}

function quotaCandidateQuality(candidate: QuotaKnowledgeCandidate) {
  const structure = candidate.extractionStatus === 'structured' ? 3 : candidate.extractionStatus === 'partial' ? 2 : 1
  const review = candidate.reviewStatus === 'approved' ? 2 : candidate.reviewStatus === 'unreviewed' ? 1 : 0
  const retrieval = candidate.relevanceScore ?? candidate.score ?? 0
  return structure * 100 + review * 10 + Math.min(1, Math.max(0, retrieval))
}

function requireScope(scope: XpertScope) {
  const tenantId = normalizeOptional(scope.tenantId)
  if (!tenantId) throw new BadRequestException('Tenant scope is required.')
  return {
    tenantId,
    organizationId: normalizeOptional(scope.organizationId),
    workspaceId: normalizeOptional(scope.workspaceId),
    projectId: normalizeOptional(scope.projectId)
  }
}

function scopeWhere(scope: XpertScope) {
  return { tenantId: normalizeOptional(scope.tenantId) ?? '', organizationId: normalizeOptional(scope.organizationId) ?? null }
}

function requireExcelWorkbook(fileName: string, mimeType?: string) {
  const legacyXls = /\.xls$/i.test(fileName) && !/\.xlsx$/i.test(fileName)
  if (!legacyXls && !/\.xlsx$/i.test(fileName)) {
    throw new BadRequestException('Only .xls and .xlsx Excel files are supported.')
  }
  const acceptedMimeTypes = legacyXls
    ? [XLS_MIME_TYPE, 'application/octet-stream']
    : [XLSX_MIME_TYPE, 'application/octet-stream', 'application/zip']
  if (mimeType && !acceptedMimeTypes.includes(mimeType)) {
    throw new BadRequestException(`Uploaded file MIME type is not valid for ${legacyXls ? 'XLS' : 'XLSX'}.`)
  }
}

function sanitizeOfficeFile(file: { fileName: string; filePath?: string; fileUrl: string; mimeType: string; extension: 'xlsx'; versionNumber?: number; size?: number }) {
  return { fileName: file.fileName, filePath: file.filePath, fileUrl: file.fileUrl, mimeType: file.mimeType, extension: file.extension, versionNumber: file.versionNumber, size: file.size }
}

function toQuotationDto(quotation: XpertQuotation) {
  return {
    id: requireId(quotation.id, 'Quotation id'),
    title: quotation.title,
    officeVersionNumber: quotation.officeVersionNumber,
    status: quotation.status,
    matchedCount: quotation.matchedCount,
    reviewCount: quotation.reviewCount,
    unmatchedCount: quotation.unmatchedCount,
    totalAmount: quotation.totalAmount ?? null,
    warnings: quotation.warnings ?? [],
    recognitionConfidence: quotation.recognitionConfidence ?? null,
    recognitionRationale: quotation.recognitionRationale ?? null,
    recognizedAt: quotation.recognizedAt ?? null
  }
}

/** Keep the persisted JSON backward-compatible while removing the retired
 * formula/blocker review sections from Agent and Workbench payloads. */
export function toPublicQuotaBreakdown(proposal: NonNullable<XpertQuotationLine['quotaBreakdown']>) {
  const { blockingReasons: _blockingReasons, pricingFormulaRules: _pricingFormulaRules, automaticPricingAllowed: _automaticPricingAllowed, ...publicProposal } = proposal
  return {
    ...publicProposal,
    components: publicProposal.components.map((component) => {
      const { formulas: _formulas, ...publicComponent } = component
      return publicComponent
    })
  }
}

function toQuotationLineDto(line: XpertQuotationLine) {
  return {
    id: requireId(line.id, 'Quotation line id'),
    sheetName: line.sheetName,
    rowNumber: line.rowNumber,
    discipline: line.discipline,
    kind: line.kind,
    materialReferenceOnly: line.materialReferenceOnly ?? false,
    code: line.code ?? null,
    name: line.name,
    specification: line.specification ?? null,
    unit: line.unit ?? null,
    quantity: line.quantity ?? null,
    quantityAddress: line.quantityAddress ?? null,
    targetPriceAddress: line.targetPriceAddress,
    targetAmountAddress: line.targetAmountAddress ?? null,
    matchStatus: line.matchStatus,
    reviewState: quotationLineReviewState(line),
    matchedUnitPrice: line.matchedUnitPrice ?? null,
    calculatedAmount: line.calculatedAmount ?? null,
    matchEvidence: line.matchEvidence ?? null,
    knowledgeCandidates: line.knowledgeCandidates ?? [],
    knowledgeSearchedAt: line.knowledgeSearchedAt ?? null,
    knowledgeNoMatchReason: line.knowledgeNoMatchReason ?? null,
    knowledgeNoMatchAt: line.knowledgeNoMatchAt ?? null,
    quotaWorkScopes: line.quotaWorkScopes ?? [],
    quotaCandidates: line.quotaCandidates ?? [],
    quotaSearchedAt: line.quotaSearchedAt ?? null,
    quotaBreakdown: line.quotaBreakdown ? toPublicQuotaBreakdown(line.quotaBreakdown) : null,
    quotaPricingResources: line.quotaPricingResources ?? [],
    quotaResourcePrices: line.quotaResourcePrices ?? [],
    pricingCalculation: line.pricingCalculation ?? null,
    aiRecommendedKnowledgeCandidateId: line.aiRecommendedKnowledgeCandidateId ?? null,
    aiRecommendedKnowledgebaseId: line.aiRecommendedKnowledgebaseId ?? null,
    aiRecommendedDocumentId: line.aiRecommendedDocumentId ?? null,
    aiRecommendedChunkId: line.aiRecommendedChunkId ?? null,
    aiMatchedMaterialName: line.aiMatchedMaterialName ?? null,
    aiMatchedSpecification: line.aiMatchedSpecification ?? null,
    aiKnowledgeEvidence: line.aiKnowledgeEvidence ?? null,
    aiRecommendedUnitPrice: line.aiRecommendedUnitPrice ?? null,
    aiRecommendedSourceUnitPrice: line.aiRecommendedSourceUnitPrice ?? null,
    aiRecommendedSourceUnit: line.aiRecommendedSourceUnit ?? null,
    aiUnitConversion: line.aiUnitConversion ?? null,
    aiConfidence: line.aiConfidence ?? null,
    aiRationale: line.aiRationale ?? null,
    aiDifferences: line.aiDifferences ?? [],
    aiSources: line.aiSources ?? [],
    aiRecommendedAt: line.aiRecommendedAt ?? null
  }
}

/** Keep review classification separate from the eventual Excel write state. */
function quotationLineReviewState(line: XpertQuotationLine): 'pending' | 'approved' | 'applied' | 'skipped' {
  if (line.matchStatus === 'applied') return 'applied'
  if (line.matchStatus === 'ignored') return 'skipped'
  if (line.pricingCalculation || line.matchStatus === 'matched' || line.matchStatus === 'confirmed') return 'approved'
  const resources = line.quotaPricingResources ?? []
  if (line.kind === 'bill' && resources.length > 0) {
    const states = new Map((line.quotaResourcePrices ?? []).map((state) => [state.resourceId, state.status]))
    if (resources.every((resource) => ['approved', 'rejected', 'no_match'].includes(states.get(resource.id) ?? ''))) return 'approved'
  }
  return 'pending'
}

function sanitizeOfficeDocument(detail: {
  item?: Record<string, unknown>
  currentSnapshot?: { id?: string; snapshot?: unknown } | null
  document?: Record<string, unknown>
  snapshot?: { id?: string; snapshot?: unknown } | null
}) {
  const item = detail.item ?? detail.document
  const snapshot = detail.currentSnapshot ?? detail.snapshot
  return {
    item: item ? {
      id: item.id,
      title: item.title,
      documentType: item.documentType,
      currentVersionNumber: item.currentVersionNumber,
      currentFileVersionId: item.currentFileVersionId,
      currentFileVersionNumber: item.currentFileVersionNumber
    } : null,
    currentSnapshot: snapshot ? { id: snapshot.id, snapshot: snapshot.snapshot } : null
  }
}

function normalizeOptional(value?: string | null) {
  const normalized = value?.trim()
  return normalized || null
}

function snapshotSheetNames(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return []
  const value = snapshot as { sheetOrder?: unknown; sheets?: Record<string, { name?: unknown }> }
  if (Array.isArray(value.sheetOrder)) {
    return value.sheetOrder
      .map((id) => typeof id === 'string' ? value.sheets?.[id]?.name : undefined)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      .slice(0, 60)
  }
  return Object.values(value.sheets ?? {})
    .map((sheet) => typeof sheet?.name === 'string' ? sheet.name : undefined)
    .filter((name): name is string => Boolean(name?.trim()))
    .slice(0, 60)
}

function normalizeRequired(value: string, message: string) {
  const normalized = value.trim()
  if (!normalized) throw new BadRequestException(message)
  return normalized
}

function requireConfidence(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new BadRequestException(`${label} must be between 0 and 1.`)
  }
  return value
}

function requireId(value: string | undefined, label: string) {
  if (!value) throw new BadRequestException(`${label} is required.`)
  return value
}

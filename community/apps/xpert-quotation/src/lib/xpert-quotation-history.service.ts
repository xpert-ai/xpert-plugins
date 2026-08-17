import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { XpertPriceBook, XpertQuotation, XpertQuotationHistory, XpertQuotationLine } from './entities/index.js'
import { XpertQuotationWorkbookService } from './xpert-quotation-workbook.service.js'
import type {
  XpertQuotationHistoryAction,
  XpertQuotationLineStateSnapshot,
  XpertQuotationStateSnapshot,
  XpertQuotationUndoSnapshot,
  XpertScope,
} from './types.js'

@Injectable()
export class XpertQuotationHistoryService {
  constructor(
    @InjectRepository(XpertQuotation) private readonly quotationRepository: Repository<XpertQuotation>,
    @InjectRepository(XpertPriceBook) private readonly priceBookRepository: Repository<XpertPriceBook>,
    @InjectRepository(XpertQuotationLine) private readonly lineRepository: Repository<XpertQuotationLine>,
    @InjectRepository(XpertQuotationHistory) private readonly historyRepository: Repository<XpertQuotationHistory>,
    private readonly workbookService: XpertQuotationWorkbookService
  ) {}

  async captureQuotation(scope: XpertScope, quotationId: string, lineIds?: string[]): Promise<XpertQuotationUndoSnapshot> {
    const quotation = await this.requireQuotation(scope, quotationId)
    const lines = await this.lineRepository.find({
      where: {
        ...scopeWhere(scope),
        quotationId,
        ...(lineIds?.length ? { id: In([...new Set(lineIds)]) } : {})
      },
      order: { sheetName: 'ASC', rowNumber: 'ASC' }
    })
    return {
      quotation: quotationSnapshot(quotation),
      lines: lines.map(lineSnapshot),
      replaceAllLines: !lineIds
    }
  }

  async recordState(
    scope: XpertScope,
    action: XpertQuotationHistoryAction,
    quotationId: string,
    snapshot: XpertQuotationUndoSnapshot
  ) {
    return this.historyRepository.save(this.historyRepository.create({
      ...historyScope(scope),
      action,
      quotationId,
      snapshot,
      undoneAt: null
    }))
  }

  async recordResource(
    scope: XpertScope,
    action: 'import_quotation' | 'import_price_book' | 'delete_quotation' | 'delete_price_book',
    input: { quotationId?: string; priceBookId?: string }
  ) {
    return this.historyRepository.save(this.historyRepository.create({
      ...historyScope(scope),
      action,
      quotationId: input.quotationId ?? null,
      priceBookId: input.priceBookId ?? null,
      snapshot: null,
      undoneAt: null
    }))
  }

  async deleteQuotation(scope: XpertScope, quotationId: string) {
    await this.requireQuotation(scope, quotationId)
    await this.quotationRepository.softDelete({ ...scopeWhere(scope), id: quotationId })
    await this.recordResource(scope, 'delete_quotation', { quotationId })
    return { deleted: true, quotationId, recoverable: true }
  }

  async deletePriceBook(scope: XpertScope, priceBookId: string) {
    await this.requirePriceBook(scope, priceBookId)
    const linkedQuotationCount = await this.quotationRepository.count({
      where: { ...scopeWhere(scope), priceBookId }
    })
    if (linkedQuotationCount) {
      throw new BadRequestException('Price book is used by an active quotation. Delete that quotation or select another price book first.')
    }
    await this.priceBookRepository.softDelete({ ...scopeWhere(scope), id: priceBookId })
    await this.recordResource(scope, 'delete_price_book', { priceBookId })
    return { deleted: true, priceBookId, recoverable: true }
  }

  async getUndoAvailability(scope: XpertScope) {
    const history = await this.latestUndoable(scope)
    return history ? {
      available: true,
      action: history.action,
      createdAt: history.createdAt ?? null
    } : { available: false, action: null, createdAt: null }
  }

  async undoLast(scope: XpertScope) {
    const history = await this.latestUndoable(scope)
    if (!history?.id) throw new BadRequestException('There is no operation to undo.')

    if (history.action === 'import_quotation') {
      await this.quotationRepository.softDelete({ ...scopeWhere(scope), id: requiredId(history.quotationId, 'Quotation id') })
    } else if (history.action === 'delete_quotation') {
      await this.quotationRepository.restore({ ...scopeWhere(scope), id: requiredId(history.quotationId, 'Quotation id') })
    } else if (history.action === 'import_price_book') {
      await this.priceBookRepository.softDelete({ ...scopeWhere(scope), id: requiredId(history.priceBookId, 'Price book id') })
    } else if (history.action === 'delete_price_book') {
      await this.priceBookRepository.restore({ ...scopeWhere(scope), id: requiredId(history.priceBookId, 'Price book id') })
    } else {
      await this.restoreQuotationSnapshot(scope, history.action, history.snapshot)
    }

    await this.historyRepository.save({ ...history, undoneAt: new Date() })
    return {
      undone: true,
      action: history.action,
      quotationId: history.quotationId ?? null,
      priceBookId: history.priceBookId ?? null
    }
  }

  private async restoreQuotationSnapshot(
    scope: XpertScope,
    action: XpertQuotationHistoryAction,
    snapshot?: XpertQuotationUndoSnapshot | null
  ) {
    if (!snapshot) throw new BadRequestException('The previous operation has no recoverable state.')
    const current = await this.quotationRepository.findOne({
      where: { ...scopeWhere(scope), id: snapshot.quotation.id },
      withDeleted: true
    })
    if (!current) throw new NotFoundException('Quotation was not found for undo.')

    let restoredFileVersionId = snapshot.quotation.officeFileVersionId ?? null
    let restoredVersionNumber = snapshot.quotation.officeVersionNumber
    if (requiresOfficeRestore(action) && current.officeVersionNumber !== snapshot.quotation.officeVersionNumber) {
      if (!snapshot.quotation.officeFileVersionId) {
        throw new BadRequestException('The previous Excel file version is unavailable for undo.')
      }
      const restored = await this.workbookService.restoreExcelVersion(scope, {
        documentId: current.officeDocumentId,
        versionId: snapshot.quotation.officeFileVersionId,
        expectedVersionNumber: current.officeVersionNumber,
        changeSummary: '撤回报价插件上一步工作簿操作。'
      })
      restoredFileVersionId = restored.fileVersion.id
      restoredVersionNumber = restored.fileVersion.versionNumber
    }

    await this.quotationRepository.save({
      ...current,
      ...restoreQuotationState(snapshot.quotation),
      officeFileVersionId: restoredFileVersionId,
      officeVersionNumber: restoredVersionNumber,
      deletedAt: null
    })
    if (snapshot.replaceAllLines) {
      await this.lineRepository.delete({ ...scopeWhere(scope), quotationId: snapshot.quotation.id })
    }
    if (snapshot.lines.length) {
      await this.lineRepository.save(snapshot.lines.map((line) => this.lineRepository.create(restoreLineState(line))))
    }
  }

  private async latestUndoable(scope: XpertScope) {
    return this.historyRepository.findOne({
      where: {
        ...scopeWhere(scope),
        undoneAt: IsNull(),
        ...(normalizeOptional(scope.userId) ? { createdById: normalizeOptional(scope.userId) } : {})
      },
      order: { createdAt: 'DESC', id: 'DESC' }
    })
  }

  private async requireQuotation(scope: XpertScope, id: string) {
    const item = await this.quotationRepository.findOne({ where: { ...scopeWhere(scope), id } })
    if (!item) throw new NotFoundException('Quotation was not found.')
    return item
  }

  private async requirePriceBook(scope: XpertScope, id: string) {
    const item = await this.priceBookRepository.findOne({ where: { ...scopeWhere(scope), id } })
    if (!item) throw new NotFoundException('Price book was not found.')
    return item
  }

}

function quotationSnapshot(quotation: XpertQuotation): XpertQuotationStateSnapshot {
  return {
    id: requiredId(quotation.id, 'Quotation id'),
    officeDocumentId: quotation.officeDocumentId,
    officeFileVersionId: quotation.officeFileVersionId ?? null,
    officeVersionNumber: quotation.officeVersionNumber,
    priceBookId: quotation.priceBookId ?? null,
    status: quotation.status,
    matchedCount: quotation.matchedCount,
    reviewCount: quotation.reviewCount,
    unmatchedCount: quotation.unmatchedCount,
    totalAmount: quotation.totalAmount ?? null,
    warnings: quotation.warnings ?? null,
    sheetMappings: quotation.sheetMappings ?? null,
    recognitionConfidence: quotation.recognitionConfidence ?? null,
    recognitionRationale: quotation.recognitionRationale ?? null,
    recognizedAt: quotation.recognizedAt?.toISOString() ?? null
  }
}

function lineSnapshot(line: XpertQuotationLine): XpertQuotationLineStateSnapshot {
  return {
    id: requiredId(line.id, 'Quotation line id'),
    tenantId: line.tenantId,
    organizationId: line.organizationId ?? null,
    quotationId: line.quotationId,
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
    matchedPriceItemId: line.matchedPriceItemId ?? null,
    matchedUnitPrice: line.matchedUnitPrice ?? null,
    calculatedAmount: line.calculatedAmount ?? null,
    candidateIds: line.candidateIds ?? null,
    matchEvidence: line.matchEvidence ?? null,
    aiRecommendedPriceItemId: line.aiRecommendedPriceItemId ?? null,
    knowledgeCandidates: line.knowledgeCandidates ?? null,
    knowledgeSearchedAt: line.knowledgeSearchedAt?.toISOString() ?? null,
    knowledgeNoMatchReason: line.knowledgeNoMatchReason ?? null,
    knowledgeNoMatchAt: line.knowledgeNoMatchAt?.toISOString() ?? null,
    quotaWorkScopes: line.quotaWorkScopes ?? null,
    quotaCandidates: line.quotaCandidates ?? null,
    quotaSearchedAt: line.quotaSearchedAt?.toISOString() ?? null,
    quotaBreakdown: line.quotaBreakdown ?? null,
    quotaPricingResources: line.quotaPricingResources ?? null,
    quotaResourcePrices: line.quotaResourcePrices ?? null,
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
    aiDifferences: line.aiDifferences ?? null,
    aiSources: line.aiSources ?? null,
    aiRecommendedAt: line.aiRecommendedAt?.toISOString() ?? null
  }
}

function restoreQuotationState(snapshot: XpertQuotationStateSnapshot) {
  return {
    priceBookId: snapshot.priceBookId ?? null,
    status: snapshot.status,
    matchedCount: snapshot.matchedCount,
    reviewCount: snapshot.reviewCount,
    unmatchedCount: snapshot.unmatchedCount,
    totalAmount: snapshot.totalAmount ?? null,
    warnings: snapshot.warnings ?? null,
    sheetMappings: snapshot.sheetMappings ?? null,
    recognitionConfidence: snapshot.recognitionConfidence ?? null,
    recognitionRationale: snapshot.recognitionRationale ?? null,
    recognizedAt: snapshot.recognizedAt ? new Date(snapshot.recognizedAt) : null
  }
}

function restoreLineState(snapshot: XpertQuotationLineStateSnapshot): XpertQuotationLine {
  return {
    ...snapshot,
    materialReferenceOnly: snapshot.materialReferenceOnly ?? false,
    knowledgeSearchedAt: snapshot.knowledgeSearchedAt ? new Date(snapshot.knowledgeSearchedAt) : null,
    knowledgeNoMatchAt: snapshot.knowledgeNoMatchAt ? new Date(snapshot.knowledgeNoMatchAt) : null,
    quotaSearchedAt: snapshot.quotaSearchedAt ? new Date(snapshot.quotaSearchedAt) : null,
    aiRecommendedAt: snapshot.aiRecommendedAt ? new Date(snapshot.aiRecommendedAt) : null
  }
}

function requiresOfficeRestore(action: XpertQuotationHistoryAction) {
  return action === 'save_workbook' || action === 'apply_workbook'
}

function historyScope(scope: XpertScope) {
  const tenantId = normalizeOptional(scope.tenantId)
  if (!tenantId) throw new BadRequestException('Tenant scope is required.')
  return {
    tenantId,
    organizationId: normalizeOptional(scope.organizationId),
    createdById: normalizeOptional(scope.userId)
  }
}

function scopeWhere(scope: XpertScope) {
  return {
    tenantId: normalizeOptional(scope.tenantId) ?? '',
    organizationId: normalizeOptional(scope.organizationId) ?? null
  }
}

function normalizeOptional(value?: string | null) {
  const normalized = value?.trim()
  return normalized || null
}

function requiredId(value: string | undefined | null, label: string) {
  if (!value) throw new BadRequestException(`${label} is required.`)
  return value
}

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { EntityManager } from 'typeorm'
import { ProcurementComparisonCase, ProcurementSourceDocument, ProcurementSupplierQuote } from './entities/index.js'
import { digestSnapshot } from './event-journal.js'
import type { ProcurementScope, SaveSupplierQuoteExtractionInput } from './types.js'

/** The original extraction is frozen until the case buyer selects its series in the workbench. */
export interface QuoteSeriesReview {
  id: string
  input: SaveSupplierQuoteExtractionInput
  conversationId: string | null
  threadId: string | null
  confirmedSeries: string | null
  inputMessageId: string | null
}

export function isSeriesReviewer(scope: ProcurementScope, c: ProcurementComparisonCase) {
  return !!scope.workspaceId && !!scope.organizationId && !!scope.userId && c.createdById === scope.userId && c.tenantId === scope.tenantId &&
    (c.organizationId ?? null) === (scope.organizationId ?? null) &&
    (c.workspaceId ?? null) === (scope.workspaceId ?? null) &&
    (c.projectId ?? null) === (scope.projectId ?? null) && (!scope.assistantId || c.xpertId === scope.assistantId)
}

function reviewDocuments(tx: EntityManager, caseId: string) {
  return tx.createQueryBuilder(ProcurementSourceDocument, 'doc')
    .addSelect('doc.seriesReview')
    .where('doc.caseId = :caseId AND doc.role = :role', { caseId, role: 'supplier_quote' })
}

function pendingDocuments(tx: EntityManager, caseId: string, inputMessageId?: string) {
  return reviewDocuments(tx, caseId)
    .andWhere(`doc."seriesReview" IS NOT NULL AND
      (doc."seriesReview"->>'confirmedSeries' IS NULL OR doc."seriesReview"->>'inputMessageId' = :inputMessageId)`, { inputMessageId: inputMessageId ?? null })
    .orderBy('doc.createdAt', 'ASC').addOrderBy('doc.id', 'ASC')
}

async function candidates(tx: EntityManager, doc: ProcurementSourceDocument) {
  const qb = tx.createQueryBuilder(ProcurementSupplierQuote, 'q')
    .innerJoin(ProcurementSourceDocument, 'source', 'source.id = q.documentId AND source.caseId = q.caseId')
    .select('q.id', 'seriesId').addSelect('q.supplierName', 'supplier').addSelect('source.name', 'file')
    .addSelect('q.deliveryTime', 'deliveryTime')
    .where('q.caseId = :caseId AND (q.eventQuoteSeriesId IS NULL OR q.eventQuoteSeriesId = q.id)', { caseId: doc.caseId })
  if (doc.supplierQuoteId) {
    qb.andWhere('q.id = (SELECT coalesce(existing."eventQuoteSeriesId", existing.id) FROM plugin_procurement_supplier_quote existing WHERE existing.id = :quote AND existing."caseId" = :caseId)',
      { quote: doc.supplierQuoteId })
  }
  return qb.orderBy('q.supplierName').addOrderBy('q.id')
    .getRawMany<{ seriesId: string; supplier: string; file: string; deliveryTime: string | null }>()
}

async function presentation(tx: EntityManager, doc: ProcurementSourceDocument) {
  const review = doc.seriesReview!
  return {
    status: 'quote_series_confirmation_required' as const,
    requestId: review.id, documentId: doc.id!, file: doc.name, supplier: review.input.supplierName,
    requestedSeries: review.input.quoteSeriesId!, proposedDate: review.input.deliveryTime ?? null,
    candidates: await candidates(tx, doc)
  }
}

export class QuoteSeriesConfirmationRequired extends Error {
  constructor(readonly review: Awaited<ReturnType<typeof presentation>>) { super('quote_series_mismatch') }
}

export async function listSeriesReviews(tx: EntityManager, caseId: string) {
  return Promise.all((await pendingDocuments(tx, caseId).getMany()).map(doc => presentation(tx, doc)))
}

// The caller holds the case lock through conflict capture, or through the normal quote write.
export async function checkQuoteSeries(tx: EntityManager, scope: ProcurementScope, c: ProcurementComparisonCase,
  input: SaveSupplierQuoteExtractionInput): Promise<SaveSupplierQuoteExtractionInput | QuoteSeriesConfirmationRequired> {
  const doc = input.documentId
    ? await reviewDocuments(tx, input.caseId).andWhere('doc.id = :id', { id: input.documentId }).getOne()
    : await pendingDocuments(tx, input.caseId, scope.inputMessageId).getOne()
  if (!doc) {
    if (input.documentId || input.quoteSeriesId) throw new NotFoundException('quote_document_mismatch')
    return input
  }
  const review = doc.seriesReview
  if (review && !review.confirmedSeries) {
    if (!isSeriesReviewer(scope, c)) throw new ForbiddenException('quote_series_buyer_required')
    return new QuoteSeriesConfirmationRequired(await presentation(tx, doc))
  }
  if (review?.confirmedSeries && scope.inputMessageId && review.inputMessageId === scope.inputMessageId) {
    const approved = { ...review.input, quoteSeriesId: review.confirmedSeries }
    if (digestSnapshot(input) !== digestSnapshot(review.input) && digestSnapshot(input) !== digestSnapshot(approved))
      throw new ConflictException('quote_series_review_input_changed')
  }
  if (!input.quoteSeriesId) return input
  if (review?.confirmedSeries && digestSnapshot(input) === digestSnapshot(review.input)) {
    if (!isSeriesReviewer(scope, c)) throw new ForbiddenException('quote_series_buyer_required')
    return { ...input, quoteSeriesId: review.confirmedSeries }
  }
  const choices = await candidates(tx, doc)
  if (choices.some(q => q.seriesId === input.quoteSeriesId && q.supplier === input.supplierName.trim())) return input
  if (!isSeriesReviewer(scope, c) || c.status === 'completed') throw new ForbiddenException('quote_series_buyer_required')
  doc.seriesReview = { id: randomUUID(), input, conversationId: scope.conversationId ?? null,
    threadId: scope.threadId ?? null, inputMessageId: scope.inputMessageId ?? null, confirmedSeries: null }
  await tx.update(ProcurementSourceDocument, doc.id!, { seriesReview: doc.seriesReview })
  return new QuoteSeriesConfirmationRequired(await presentation(tx, doc))
}

export async function readSeriesSelection(tx: EntityManager, caseId: string, documentId: string, requestId: string, seriesId: string) {
  const doc = await reviewDocuments(tx, caseId).andWhere('doc.id = :documentId', { documentId }).getOne()
  const review = doc?.seriesReview
  if (!review || review.id !== requestId) throw new ForbiddenException('quote_series_request_changed')
  if (review.confirmedSeries ? review.confirmedSeries !== seriesId : !(await candidates(tx, doc!)).some(q => q.seriesId === seriesId))
    throw new ForbiddenException('quote_series_selection_changed')
  return review
}

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { IsNull, Repository } from 'typeorm'
import { z } from 'zod'
import { BusinessError, humanLinesSchema, linesSchema, parseInput, requireScope, type Catalog, type ProposalLine, type Scope } from './contracts.js'
import { QuotationDraft, draftDto } from './draft.entity.js'
import { PricingService } from './pricing.service.js'
import { OcrService, validateImage } from './ocr.service.js'
import { sourceCategories } from './business-rules.js'
import { sourceRows, validateProposal } from './proposal-validation.js'

export const createSchema = z.object({ title: z.string().trim().min(1).max(120), inquiry: z.string().trim().min(1).max(8000), requestId: z.string().uuid() }).strict()
export const revisionSchema = z.number().int().positive()
export type AnalysisSnapshot = { revision: number; attemptId: string }
function sameLines(left: ProposalLine[], right: ProposalLine[]) {
  const keys = ['category', 'productName', 'specification', 'quantityCartons', 'priceMarker', 'gradeRaw', 'evidence'] as const
  return left.length === right.length && left.every((line, index) => keys.every((key) => line[key] === right[index][key]))
}

@Injectable()
export class QuotationService {
  constructor(@InjectRepository(QuotationDraft) private readonly drafts: Repository<QuotationDraft>, private readonly pricing: PricingService, private readonly ocr: OcrService) {}

  private scopeWhere(scope: Scope) {
    requireScope(scope)
    return { tenantId: scope.tenantId, organizationId: scope.organizationId ?? IsNull(), createdById: scope.userId, assistantId: scope.assistantId }
  }

  async get(scope: Scope, id: string): Promise<QuotationDraft> {
    parseInput(z.string().uuid(), id)
    const record = await this.drafts.findOneBy({ ...this.scopeWhere(scope), id })
    if (!record) throw new BusinessError('not_found')
    return record
  }

  private async update(scope: Scope, old: QuotationDraft, patch: Partial<QuotationDraft>) {
    const result = await this.drafts.update({ ...this.scopeWhere(scope), id: old.id, revision: old.revision }, { ...patch, revision: old.revision + 1 })
    if (result.affected !== 1) throw new BusinessError('conflict')
    return this.get(scope, old.id)
  }

  async workbench(scope: Scope, selectedId?: string) {
    // shortcut: show the newest 50 records, add pagination when this interview-sized dataset grows.
    const records = await this.drafts.find({
      select: ['id', 'title', 'status', 'revision', 'createdAt', 'updatedAt'],
      where: this.scopeWhere(scope), order: { updatedAt: 'DESC' }, take: 50
    })
    const id = selectedId || records[0]?.id
    const selected = id ? await this.get(scope, id) : null
    let catalog: Catalog | null = null
    let serviceError: string | null = null
    try { catalog = await this.pricing.catalog() } catch { serviceError = 'pricing_unavailable' }
    return {
      catalog, serviceError,
      records: records.map(({ id, title, status, revision, createdAt, updatedAt }) => ({ id, title, status, revision, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() })),
      selected: selected ? draftDto(selected) : null
    }
  }

  async create(scope: Scope, value: unknown) {
    const input = parseInput(createSchema, value)
    const where = this.scopeWhere(scope)
    const existing = await this.drafts.findOneBy({ ...where, id: input.requestId })
    if (existing) {
      if (existing.title !== input.title || existing.inquiry !== input.inquiry) throw new BusinessError('conflict')
      return existing
    }
    const catalog = await this.pricing.catalog()
    const draft = this.drafts.create({
      id: input.requestId, tenantId: scope.tenantId, organizationId: scope.organizationId, createdById: scope.userId,
      assistantId: scope.assistantId, title: input.title, inquiry: input.inquiry, status: 'draft', revision: 1,
      catalogVersion: catalog.catalogVersion, lines: [], quote: null, errorCode: null, source: null, modelRequests: 0,
      attemptId: null, retryAt: null, confirmedById: null, confirmedAt: null
    })
    try { await this.drafts.insert(draft) } catch (error) {
      const raced = await this.drafts.findOneBy({ ...where, id: input.requestId })
      if (raced && raced.title === input.title && raced.inquiry === input.inquiry) return raced
      if (raced) throw new BusinessError('conflict')
      throw error
    }
    return this.get(scope, draft.id)
  }

  async createImage(scope: Scope, value: unknown, file: { buffer: Buffer; mimetype: string; originalname: string }) {
    const input = parseInput(createSchema.omit({ inquiry: true }), value)
    const source = validateImage(file)
    const where = this.scopeWhere(scope)
    const existing = await this.drafts.findOneBy({ ...where, id: input.requestId })
    if (existing) {
      if (existing.title !== input.title || existing.source?.sha256 !== source.sha256) throw new BusinessError('conflict')
      return existing
    }
    const catalog = await this.pricing.catalog()
    const draft = this.drafts.create({ id: input.requestId, tenantId: scope.tenantId, organizationId: scope.organizationId,
      createdById: scope.userId, assistantId: scope.assistantId, title: input.title, inquiry: '', source,
      status: 'ocr_pending', revision: 1, modelRequests: 0, catalogVersion: catalog.catalogVersion,
      lines: [], quote: null, errorCode: null, attemptId: null, retryAt: new Date(Date.now() + 120_000), confirmedById: null, confirmedAt: null })
    try { await this.drafts.insert(draft) } catch (error) {
      const raced = await this.drafts.findOneBy({ ...where, id: input.requestId })
      if (raced?.source?.sha256 === source.sha256 && raced.title === input.title) return raced
      if (raced) throw new BusinessError('conflict')
      throw error
    }
    return this.runOcr(scope, await this.get(scope, draft.id))
  }

  private async runOcr(scope: Scope, draft: QuotationDraft) {
    if (!draft.source) throw new BusinessError('invalid_image')
    let result: { text: string; warnings: string[] }
    try { result = await this.ocr.recognize(scope, draft.source) } catch (error) {
      return this.update(scope, draft, { status: 'ocr_failed', retryAt: null,
        errorCode: error instanceof BusinessError ? error.code : 'ocr_failed' })
    }
    return this.update(scope, draft, { source: { ...draft.source, ocrText: result.text, warnings: result.warnings },
      inquiry: result.text, status: 'draft', retryAt: null, errorCode: null })
  }

  async retryOcr(scope: Scope, id: string, revision: number) {
    const old = await this.get(scope, id)
    if (old.revision !== revision) throw new BusinessError('conflict')
    if (!old.source || !['ocr_failed', 'ocr_pending'].includes(old.status)) throw new BusinessError('invalid_input')
    if (old.status === 'ocr_pending' && old.retryAt && old.retryAt.getTime() > Date.now()) throw new BusinessError('ocr_pending')
    const draft = await this.update(scope, old, { status: 'ocr_pending', retryAt: new Date(Date.now() + 120_000), errorCode: null })
    return this.runOcr(scope, draft)
  }

  async saveInquiry(scope: Scope, id: string, revision: number, inquiry: string) {
    const text = parseInput(createSchema.shape.inquiry, inquiry)
    const old = await this.get(scope, id)
    if (old.revision !== revision) throw new BusinessError('conflict')
    if (['quoted', 'ocr_pending'].includes(old.status)) throw new BusinessError('invalid_input')
    const catalog = await this.pricing.catalog()
    return this.update(scope, old, { inquiry: text, status: 'draft', lines: [], quote: null, errorCode: null,
      catalogVersion: catalog.catalogVersion, attemptId: null, retryAt: null, modelRequests: 0 })
  }

  async analyze(scope: Scope, id: string, revision: number) {
    const old = await this.get(scope, id)
    if (old.status === 'quoted') throw new BusinessError('already_quoted')
    if (['ocr_pending', 'ocr_failed'].includes(old.status) || !old.inquiry.trim()) throw new BusinessError('invalid_input')
    if (old.revision !== revision) throw new BusinessError('conflict')
    let draft = old
    if (old.status !== 'analyzing' || !old.retryAt || old.retryAt.getTime() <= Date.now()) {
      const catalog = await this.pricing.catalog()
      draft = await this.update(scope, old, {
        status: 'analyzing', attemptId: randomUUID(), retryAt: new Date(Date.now() + 120_000),
        catalogVersion: catalog.catalogVersion, lines: [], quote: null, errorCode: null, modelRequests: 0
      })
    }
    return { draft: draftDto(draft), chatMessage: `请处理询价记录 draftId=${draft.id}，本次请求 attemptId=${draft.attemptId}。读取已保存的原始询价与当前无价目录，提出有原文依据的商品和箱数候选供人工核对；无法确定时报告失败，不猜测，也不确认报价。` }
  }

  async readForAgent(scope: Scope, id: string, attemptId: string) {
    const draft = await this.get(scope, id)
    if (draft.status !== 'analyzing' || !draft.attemptId) throw new BusinessError('analysis_pending')
    if (draft.attemptId !== attemptId) throw new BusinessError('conflict')
    if (!draft.retryAt || draft.retryAt.getTime() <= Date.now()) throw new BusinessError('analysis_expired')
    const catalog = await this.pricing.catalog()
    if (catalog.catalogVersion !== draft.catalogVersion) throw new BusinessError('stale_catalog')
    const allowed = sourceCategories(draft.inquiry)
    return { snapshot: { revision: draft.revision, attemptId: draft.attemptId }, data: {
      id: draft.id, inquiry: draft.inquiry, status: draft.status, catalogVersion: draft.catalogVersion,
      sourceRows: sourceRows(draft.inquiry), catalog: { ...catalog, products: catalog.products.filter((product) => allowed.includes(product.category)) }
    } }
  }

  async reserveModelRequest(scope: Scope, id: string, snapshot: AnalysisSnapshot) {
    const old = await this.get(scope, id)
    this.checkAnalysis(old, snapshot)
    // Image recognition already used one request; never spend an extra tool-followup request on it.
    if (old.modelRequests >= (old.source ? 1 : 2)) throw new BusinessError('model_budget_exhausted')
    const result = await this.drafts.update({ ...this.scopeWhere(scope), id, revision: old.revision,
      attemptId: snapshot.attemptId, modelRequests: old.modelRequests }, { modelRequests: old.modelRequests + 1 })
    if (result.affected !== 1) throw new BusinessError('conflict')
  }

  async catalogForAgent(scope: Scope) {
    requireScope(scope)
    return this.pricing.catalog()
  }

  async saveProposal(scope: Scope, id: string, value: unknown, snapshot: AnalysisSnapshot) {
    const lines = parseInput(linesSchema, value)
    const old = await this.get(scope, id)
    if (old.status === 'review' && old.attemptId === snapshot.attemptId && sameLines(old.lines, lines)) return old
    this.checkAnalysis(old, snapshot)
    const catalog = await this.pricing.catalog()
    if (catalog.catalogVersion !== old.catalogVersion) throw new BusinessError('stale_catalog')
    validateProposal(lines, catalog, old.inquiry)
    this.pricing.validate(lines)
    return this.update(scope, old, { lines, status: 'review', errorCode: null, retryAt: null })
  }

  private checkAnalysis(draft: QuotationDraft, snapshot: AnalysisSnapshot) {
    if (draft.status !== 'analyzing' || draft.revision !== snapshot.revision || draft.attemptId !== snapshot.attemptId) throw new BusinessError('conflict')
    if (!draft.retryAt || draft.retryAt.getTime() <= Date.now()) throw new BusinessError('analysis_expired')
  }

  async reportFailure(scope: Scope, id: string, snapshot: AnalysisSnapshot, errorCode = 'analysis_failed') {
    const old = await this.get(scope, id)
    this.checkAnalysis(old, snapshot)
    return this.update(scope, old, { status: 'failed', errorCode, retryAt: null })
  }

  async saveLines(scope: Scope, id: string, revision: number, value: unknown) {
    const lines = parseInput(humanLinesSchema, value)
    const old = await this.get(scope, id)
    if (old.status !== 'review') throw new BusinessError('invalid_input')
    if (old.revision !== revision) throw new BusinessError('conflict')
    const catalog = await this.pricing.catalog()
    if (catalog.catalogVersion !== old.catalogVersion) throw new BusinessError('stale_catalog')
    this.pricing.validate(lines)
    return this.update(scope, old, { lines, quote: null, errorCode: null })
  }

  async confirm(scope: Scope, id: string, revision: number, value: unknown) {
    const lines = parseInput(humanLinesSchema, value)
    const old = await this.get(scope, id)
    if (old.status === 'quoted' && sameLines(old.lines, lines)) return old
    if (old.status !== 'review' || old.revision !== revision) throw new BusinessError('conflict')
    try {
      const quote = await this.pricing.quote(old.catalogVersion, lines)
      return await this.update(scope, old, { lines, quote, status: 'quoted', errorCode: null, confirmedById: scope.userId, confirmedAt: new Date() })
    } catch (error) {
      if (error instanceof BusinessError && ['pricing_unavailable', 'stale_catalog', 'invalid_proposal', 'not_found_product', 'ambiguous_product', 'no_priced_products'].includes(error.code)) {
        await this.update(scope, old, { lines, errorCode: error.code })
      }
      throw error
    }
  }
}

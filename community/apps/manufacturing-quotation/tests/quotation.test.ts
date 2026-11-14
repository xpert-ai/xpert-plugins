import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { DataType, newDb } from 'pg-mem'
import type { DataSource, Repository } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BusinessError, type Catalog, type ProposalLine, type Quote, type Scope } from '../src/contracts.js'
import { QuotationDraft, draftDto } from '../src/draft.entity.js'
import type { OcrService } from '../src/ocr.service.js'
import { PricingService } from '../src/pricing.service.js'
import { QuotationService } from '../src/quotation.service.js'

const owner: Scope = {
  tenantId: 'tenant-1', organizationId: 'organization-1', userId: 'user-1', assistantId: 'assistant-1'
}
const productA: Catalog['products'][number] = {
  id: 'demo-elbow-25-a', category: '玛钢', productName: '90°弯头', specification: '25', priceMarker: 'a', aliases: [], status: 'enabled'
}
const productB: Catalog['products'][number] = { ...productA, id: 'demo-tee-25-b', productName: '三通', priceMarker: 'b' }
const catalog: Catalog = { catalogVersion: 'a'.repeat(64), synthetic: true, products: [productA, productB] }
const lineA: ProposalLine = {
  category: '玛钢', productName: '90°弯头', specification: '25', quantityCartons: 2,
  priceMarker: 'a', gradeRaw: '黑袋', evidence: '90°弯头 25 2箱 黑袋'
}
const lineB: ProposalLine = { ...lineA, productName: '三通', quantityCartons: 1, priceMarker: 'b', gradeRaw: '', evidence: '三通 25 1箱' }
const inquiry = lineA.evidence
const quoted: Quote = {
  catalogVersion: catalog.catalogVersion, synthetic: true, currency: 'CNY', total: '1.45', totalKind: 'total',
  lines: [{
    productId: productA.id, category: productA.category, productName: productA.productName,
    specification: productA.specification, quantityCartons: 2, priceMarker: 'a',
    packingQuantity: 7, unitPrice: '0.103', lineAmount: '1.45', totalPieces: 14, status: 'priced'
  }]
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==', 'base64')
const imageFile = { buffer: png, mimetype: 'image/png', originalname: '合成询价.png' }

class FakePricing extends PricingService {
  currentCatalog = catalog
  override catalog = vi.fn(async () => this.currentCatalog)
  override quote = vi.fn(async (version: string, _lines: ProposalLine[]) => {
    if (version !== this.currentCatalog.catalogVersion) throw new BusinessError('stale_catalog')
    return quoted
  })
}

function waitForBoth<T>(value: T) {
  let arrived = 0
  let release!: () => void
  const bothArrived = new Promise<void>((resolve) => { release = resolve })
  return async () => {
    if (++arrived === 2) release()
    await bothArrived
    return value
  }
}

describe('quotation persistence and review', () => {
  let db: DataSource
  let drafts: Repository<QuotationDraft>
  let pricing: FakePricing
  let recognize: ReturnType<typeof vi.fn<OcrService['recognize']>>
  let service: QuotationService

  beforeEach(async () => {
    const memory = newDb()
    memory.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'manufacturing_test' })
    memory.public.registerFunction({ name: 'current_schema', returns: DataType.text, implementation: () => 'public' })
    memory.public.registerFunction({ name: 'version', returns: DataType.text, implementation: () => 'PostgreSQL 16.0' })
    db = await memory.adapters.createTypeormDataSource({
      type: 'postgres', entities: [QuotationDraft], synchronize: true
    })
    await db.initialize()
    drafts = db.getRepository(QuotationDraft)
    pricing = new FakePricing()
    recognize = vi.fn<OcrService['recognize']>().mockResolvedValue({ text: inquiry, warnings: [] })
    service = new QuotationService(drafts, pricing, { recognize } as unknown as OcrService)
  })

  afterEach(async () => {
    if (db?.isInitialized) await db.destroy()
  })

  async function analyzingDraft(text = inquiry) {
    const created = await service.create(owner, { title: '演示询价', inquiry: text, requestId: randomUUID() })
    const { draft } = await service.analyze(owner, created.id, created.revision)
    const row = await drafts.findOneByOrFail({ id: created.id })
    expect(row.attemptId).toBeTruthy()
    const read = await service.readForAgent(owner, draft.id, row.attemptId!)
    expect(read.data.inquiry).toBe(text)
    expect(read.snapshot).toEqual({ revision: draft.revision, attemptId: row.attemptId })
    return { draft, snapshot: read.snapshot }
  }

  async function reviewDraft() {
    const { draft, snapshot } = await analyzingDraft()
    return service.saveProposal(owner, draft.id, [lineA], snapshot)
  }

  it('keeps historical quotes readable while omitting retired response fields', async () => {
    const created = await reviewDraft()
    const { totalKind: _totalKind, ...historical } = quoted
    const storedQuote = { ...historical, lines: quoted.lines.map(({ priceMarker: _marker, status: _status, totalPieces: _pieces, ...line }) => ({
      ...line, retiredField: 'legacy'
    })) }
    await drafts.update(created.id, { status: 'quoted', quote: storedQuote })
    const stored = await drafts.findOneByOrFail({ id: created.id })
    expect(draftDto(stored).quote?.lines[0]).toMatchObject({ productId: productA.id, lineAmount: '1.45' })
    expect(draftDto(stored).quote?.lines[0]).not.toHaveProperty('retiredField')
    expect(stored.quote).toEqual(storedQuote)
  })

  it('deduplicates a create request and rejects changed content under the same id', async () => {
    const input = { title: '演示询价', inquiry, requestId: randomUUID() }
    const first = await service.create(owner, input)
    const replay = await service.create(owner, input)
    expect(replay).toMatchObject({ id: first.id, status: 'draft', revision: first.revision })
    await expect(service.create(owner, { ...input, inquiry: '改写的询价' }))
      .rejects.toMatchObject({ code: 'conflict' })
    expect(await drafts.count()).toBe(1)
    expect((await drafts.findOneByOrFail({ id: first.id })).inquiry).toBe(inquiry)
    expect(pricing.catalog).toHaveBeenCalledTimes(1)
  })

  it('reports a business conflict when different drafts race for the same request id', async () => {
    const input = { title: '演示询价', inquiry, requestId: randomUUID() }
    const raceForCatalog = waitForBoth(catalog)
    pricing.catalog.mockImplementationOnce(raceForCatalog).mockImplementationOnce(raceForCatalog)
    const results = await Promise.allSettled([
      service.create(owner, input),
      service.create(owner, { ...input, inquiry: '改写的询价' })
    ])
    const committed = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(committed).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toMatchObject({ code: 'conflict' })
    expect(await drafts.count()).toBe(1)
    expect((await drafts.findOneByOrFail({ id: input.requestId })).inquiry).toBe(committed[0].value.inquiry)
  })

  it('isolates persisted drafts by tenant, organization, actor, and assistant', async () => {
    const review = await reviewDraft()
    const otherScopes: Scope[] = [
      { ...owner, tenantId: 'tenant-2' },
      { ...owner, organizationId: 'organization-2' },
      { ...owner, organizationId: null },
      { ...owner, userId: 'user-2' },
      { ...owner, assistantId: 'assistant-2' }
    ]
    for (const scope of otherScopes) {
      await expect(service.workbench(scope)).resolves.toMatchObject({ records: [], selected: null })
      await expect(service.workbench(scope, review.id)).rejects.toMatchObject({ code: 'not_found' })
      await expect(service.get(scope, review.id)).rejects.toMatchObject({ code: 'not_found' })
      await expect(service.analyze(scope, review.id, review.revision)).rejects.toMatchObject({ code: 'not_found' })
      await expect(service.saveLines(scope, review.id, review.revision, [lineB]))
        .rejects.toMatchObject({ code: 'not_found' })
      await expect(service.confirm(scope, review.id, review.revision, [lineA]))
        .rejects.toMatchObject({ code: 'not_found' })
    }
    expect(await service.get(owner, review.id)).toMatchObject({
      status: 'review', revision: review.revision, lines: [lineA], quote: null
    })
    expect(pricing.quote).not.toHaveBeenCalled()
  })

  it('loads only summary columns for the list and fetches the selected detail separately', async () => {
    const image = await service.createImage(owner, { title: '合成图片询价', requestId: randomUUID() }, imageFile)
    const newest = await service.create(owner, { title: '演示询价', inquiry, requestId: randomUUID() })
    await drafts.update(image.id, { updatedAt: new Date('2026-01-01T00:00:00Z') })
    await drafts.update(newest.id, { updatedAt: new Date('2026-01-02T00:00:00Z') })
    const list = vi.spyOn(drafts, 'find')
    const detail = vi.spyOn(drafts, 'findOneBy')

    const defaultView = await service.workbench(owner)
    const imageView = await service.workbench(owner, image.id)

    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      select: ['id', 'title', 'status', 'revision', 'createdAt', 'updatedAt'], order: { updatedAt: 'DESC' }, take: 50
    }))
    expect(detail.mock.calls.map(([where]) => where)).toEqual([newest.id, image.id].map((id) => ({
      id, tenantId: owner.tenantId, organizationId: owner.organizationId, createdById: owner.userId, assistantId: owner.assistantId
    })))
    expect(defaultView.records.map(({ id }) => id)).toEqual([newest.id, image.id])
    expect(defaultView.selected?.id).toBe(newest.id)
    expect(imageView.selected).toMatchObject({ id: image.id, source: image.source })
  })

  it('requires authentic inquiry excerpts for model proposals and leaves the result for human review', async () => {
    const { draft, snapshot } = await analyzingDraft()
    expect(draft).toMatchObject({ status: 'analyzing', lines: [], quote: null })
    await expect(service.saveProposal(owner, draft.id, [{ ...lineA, evidence: '' }], snapshot))
      .rejects.toMatchObject({ code: 'invalid_input' })
    await expect(service.saveProposal(owner, draft.id, [{ ...lineA, evidence: '询价从未包含的文字' }], snapshot))
      .rejects.toMatchObject({ code: 'invalid_proposal' })
    await expect(service.saveProposal(owner, draft.id, [{ ...lineA, productId: 'fake-product' }], snapshot))
      .rejects.toMatchObject({ code: 'invalid_input' })
    expect((await service.get(owner, draft.id)).revision).toBe(draft.revision)
    const saved = await service.saveProposal(owner, draft.id, [lineA], snapshot)
    expect(saved).toMatchObject({
      status: 'review', revision: draft.revision + 1, lines: [lineA], quote: null, confirmedAt: null
    })
    expect(pricing.quote).not.toHaveBeenCalled()
  })

  it.each([
    ['a truncated count', { evidence: '90°弯头 25 1,234箱 黑袋', quantityCartons: 234 }, 'invalid_proposal'],
    ['a count taken from a division expression', { evidence: '90°弯头 25 1÷2箱 黑袋' }, 'invalid_proposal'],
    ['a count with a trailing half', { ...lineB, evidence: '三通 25 1箱半。请报价' }, 'invalid_proposal'],
    ['a specification taken from a note', { ...lineB, evidence: '三通 1箱 备注 25' }, 'invalid_proposal'],
    ['conflicting specifications', { ...lineB, evidence: '三通 25 1箱 规格 32' }, 'invalid_proposal'],
    ['a conflicting specification beside the unit', { ...lineB, evidence: '三通 25 1箱规格32。请报价' }, 'invalid_proposal'],
    ['an omitted suffixed grade', { evidence: '90°弯头 25 A档 1箱', quantityCartons: 1, gradeRaw: '', priceMarker: 'b' }, 'invalid_grade'],
    ['an omitted grade before a full stop', { evidence: '90°弯头 25 1箱A。请报价', quantityCartons: 1, gradeRaw: '', priceMarker: 'b' }, 'invalid_grade'],
    ['an omitted bag grade', { evidence: '黑袋弯头 25 2箱', gradeRaw: '', priceMarker: 'b' }, 'invalid_grade'],
    ['an unsupported bag grade', { evidence: '弯头紫袋 25 2箱', gradeRaw: '', priceMarker: 'b' }, 'invalid_grade'],
    ['an unrelated OCR substitution', { evidence: '法兰 25 2箱 黑袋', correctionReason: '原文字形相似' }, 'invalid_proposal']
  ] satisfies [string, Partial<ProposalLine>, string][])('rejects %s without changing the active inquiry', async (_name, fields, code) => {
    const proposed = { ...lineA, ...fields }
    const { draft, snapshot } = await analyzingDraft(proposed.evidence)
    await expect(service.saveProposal(owner, draft.id, [proposed], snapshot)).rejects.toMatchObject({ code })
    expect(await service.get(owner, draft.id)).toMatchObject({
      inquiry: proposed.evidence, status: 'analyzing', revision: draft.revision, attemptId: snapshot.attemptId,
      lines: [], quote: null, confirmedAt: null, errorCode: null
    })
    expect(pricing.quote).not.toHaveBeenCalled()
  })

  it('reviews and confirms the same draft after a person corrects the source count', async () => {
    const evidence = '90°弯头 25 1–2箱 黑袋'
    const { draft, snapshot } = await analyzingDraft(evidence)
    await expect(service.saveProposal(owner, draft.id, [{ ...lineA, evidence }], snapshot))
      .rejects.toMatchObject({ code: 'invalid_proposal' })
    const failed = await service.reportFailure(owner, draft.id, snapshot)
    expect(failed).toMatchObject({ inquiry: evidence, status: 'failed', lines: [], quote: null })

    const edited = await service.saveInquiry(owner, draft.id, failed.revision, lineA.evidence)
    expect(edited).toMatchObject({ id: draft.id, inquiry: lineA.evidence, status: 'draft', errorCode: null, quote: null })
    await service.analyze(owner, edited.id, edited.revision)
    const active = await service.get(owner, edited.id)
    const read = await service.readForAgent(owner, edited.id, active.attemptId!)
    expect(read.data.inquiry).toBe(lineA.evidence)
    await expect(service.saveProposal(owner, edited.id, [lineA], snapshot)).rejects.toMatchObject({ code: 'conflict' })

    const review = await service.saveProposal(owner, edited.id, [lineA], read.snapshot)
    expect(review).toMatchObject({ id: draft.id, status: 'review', lines: [lineA], quote: null, confirmedAt: null })
    expect(pricing.quote).not.toHaveBeenCalled()
    await expect(service.confirm(owner, review.id, review.revision, [lineA])).resolves.toMatchObject({
      id: draft.id, status: 'quoted', confirmedById: owner.userId, quote: quoted
    })
    expect(pricing.quote).toHaveBeenCalledExactlyOnceWith(catalog.catalogVersion, [lineA])
  })

  it('requires source coverage before transitioning the whole inquiry to review', async () => {
    const { draft, snapshot } = await analyzingDraft([inquiry, lineB.evidence].join('\n'))
    await expect(service.saveProposal(owner, draft.id, [lineA], snapshot)).rejects.toMatchObject({ code: 'incomplete_coverage' })
    await expect(service.saveProposal(owner, draft.id, [lineA, lineB], snapshot)).resolves.toMatchObject({
      status: 'review', lines: [lineA, lineB], quote: null
    })
    expect(pricing.quote).not.toHaveBeenCalled()
  })

  it('binds agent reads and writes to the active attempt and revision', async () => {
    const { draft, snapshot: expired } = await analyzingDraft()
    await drafts.update({ id: draft.id }, { retryAt: new Date('2000-01-01T00:00:00Z') })
    await expect(service.readForAgent(owner, draft.id, expired.attemptId))
      .rejects.toMatchObject({ code: 'analysis_expired' })
    const { draft: active } = await service.analyze(owner, draft.id, draft.revision)
    const { attemptId } = await drafts.findOneByOrFail({ id: draft.id })
    expect(attemptId).not.toBe(expired.attemptId)
    await expect(service.readForAgent(owner, draft.id, expired.attemptId))
      .rejects.toMatchObject({ code: 'conflict' })
    await expect(service.saveProposal(owner, draft.id, [lineA], expired))
      .rejects.toMatchObject({ code: 'conflict' })
    await expect(service.saveProposal(owner, draft.id, [lineA], { revision: draft.revision, attemptId: attemptId! }))
      .rejects.toMatchObject({ code: 'conflict' })
    const { snapshot } = await service.readForAgent(owner, draft.id, attemptId!)
    expect(snapshot.revision).toBe(active.revision)
    await expect(service.saveProposal(owner, draft.id, [lineA], snapshot))
      .resolves.toMatchObject({ status: 'review', revision: active.revision + 1 })
  })

  it('commits only one of two competing model proposals for one snapshot', async () => {
    const { draft, snapshot } = await analyzingDraft()
    const raceForCatalog = waitForBoth(catalog)
    pricing.catalog.mockImplementationOnce(raceForCatalog).mockImplementationOnce(raceForCatalog)
    const results = await Promise.allSettled([
      service.saveProposal(owner, draft.id, [lineA], snapshot),
      service.saveProposal(owner, draft.id, [lineA], snapshot)
    ])
    const committed = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(committed).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toMatchObject({ code: 'conflict' })
    expect(await service.get(owner, draft.id)).toMatchObject({
      status: 'review', revision: draft.revision + 1, lines: committed[0].value.lines, quote: null
    })
  })

  it('persists a single confirmed quote and replays it after JSONB key reordering', async () => {
    const review = await reviewDraft()
    const confirmed = await service.confirm(owner, review.id, review.revision, [lineA])
    expect(confirmed).toMatchObject({
      status: 'quoted', confirmedById: owner.userId, confirmedAt: expect.any(Date),
      revision: review.revision + 1, quote: quoted
    })
    // Exercise the key order PostgreSQL JSONB can return independently of input order.
    await drafts.update({ id: review.id }, {
      lines: [{ evidence: lineA.evidence, gradeRaw: lineA.gradeRaw, priceMarker: lineA.priceMarker,
        quantityCartons: lineA.quantityCartons, specification: lineA.specification, productName: lineA.productName, category: lineA.category }]
    })
    await expect(service.confirm(owner, review.id, review.revision, [lineA]))
      .resolves.toMatchObject({ id: confirmed.id, status: 'quoted', revision: confirmed.revision, quote: quoted })
    expect(await drafts.count()).toBe(1)
    expect((await drafts.findOneByOrFail({ id: review.id })).quote).toEqual(quoted)
    expect(pricing.quote).toHaveBeenCalledTimes(1)
    await expect(service.saveInquiry(owner, review.id, confirmed.revision, lineB.evidence)).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(service.analyze(owner, review.id, confirmed.revision)).rejects.toMatchObject({ code: 'already_quoted' })
  })

  it('saves one quote when two confirmations compete for the same revision', async () => {
    const review = await reviewDraft()
    const raceForQuote = waitForBoth(quoted)
    pricing.quote.mockImplementationOnce(raceForQuote).mockImplementationOnce(raceForQuote)

    const results = await Promise.allSettled([
      service.confirm(owner, review.id, review.revision, [lineA]),
      service.confirm(owner, review.id, review.revision, [lineA])
    ])
    const committed = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(committed).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toMatchObject({ code: 'conflict' })
    expect(await drafts.count()).toBe(1)
    const persisted = await service.get(owner, review.id)
    expect(persisted).toMatchObject({
      status: 'quoted', revision: review.revision + 1, quote: quoted, confirmedById: owner.userId
    })
    await expect(service.confirm(owner, review.id, review.revision, [lineA]))
      .resolves.toMatchObject({ id: persisted.id, revision: persisted.revision, quote: quoted })
    expect(pricing.quote).toHaveBeenCalledTimes(2)
  })

  it('preserves a manually edited review on pricing failure and retries with the updated revision', async () => {
    const review = await reviewDraft()
    const humanLine = { ...lineA, evidence: '' }
    const edited = await service.saveLines(owner, review.id, review.revision, [humanLine])
    expect(edited).toMatchObject({ status: 'review', revision: review.revision + 1, lines: [humanLine] })
    await expect(service.saveLines(owner, review.id, review.revision, [lineA]))
      .rejects.toMatchObject({ code: 'conflict' })

    pricing.quote.mockRejectedValueOnce(new BusinessError('pricing_unavailable'))
    await expect(service.confirm(owner, review.id, edited.revision, [humanLine]))
      .rejects.toMatchObject({ code: 'pricing_unavailable' })
    const retryable = await service.get(owner, review.id)
    expect(retryable).toMatchObject({
      status: 'review', revision: edited.revision + 1, lines: [humanLine],
      quote: null, errorCode: 'pricing_unavailable', confirmedAt: null
    })
    await expect(service.confirm(owner, review.id, edited.revision, [humanLine]))
      .rejects.toMatchObject({ code: 'conflict' })
    await expect(service.confirm(owner, review.id, retryable.revision, [humanLine]))
      .resolves.toMatchObject({ status: 'quoted', errorCode: null, quote: quoted })
    expect(pricing.quote).toHaveBeenCalledTimes(2)
  })

  it('rejects proposals and confirmation against a changed catalog version', async () => {
    const { draft, snapshot } = await analyzingDraft()
    pricing.currentCatalog = { ...catalog, catalogVersion: 'b'.repeat(64) }
    await expect(service.saveProposal(owner, draft.id, [lineA], snapshot))
      .rejects.toMatchObject({ code: 'stale_catalog' })
    expect(await service.get(owner, draft.id)).toMatchObject({ status: 'analyzing', lines: [], quote: null })

    pricing.currentCatalog = catalog
    const review = await service.saveProposal(owner, draft.id, [lineA], snapshot)
    pricing.currentCatalog = { ...catalog, catalogVersion: 'c'.repeat(64) }
    await expect(service.saveLines(owner, review.id, review.revision, [lineA]))
      .rejects.toMatchObject({ code: 'stale_catalog' })
    await expect(service.confirm(owner, review.id, review.revision, [lineA]))
      .rejects.toMatchObject({ code: 'stale_catalog' })
    expect(await service.get(owner, review.id)).toMatchObject({
      status: 'review', errorCode: 'stale_catalog', lines: [lineA], quote: null
    })
  })

  it('persists an image and its original OCR separately from the editable inquiry', async () => {
    const input = { title: '合成图片询价', requestId: randomUUID() }
    recognize.mockResolvedValueOnce({ text: inquiry, warnings: ['合成提醒'] })
    const image = await service.createImage(owner, input, imageFile)
    expect(image).toMatchObject({ status: 'draft', inquiry, source: {
      type: 'image', fileName: imageFile.originalname, mimeType: imageFile.mimetype,
      dataUrl: `data:image/png;base64,${png.toString('base64')}`, ocrText: inquiry, warnings: ['合成提醒']
    } })
    await expect(service.createImage(owner, input, imageFile)).resolves.toMatchObject({ id: image.id, revision: image.revision })
    await expect(service.createImage(owner, { ...input, title: '不同名称' }, imageFile)).rejects.toMatchObject({ code: 'conflict' })
    const edited = await service.saveInquiry(owner, image.id, image.revision, lineB.evidence)
    expect(edited).toMatchObject({ inquiry: lineB.evidence, source: image.source, status: 'draft', lines: [], quote: null })
    const { draft } = await service.analyze(owner, edited.id, edited.revision)
    const { attemptId } = await service.get(owner, draft.id)
    const read = await service.readForAgent(owner, draft.id, attemptId!)
    expect(read.data.inquiry).toBe(lineB.evidence)
    expect(JSON.stringify(read.data)).not.toContain(png.toString('base64'))
    await expect(service.saveProposal(owner, draft.id, [lineA], read.snapshot)).rejects.toMatchObject({ code: 'invalid_proposal' })
    await expect(service.saveProposal(owner, draft.id, [lineB], read.snapshot)).resolves.toMatchObject({
      id: image.id, inquiry: lineB.evidence, source: image.source, status: 'review', lines: [lineB], quote: null
    })
    expect(recognize).toHaveBeenCalledTimes(1)
  })

  it('retains a failed image and retries transcription on the same source', async () => {
    recognize.mockRejectedValueOnce(new BusinessError('ocr_unreadable'))
    const image = await service.createImage(owner, { title: '合成图片询价', requestId: randomUUID() }, imageFile)
    expect(image).toMatchObject({ status: 'ocr_failed', inquiry: '', source: { fileName: imageFile.originalname }, errorCode: 'ocr_unreadable' })
    await expect(service.analyze(owner, image.id, image.revision)).rejects.toMatchObject({ code: 'invalid_input' })
    const retried = await service.retryOcr(owner, image.id, image.revision)
    expect(retried).toMatchObject({ id: image.id, status: 'draft', inquiry, source: { sha256: image.source?.sha256 }, errorCode: null })
    expect(recognize.mock.calls[1][1]).toEqual(recognize.mock.calls[0][1])
    await expect(service.retryOcr(owner, image.id, image.revision)).rejects.toMatchObject({ code: 'conflict' })
  })

  it('admits one OCR retry after expiry and keeps its result when the older call returns late', async () => {
    let started!: () => void
    const began = new Promise<void>((resolve) => { started = resolve })
    let release!: (value: Awaited<ReturnType<OcrService['recognize']>>) => void
    const delayed = new Promise<Awaited<ReturnType<OcrService['recognize']>>>((resolve) => { release = resolve })
    recognize.mockImplementationOnce(() => { started(); return delayed })
    const requestId = randomUUID()
    const first = service.createImage(owner, { title: '合成图片询价', requestId }, imageFile)
    const conflicted = expect(first).rejects.toMatchObject({ code: 'conflict' })
    await began
    try {
      const pending = await service.get(owner, requestId)
      await expect(service.retryOcr(owner, requestId, pending.revision)).rejects.toMatchObject({ code: 'ocr_pending' })
      await drafts.update(requestId, { retryAt: new Date('2000-01-01T00:00:00Z') })
      const retries = await Promise.allSettled([
        service.retryOcr(owner, requestId, pending.revision),
        service.retryOcr(owner, requestId, pending.revision)
      ])
      expect(retries.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
      const rejected = retries.find((result) => result.status === 'rejected')
      expect(rejected?.reason).toMatchObject({ code: 'conflict' })
      expect(recognize).toHaveBeenCalledTimes(2)
    } finally {
      release({ text: lineB.evidence, warnings: [] })
      await conflicted
    }
    expect(await service.get(owner, requestId)).toMatchObject({ status: 'draft', inquiry, source: { ocrText: inquiry } })
  })

  it('reserves at most two model calls for text and one more after image OCR', async () => {
    const { draft: text, snapshot: textSnapshot } = await analyzingDraft()
    await service.reserveModelRequest(owner, text.id, textSnapshot)
    await service.reserveModelRequest(owner, text.id, textSnapshot)
    await expect(service.reserveModelRequest(owner, text.id, textSnapshot)).rejects.toMatchObject({ code: 'model_budget_exhausted' })
    expect(await service.get(owner, text.id)).toMatchObject({ modelRequests: 2, revision: textSnapshot.revision })

    const image = await service.createImage(owner, { title: '合成图片询价', requestId: randomUUID() }, imageFile)
    await service.analyze(owner, image.id, image.revision)
    const active = await service.get(owner, image.id)
    const { snapshot: imageSnapshot } = await service.readForAgent(owner, image.id, active.attemptId!)
    await service.reserveModelRequest(owner, image.id, imageSnapshot)
    await expect(service.reserveModelRequest(owner, image.id, imageSnapshot)).rejects.toMatchObject({ code: 'model_budget_exhausted' })
    expect(await service.get(owner, image.id)).toMatchObject({ modelRequests: 1, revision: imageSnapshot.revision })
    expect(recognize).toHaveBeenCalledTimes(1)
  })
})

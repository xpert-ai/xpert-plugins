import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProductRecord } from '../src/business-rules.js'
import type { ProposalLine } from '../src/contracts.js'
import { DEMO_PRODUCTS } from '../src/demo-catalog.js'
import { PricingService, calculateQuote, catalogFingerprint } from '../src/pricing.service.js'

const elbow: ProposalLine = {
  category: '玛钢', productName: '弯头', specification: '25', priceMarker: 'b', quantityCartons: 1, gradeRaw: '', evidence: ''
}
const tee: ProposalLine = { ...elbow, productName: '三通' }

// Synthetic fixture for states absent from the six demo rows.
const product: ProductRecord = {
  id: 'fixture-tee', sourceCategory: '玛钢', productName: '等径三通', specification: '32x25',
  priceMarker: 'b', aliases: ['合成古'], unitPrice: '1.25', packingQuantity: 12,
  status: 'enabled', source: { file: 'synthetic-fixture', sheet: '玛钢数据', row: 1 }
}
const selectedAlias: ProposalLine = { ...tee, productName: '合成古', specification: '32 × 25G' }

describe('local deterministic pricing', () => {
  const pricing = new PricingService()

  afterEach(() => vi.unstubAllGlobals())

  it('returns the six unpriced catalog projections and prices all grades locally', async () => {
    const fetchMock = vi.fn(() => { throw new Error('Pricing must run locally') })
    vi.stubGlobal('fetch', fetchMock)
    const catalog = await pricing.catalog()
    expect(catalog.synthetic).toBe(true)
    expect(catalog.products).toEqual(DEMO_PRODUCTS.map((record) => ({
      id: record.id, category: '玛钢', productName: record.productName, specification: record.specification,
      priceMarker: record.priceMarker, aliases: [], status: 'enabled'
    })))
    for (const [priceMarker, gradeRaw, lineAmount, total] of [
      ['b', '', '1.60', '15.51'], ['a', '黑袋', '0.73', '14.64'], ['A', 'A', '1.06', '14.97']
    ] as const) {
      const quote = await pricing.quote(catalog.catalogVersion, [{ ...elbow, priceMarker, gradeRaw }, tee])
      expect(quote).toMatchObject({ synthetic: true, currency: 'CNY', total, totalKind: 'total' })
      expect(quote.lines[0]).toMatchObject({ productId: `demo-elbow-25-${priceMarker}`, priceMarker, lineAmount, status: 'priced' })
      expect(quote.lines[1].lineAmount).toBe('13.91')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps repeated products on separate lines and ceilings before summing', async () => {
    const { catalogVersion } = await pricing.catalog()
    const blackElbow: ProposalLine = { ...elbow, priceMarker: 'a', gradeRaw: '黑' }
    const repeated = await pricing.quote(catalogVersion, [blackElbow, blackElbow])
    expect(repeated.lines.map((line) => [line.lineAmount, line.totalPieces])).toEqual([['0.73', 7], ['0.73', 7]])
    expect(repeated.total).toBe('1.46')
    const combined = await pricing.quote(catalogVersion, [{ ...blackElbow, quantityCartons: 2 }])
    expect(combined.total).toBe('1.45')
  })

  it('rejects stale versions and fingerprints price, packaging, and source facts', async () => {
    const { catalogVersion } = await pricing.catalog()
    expect(catalogFingerprint([...DEMO_PRODUCTS].reverse())).toBe(catalogVersion)
    await expect(pricing.quote('0'.repeat(64), [elbow])).rejects.toMatchObject({ code: 'stale_catalog' })
    const original = catalogFingerprint([product])
    for (const changed of [
      { ...product, unitPrice: '1.26' }, { ...product, packingQuantity: 13 }, { ...product, aliases: ['另一别名'] },
      { ...product, source: { ...product.source, row: 2 } }, { ...product, notes: '新备注' }, { ...product, blankWeight: '1' }
    ]) {
      expect(catalogFingerprint([changed])).not.toBe(original)
      expect(() => calculateQuote([changed], original, [selectedAlias])).toThrow('stale_catalog')
    }
  })

  it('keeps catalog and quote data independent from previously returned objects', async () => {
    const expected = await pricing.catalog()
    const first = await pricing.catalog()
    first.products[0].aliases.push('不应写入')
    first.products.pop()
    const firstQuote = await pricing.quote(expected.catalogVersion, [elbow])
    firstQuote.lines[0].productName = '不应写入'
    await expect(pricing.catalog()).resolves.toEqual(expected)
    await expect(pricing.quote(expected.catalogVersion, [elbow])).resolves.toMatchObject({ lines: [{ productName: '弯头' }] })
  })

  it('rejects invalid lines, client price facts, and exact-match failures', async () => {
    const { catalogVersion } = await pricing.catalog()
    await expect(pricing.quote(catalogVersion, [{ ...elbow, gradeRaw: '未知' }])).rejects.toMatchObject({ code: 'invalid_grade' })
    await expect(pricing.quote(catalogVersion, [{ ...elbow, gradeRaw: '黑袋' }])).rejects.toMatchObject({ code: 'invalid_grade' })
    for (const quantityCartons of [true, 1.25, 0, -1, 1_000_001, '1', null]) {
      const line = { ...elbow, quantityCartons } as ProposalLine
      await expect(pricing.quote(catalogVersion, [line])).rejects.toMatchObject({ code: 'invalid_proposal' })
    }
    for (const extra of [{ unitPrice: '0.01' }, { packingQuantity: 1 }, { lineAmount: '0.01' }, { productId: 'demo-elbow-25-b' }]) {
      await expect(pricing.quote(catalogVersion, [{ ...elbow, ...extra }])).rejects.toMatchObject({ code: 'invalid_proposal' })
    }
    await expect(pricing.quote(catalogVersion, [])).rejects.toMatchObject({ code: 'invalid_proposal' })
    for (const line of [{ ...elbow, specification: 'DN25' }, { ...tee, priceMarker: 'a' as const }, { ...elbow, category: '沟槽' as const }]) {
      await expect(pricing.quote(catalogVersion, [line])).rejects.toMatchObject({ code: 'not_found_product' })
    }
  })

  it('validates a confirmed selection shape and exact match without calculating a quote', () => {
    const quote = vi.spyOn(pricing, 'quote')
    try {
      expect(pricing.validate([elbow])).toBeUndefined()
      expect(() => pricing.validate([{ ...tee, priceMarker: 'A' }])).toThrow('not_found_product')
      expect(quote).not.toHaveBeenCalled()
    } finally {
      quote.mockRestore()
    }
  })

  it('blocks distinct ambiguous alias candidates and retains the confirmed name for a unique source', () => {
    const other = { ...product, id: 'fixture-tee-2', productName: '异径三通' }
    const sameSource = [product, other]
    expect(calculateQuote(sameSource, catalogFingerprint(sameSource), [selectedAlias]).lines[0]).toMatchObject({
      productId: product.id, productName: selectedAlias.productName, specification: '32x25', lineAmount: '15.00'
    })
    expect(calculateQuote([...sameSource].reverse(), catalogFingerprint(sameSource), [selectedAlias]).lines[0].productId).toBe(product.id)
    const separate = [product, { ...other, source: { ...other.source, row: 2 } }]
    expect(() => calculateQuote(separate, catalogFingerprint(separate), [selectedAlias])).toThrow('ambiguous_product')
  })

  it('returns a subtotal when price or packaging is missing and blocks an all-pending quote', () => {
    const pending: ProductRecord = {
      ...product, id: 'pending', productName: '待补充合成件', aliases: [], status: 'pending_price', unitPrice: null,
      source: { ...product.source, row: 2 }
    }
    const missing = {
      ...product, id: 'missing', productName: '缺包装合成件', aliases: [], packingQuantity: null,
      source: { ...product.source, row: 3 }
    }
    const pendingLine = { ...selectedAlias, productName: pending.productName }
    const missingLine = { ...selectedAlias, productName: missing.productName }
    const records = [pending, missing, product]
    const version = catalogFingerprint(records)
    const quote = calculateQuote(records, version, [pendingLine, missingLine, selectedAlias])
    expect(quote).toMatchObject({ totalKind: 'subtotal', total: '15.00', warnings: ['pending_price', 'missing_packaging'] })
    expect(quote.lines).toMatchObject([
      { status: 'pending_price', unitPrice: null, packingQuantity: null, totalPieces: null, lineAmount: null },
      { status: 'missing_packaging', unitPrice: '1.25', packingQuantity: null, totalPieces: null, lineAmount: null },
      { status: 'priced', unitPrice: '1.25', packingQuantity: 12, totalPieces: 12, lineAmount: '15.00' }
    ])
    expect(calculateQuote(records, version, [missingLine])).toMatchObject({ totalKind: 'subtotal', total: '0.00' })
    expect(() => calculateQuote(records, version, [pendingLine])).toThrow('no_priced_products')
  })

  it('rejects invalid authority data before calculating money', () => {
    for (const change of [{ unitPrice: '0.00' }, { unitPrice: '-1.00' }, { unitPrice: 'Infinity' },
      { unitPrice: null }, { packingQuantity: 0 }, { packingQuantity: 1.5 }]) {
      const records = [{ ...product, ...change }]
      expect(() => calculateQuote(records, catalogFingerprint(records), [selectedAlias])).toThrow('invalid_catalog')
    }
    const duplicateKey = [product, { ...product, id: 'duplicate-key' }]
    expect(() => calculateQuote(duplicateKey, catalogFingerprint(duplicateKey), [selectedAlias])).toThrow('invalid_catalog')
    const overflow = [{ ...product, packingQuantity: Number.MAX_SAFE_INTEGER }]
    expect(() => calculateQuote(overflow, catalogFingerprint(overflow), [{ ...selectedAlias, quantityCartons: 2 }])).toThrow('invalid_catalog')
  })
})

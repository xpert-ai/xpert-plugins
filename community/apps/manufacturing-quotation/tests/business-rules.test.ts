import { describe, expect, it } from 'vitest'
import {
  gradeFromEvidence, matchProducts, normalizePriceMarker, normalizeSpecification, sourceCategories, uiCategory,
  type ProductRecord, type Selection
} from '../src/business-rules.js'
import { DEMO_PRODUCTS } from '../src/demo-catalog.js'

// Additional synthetic records exercise combinations absent from the demo catalog.
const base: ProductRecord = {
  id: 'synthetic-tee', sourceCategory: '玛钢', productName: '等径三通', specification: '32x25',
  priceMarker: 'b', aliases: ['合成三通'], unitPrice: '1.25', packingQuantity: 12,
  status: 'enabled', source: { file: 'synthetic-test', sheet: '玛钢数据', row: 1 }
}
const selection: Selection = { category: '玛钢', productName: '合成三通', specification: '32 × 25G', priceMarker: 'b' }

describe('Manufacturing quotation deterministic business rules', () => {
  it('normalizes specification notation without guessing conversions', () => {
    expect(normalizeSpecification(' 114*76G ')).toBe('114x76')
    expect(normalizeSpecification('32-25S × 25')).toBe('32x25x25')
    expect(normalizeSpecification('DN25')).toBe('dn25')
    expect(normalizeSpecification('1/2')).toBe('1/2')
  })

  it.each([
    ['黑', 'a'], ['黑袋', 'a'], ['中', 'a'], ['a', 'a'], [' A ', 'A'],
    ['蓝', 'b'], ['蓝袋', 'b'], ['好', 'b'], ['b', 'b'], ['B', 'b'],
    ['', null], ['蓝黑', null], ['中大', null], ['黑弯头', null], ['镀锌', null]
  ])('maps only confirmed grade tokens (%s)', (raw, expected) => {
    expect(normalizePriceMarker(raw as string)).toBe(expected)
  })

  it('defaults an absent grade and keeps conflicts or unknown evidence for review', () => {
    expect(gradeFromEvidence(' ')).toEqual({ priceMarker: 'b', reviewRequired: false })
    expect(gradeFromEvidence('', '中')).toEqual({ priceMarker: 'a', reviewRequired: false })
    expect(gradeFromEvidence('黑袋', '中')).toEqual({ priceMarker: 'a', reviewRequired: false })
    expect(gradeFromEvidence('A')).toEqual({ priceMarker: 'A', reviewRequired: false })
    for (const [raw, context] of [['蓝', '中'], ['A', '黑'], ['X', '好'], ['', '蓝黑']]) {
      expect(gradeFromEvidence(raw, context)).toEqual({ priceMarker: null, reviewRequired: true })
    }
  })

  it('keeps exact grade partitions, uses the bare elbow default, and never falls back', () => {
    const elbow = { category: '玛钢', productName: ' LS 弯头 ', specification: '25' } as const
    for (const priceMarker of ['a', 'A', 'b'] as const) {
      expect(matchProducts(DEMO_PRODUCTS, { ...elbow, priceMarker }).map(({ id }) => id)).toEqual([`demo-elbow-25-${priceMarker}`])
    }
    expect(matchProducts(DEMO_PRODUCTS, { ...elbow, priceMarker: 'b', productName: '黑弯头' })).toEqual([])
    expect(matchProducts(DEMO_PRODUCTS, { ...elbow, priceMarker: 'a', productName: '三通' })).toEqual([])
  })

  it('keeps each source and each category within its authorized scope', () => {
    const grooved: ProductRecord = { ...base, id: 'grooved', sourceCategory: '沟槽' }
    const ballIron = { ...base, id: 'ball-iron', productName: '球热等径三通' }
    const products = [grooved, base, ballIron]
    expect(sourceCategories('黑袋三通 1件')).toEqual(['玛钢'])
    expect(sourceCategories('玛钢\n沟槽\nqt450')).toEqual(['玛钢', '沟槽', '球铁'])
    expect(sourceCategories('AQT条目')).toEqual(['玛钢'])
    expect(uiCategory(ballIron)).toBe('球铁')
    expect(matchProducts(products, selection)).toEqual([base])
    expect(matchProducts(products, { ...selection, category: '沟槽' })).toEqual([grooved])
    expect(matchProducts(products, { ...selection, category: '球铁', productName: '等径三通' })).toEqual([ballIron])
    expect(matchProducts(products, { ...selection, productName: '球热等径三通' })).toEqual([])
  })

  it('uses authorized names across specifications and keeps all distinct alias candidates', () => {
    const anotherSpec = { ...base, id: 'larger', specification: '40x25', aliases: [] }
    const anotherTarget = {
      ...base, id: 'second-target', productName: '异径三通', source: { ...base.source, row: 2 }
    }
    const products = [base, anotherSpec, anotherTarget]
    expect(matchProducts(products, { ...selection, specification: '40x25' })).toEqual([anotherSpec])
    expect(matchProducts(products, selection)).toEqual([base, anotherTarget])
  })

  it('collapses same-source aliases only when every quote fact agrees', () => {
    const anotherTarget = { ...base, id: 'second-target', productName: '异径三通', unitPrice: '01.250' }
    expect(matchProducts([base, anotherTarget], selection)).toEqual([{ ...base, productName: selection.productName }])
    for (const change of [
      { unitPrice: '1.26' }, { packingQuantity: null }, { blankWeight: '9' }, { finishedWeight: '9' },
      { pureWeight: '9' }, { notes: '合成备注' }, { source: { ...base.source, row: 2 } }
    ]) {
      const distinct = { ...anotherTarget, ...change }
      expect(matchProducts([base, distinct], selection)).toEqual([base, distinct])
    }
    const pending: ProductRecord = { ...anotherTarget, unitPrice: null, status: 'pending_price' }
    expect(matchProducts([pending], selection)).toEqual([pending])
    expect(matchProducts([base, pending], selection)).toEqual([base, pending])
  })
})

// @ts-nocheck
import { matchControlledGoods } from './trade-compliance.matching.js'
import type { ControlledGoodsMatchCandidate, ProductMatchInput } from './types.js'

const baseProduct: ProductMatchInput = {
  productName: '服务器',
  model: 'HPC-8208',
  description: '企业数据中心服务器',
  hsCode: '8471499100'
}

describe('matchControlledGoods', () => {
  it('returns controlled when an enabled controlled goods record has the same HS code', () => {
    const result = matchControlledGoods(baseProduct, [
      controlledGoods({ hsCode: '8471499100', productName: '高性能数字计算机' })
    ])

    expect(result.status).toBe('controlled')
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.reason).toBe('hs_code')
  })

  it('returns suspected when only a keyword matches the product text', () => {
    const result = matchControlledGoods(
      { ...baseProduct, hsCode: '8471504090', description: 'GPU 数字计算机，峰值性能待确认' },
      [controlledGoods({ hsCode: '8471411010', keywords: ['数字计算机'] })]
    )

    expect(result.status).toBe('suspected')
    expect(result.matches[0]?.reason).toBe('keyword')
  })

  it('ignores disabled controlled goods records', () => {
    const result = matchControlledGoods(baseProduct, [
      controlledGoods({ hsCode: '8471499100', enabled: false })
    ])

    expect(result.status).toBe('not_controlled')
    expect(result.matches).toHaveLength(0)
  })

  it('returns not_controlled when no explicit field matches', () => {
    const result = matchControlledGoods(baseProduct, [
      controlledGoods({ hsCode: '2930909041', productName: '芥子气', keywords: ['化学品'] })
    ])

    expect(result.status).toBe('not_controlled')
    expect(result.matches).toHaveLength(0)
  })
})

function controlledGoods(input: Partial<ControlledGoodsMatchCandidate>): ControlledGoodsMatchCandidate {
  return {
    id: 'cg-1',
    productName: input.productName ?? '数字计算机',
    hsCode: input.hsCode,
    keywords: input.keywords ?? [],
    controlNote: input.controlNote ?? '需要许可证',
    enabled: input.enabled ?? true
  }
}

import { enrichProductWithFallback } from './trade-compliance.enrichment.js'

describe('enrichProductWithFallback', () => {
  it('returns deterministic mock customs data for server products when no provider is configured', async () => {
    const result = await enrichProductWithFallback({
      productName: '服务器',
      model: 'HPC-8208',
      description: '企业数据中心服务器'
    })

    expect(result.source).toBe('mock')
    expect(result.hsCode).toBe('8471499100')
    expect(result.taxRefundRate).toBe('13%')
    expect(result.englishName).toBe('Server')
  })

  it('returns an unknown-product fallback when no mock record matches', async () => {
    const result = await enrichProductWithFallback({
      productName: '定制支架',
      model: 'BRACKET-01'
    })

    expect(result.source).toBe('mock')
    expect(result.hsCode).toBeUndefined()
    expect(result.taxRefundRate).toBeUndefined()
    expect(result.englishName).toBe('Customized Bracket')
  })
})

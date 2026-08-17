jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, tableKey: string) => `plugin_${namespace}_${tableKey}`
}))

import {
  buildWebQuotaBreakdownProposal,
  normalizeWebPriceSources
} from './xpert-quotation-web-fallback.js'

describe('Xpert Quotation web evidence fallback', () => {
  it('builds a review-only quota decomposition from exact web evidence', () => {
    const proposal = buildWebQuotaBreakdownProposal('building', ['基层处理并涂刷内墙乳胶漆两遍'], {
      components: [{
        quotaCode: '15-161',
        quotaName: '内墙面乳胶漆 二遍',
        quotaUnit: '10m2',
        coveredWorkScopes: ['基层处理并涂刷内墙乳胶漆两遍'],
        confidence: 0.76,
        rationale: '公开定额说明与当前施工动作相符，留待造价人员复核。',
        differences: ['项目地区与网页定额版本需人工核对'],
        resources: [
          { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '0.5' },
          { category: '材料', code: '11010304', name: '内墙乳胶漆', unit: 'kg', consumption: '3.2' }
        ],
        sources: [{
          title: '公开消耗量定额摘录',
          url: 'https://zjt.jiangsu.gov.cn/quota/15-161',
          quote: '内墙面乳胶漆二遍，计量单位10m2；普工0.5工日，内墙乳胶漆3.2kg。'
        }]
      }],
      uncoveredWorkScopes: [],
      rationale: '知识库未连接，采用联网证据生成待复核拆解。'
    }, new Date('2026-08-16T00:00:00.000Z'))

    expect(proposal).toEqual(expect.objectContaining({
      coverageStatus: 'complete',
      mappingStatus: 'proposed',
      automaticPricingAllowed: false,
      blockingReasons: expect.arrayContaining(['pricing_not_evaluated', 'web_source_requires_review'])
    }))
    expect(proposal.components[0]).toEqual(expect.objectContaining({
      candidateId: expect.stringMatching(/^web_quota_/),
      sourceKind: 'web',
      sourceReviewStatus: 'web_evidence_unreviewed',
      sourceIngestionReady: false,
      externalSources: [expect.objectContaining({ url: 'https://zjt.jiangsu.gov.cn/quota/15-161' })]
    }))
  })

  it('rejects invented consumption but permits an explicit pending placeholder', () => {
    const input = {
      components: [{
        quotaName: '墙面修补', quotaUnit: 'm2', coveredWorkScopes: ['墙面修补'], confidence: 0.5,
        rationale: '仅找到工序证据。', differences: [],
        resources: [{ category: '人工' as const, name: '普工', unit: '工日', consumption: '0.8' }],
        sources: [{ title: '施工工序', url: 'https://zjt.jiangsu.gov.cn/method', quote: '墙面修补包括清理、找平和涂刷。' }]
      }],
      uncoveredWorkScopes: [], rationale: '联网拆解。'
    }

    expect(() => buildWebQuotaBreakdownProposal('building', ['墙面修补'], input)).toThrow(/does not contain the consumption/)
    input.components[0].resources[0] = {
      category: '人工', name: '普工', unit: '工日', consumption: '0', consumptionPending: true
    }
    expect(buildWebQuotaBreakdownProposal('building', ['墙面修补'], input).components[0].resources[0])
      .toEqual(expect.objectContaining({ consumption: '0', consumptionPending: true }))

    input.components[0].resources[0] = {
      category: '人工', name: '普工', unit: '工日', consumption: '0.8', consumptionPending: true
    }
    expect(() => buildWebQuotaBreakdownProposal('building', ['墙面修补'], input)).toThrow(/must be 0/)
  })

  it('rejects placeholder and local source URLs', () => {
    for (const url of ['https://example.com/quota', 'http://localhost:3000/quota', 'https://source.test/quota']) {
      expect(() => normalizeWebPriceSources([{
        title: '占位来源', url, quote: '建筑普工 254.00 元/工日'
      }], '254.00', '工日')).toThrow(/real public source/)
    }
  })

  it('requires every web price excerpt to contain the exact price and unit', () => {
    expect(normalizeWebPriceSources([{
      title: '南京人工信息价', url: 'https://zjt.jiangsu.gov.cn/prices/labor', quote: '建筑普工 254.00 元/工日'
    }], '254.00', '工日')).toHaveLength(1)
    expect(() => normalizeWebPriceSources([{
      title: '南京人工信息价', url: 'https://zjt.jiangsu.gov.cn/prices/labor', quote: '建筑普工价格详见附件'
    }], '254.00', '工日')).toThrow(/explicitly contain/)
  })
})

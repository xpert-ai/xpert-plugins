jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, tableKey: string) => `plugin_${namespace}_${tableKey}`
}))

import { XpertQuotationWebFallbackService } from './xpert-quotation-web-fallback.service.js'

describe('XpertQuotationWebFallbackService', () => {
  it('persists web quota evidence and a reviewable resource price without a knowledgebase', async () => {
    const quotation = {
      id: 'quotation-1', tenantId: 'tenant-1', organizationId: null, status: 'review_required'
    }
    let line = {
      id: 'line-1', tenantId: 'tenant-1', organizationId: null, quotationId: 'quotation-1',
      sheetName: '分部分项', rowNumber: 8, discipline: 'building' as const, kind: 'bill' as const,
      materialReferenceOnly: false, name: '墙面乳胶漆修补', specification: '基层处理并涂刷乳胶漆两遍',
      unit: 'm2', quantity: '100', targetPriceAddress: 'J8', matchStatus: 'unmatched' as const,
      quotaWorkScopes: ['基层处理并涂刷乳胶漆两遍'], quotaCandidates: null, quotaSearchedAt: null,
      quotaBreakdown: null, quotaPricingResources: null, quotaResourcePrices: null, pricingCalculation: null
    }
    const quotationRepository = { findOne: jest.fn(async () => quotation) }
    const lineRepository = {
      findOne: jest.fn(async () => line),
      save: jest.fn(async (value) => { line = { ...line, ...value }; return line })
    }
    const history = {
      captureQuotation: jest.fn(async () => ({ quotation: {}, lines: [], replaceAllLines: false })),
      recordState: jest.fn(async () => ({}))
    }
    const service = new XpertQuotationWebFallbackService(
      quotationRepository as never,
      lineRepository as never,
      history as never
    )
    const scope = { tenantId: 'tenant-1', organizationId: null }

    const breakdown = await service.recommendWebQuotaBreakdown(scope, 'quotation-1', 'line-1', {
      components: [{
        quotaName: '内墙面乳胶漆 二遍', quotaUnit: '10m2',
        coveredWorkScopes: ['基层处理并涂刷乳胶漆两遍'], confidence: 0.72,
        rationale: '公开定额工序相符。', differences: ['地区版本待核'],
        resources: [{ category: '人工', name: '建筑普工', unit: '工日', consumption: '0.5' }],
        sources: [{
          title: '湖北省房屋修缮工程消耗量定额及全费用基价表宣贯资料',
          url: 'http://www.czqz.org.cn/upload_fck/20241023/17296512151887622430.pdf',
          quote: '内墙乳胶漆二遍，计量单位10m2，建筑普工消耗量0.5工日。'
        }]
      }],
      uncoveredWorkScopes: [], rationale: '知识库未连接，联网检索形成待审核拆解。'
    })

    expect(breakdown.persisted).toBe(true)
    expect(line.quotaCandidates?.[0]).toEqual(expect.objectContaining({ sourceKind: 'web' }))
    expect(line.quotaBreakdown).toEqual(expect.objectContaining({ mappingStatus: 'proposed' }))
    expect(line.quotaPricingResources).toHaveLength(1)

    const resourceId = line.quotaPricingResources?.[0].id as string
    const priced = await service.recommendWebResourcePrice(scope, 'quotation-1', 'line-1', {
      resourceId,
      unitPrice: '155.00', sourceUnit: '工日', currency: 'CNY', confidence: 0.7,
      rationale: '名称与工日单位一致，来源需人工复核。', differences: ['价格时期需核验'],
      sources: [{
        title: '2026年第二季度淮南市建设工程人工价格信息',
        url: 'https://zjj.huainan.gov.cn/zjgl/551864617.html',
        quote: '综合人工 元/工日 155.00。人工信息价按每工作日8小时测算。'
      }]
    })

    expect(priced.persisted).toBe(true)
    expect(line.quotaResourcePrices?.[0]).toEqual(expect.objectContaining({
      status: 'recommended',
      recommendation: expect.objectContaining({ sourceKind: 'web', normalizedUnitPrice: '155' })
    }))
    expect(history.recordState).toHaveBeenNthCalledWith(1, scope, 'recommend_web_quota_breakdown', 'quotation-1', expect.anything())
    expect(history.recordState).toHaveBeenNthCalledWith(2, scope, 'recommend_web_resource_price', 'quotation-1', expect.anything())
  })
})

jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, tableKey: string) => `plugin_${namespace}_${tableKey}`
}))

import { XpertQuotationResourcePricingService } from './xpert-quotation-resource-pricing.service.js'
import { extractQuotaPricingResources, initializeQuotaResourcePrices } from './xpert-quotation-resource-pricing.js'
import type { QuotaBreakdownProposal } from './types.js'

describe('XpertQuotationResourcePricingService', () => {
  it('searches by quota resource, persists review, and confirms a deterministic line calculation', async () => {
    const proposal = approvedProposal()
    const resources = extractQuotaPricingResources(proposal)
    let quotation = {
      id: 'quotation-1', tenantId: 'tenant-1', organizationId: null, status: 'review_required',
      matchedCount: 0, reviewCount: 0, unmatchedCount: 1
    }
    let line = {
      id: 'line-1', tenantId: 'tenant-1', organizationId: null, quotationId: 'quotation-1',
      kind: 'bill', name: '平整场地', quantity: '3600', unit: 'm2', matchStatus: 'unmatched',
      quotaBreakdown: proposal,
      quotaPricingResources: resources,
      quotaResourcePrices: initializeQuotaResourcePrices(resources),
      pricingCalculation: null
    }
    const quotationRepository = {
      findOne: jest.fn(async () => quotation),
      save: jest.fn(async (value) => { quotation = { ...quotation, ...value }; return quotation })
    }
    const lineRepository = {
      findOne: jest.fn(async () => line),
      find: jest.fn(async () => [line]),
      save: jest.fn(async (value) => { line = { ...line, ...value }; return line }),
      update: jest.fn(async (_criteria, value) => { line = { ...line, ...value }; return { affected: 1 } })
    }
    const history = {
      captureQuotation: jest.fn(async () => ({ quotation: {}, lines: [], replaceAllLines: false })),
      recordState: jest.fn(async () => ({}))
    }
    const knowledgebaseAdapter = {
      searchConnected: jest.fn(async () => ({
        knowledgebaseIds: ['kb-price'], failedKnowledgebaseIds: [], documents: [{
          id: 'chunk-72',
          pageContent: [
            '序号 名称 单位 日工资（元）',
            '1建筑、装饰工程普工 元254.00',
            '注：日工资按照10小时计算。'
          ].join('\n'),
          metadata: { knowledgebaseId: 'kb-price', documentId: 'price-pdf', chunkId: 'chunk-72', score: 0.95 }
        }]
      }))
    }
    const service = new XpertQuotationResourcePricingService(
      quotationRepository as never,
      lineRepository as never,
      history as never,
      knowledgebaseAdapter as never
    )
    const scope = { tenantId: 'tenant-1', organizationId: null }

    const search = await service.searchResourcePrices(
      scope, 'quotation-1', 'line-1', resources[0].id, ['kb-price'], {} as never, 8
    )
    expect(knowledgebaseAdapter.searchConnected).toHaveBeenCalledWith(expect.objectContaining({
      role: 'price',
      query: expect.stringMatching(/项目名称\/资源名称：.*普工[\s\S]*资源别名：建筑、装饰工程普工[\s\S]*资源计价单位：工日/)
    }))
    expect(search.candidates[0]).toEqual(expect.objectContaining({
      matchedPriceItemIds: [expect.stringMatching(/^price_/)]
    }))
    const priceItemId = search.candidates[0].matchedPriceItemIds[0]

    const accepted = await service.acceptResourcePrice(scope, 'quotation-1', 'line-1', {
      resourceId: resources[0].id,
      candidateId: search.candidates[0].id,
      priceItemId,
      quotaWorkdayHours: 10,
      confidence: 0.98,
      rationale: '普工名称、工日单位及10小时口径一致。',
      differences: [],
      comment: '确认采用2026年6月南京建筑装饰普工日工资。'
    })
    expect(accepted).toEqual(expect.objectContaining({ persisted: true, status: 'approved' }))
    expect(line.quotaResourcePrices?.[0].recommendation).toEqual(expect.objectContaining({
      sourceWorkdayHours: 10,
      quotaWorkdayHours: 10,
      workdayEvidenceQuote: '注：日工资按照10小时计算。'
    }))
    const result = await service.calculateComprehensiveRate(scope, 'quotation-1', 'line-1', {
      fees: [], unitPriceScale: 4
    })

    expect(result.calculation.comprehensiveUnitPrice).toBe('11.6840')
    expect(result.calculation.totalAmount).toBe('42062.40')
    expect(result).toEqual(expect.objectContaining({
      matchedUnitPrice: '11.6840',
      calculatedAmount: '42062.40',
      excelReady: true,
      excelApplyBlockReason: null
    }))
    expect(line).toEqual(expect.objectContaining({
      matchStatus: 'confirmed', matchedUnitPrice: '11.6840', calculatedAmount: '42062.40',
      pricingCalculation: expect.objectContaining({ engineVersion: '1.1.0' })
    }))
    expect(lineRepository.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 'line-1', quotationId: 'quotation-1'
    }), expect.objectContaining({ pricingCalculation: expect.objectContaining({ comprehensiveUnitPrice: '11.6840' }) }))
    expect(history.recordState).toHaveBeenCalledTimes(4)
  })

  it('keeps only the latest approved resource selected in each category', async () => {
    const proposal: QuotaBreakdownProposal = {
      ...approvedProposal(),
      components: [{
        ...approvedProposal().components[0],
        quotaUnit: 'm3',
        resources: [
          { category: '机械', code: 'M-1', name: '挖掘机', unit: '台班', consumption: '1' },
          { category: '机械', code: 'M-2', name: '推土机', unit: '台班', consumption: '2' }
        ]
      }]
    }
    const resources = extractQuotaPricingResources(proposal)
    const recommendation = (index: number) => ({
      candidateId: `candidate-${index}`, priceItemId: `price-${index}`, matchedName: resources[index].name,
      sourceUnit: '台班', sourceUnitPrice: String((index + 1) * 100), normalizedUnitPrice: String((index + 1) * 100),
      evidenceQuote: `${resources[index].name} 台班`, confidence: 1, rationale: '测试。', differences: [],
      recommendedAt: `2026-08-17T0${index}:00:00.000Z`
    })
    let line: Record<string, any> = {
      id: 'line-1', tenantId: 'tenant-1', organizationId: null, quotationId: 'quotation-1',
      quotaPricingResources: resources,
      quotaResourcePrices: [
        { resourceId: resources[0].id, status: 'approved', candidates: [], recommendation: recommendation(0), reviewedAt: '2026-08-17T01:00:00.000Z' },
        { resourceId: resources[1].id, status: 'recommended', candidates: [], recommendation: recommendation(1) }
      ],
      pricingCalculation: { status: 'calculated' }
    }
    const lineRepository = {
      findOne: jest.fn(async () => line),
      save: jest.fn(async (value) => { line = { ...line, ...value }; return line })
    }
    const service = new XpertQuotationResourcePricingService(
      { findOne: jest.fn(async () => ({ id: 'quotation-1' })) } as never,
      lineRepository as never,
      {
        captureQuotation: jest.fn(async () => ({ quotation: {}, lines: [], replaceAllLines: false })),
        recordState: jest.fn(async () => ({}))
      } as never,
      {} as never
    )

    const result = await service.reviewResourcePrice(
      { tenantId: 'tenant-1', organizationId: null }, 'quotation-1', 'line-1',
      { resourceId: resources[1].id, decision: 'approve', comment: '改选推土机。' }
    )

    expect(result).toEqual(expect.objectContaining({ approvedCount: 1, requiredCount: 1 }))
    expect(line.quotaResourcePrices).toEqual([
      expect.objectContaining({ resourceId: resources[0].id, status: 'recommended', reviewedAt: undefined }),
      expect.objectContaining({ resourceId: resources[1].id, status: 'approved' })
    ])
    expect(line.pricingCalculation).toBeNull()
  })
})

function approvedProposal(): QuotaBreakdownProposal {
  return {
    coverageStatus: 'complete', mappingStatus: 'approved', uncoveredWorkScopes: [], blockingReasons: ['pricing_not_evaluated'],
    automaticPricingAllowed: false, rationale: '范围完整。', proposedAt: '2026-08-11T00:00:00.000Z',
    components: [{
      candidateId: 'quota-1-38', quotaCode: '1-38', quotaName: '平整场地', quotaUnit: '10m2',
      coveredWorkScopes: ['就地挖填、找平'], confidence: 0.99, rationale: '匹配。', differences: [],
      knowledgebaseId: 'kb-quota', sourcePages: [20], sourceReviewStatus: 'approved', sourceIngestionReady: true,
      resources: [{ category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '0.460' }]
    }]
  }
}

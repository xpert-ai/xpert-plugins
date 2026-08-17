jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, tableKey: string) => `plugin_${namespace}_${tableKey}`
}))

import {
  buildResourcePriceFallbackQuery,
  buildResourcePriceDeepQuery,
  buildResourcePriceQuery,
  calculateComprehensiveRate,
  convertUnitPrice,
  extractQuotaPricingResources,
  initializeQuotaResourcePrices,
  normalizeSelectedResourcePrice,
  reconcileQuotaResourcePrices,
  rankResourcePriceCandidates
} from './xpert-quotation-resource-pricing.js'
import type { KnowledgePriceCandidate, QuotaBreakdownProposal } from './types.js'

describe('Xpert quotation quota resource pricing', () => {
  const proposal = approvedProposal()
  const [resource] = extractQuotaPricingResources(proposal)

  it('extracts stable quota resources and builds a resource-unit query', () => {
    expect(resource).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^resource_/), quotaCode: '1-38', quotaUnit: '10m2',
      category: '人工', code: '00150101', name: '普工', aliases: ['建筑、装饰工程普工'],
      unit: '工日', consumption: '0.460'
    }))
    expect(initializeQuotaResourcePrices([resource])).toEqual([{
      resourceId: resource.id, status: 'not_searched', candidates: []
    }])
    const query = buildResourcePriceQuery(resource, { region: '南京市', pricePeriod: '2026-06' })
    expect(query).toMatch(/项目名称\/资源名称：.*普工/)
    expect(query).toContain('资源别名：建筑、装饰工程普工')
    expect(query).toContain('资源计价单位：工日')
    expect(query).toContain('检索关键词：平整场地 普工 建筑、装饰工程普工 元 价格')
    expect(query).not.toContain('m2')
    expect(query).toContain('建筑工种劳务市场人工信息价格')
    expect(buildResourcePriceFallbackQuery(resource, { region: '南京市', pricePeriod: '2026-06' }))
      .toMatch(/建筑工种劳务市场人工信息价格.*普工.*工日/)
    expect(buildResourcePriceDeepQuery(resource, { region: '南京市', pricePeriod: '2026-06' }))
      .toMatch(/普工.*建筑、装饰工程普工.*日工资\(元\)/)
  })

  it('ranks the aliased flat wage item and converts an explicit workday basis', () => {
    const candidate = laborCandidate()
    const [ranked] = rankResourcePriceCandidates([candidate], resource)
    expect(ranked.resourceMatchScore).toBeGreaterThan(0)
    expect(ranked.matchedPriceItemIds).toEqual(['price-labor'])
    expect(() => normalizeSelectedResourcePrice({ resource, priceItem: candidate.priceItems[0] }))
      .toThrow('Provide the reviewed quota workday-hour basis')
    expect(normalizeSelectedResourcePrice({
      resource,
      priceItem: candidate.priceItems[0],
      quotaWorkdayHours: 8
    }).normalizedUnitPrice).toBe('203.2')

    const materialResource = { ...resource, category: '材料' as const, code: '04010132', name: '水泥', unit: 'kg' }
    const materialPrice = { ...candidate.priceItems[0], resourceCategory: 'material' as const, name: '水泥', unit: 't', unitPrice: '4200', workdayHours: undefined }
    expect(normalizeSelectedResourcePrice({ resource: materialResource, priceItem: materialPrice })).toEqual(expect.objectContaining({
      normalizedUnitPrice: '4.2', unitConversion: expect.objectContaining({ factor: '0.001' })
    }))
  })

  it('preserves searched prices when a repaired quota changes only the resource id', () => {
    const previous = { ...resource, id: 'resource-before', componentCandidateId: 'candidate-before' }
    const next = { ...resource, id: 'resource-after', componentCandidateId: 'candidate-after' }
    const candidates = rankResourcePriceCandidates([laborCandidate()], previous)

    expect(reconcileQuotaResourcePrices([previous], [{
      resourceId: previous.id,
      status: 'searched',
      query: '普工 工日',
      candidates,
      searchedAt: '2026-08-12T00:00:00.000Z'
    }], [next])).toEqual([expect.objectContaining({
      resourceId: next.id,
      status: 'searched',
      query: '普工 工日',
      candidates
    })])
  })

  it('does not carry a searched price to a materially different repaired resource', () => {
    const previous = { ...resource, id: 'resource-before' }
    const next = { ...resource, id: 'resource-after', code: '00150102', name: '一般技工' }

    expect(reconcileQuotaResourcePrices([previous], [{
      resourceId: previous.id,
      status: 'searched',
      candidates: rankResourcePriceCandidates([laborCandidate()], previous)
    }], [next])).toEqual([{
      resourceId: next.id,
      status: 'not_searched',
      candidates: []
    }])
  })

  it('matches normalized earthwork machine names to official rental prices', () => {
    const machineResource = {
      ...resource,
      category: '机械' as const,
      code: '99130511',
      name: '电动夯实机 夯击能量250N·m',
      aliases: ['夯实机(电动)', '夯实机'],
      unit: '台班'
    }
    const candidate: KnowledgePriceCandidate = {
      id: 'kb-machine', knowledgebaseId: 'kb-price', pageContent: '53 夯实机(电动)夯击能力20-62Nm 台班 24.81', sourcePages: [67],
      priceItems: [{ id: 'price-machine', resourceCategory: 'machine', name: '夯实机(电动)夯击能力20-62Nm', aliases: ['夯实机'], unit: '台班', unitPrice: '24.81', evidenceQuote: '53 夯实机(电动)夯击能力20-62Nm 台班 24.81' }],
      query: '夯实机 台班', retrievedAt: '2026-08-12T00:00:00.000Z'
    }
    const [ranked] = rankResourcePriceCandidates([candidate], machineResource)
    expect(ranked.matchedPriceItemIds).toEqual(['price-machine'])
  })

  it('lists the same machine family when OCR lost the quota resource unit', () => {
    const machineResource = {
      ...resource,
      category: '机械' as const,
      code: '99010303',
      name: '履带式单斗挖掘机(液压) 斗容量0.6m³',
      aliases: ['履带式单斗挖掘机(液压)0.6m3'],
      unit: '未识别'
    }
    const candidate: KnowledgePriceCandidate = {
      id: 'kb-excavators', knowledgebaseId: 'kb-price', pageContent: '履带式单斗挖掘机价格表', sourcePages: [67],
      priceItems: [
        { id: 'excavator-06', resourceCategory: 'machine', name: '履带式单斗挖掘机(液压)斗容量0.6m3', unit: '台班', unitPrice: '865.42', evidenceQuote: '0.6m3 台班 865.42' },
        { id: 'excavator-10', resourceCategory: 'machine', name: '履带式单斗挖掘机(液压)斗容量1m3', unit: '台班', unitPrice: '1024.80', evidenceQuote: '1m3 台班 1024.80' }
      ],
      query: '履带式单斗挖掘机', retrievedAt: '2026-08-12T00:00:00.000Z'
    }

    const [ranked] = rankResourcePriceCandidates([candidate], machineResource)
    expect(ranked.matchedPriceItemIds).toEqual(['excavator-06', 'excavator-10'])
    expect(normalizeSelectedResourcePrice({ resource: machineResource, priceItem: candidate.priceItems[0] }))
      .toEqual(expect.objectContaining({ normalizedUnit: '台班', normalizedUnitPrice: '865.42', requiresResourceUnitReview: true }))
  })

  it('converts compatible metric price and quota units without density assumptions', () => {
    expect(convertUnitPrice('4200', 't', 'kg')).toEqual(expect.objectContaining({
      unitPrice: '4.2',
      conversion: expect.objectContaining({ factor: '0.001', method: 'metric' })
    }))
    expect(convertUnitPrice('8', 'L', 'm3')).toEqual(expect.objectContaining({
      unitPrice: '8000',
      conversion: expect.objectContaining({ factor: '1000' })
    }))
    expect(() => convertUnitPrice('4200', 't', 'm3')).toThrow('not compatible')
  })

  it('calculates the 1-38 direct comprehensive rate and bill amount deterministically', () => {
    const calculation = calculateComprehensiveRate({
      proposal,
      resources: [resource],
      resourcePrices: [{
        resourceId: resource.id,
        status: 'approved',
        candidates: [],
        recommendation: {
          candidateId: 'kb-wage', priceItemId: 'price-labor', matchedName: '建筑、装饰工程普工',
          sourceUnit: '工日', sourceUnitPrice: '254.00', normalizedUnitPrice: '254',
          sourceWorkdayHours: 10, quotaWorkdayHours: 10,
          evidenceQuote: '1建筑、装饰工程普工 元254.00', confidence: 0.98,
          rationale: '名称、单位和工日口径一致。', differences: [], recommendedAt: '2026-08-11T00:00:00.000Z'
        },
        reviewedAt: '2026-08-11T01:00:00.000Z', reviewComment: '确认采用。'
      }],
      quantity: '3600',
      billUnit: 'm2',
      fees: [],
      unitPriceScale: 4,
      calculatedAt: new Date('2026-08-11T02:00:00.000Z')
    })

    expect(calculation.resourceCosts[0]).toEqual(expect.objectContaining({
      costPerQuotaUnit: '116.84', costPerBillUnit: '11.684'
    }))
    expect(calculation.directCosts).toEqual({ labor: '11.684', material: '0', machine: '0', total: '11.684' })
    expect(calculation.comprehensiveUnitPrice).toBe('11.6840')
    expect(calculation.totalAmount).toBe('42062.40')
  })

  it('uses the component quota unit when the extracted resource quota unit is missing', () => {
    const calculation = calculateComprehensiveRate({
      proposal,
      resources: [{ ...resource, quotaUnit: '' }],
      resourcePrices: [{
        resourceId: resource.id,
        status: 'approved',
        candidates: [],
        recommendation: {
          candidateId: 'kb-wage', priceItemId: 'price-labor', matchedName: '建筑、装饰工程普工',
          sourceUnit: '工日', sourceUnitPrice: '254.00', normalizedUnitPrice: '254',
          sourceWorkdayHours: 10, quotaWorkdayHours: 10,
          evidenceQuote: '1建筑、装饰工程普工 元254.00', confidence: 0.98,
          rationale: '名称、单位和工日口径一致。', differences: [], recommendedAt: '2026-08-11T00:00:00.000Z'
        }
      }],
      quantity: '3600',
      billUnit: 'm2',
      fees: [],
      unitPriceScale: 4,
      calculatedAt: new Date('2026-08-11T03:00:00.000Z')
    })

    expect(calculation.comprehensiveUnitPrice).toBe('11.6840')
    expect(calculation.resourceCosts[0]).toEqual(expect.objectContaining({ quotaUnit: '10m2', priceStatus: 'approved' }))
  })

  it('uses the selected labor and machine prices with quota consumption', () => {
    const twoResourceProposal: QuotaBreakdownProposal = {
      ...proposal,
      components: [{
        ...proposal.components[0],
        quotaUnit: 'm3',
        resources: [
          { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '0.23' },
          { category: '机械', code: '99010303', name: '履带式单斗挖掘机', unit: '台班', consumption: '0.4' }
        ]
      }]
    }
    const resources = extractQuotaPricingResources(twoResourceProposal)
    const labor = resources.find((resource) => resource.category === '人工')!
    const machine = resources.find((resource) => resource.category === '机械')!
    const calculation = calculateComprehensiveRate({
      proposal: twoResourceProposal,
      resources,
      resourcePrices: [
        {
          resourceId: labor.id, status: 'approved', candidates: [],
          recommendation: {
            candidateId: 'kb-labor', priceItemId: 'price-labor', matchedName: '普工',
            sourceUnit: '工日', sourceUnitPrice: '254', normalizedUnitPrice: '254', evidenceQuote: '普工 工日 254',
            confidence: 1, rationale: '名称和单位一致。', differences: [], recommendedAt: '2026-08-12T00:00:00.000Z'
          }
        },
        {
          resourceId: machine.id, status: 'approved', candidates: [],
          recommendation: {
            candidateId: 'kb-machine', priceItemId: 'price-machine', matchedName: '履带式单斗挖掘机',
            sourceUnit: '台班', sourceUnitPrice: '300', normalizedUnitPrice: '300', evidenceQuote: '履带式单斗挖掘机 台班 300',
            confidence: 1, rationale: '名称和单位一致。', differences: [], recommendedAt: '2026-08-12T00:00:00.000Z'
          }
        }
      ],
      quantity: '1', billUnit: 'm3', fees: [], unitPriceScale: 4,
      calculatedAt: new Date('2026-08-12T01:00:00.000Z')
    })

    expect(calculation.directCosts).toEqual({ labor: '58.42', material: '0', machine: '120', total: '178.42' })
    expect(calculation.comprehensiveUnitPrice).toBe('178.4200')
    expect(calculation.totalAmount).toBe('178.42')
    expect(calculation.resourceCosts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '普工', consumption: '0.23', normalizedUnitPrice: '254', costPerBillUnit: '58.42' }),
      expect.objectContaining({ name: '履带式单斗挖掘机', consumption: '0.4', normalizedUnitPrice: '300', costPerBillUnit: '120' })
    ]))
  })

  it('allows explicitly skipped uncovered work and applies enabled formula rules', () => {
    const partial = {
      ...proposal,
      coverageStatus: 'partial' as const,
      uncoveredWorkScopes: ['场内运输50m'],
      skippedUncoveredWorkScopes: ['场内运输50m'],
      blockingReasons: ['pricing_not_evaluated', 'uncovered_work', 'unreviewed_quota_source'],
      components: proposal.components.map((component) => ({ ...component, sourceReviewStatus: 'unreviewed' }))
    }
    const calculation = calculateComprehensiveRate({
      proposal: partial,
      resources: [resource],
      resourcePrices: [{
        resourceId: resource.id, status: 'approved', candidates: [], reviewedAt: '2026-08-12T00:00:00.000Z', reviewComment: '采用。',
        recommendation: {
          candidateId: 'kb-wage', priceItemId: 'price-labor', matchedName: '建筑、装饰工程普工',
          sourceUnit: '工日', sourceUnitPrice: '254', normalizedUnitPrice: '254', evidenceQuote: '普工 工日 254',
          confidence: 1, rationale: '采用。', differences: [], recommendedAt: '2026-08-12T00:00:00.000Z'
        }
      }],
      quantity: '3600', billUnit: 'm2',
      fees: [{ code: 'management', name: '管理费', ratePercent: '10', base: 'direct_cost' }]
    })

    expect(calculation.fees).toEqual([expect.objectContaining({ code: 'management', amount: '1.1684' })])
    expect(calculation.comprehensiveUnitPrice).toBe('12.8524')
  })

  it('calculates with missing resource prices as zero-cost warnings', () => {
    const calculation = calculateComprehensiveRate({
      proposal,
      resources: [resource],
      resourcePrices: [{ resourceId: resource.id, status: 'no_match', candidates: [] }],
      quantity: '3600',
      billUnit: 'm2',
      fees: [],
      unitPriceScale: 4,
      calculatedAt: new Date('2026-08-11T03:00:00.000Z')
    })

    expect(calculation.directCosts).toEqual({ labor: '0', material: '0', machine: '0', total: '0' })
    expect(calculation.comprehensiveUnitPrice).toBe('0.0000')
    expect(calculation.totalAmount).toBe('0.00')
    expect(calculation.unpricedResourceIds).toEqual([resource.id])
    expect(calculation.calculationWarnings).toEqual([expect.stringContaining('人工尚未选择已批准资源')])
    expect(calculation.resourceCosts).toEqual([])
  })

  it('uses only approved selections and omits unselected resources from the calculation rows', () => {
    const partialPriceProposal: QuotaBreakdownProposal = {
      ...proposal,
      components: [{
        ...proposal.components[0],
        quotaUnit: 't',
        resources: [
          { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '0.280' },
          { category: '材料', code: '04030100', name: '黄砂', unit: 't', consumption: '1.050' }
        ]
      }]
    }
    const resources = extractQuotaPricingResources(partialPriceProposal)
    const labor = resources.find((resource) => resource.category === '人工')!
    const sand = resources.find((resource) => resource.category === '材料')!
    const calculation = calculateComprehensiveRate({
      proposal: partialPriceProposal,
      resources,
      resourcePrices: [{
        resourceId: sand.id,
        status: 'approved',
        candidates: [],
        recommendation: {
          candidateId: 'kb-sand', priceItemId: 'price-sand', matchedName: '中砂',
          sourceUnit: 't', sourceUnitPrice: '174.92', normalizedUnitPrice: '174.92',
          evidenceQuote: '中砂 t 174.92', confidence: 1, rationale: '名称和单位一致。',
          differences: [], recommendedAt: '2026-08-17T00:00:00.000Z'
        }
      }],
      quantity: '120',
      billUnit: 't',
      fees: [],
      unitPriceScale: 4,
      calculatedAt: new Date('2026-08-17T01:00:00.000Z')
    })

    expect(calculation.directCosts).toEqual({ labor: '0', material: '183.666', machine: '0', total: '183.666' })
    expect(calculation.comprehensiveUnitPrice).toBe('183.6660')
    expect(calculation.totalAmount).toBe('22039.92')
    expect(calculation.unpricedResourceIds).toContain(labor.id)
    expect(calculation.resourceCosts).toEqual([
      expect.objectContaining({ resourceId: sand.id, priceStatus: 'approved', normalizedUnitPrice: '174.92', costPerBillUnit: '183.666' })
    ])
  })

  it('does not calculate recommended prices before user approval', () => {
    const calculation = calculateComprehensiveRate({
      proposal,
      resources: [resource],
      resourcePrices: [{
        resourceId: resource.id,
        status: 'recommended',
        candidates: [],
        recommendation: {
          candidateId: 'kb-wage', priceItemId: 'price-labor', matchedName: '普工',
          sourceUnit: '工日', sourceUnitPrice: '254', normalizedUnitPrice: '254',
          evidenceQuote: '普工 工日 254', confidence: 1, rationale: '待用户审批。', differences: [],
          recommendedAt: '2026-08-17T00:00:00.000Z'
        }
      }],
      quantity: '1', billUnit: 'm2', fees: [], unitPriceScale: 4
    })

    expect(calculation.resourceCosts).toEqual([])
    expect(calculation.comprehensiveUnitPrice).toBe('0.0000')
    expect(calculation.calculationWarnings).toEqual([expect.stringContaining('人工尚未选择已批准资源')])
  })

  it('uses at most the last approved resource in one category', () => {
    const machineProposal: QuotaBreakdownProposal = {
      ...proposal,
      components: [{
        ...proposal.components[0],
        quotaUnit: 'm3',
        resources: [
          { category: '机械', code: 'M-1', name: '挖掘机', unit: '台班', consumption: '1' },
          { category: '机械', code: 'M-2', name: '推土机', unit: '台班', consumption: '2' },
          { category: '机械', code: 'M-3', name: '夯实机', unit: '台班', consumption: '3' }
        ]
      }]
    }
    const resources = extractQuotaPricingResources(machineProposal)
    const state = (index: number, status: 'approved' | 'recommended', reviewedAt?: string) => ({
      resourceId: resources[index].id,
      status,
      candidates: [],
      recommendation: {
        candidateId: `candidate-${index}`, priceItemId: `price-${index}`, matchedName: resources[index].name,
        sourceUnit: '台班', sourceUnitPrice: String((index + 1) * 100), normalizedUnitPrice: String((index + 1) * 100),
        evidenceQuote: `${resources[index].name} 台班`, confidence: 1, rationale: '测试。', differences: [],
        recommendedAt: `2026-08-17T0${index}:00:00.000Z`
      },
      ...(reviewedAt ? { reviewedAt } : {})
    })
    const calculation = calculateComprehensiveRate({
      proposal: machineProposal,
      resources,
      resourcePrices: [
        state(0, 'approved', '2026-08-17T01:00:00.000Z'),
        state(1, 'approved', '2026-08-17T02:00:00.000Z'),
        state(2, 'recommended')
      ],
      quantity: '1', billUnit: 'm3', fees: [], unitPriceScale: 4
    })

    expect(calculation.resourceCosts).toEqual([
      expect.objectContaining({ resourceId: resources[1].id, name: '推土机', costPerBillUnit: '400' })
    ])
    expect(calculation.directCosts.machine).toBe('400')
    expect(calculation.comprehensiveUnitPrice).toBe('400.0000')
    expect(calculation.calculationWarnings).toContain('机械存在多个历史批准项，当前仅采用最后批准的一项。')
  })

  it('uses one quota unit when OCR did not recover consumption', () => {
    const pendingResource = { ...resource, consumption: '0', consumptionPending: true }
    const calculation = calculateComprehensiveRate({
      proposal,
      resources: [pendingResource],
      resourcePrices: [{
        resourceId: pendingResource.id,
        status: 'approved',
        candidates: [],
        recommendation: {
          candidateId: 'kb-wage', priceItemId: 'price-labor', matchedName: '普工',
          sourceUnit: '工日', sourceUnitPrice: '254', normalizedUnitPrice: '254',
          evidenceQuote: '普工 工日 254', confidence: 1, rationale: '测试价格。', differences: [],
          recommendedAt: '2026-08-12T00:00:00.000Z'
        }
      }],
      quantity: '1', billUnit: 'm2', fees: [], unitPriceScale: 4
    })

    expect(calculation.resourceCosts[0]).toEqual(expect.objectContaining({
      consumption: '1', normalizedUnitPrice: '254', costPerBillUnit: '25.4'
    }))
    expect(calculation.comprehensiveUnitPrice).toBe('25.4000')
    expect(calculation.calculationWarnings).toEqual([expect.stringContaining('按 1 计')])
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

function laborCandidate(): KnowledgePriceCandidate {
  return {
    id: 'kb-wage', knowledgebaseId: 'kb-price', pageContent: '1建筑、装饰工程普工 元254.00', sourcePages: [72],
    priceItems: [{
      id: 'price-labor', resourceCategory: 'labor', name: '建筑、装饰工程普工', aliases: ['普工'],
      unit: '工日', unitPrice: '254.00', workdayHours: 10, evidenceQuote: '1建筑、装饰工程普工 元254.00'
    }],
    query: '普工 工日', retrievedAt: '2026-08-11T00:00:00.000Z'
  }
}

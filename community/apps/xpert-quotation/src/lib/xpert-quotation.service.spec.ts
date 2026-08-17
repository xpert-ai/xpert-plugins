jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, tableKey: string) => `plugin_${namespace}_${tableKey}`
}))

import { XpertQuotationService } from './xpert-quotation.service.js'
import { XpertQuotationHistoryService } from './xpert-quotation-history.service.js'
import { XpertQuotationKnowledgebaseAdapter } from './xpert-quotation-knowledgebase.adapter.js'
import { XpertQuotationReviewService } from './xpert-quotation-review.service.js'
import { extractQuotaPricingResources } from './xpert-quotation-resource-pricing.js'

describe('XpertQuotationService knowledgebase pricing', () => {
  let quotations: MemoryRepository
  let legacyPriceBooks: MemoryRepository
  let lines: MemoryRepository
  let histories: MemoryRepository
  let office: ReturnType<typeof createOffice>
  let service: XpertQuotationService
  let historyService: XpertQuotationHistoryService
  let reviewService: XpertQuotationReviewService

  beforeEach(() => {
    quotations = new MemoryRepository([quotation()])
    legacyPriceBooks = new MemoryRepository([])
    lines = new MemoryRepository([])
    histories = new MemoryRepository([])
    office = createOffice()
    historyService = new XpertQuotationHistoryService(
      quotations as never,
      legacyPriceBooks as never,
      lines as never,
      histories as never,
      office as never
    )
    reviewService = new XpertQuotationReviewService(quotations as never, lines as never, historyService)
    service = new XpertQuotationService(quotations as never, lines as never, reviewService, historyService, office as never)
  })

  it('accepts legacy XLS quotation uploads and keeps the workbook service conversion result', async () => {
    office.importWorkbook.mockResolvedValue({
      document: { id: 'legacy-xls', title: '旧格式报价', currentFileVersionNumber: 1 },
      fileVersion: { id: 'version-xls', versionNumber: 1, fileName: '旧格式报价.xlsx' },
      convertedFromLegacyXls: true
    })

    const result = await service.importSourceXlsx(scope(), {
      fileName: '旧格式报价.xls',
      mimeType: 'application/vnd.ms-excel',
      buffer: Buffer.from('legacy-xls')
    })

    expect(office.importWorkbook).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      title: '旧格式报价', fileName: '旧格式报价.xls'
    }))
    expect(result).toEqual(expect.objectContaining({
      convertedFromLegacyXls: true,
      fileVersion: expect.objectContaining({ fileName: '旧格式报价.xlsx' })
    }))
  })

  it('rejects non-Excel quotation uploads before creating a quotation', async () => {
    await expect(service.importSourceXlsx(scope(), {
      fileName: '报价.csv', mimeType: 'text/csv', buffer: Buffer.from('项目,工程量')
    })).rejects.toThrow('Only .xls and .xlsx Excel files are supported')
    expect(office.importWorkbook).not.toHaveBeenCalled()
  })

  it('inspects bounded workbook samples without requiring Xpert Software sheet names', async () => {
    office.readExcel.mockImplementation(async (_scope, input) => input.sheetName
      ? officeRead(input.sheetName, 'A1:J5', mappedRows())
      : officeCatalog([{ name: '任意名称-工程报价明细', range: 'A1:J5' }, { name: '说明', range: 'A1:B2' }]))

    const result = await service.inspectWorkbook(scope(), 'quotation-1')

    expect(result).toEqual(expect.objectContaining({ sheetsExamined: 2 }))
    expect(result.sheets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: '任意名称-工程报价明细',
        sampleRows: expect.any(Array),
        observedHeaderCells: expect.arrayContaining([expect.objectContaining({ address: 'I2', value: '综合单价' })]),
        observedTotalLabels: expect.any(Array)
      })
    ]))
    expect(result.mappingContract).toEqual(expect.objectContaining({
      bill: expect.objectContaining({ requiredColumns: ['name', 'quantity', 'unitPrice', 'amount'] }),
      totals: expect.objectContaining({ subtotalRule: expect.stringContaining('targetRow - 1') })
    }))
  })

  it('returns quotation Workbench data without an uploaded price-list collection', async () => {
    office.getExcelFile.mockResolvedValue({
      documentId: 'office-1', fileVersionId: 'internal-version-1', versionNumber: 1,
      fileName: 'quotation.xlsx', filePath: 'files/quotation.xlsx', fileUrl: '/quotation.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 100, extension: 'xlsx'
    })
    office.openDocument.mockResolvedValue({ item: { id: 'office-1' }, currentSnapshot: { id: 'internal-version-1', snapshot: {} } })

    const result = await service.getWorkbenchData(scope(), 'quotation-1')

    expect(result).not.toHaveProperty('priceBooks')
    expect(result.detail).not.toHaveProperty('candidates')
    expect(result.detail?.quotation).toEqual(expect.objectContaining({ officeVersionNumber: 1 }))
    expect(result.detail?.quotation).not.toHaveProperty('officeFileVersionId')
    expect(result.detail?.quotation).not.toHaveProperty('priceBookId')
    expect(result.detail?.quotation).not.toHaveProperty('tenantId')
    expect(quotations.items[0]).toEqual(expect.objectContaining({ officeFileVersionId: 'internal-version-1' }))
  })

  it('resolves the latest scoped quotation when Workbench context has not arrived yet', async () => {
    const result = await service.getCurrentWorkbenchContext(scope(), {})

    expect(result).toEqual(expect.objectContaining({
      code: 'ok',
      quotation: expect.objectContaining({ quotationId: 'quotation-1', fileName: null }),
      workbench: expect.objectContaining({ activeView: 'quotation', sheetNames: [] }),
      nextAction: expect.stringContaining('quotationId')
    }))
  })

  it('returns a recoverable result when no scoped quotation exists', async () => {
    quotations.items.length = 0

    const result = await service.getCurrentWorkbenchContext(scope(), {})

    expect(result).toEqual(expect.objectContaining({
      code: 'workbench_context_unavailable',
      nextAction: expect.stringContaining('Open or import a quotation workbook')
    }))
  })

  it('returns current Workbench metadata and file path without loading workbook content', async () => {
    office.getExcelFile.mockResolvedValue({
      documentId: 'office-1', fileVersionId: 'internal-version-1', versionNumber: 1,
      fileName: '三类资源报价测试表.xlsx', filePath: 'files/quotation.xlsx', fileUrl: '/quotation.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 100, extension: 'xlsx'
    })
    office.openDocument.mockResolvedValue({
      item: { id: 'office-1', title: '三类资源报价测试表', currentVersionNumber: 1 },
      currentSnapshot: {
        id: 'internal-version-1',
        snapshot: {
          sheetOrder: ['sheet-1'],
          sheets: { 'sheet-1': { name: '分部分项工程项目清单计价表' } }
        }
      }
    })
    office.readExcel.mockResolvedValue(officeRead('分部分项工程项目清单计价表', 'A1:Z80', mappedRows()))

    const result = await service.getCurrentWorkbenchContext(scope(), {
      quotationId: 'quotation-1',
      activeView: 'review',
      activeSheetName: '分部分项工程项目清单计价表',
      selectedRange: 'C8:J8',
      dirty: true
    })

    expect(result).toEqual(expect.objectContaining({
      code: 'ok',
      quotation: expect.objectContaining({ quotationId: 'quotation-1', fileName: '三类资源报价测试表.xlsx' }),
      workbench: expect.objectContaining({
        activeView: 'review', activeSheetName: '分部分项工程项目清单计价表', selectedRange: 'C8:J8',
        dirty: true, contentFreshness: 'not_loaded',
        warning: expect.stringContaining('unsaved edits'),
        sheetNames: ['分部分项工程项目清单计价表'],
        file: expect.objectContaining({
          documentId: 'office-1',
          fileName: '三类资源报价测试表.xlsx',
          filePath: 'files/quotation.xlsx',
          versionNumber: 1
        })
      }),
      review: expect.objectContaining({ total: 0, pending: 0 })
    }))
    expect(result.workbench).not.toHaveProperty('activeSheet')
    expect(JSON.stringify(result)).not.toContain('rows')
    expect(office.readExcel).not.toHaveBeenCalled()
  })

  it('keeps a persisted quota review snapshot stable across Workbench refreshes', async () => {
    office.getExcelFile.mockResolvedValue(null)
    office.openDocument.mockResolvedValue(null)
    const component = {
      candidateId: 'quota-1-44', quotaCode: '1-44', quotaName: '回填土槽(坑)夯填', quotaUnit: 'm3',
      coveredWorkScopes: ['机械分层回填、夯实'], confidence: 0.9, rationale: '已形成审核提案。', differences: [],
      knowledgebaseId: 'kb-quota', sourcePages: [20], sourceReviewStatus: 'unreviewed',
      resources: [
        { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '0.170' },
        { category: '机械', code: '99130511', name: '电动夯实机', unit: '台班', consumption: '0.036' }
      ]
    }
    lines.items.push(line({
      id: 'line-backfill', name: '基坑回填方', specification: '机械分层回填、夯实', unit: 'm3',
      quotaBreakdown: {
        coverageStatus: 'complete', mappingStatus: 'proposed', components: [component], uncoveredWorkScopes: [],
        blockingReasons: ['pricing_not_evaluated'], automaticPricingAllowed: false, rationale: '待审核。',
        proposedAt: '2026-08-12T00:00:00.000Z'
      },
      quotaCandidates: [],
      quotaPricingResources: [{
        id: 'resource-labor', componentCandidateId: component.candidateId, quotaCode: component.quotaCode,
        quotaName: component.quotaName, quotaUnit: component.quotaUnit, category: '人工', code: '00150101',
        name: '普工', aliases: ['建筑、装饰工程普工'], unit: '工日', consumption: '0.170'
      }],
      quotaResourcePrices: [{
        resourceId: 'resource-labor', status: 'searched', candidates: [], searchedAt: '2026-08-12T01:00:00.000Z'
      }]
    }))

    const first = await service.getWorkbenchData(scope(), 'quotation-1')
    const second = await service.getWorkbenchData(scope(), 'quotation-1')

    expect(first.detail?.lines[0]).toEqual(expect.objectContaining({
      quotaBreakdown: expect.objectContaining({ components: [component] }),
      quotaPricingResources: expect.arrayContaining([
        expect.objectContaining({ code: '00150101', consumption: '0.170' }),
        expect.objectContaining({ code: '99130511', consumption: '0.036' })
      ]),
      quotaResourcePrices: expect.arrayContaining([
        expect.objectContaining({ status: 'searched' }),
        expect.objectContaining({ status: 'not_searched' })
      ])
    }))
    expect(second.detail?.lines[0]).toEqual(expect.objectContaining({
      quotaBreakdown: expect.objectContaining({ components: [component] }),
      quotaPricingResources: expect.arrayContaining([
        expect.objectContaining({ code: '00150101', consumption: '0.170' }),
        expect.objectContaining({ code: '99130511', consumption: '0.036' })
      ])
    }))
  })

  it('keeps a calculated confirmed line visible after Workbench refresh', async () => {
    office.getExcelFile.mockResolvedValue(null)
    office.openDocument.mockResolvedValue(null)
    const component = {
      candidateId: 'quota-calculated', quotaCode: '1-121', quotaName: '反铲挖掘机挖土', quotaUnit: 'm3',
      coveredWorkScopes: ['机械开挖'], confidence: 0.96, rationale: '知识库定额工作内容和清单特征一致。', differences: [],
      knowledgebaseId: 'kb-quota', sourcePages: [121], sourceReviewStatus: 'approved', sourceIngestionReady: true,
      resources: [
        { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '0.23' },
        { category: '机械', code: '99010303', name: '履带式单斗挖掘机', unit: '台班', consumption: '0.4' }
      ]
    }
    const resources = extractQuotaPricingResources({
      coverageStatus: 'complete', mappingStatus: 'approved', components: [component], uncoveredWorkScopes: [],
      blockingReasons: ['pricing_not_evaluated'], automaticPricingAllowed: false,
      rationale: '已从当前 Agent 连接的定额知识库提取人材机消耗量。', proposedAt: '2026-08-12T00:00:00.000Z'
    })
    lines.items.push(line({
      id: 'line-calculated', name: '机械挖一般土方', specification: '机械开挖', unit: 'm3', quantity: '800', matchStatus: 'confirmed', matchedUnitPrice: '178.4200', calculatedAmount: '142736.00',
      quotaBreakdown: {
        coverageStatus: 'complete', mappingStatus: 'approved', components: [component], uncoveredWorkScopes: [],
        blockingReasons: ['pricing_not_evaluated'], automaticPricingAllowed: false,
        rationale: '已从当前 Agent 连接的定额知识库提取人材机消耗量。', proposedAt: '2026-08-12T00:00:00.000Z'
      },
      quotaPricingResources: resources,
      quotaResourcePrices: resources.map((resource, index) => ({
        resourceId: resource.id, status: 'approved', candidates: [], recommendation: {
          candidateId: index === 0 ? 'kb-labor' : 'kb-machine', priceItemId: index === 0 ? 'price-labor' : 'price-machine',
          matchedName: resource.name, sourceUnit: resource.unit, sourceUnitPrice: index === 0 ? '254' : '300',
          normalizedUnitPrice: index === 0 ? '254' : '300', evidenceQuote: `${resource.name} ${resource.unit}`,
          confidence: 1, rationale: '已人工采用知识库价格。', differences: [], recommendedAt: '2026-08-12T00:30:00.000Z'
        }
      })),
      pricingCalculation: {
        status: 'calculated', engineVersion: '1.0.0', quotaBreakdownProposedAt: '2026-08-12T00:00:00.000Z',
        quantity: '800', billUnit: 'm3', resourceCosts: [], directCosts: { labor: '58.42', material: '0', machine: '120', total: '178.42' },
        fees: [], comprehensiveUnitPrice: '178.4200', totalAmount: '142736.00', unitPriceScale: 4,
        calculationWarnings: [], unpricedResourceIds: [], calculatedAt: '2026-08-12T00:30:00.000Z'
      }
    }))

    const result = await service.getWorkbenchData(scope(), 'quotation-1')
    expect(result.detail?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'line-calculated', matchStatus: 'confirmed', matchedUnitPrice: '178.4200', calculatedAmount: '142736.00',
        pricingCalculation: expect.objectContaining({ comprehensiveUnitPrice: '178.4200', totalAmount: '142736.00' })
      })
    ]))
    expect(lines.items.find((item) => item.id === 'line-calculated')).toEqual(expect.objectContaining({
      matchStatus: 'confirmed', pricingCalculation: expect.objectContaining({ comprehensiveUnitPrice: '178.4200' }),
      quotaBreakdown: expect.objectContaining({ pricingFormulaRules: expect.any(Array) })
    }))
  })

  it('returns project specifications and knowledge evidence without legacy price-list fields', async () => {
    lines.items.push(materialLine({
      id: 'line-material',
      knowledgeSearchedAt: new Date(),
      knowledgeCandidates: [knowledgeCandidate()]
    }))

    const result = await service.getIssues(scope(), 'quotation-1', 1, 20)

    expect(result.items[0]).toEqual(expect.objectContaining({
      id: 'line-material',
      name: '镀锌钢管',
      specification: 'DN50 热镀锌',
      unit: 'm',
      knowledgeCandidates: [expect.objectContaining({ id: 'kb_candidate', knowledgebaseId: 'kb-price' })]
    }))
    expect(result.items[0]).not.toHaveProperty('candidateIds')
    expect(result.items[0]).not.toHaveProperty('aiRecommendedPriceItemId')
    expect(result.items[0]).not.toHaveProperty('matchedPriceItemId')
  })

  it('extracts a renamed worksheet and preserves the full project feature as an unresolved row', async () => {
    office.readExcel.mockImplementation(async (_scope, input) => input.sheetName
      ? officeRead(input.sheetName, 'A1:J5', mappedRows())
      : officeCatalog([{ name: '任意名称-工程报价明细', range: 'A1:J5' }]))

    const result = await service.matchQuotation(scope(), 'quotation-1', recognition(testMapping()))

    expect(result).toEqual(expect.objectContaining({
      recognizedSheets: ['任意名称-工程报价明细'],
      matchedCount: 0,
      unmatchedCount: 1
    }))
    expect(lines.items[0]).toEqual(expect.objectContaining({
      specification: '镀锌钢管 DN50 热镀锌',
      quantityAddress: 'H4',
      targetPriceAddress: 'I4',
      targetAmountAddress: 'J4',
      matchStatus: 'unmatched',
      knowledgeCandidates: [],
      matchedUnitPrice: null
    }))
    expect(quotations.items[0]).toEqual(expect.objectContaining({ priceBookId: null, recognitionConfidence: 0.94 }))
  })

  it('derives a final total only from an explicit workbook total label', async () => {
    const rows = mappedRows()
    rows[4][0].value = '合    计'
    office.readExcel.mockImplementation(async (_scope, input) => input.sheetName
      ? officeRead(input.sheetName, 'A1:J5', rows)
      : officeCatalog([{ name: '任意名称-工程报价明细', range: 'A1:J5' }]))

    await service.matchQuotation(scope(), 'quotation-1', recognition(testMapping({ dataEndRow: 5, totals: undefined })))

    expect(quotations.items[0].sheetMappings[0]).toEqual(expect.objectContaining({
      dataEndRow: 4,
      totals: { finalTotalRow: 5 }
    }))
  })

  it('rejects guessed sheet names and target columns outside the used range', async () => {
    office.readExcel.mockResolvedValue(officeCatalog([{ name: '任意名称-工程报价明细', range: 'A1:J5' }]))

    await expect(service.matchQuotation(scope(), 'quotation-1', recognition({
      ...testMapping(), sheetName: '模型猜测的表名'
    }))).rejects.toThrow('does not exist in the current workbook')

    await expect(service.matchQuotation(scope(), 'quotation-1', recognition({
      ...testMapping(), columns: { ...testMapping().columns, unitPrice: 'L', amount: 'M' }
    }))).rejects.toThrow('outside used column J')
  })

  it('searches only connected knowledgebases using name, project specification, unit, and code', async () => {
    lines.items.push(materialLine({ id: 'line-material' }))
    const search = jest.fn().mockResolvedValue([
      {
        id: 'chunk-12',
        pageContent: '镀锌钢管 DN50 热镀锌，单位m，南京材料价36.80元/m。',
        metadata: {
          knowledgebaseId: 'kb-price', documentId: 'doc-2026-07', chunkId: 'chunk-12',
          title: '南京工程造价信息 2026年7月', score: 0.93
        }
      }
    ])

    const result = await service.searchKnowledgePrices(
      scope(), 'quotation-1', 'line-material', ['kb-price'], { search } as never, 8
    )

    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      knowledgebaseIds: ['kb-price'],
      query: expect.stringMatching(/镀锌钢管[\s\S]*DN50 热镀锌[\s\S]*m[\s\S]*MAT-001/),
      source: 'xpert-quotation'
    }))
    expect(result).toEqual(expect.objectContaining({ candidateCount: 1, knowledgeNoMatchRecorded: false }))
    expect(lines.items[0]).toEqual(expect.objectContaining({
      knowledgeSearchedAt: expect.any(Date),
      knowledgeCandidates: [expect.objectContaining({
        knowledgebaseId: 'kb-price', documentId: 'doc-2026-07', chunkId: 'chunk-12', score: 0.93
      })]
    }))
  })

  it('searches normalized quota chunks for a bill row and persists an auditable work-scope snapshot', async () => {
    lines.items.push(line({
      id: 'line-bill', kind: 'bill', code: '011404001001', name: '墙面乳胶漆修补',
      specification: '1.部位：过道\n2.铲除旧乳胶漆及腻子；\n3.满批腻子两遍；\n4.涂刷内墙乳胶漆两遍'
    }))
    const search = jest.fn().mockResolvedValue([quotaKnowledgeDocument()])

    const result = await service.searchQuotaComponents(
      scope(), 'quotation-1', 'line-bill', ['kb-quota'], { search } as never, 12
    )

    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      knowledgebaseIds: ['kb-quota'],
      query: expect.stringMatching(/墙面乳胶漆修补[\s\S]*铲除旧乳胶漆及腻子[\s\S]*涂刷内墙乳胶漆两遍/),
      source: 'xpert-quotation-quota'
    }))
    expect(search.mock.calls[0][0]).not.toHaveProperty('filter')
    expect(result).toEqual(expect.objectContaining({
      candidateCount: 1,
      searchSnapshotId: expect.any(String),
      workScopes: ['铲除旧乳胶漆及腻子', '满批腻子两遍', '涂刷内墙乳胶漆两遍']
    }))
    expect(lines.items[0]).toEqual(expect.objectContaining({
      quotaSearchedAt: expect.any(Date),
      quotaWorkScopes: result.workScopes,
      quotaCandidates: [expect.objectContaining({ quotaCode: '15-161', reviewStatus: 'unreviewed' })],
      quotaBreakdown: expect.objectContaining({ mappingStatus: 'proposed' }),
      quotaPricingResources: expect.arrayContaining([
        expect.objectContaining({ category: '人工', code: '00150101', consumption: '0.036' }),
        expect.objectContaining({ category: '材料', code: '11010304', consumption: '2.884' })
      ])
    }))
  })

  it('replaces the quota consumption set when a reviewer selects another candidate', async () => {
    lines.items.push(line({
      id: 'line-select-quota', kind: 'bill', code: '010101001001', name: '级配砂石回填',
      specification: '机械分层回填、夯实', unit: 'm3'
    }))
    await service.searchQuotaComponents(
      scope(), 'quotation-1', 'line-select-quota', ['kb-quota'], { search: jest.fn().mockResolvedValue([quotaKnowledgeDocument()]) } as never
    )
    const selectedLine = lines.items.find((item) => item.id === 'line-select-quota')!
    const original = selectedLine.quotaCandidates[0]
    const alternative = {
      ...original,
      id: 'quota-choice-alternative',
      quotaCode: '1-47',
      quotaName: '砂石回填（碾压）',
      resources: [
        { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '0.150' },
        { category: '机械', code: '99130520', name: '履带式推土机', unit: '台班', consumption: '0.185' },
        { category: '材料', code: '04050208', name: '级配砂石', unit: 't', consumption: '1.050' }
      ]
    }
    selectedLine.quotaCandidates = [original, alternative]
    selectedLine.quotaResourcePrices = [{ resourceId: 'old-resource', status: 'approved', candidates: [], recommendation: { candidateId: 'old', priceItemId: 'old', normalizedUnitPrice: '1' } }]
    selectedLine.pricingCalculation = { status: 'calculated', comprehensiveUnitPrice: '999' }

    const result = await service.selectQuotaCandidate(
      scope(), 'quotation-1', 'line-select-quota', alternative.id
    )
    const persistedLine = lines.items.find((item) => item.id === 'line-select-quota')!

    expect(result).toEqual(expect.objectContaining({ candidateId: alternative.id, persisted: true }))
    expect(persistedLine.quotaBreakdown).toEqual(expect.objectContaining({
      components: [expect.objectContaining({ candidateId: alternative.id, quotaCode: '1-47' })]
    }))
    expect(persistedLine.quotaPricingResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: '机械', code: '99130520', consumption: '0.185' }),
      expect.objectContaining({ category: '材料', code: '04050208', consumption: '1.050' })
    ]))
    expect(persistedLine.quotaResourcePrices).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'not_searched' })
    ]))
    expect(persistedLine.pricingCalculation).toBeNull()
  })

  it('routes a direct-material bill row into a material resource without requiring a quota knowledgebase', async () => {
    lines.items.push(line({
      id: 'line-direct-material', code: '040103001001', name: '中砂材料采购',
      specification: '天然中砂，粒径 0.35-0.5mm，供应至现场', unit: 't', quantity: '120'
    }))

    const result = await service.searchQuotaComponents(
      scope(), 'quotation-1', 'line-direct-material', [], undefined
    )

    expect(result).toEqual(expect.objectContaining({ directMaterial: true, candidateCount: 0 }))
    expect(result.resourcePricing.resources).toEqual([
      expect.objectContaining({ category: '材料', name: '中砂材料采购 天然中砂，粒径 0.35-0.5mm，供应至现场', unit: 't', consumption: '1' })
    ])
    expect(lines.items.find((item) => item.id === 'line-direct-material')).toEqual(expect.objectContaining({
      materialReferenceOnly: true,
      quotaBreakdown: expect.objectContaining({ components: [expect.objectContaining({ directMaterial: true })] }),
      quotaPricingResources: [expect.objectContaining({ category: '材料' })],
      quotaResourcePrices: [expect.objectContaining({ status: 'not_searched' })]
    }))
  })

  it('recovers structured quota consumption when connected retrieval returns only a summary chunk', async () => {
    lines.items.push(line({ id: 'line-bill', kind: 'bill', name: '级配砂石回填', specification: '机械分层回填、夯实' }))
    const structuredCandidate = {
      id: 'quota-db-46', knowledgebaseId: 'xpert-quotation-database', quotaCode: '1-46', quotaName: '回填砂石', quotaUnit: 'm3',
      pageContent: '定额编号：1-46\n人材机消耗量：', extractionStatus: 'structured', extractedQuotaCodes: ['1-46'], reviewStatus: 'approved',
      ingestionReady: true, workContents: ['铺料、整平、洒水夯实'], resources: [
        { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '0.280' },
        { category: '材料', code: '04050207', name: '碎石 5-40mm', unit: 't', consumption: '0.640' },
        { category: '机械', code: '99130511', name: '电动夯实机', unit: '台班', consumption: '0.036' }
      ], adjustments: [], sourcePages: [24], query: '级配砂石回填', retrievedAt: new Date().toISOString()
    }
    const quotaKnowledge = {
      searchActiveQuota: jest.fn().mockResolvedValue([structuredCandidate]),
      hydrateKnowledgeCandidates: jest.fn().mockResolvedValue([])
    }
    const scopedService = new XpertQuotationService(
      quotations as never, lines as never, reviewService, historyService, office as never,
      new XpertQuotationKnowledgebaseAdapter(), quotaKnowledge as never
    )
    const result = await scopedService.searchQuotaComponents(scope(), 'quotation-1', 'line-bill', ['kb-quota'], {
      search: jest.fn().mockResolvedValue([{
        id: 'summary', pageContent: '定额编号 1-46 回填砂石，详见人材机表。',
        metadata: { knowledgebaseId: 'kb-quota', quotaCode: '1-46', quotaName: '回填砂石', quotaUnit: 'm3', documentType: 'quota_item' }
      }])
    } as never)
    expect(quotaKnowledge.searchActiveQuota).toHaveBeenCalled()
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ quotaCode: '1-46', resources: expect.arrayContaining([
        expect.objectContaining({ code: '00150101', consumption: '0.280' }),
        expect.objectContaining({ code: '04050207', consumption: '0.640' }),
        expect.objectContaining({ code: '99130511', consumption: '0.036' })
      ]) })
    ]))
    expect(result).toEqual(expect.objectContaining({ previewApplied: true, resourcePricing: expect.objectContaining({ resourceCount: 5 }) }))
    expect(lines.items.find((item) => item.id === 'line-bill')).toEqual(expect.objectContaining({
      quotaBreakdown: expect.objectContaining({ mappingStatus: 'proposed' }),
      quotaPricingResources: expect.arrayContaining([
        expect.objectContaining({ category: '人工', code: '00150101', consumption: '0.280' }),
        expect.objectContaining({ category: '材料', code: '04050207', consumption: '0.640' }),
        expect.objectContaining({ category: '机械', code: '99130511', consumption: '0.036' })
      ])
    }))
  })

  it('scopes quota candidate IDs to one line and one search snapshot', async () => {
    lines.items.push(
      line({ id: 'line-bill-a', kind: 'bill', name: '墙面乳胶漆', specification: '涂刷内墙乳胶漆两遍' }),
      line({ id: 'line-bill-b', kind: 'bill', name: '墙面乳胶漆', specification: '涂刷内墙乳胶漆两遍' })
    )
    const knowledgebase = { search: jest.fn().mockResolvedValue([quotaKnowledgeDocument()]) } as never

    const first = await service.searchQuotaComponents(scope(), 'quotation-1', 'line-bill-a', ['kb-quota'], knowledgebase)
    const otherLine = await service.searchQuotaComponents(scope(), 'quotation-1', 'line-bill-b', ['kb-quota'], knowledgebase)
    const latest = await service.searchQuotaComponents(scope(), 'quotation-1', 'line-bill-a', ['kb-quota'], knowledgebase)

    expect(first.candidates[0].id).not.toBe(otherLine.candidates[0].id)
    expect(first.candidates[0].id).not.toBe(latest.candidates[0].id)
    expect(first.searchSnapshotId).not.toBe(latest.searchSnapshotId)
    await expect(service.proposeQuotaBreakdown(scope(), 'quotation-1', 'line-bill-a', {
      components: [{
        candidateId: first.candidates[0].id,
        quotaCode: '15-161',
        coveredWorkScopes: ['涂刷内墙乳胶漆两遍'],
        confidence: 0.94,
        rationale: '工作内容和遍数一致。',
        differences: []
      }],
      uncoveredWorkScopes: [],
      rationale: '提交旧搜索快照。'
    })).rejects.toThrow(/line line-bill-a:.*never reuse candidate IDs across lines or after a re-search/)
  })

  it('does not bypass the Agent connection boundary with the legacy quota database', async () => {
    lines.items.push(line({ id: 'line-bill', kind: 'bill', name: '墙面乳胶漆' }))
    const legacyQuotaKnowledge = {
      searchActiveQuota: jest.fn().mockResolvedValue([]),
      hydrateKnowledgeCandidates: jest.fn().mockResolvedValue([])
    }
    const scopedService = new XpertQuotationService(
      quotations as never,
      lines as never,
      reviewService,
      historyService,
      office as never,
      new XpertQuotationKnowledgebaseAdapter(),
      legacyQuotaKnowledge as never
    )

    await expect(scopedService.searchQuotaComponents(
      scope(), 'quotation-1', 'line-bill', [], { search: jest.fn() } as never
    )).rejects.toThrow('not connected')
    expect(legacyQuotaKnowledge.searchActiveQuota).not.toHaveBeenCalled()
    expect(legacyQuotaKnowledge.hydrateKnowledgeCandidates).not.toHaveBeenCalled()
  })

  it('persists a strict partial quota breakdown without pricing or changing the bill match status', async () => {
    lines.items.push(line({
      id: 'line-bill', kind: 'bill', code: '011404001001', name: '墙面乳胶漆修补',
      specification: '1.铲除旧乳胶漆及腻子；\n2.涂刷内墙乳胶漆两遍'
    }))
    const searchResult = await service.searchQuotaComponents(scope(), 'quotation-1', 'line-bill', ['kb-quota'], {
      search: jest.fn().mockResolvedValue([quotaKnowledgeDocument()])
    } as never)
    const candidateId = searchResult.candidates[0].id

    const result = await service.proposeQuotaBreakdown(scope(), 'quotation-1', 'line-bill', {
      components: [{
        candidateId, quotaCode: '15-161', coveredWorkScopes: ['涂刷内墙乳胶漆两遍'], confidence: 0.94,
        rationale: '工作内容和遍数一致。', differences: []
      }],
      uncoveredWorkScopes: ['铲除旧乳胶漆及腻子'],
      rationale: '现有建筑装饰定额不覆盖铲除工作。'
    })

    expect(result).toEqual(expect.objectContaining({
      persisted: true,
      proposal: expect.objectContaining({ coverageStatus: 'partial', automaticPricingAllowed: false })
    }))
    expect(result.proposal.blockingReasons).toEqual(expect.arrayContaining([
      'uncovered_work', 'missing_repair_quota', 'unreviewed_quota_source', 'pricing_not_evaluated'
    ]))
    expect(result.proposal).toEqual(expect.objectContaining({
      skippedUncoveredWorkScopes: [],
      pricingFormulaRules: [expect.objectContaining({ status: 'skipped', ratePercent: '0' })]
    }))
    expect(lines.items[0]).toEqual(expect.objectContaining({
      matchStatus: 'unmatched', matchedUnitPrice: null,
      quotaBreakdown: expect.objectContaining({ mappingStatus: 'proposed' })
    }))
  })

  it('persists uncovered-work skip decisions and editable formula rules', async () => {
    const component = {
      candidateId: 'quota-1', quotaCode: '1-1', quotaName: '人工挖土', quotaUnit: 'm3',
      coveredWorkScopes: ['挖土'], confidence: 0.9, rationale: '匹配。', differences: [],
      knowledgebaseId: 'kb-quota', sourcePages: [1], sourceReviewStatus: 'approved', sourceIngestionReady: true,
      resources: [{ category: '人工' as const, code: '00150101', name: '普工', unit: '工日', consumption: '0.2' }],
      formulas: ['按直接费计取管理费']
    }
    lines.items.push(line({
      id: 'line-review-controls', kind: 'bill', quotaBreakdown: {
        coverageStatus: 'partial', mappingStatus: 'approved', components: [component], uncoveredWorkScopes: ['场内运输50m'],
        skippedUncoveredWorkScopes: [], pricingFormulaRules: [{
          id: 'formula-1', componentCandidateId: 'quota-1', code: 'formula-1', name: '按直接费计取管理费',
          ratePercent: '0', base: 'direct_cost', status: 'skipped', sourceText: '按直接费计取管理费'
        }],
        blockingReasons: ['pricing_not_evaluated', 'uncovered_work'], automaticPricingAllowed: false,
        rationale: '部分覆盖。', proposedAt: '2026-08-12T00:00:00.000Z'
      }
    }))

    await service.setUncoveredWorkSkipped(scope(), 'quotation-1', 'line-review-controls', '场内运输50m', true)
    const updated = await service.updatePricingFormulaRule(scope(), 'quotation-1', 'line-review-controls', {
      ruleId: 'formula-1', name: '管理费', ratePercent: '5', base: 'direct_cost', status: 'enabled'
    })

    expect(updated).toEqual(expect.objectContaining({ persisted: true, rule: expect.objectContaining({ name: '管理费', ratePercent: '5', status: 'enabled' }) }))
    expect(lines.items.find((item) => item.id === 'line-review-controls')?.quotaBreakdown).toEqual(expect.objectContaining({
      skippedUncoveredWorkScopes: ['场内运输50m'],
      pricingFormulaRules: [expect.objectContaining({ name: '管理费', ratePercent: '5', status: 'enabled' })]
    }))
  })

  it('records an explicit quota-breakdown review without clearing pricing blockers or pricing the bill', async () => {
    lines.items.push(line({
      id: 'line-bill', kind: 'bill', code: '011404001001', name: '墙面乳胶漆修补',
      specification: '1.铲除旧乳胶漆及腻子；\n2.涂刷内墙乳胶漆两遍'
    }))
    const searchResult = await service.searchQuotaComponents(scope(), 'quotation-1', 'line-bill', ['kb-quota'], {
      search: jest.fn().mockResolvedValue([quotaKnowledgeDocument()])
    } as never)
    await service.proposeQuotaBreakdown(scope(), 'quotation-1', 'line-bill', {
      components: [{
        candidateId: searchResult.candidates[0].id,
        coveredWorkScopes: ['涂刷内墙乳胶漆两遍'],
        confidence: 0.94,
        rationale: '工作内容和遍数一致。',
        differences: []
      }],
      uncoveredWorkScopes: ['铲除旧乳胶漆及腻子'],
      rationale: '现有建筑装饰定额不覆盖铲除工作。'
    })

    const result = await service.reviewQuotaBreakdown(
      scope(), 'quotation-1', 'line-bill', 'approve', '确认当前部分映射，保留未覆盖项。'
    )

    expect(result).toEqual(expect.objectContaining({
      decision: 'approve', mappingStatus: 'approved', automaticPricingAllowed: false
    }))
    expect(result.blockingReasons).toEqual(expect.arrayContaining([
      'uncovered_work', 'missing_repair_quota', 'unreviewed_quota_source', 'pricing_not_evaluated'
    ]))
    expect(lines.items[0]).toEqual(expect.objectContaining({
      matchStatus: 'unmatched', matchedUnitPrice: null,
      quotaBreakdown: expect.objectContaining({
        mappingStatus: 'approved',
        reviewComment: '确认当前部分映射，保留未覆盖项。',
        reviewedAt: expect.any(String),
        automaticPricingAllowed: false
      })
    }))
    await expect(service.reviewQuotaBreakdown(
      scope(), 'quotation-1', 'line-bill', 'reject', '重复审核。'
    )).rejects.toThrow('Only a proposed quota breakdown')
  })

  it('rejects a proposed quota breakdown without changing the unresolved bill price state', async () => {
    lines.items.push(line({
      id: 'line-bill', kind: 'bill', name: '墙面乳胶漆修补',
      quotaBreakdown: {
        coverageStatus: 'partial', mappingStatus: 'proposed', components: [],
        uncoveredWorkScopes: ['铲除旧乳胶漆及腻子'],
        blockingReasons: ['pricing_not_evaluated', 'uncovered_work', 'missing_repair_quota'],
        automaticPricingAllowed: false,
        rationale: '当前没有可靠候选。',
        proposedAt: '2026-08-10T01:00:00.000Z'
      }
    }))

    const result = await service.reviewQuotaBreakdown(
      scope(), 'quotation-1', 'line-bill', 'reject', '工作范围与定额工作内容不一致。'
    )

    expect(result).toEqual(expect.objectContaining({ decision: 'reject', mappingStatus: 'rejected' }))
    expect(lines.items[0]).toEqual(expect.objectContaining({
      matchStatus: 'unmatched', matchedUnitPrice: null,
      quotaBreakdown: expect.objectContaining({ mappingStatus: 'rejected', automaticPricingAllowed: false })
    }))
  })

  it('does not use a material-price knowledgebase for bill or measure rows', async () => {
    lines.items.push(line({ id: 'line-bill', kind: 'bill' }))

    await expect(service.searchKnowledgePrices(
      scope(), 'quotation-1', 'line-bill', ['kb-price'], { search: jest.fn() } as never
    )).rejects.toThrow('material prices only')
  })

  it('does not route a bill containing a named material into material-price search', async () => {
    lines.items.push(line({
      id: 'line-bill-material', kind: 'bill', name: '级配砂石回填',
      specification: '级配砂石，分层夯实，厚度300mm'
    }))

    await expect(service.searchKnowledgePrices(
      scope(), 'quotation-1', 'line-bill-material', ['kb-price'], { search: jest.fn() } as never
    )).rejects.toThrow('Bill rows must use quota decomposition and resource-price search')
  })

  it('converts a material knowledge price into the quotation unit while preserving source evidence', async () => {
    lines.items.push(materialLine({
      id: 'line-material-convert', name: '水泥', specification: '42.5级', unit: 'kg', quantity: '1000',
      knowledgeSearchedAt: new Date(), knowledgeCandidates: [{
        ...knowledgeCandidate(), pageContent: '水泥42.5级，市场价4200.00元/t。'
      }]
    }))

    const recommendation = await service.recommendKnowledgePrice(scope(), 'quotation-1', 'line-material-convert', {
      candidateId: 'kb_candidate', unitPrice: '4200.00', sourceUnit: 't', matchedMaterialName: '水泥',
      matchedSpecification: '42.5级', evidenceQuote: '水泥42.5级，市场价4200.00元/t。', confidence: 0.95,
      rationale: '材料和规格一致，吨价可确定换算为公斤价。', differences: ['来源单位为t，清单单位为kg。']
    })

    expect(recommendation.recommendation).toEqual(expect.objectContaining({
      sourceUnitPrice: '4200.00', unitPrice: '4.2',
      unitConversion: expect.objectContaining({ sourceUnit: 't', targetUnit: 'kg', factor: '0.001' })
    }))
    expect(lines.items[0]).toEqual(expect.objectContaining({
      aiRecommendedUnitPrice: '4.2', aiRecommendedSourceUnitPrice: '4200.00',
      aiUnitConversion: expect.objectContaining({ factor: '0.001' })
    }))
  })

  it('persists a selected knowledge chunk recommendation and applies it only after review', async () => {
    lines.items.push(materialLine({ id: 'line-material', quantity: '10' }))
    await service.searchKnowledgePrices(scope(), 'quotation-1', 'line-material', ['kb-price'], {
      search: jest.fn().mockResolvedValue([knowledgeDocument()])
    } as never)
    const candidateId = lines.items[0].knowledgeCandidates[0].id

    const recommendation = await service.recommendKnowledgePrice(scope(), 'quotation-1', 'line-material', {
      candidateId,
      unitPrice: '36.80',
      sourceUnit: 'm',
      matchedMaterialName: '镀锌钢管',
      matchedSpecification: 'DN50 热镀锌',
      evidenceQuote: '镀锌钢管 DN50 热镀锌，单位m，南京材料价36.80元/m。',
      confidence: 0.94,
      rationale: '名称、DN50 规格、热镀锌材质和单位均一致。',
      differences: []
    })

    expect(recommendation).toEqual(expect.objectContaining({
      persisted: true,
      recommendation: expect.objectContaining({ kind: 'knowledge', candidateId, unitPrice: '36.80', sourceUnitPrice: '36.80' })
    }))
    expect(lines.items[0]).toEqual(expect.objectContaining({ matchStatus: 'unmatched', matchedUnitPrice: null }))

    const accepted = await service.acceptAiRecommendation(scope(), 'quotation-1', 'line-material')
    expect(accepted.line).toEqual(expect.objectContaining({
      matchStatus: 'confirmed', matchedUnitPrice: '36.80', calculatedAmount: '368.00'
    }))
    expect(office.patchExcelPreservingFormat).not.toHaveBeenCalled()
  })

  it('rejects stale candidates, fabricated quotes, prices absent from evidence, and unit mismatches', async () => {
    lines.items.push(materialLine({
      id: 'line-material',
      knowledgeSearchedAt: new Date(),
      knowledgeCandidates: [knowledgeCandidate()]
    }))
    const base = {
      unitPrice: '36.80', sourceUnit: 'm', matchedMaterialName: '镀锌钢管', matchedSpecification: 'DN50',
      evidenceQuote: knowledgeCandidate().pageContent, confidence: 0.9, rationale: '规格一致。', differences: []
    }

    await expect(service.recommendKnowledgePrice(scope(), 'quotation-1', 'line-material', {
      ...base, candidateId: 'missing'
    })).rejects.toThrow('not part of the current line search result')
    await expect(service.recommendKnowledgePrice(scope(), 'quotation-1', 'line-material', {
      ...base, candidateId: 'kb_candidate', evidenceQuote: '不存在的报价原文 36.80元/m'
    })).rejects.toThrow('not present')
    await expect(service.recommendKnowledgePrice(scope(), 'quotation-1', 'line-material', {
      ...base, candidateId: 'kb_candidate', evidenceQuote: '镀锌钢管 DN50 热镀锌，单位m'
    })).rejects.toThrow('does not contain the recommended unit price and source unit')
    await expect(service.recommendKnowledgePrice(scope(), 'quotation-1', 'line-material', {
      ...base, candidateId: 'kb_candidate', unitPrice: '99.99'
    })).rejects.toThrow('does not contain')
    await expect(service.recommendKnowledgePrice(scope(), 'quotation-1', 'line-material', {
      ...base, candidateId: 'kb_candidate', sourceUnit: 'kg'
    })).rejects.toThrow('does not match quotation unit')
  })

  it('requires every current candidate to be rejected before web fallback can be saved', async () => {
    lines.items.push(materialLine({
      id: 'line-material', quantity: '10', knowledgeSearchedAt: new Date(),
      knowledgeCandidates: [knowledgeCandidate()]
    }))
    const webInput = {
      unitPrice: '38.20', sourceUnit: 'm', currency: 'CNY' as const, confidence: 0.82,
      rationale: '南京近期公开采购价格，规格和单位一致。',
      sources: [{
        title: '南京公开采购价格', url: 'https://example.com/nanjing-material-price',
        quote: 'DN50 热镀锌钢管含税材料单价为 38.20 元/m。', publishedAt: '2026-07-18'
      }]
    }

    await expect(service.recommendWebPrice(scope(), 'quotation-1', 'line-material', webInput))
      .rejects.toThrow('persisted no-match decision')
    await expect(service.markKnowledgeNoMatch(scope(), 'quotation-1', 'line-material', [], '规格不符。'))
      .rejects.toThrow('every current knowledge candidate')

    const noMatch = await service.markKnowledgeNoMatch(
      scope(), 'quotation-1', 'line-material', ['kb_candidate'], '知识片段为沟槽连接型号，与报价的螺纹连接规格不符。'
    )
    await expect(service.recommendWebPrice(scope(), 'quotation-1', 'line-material', {
      ...webInput,
      sources: [{ ...webInput.sources[0], quote: 'DN50 热镀锌钢管，详见网页报价。' }]
    })).rejects.toThrow('must explicitly contain the recommended unit price and source unit')
    const recommended = await service.recommendWebPrice(scope(), 'quotation-1', 'line-material', webInput)
    const accepted = await service.acceptAiRecommendation(scope(), 'quotation-1', 'line-material')

    expect(noMatch).toEqual(expect.objectContaining({ knowledgeNoMatchRecorded: true, reviewedCandidateCount: 1 }))
    expect(recommended).toEqual(expect.objectContaining({ persisted: true, recommendation: expect.objectContaining({ kind: 'web' }) }))
    expect(accepted.line).toEqual(expect.objectContaining({ matchStatus: 'confirmed', matchedUnitPrice: '38.20', calculatedAmount: '382.00' }))
  })

  it('applies every knowledgebase AI recommendation as one undoable review action', async () => {
    lines.items.push(
      materialLine({ id: 'line-a', rowNumber: 20, quantity: '10', knowledgeCandidates: [knowledgeCandidate()], ...knowledgeRecommendationFields('36.80') }),
      materialLine({ id: 'line-b', rowNumber: 21, quantity: '2', knowledgeCandidates: [knowledgeCandidate()], ...knowledgeRecommendationFields('36.80') }),
      materialLine({ id: 'line-pending', rowNumber: 22 })
    )

    const result = await service.acceptAiRecommendations(scope(), 'quotation-1', 'knowledge')

    expect(result).toEqual(expect.objectContaining({ acceptedCount: 2, recommendationKind: 'knowledge' }))
    expect(lines.items.filter((item) => item.matchStatus === 'confirmed')).toHaveLength(2)
    expect(lines.items.find((item) => item.id === 'line-pending')?.matchStatus).toBe('unmatched')

    await service.undoLast(scope())
    expect(lines.items.filter((item) => item.matchStatus === 'unmatched')).toHaveLength(3)
  })

  it('accepts a non-negative manual price and calculates the amount', async () => {
    lines.items.push(line({ id: 'line-unmatched', quantity: '2.5', matchStatus: 'unmatched' }))

    const result = await service.setManualPrice(scope(), 'quotation-1', 'line-unmatched', '12.5')

    expect(result.line).toEqual(expect.objectContaining({
      matchStatus: 'confirmed', matchedUnitPrice: '12.5', calculatedAmount: '31.25'
    }))
    await expect(service.setManualPrice(scope(), 'quotation-1', 'line-unmatched', '-1')).rejects.toThrow('non-negative decimal')
  })

  it('applies approved rows while unresolved rows remain untouched and omits premature totals', async () => {
    lines.items.push(
      line({ id: 'line-priced', matchStatus: 'confirmed', matchedUnitPrice: '10', calculatedAmount: '20.00' }),
      line({ id: 'line-unmatched', rowNumber: 9, targetPriceAddress: 'I9', targetAmountAddress: 'J9' })
    )

    const result = await service.applyQuotation(scope(), 'quotation-1', 'Apply approved rows')

    expect(result).toEqual(expect.objectContaining({ appliedLineCount: 1, unresolvedCount: 1, totalsWritten: false }))
    expect(office.patchExcelPreservingFormat).toHaveBeenCalledWith(scope(), expect.objectContaining({
      patches: [
        expect.objectContaining({ address: 'I8', value: '10' }),
        expect.objectContaining({ address: 'J8', cachedValue: '20.00' })
      ]
    }))
  })

  it('returns an overwrite confirmation request without changing Excel or line state', async () => {
    lines.items.push(line({ id: 'line-priced', matchStatus: 'confirmed', matchedUnitPrice: '10', calculatedAmount: '20.00' }))
    office.findOccupiedPatchTargets.mockResolvedValue({
      versionNumber: 1,
      targets: [
        { sheetName: '3.2E.2.1 分部分项工程项目清单计价表', address: 'I8' },
        { sheetName: '3.2E.2.1 分部分项工程项目清单计价表', address: 'J8' }
      ]
    })

    const result = await service.applyQuotation(scope(), 'quotation-1', 'Apply approved row', 'line-priced')

    expect(result).toEqual({
      status: 'overwrite_required', expectedVersionNumber: 1, occupiedCellCount: 2,
      occupiedCells: [
        { sheetName: '3.2E.2.1 分部分项工程项目清单计价表', address: 'I8' },
        { sheetName: '3.2E.2.1 分部分项工程项目清单计价表', address: 'J8' }
      ],
      occupiedCellsTruncated: false
    })
    expect(office.patchExcelPreservingFormat).not.toHaveBeenCalled()
    expect(lines.items[0]).toEqual(expect.objectContaining({ matchStatus: 'confirmed' }))
  })

  it('overwrites occupied Excel targets only for the confirmed workbook version', async () => {
    lines.items.push(line({ id: 'line-priced', matchStatus: 'confirmed', matchedUnitPrice: '10', calculatedAmount: '20.00' }))

    await service.applyQuotation(scope(), 'quotation-1', 'Overwrite approved row', 'line-priced', {
      overwriteExisting: true, expectedVersionNumber: 1
    })

    expect(office.findOccupiedPatchTargets).not.toHaveBeenCalled()
    expect(office.patchExcelPreservingFormat).toHaveBeenCalledWith(scope(), expect.objectContaining({
      expectedVersionNumber: 1,
      patches: [
        expect.objectContaining({ address: 'I8', expectedCellState: { kind: 'any' } }),
        expect.objectContaining({ address: 'J8', expectedCellState: { kind: 'any' } })
      ]
    }))
  })

  it('rejects an overwrite confirmation after the workbook version changes', async () => {
    lines.items.push(line({ id: 'line-priced', matchStatus: 'confirmed', matchedUnitPrice: '10', calculatedAmount: '20.00' }))
    quotations.items[0].officeVersionNumber = 2

    await expect(service.applyQuotation(scope(), 'quotation-1', 'Overwrite approved row', 'line-priced', {
      overwriteExisting: true, expectedVersionNumber: 1
    })).rejects.toThrow('version conflict')
    expect(office.patchExcelPreservingFormat).not.toHaveBeenCalled()
  })

  it('does not write a zero comprehensive rate to Excel', async () => {
    lines.items.push(line({
      id: 'line-zero-preview',
      matchStatus: 'confirmed',
      matchedUnitPrice: '0.0000',
      calculatedAmount: '0.00',
      pricingCalculation: {
        status: 'calculated',
        engineVersion: '1.0.0',
        quotaBreakdownProposedAt: '2026-08-17T00:00:00.000Z',
        quantity: '120',
        billUnit: 't',
        resourceCosts: [],
        directCosts: { labor: '0', material: '0', machine: '0', total: '0' },
        fees: [],
        comprehensiveUnitPrice: '0.0000',
        totalAmount: '0.00',
        unitPriceScale: 4,
        calculationWarnings: ['资源 中砂 没有已采用价格，金额按 0 计。'],
        unpricedResourceIds: ['resource-sand'],
        calculatedAt: '2026-08-17T01:00:00.000Z'
      }
    }))

    await expect(service.applyQuotation(scope(), 'quotation-1', 'Apply approved rows'))
      .rejects.toThrow('综合单价为 0')
    expect(office.patchExcelPreservingFormat).not.toHaveBeenCalled()
  })

  it('writes a non-zero partial comprehensive rate while unpriced resources remain visible as warnings', async () => {
    lines.items.push(line({
      id: 'line-partial-price',
      matchStatus: 'confirmed',
      matchedUnitPrice: '183.6660',
      calculatedAmount: '22039.92',
      pricingCalculation: {
        status: 'calculated',
        engineVersion: '1.0.0',
        quotaBreakdownProposedAt: '2026-08-17T00:00:00.000Z',
        quantity: '120',
        billUnit: 't',
        resourceCosts: [],
        directCosts: { labor: '0', material: '183.6660', machine: '0', total: '183.6660' },
        fees: [],
        comprehensiveUnitPrice: '183.6660',
        totalAmount: '22039.92',
        unitPriceScale: 4,
        calculationWarnings: ['资源 普工 没有已采用价格，金额按 0 计。'],
        unpricedResourceIds: ['resource-labor'],
        calculatedAt: '2026-08-17T01:00:00.000Z'
      }
    }))

    await service.applyQuotation(scope(), 'quotation-1', 'Apply partial calculation')

    expect(office.patchExcelPreservingFormat).toHaveBeenCalledWith(scope(), expect.objectContaining({
      patches: expect.arrayContaining([
        expect.objectContaining({ address: 'I8', value: '183.6660' }),
        expect.objectContaining({ address: 'J8', cachedValue: '22039.92' })
      ])
    }))
  })

  it('applies only the requested quotation line and leaves other calculated rows untouched', async () => {
    lines.items.push(
      line({ id: 'line-first', matchStatus: 'confirmed', matchedUnitPrice: '10', calculatedAmount: '20.00' }),
      line({ id: 'line-second', rowNumber: 9, targetPriceAddress: 'I9', targetAmountAddress: 'J9', matchStatus: 'confirmed', matchedUnitPrice: '30', calculatedAmount: '60.00' })
    )

    const result = await service.applyQuotation(scope(), 'quotation-1', 'Apply current row only', 'line-first')
    const patches = office.patchExcelPreservingFormat.mock.calls[0][1].patches

    expect(result).toEqual(expect.objectContaining({ appliedLineCount: 1, totalsWritten: false }))
    expect(patches).toEqual([
      expect.objectContaining({ address: 'I8', value: '10', evidenceId: 'line-first' }),
      expect.objectContaining({ address: 'J8', cachedValue: '20.00', evidenceId: 'line-first' })
    ])
    expect(patches.some((patch: { address: string }) => patch.address === 'I9' || patch.address === 'J9')).toBe(false)
    expect(lines.items.find((item) => item.id === 'line-first')).toEqual(expect.objectContaining({ matchStatus: 'applied' }))
    expect(lines.items.find((item) => item.id === 'line-second')).toEqual(expect.objectContaining({ matchStatus: 'confirmed' }))
  })

  it('skips an unresolved row and writes totals without touching the skipped target', async () => {
    lines.items.push(
      line({ id: 'line-priced', matchStatus: 'confirmed', matchedUnitPrice: '10', calculatedAmount: '20.00' }),
      line({ id: 'line-unmatched', rowNumber: 9, targetPriceAddress: 'I9', targetAmountAddress: 'J9' })
    )

    await service.skipLine(scope(), 'quotation-1', 'line-unmatched')
    const result = await service.applyQuotation(scope(), 'quotation-1', 'Apply with skipped row')
    const patches = office.patchExcelPreservingFormat.mock.calls[0][1].patches

    expect(result).toEqual(expect.objectContaining({ skippedCount: 1, unresolvedCount: 0, totalsWritten: true }))
    expect(patches.some((patch: { address: string }) => patch.address === 'I9' || patch.address === 'J9')).toBe(false)
    expect(patches).toEqual(expect.arrayContaining([expect.objectContaining({ address: 'J150' })]))
  })

  it('deletes and restores a quotation through one-step undo', async () => {
    await service.deleteQuotation(scope(), 'quotation-1')
    expect(await quotations.findOne({ where: { id: 'quotation-1' } })).toBeNull()

    await service.undoLast(scope())
    expect(await quotations.findOne({ where: { id: 'quotation-1' } })).toEqual(expect.objectContaining({ id: 'quotation-1', deletedAt: null }))
  })

  it('undoes an Excel apply by restoring the previous workbook version and line state', async () => {
    lines.items.push(line({ id: 'line-priced', matchStatus: 'confirmed', matchedUnitPrice: '10', calculatedAmount: '20.00' }))
    await service.applyQuotation(scope(), 'quotation-1', 'Apply approved row')

    const result = await service.undoLast(scope())

    expect(result).toEqual(expect.objectContaining({ undone: true, action: 'apply_workbook' }))
    expect(office.restoreExcelVersion).toHaveBeenCalledWith(scope(), expect.objectContaining({
      documentId: 'office-1', versionId: 'file-version-1', expectedVersionNumber: 2
    }))
    expect(lines.items[0]).toEqual(expect.objectContaining({ matchStatus: 'confirmed' }))
  })
})

function scope() {
  return { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' }
}

function quotation() {
  return {
    id: 'quotation-1', tenantId: 'tenant-1', organizationId: 'org-1', title: 'Test quotation', officeDocumentId: 'office-1',
    officeFileVersionId: 'file-version-1', officeVersionNumber: 1, status: 'review_required', matchedCount: 0, reviewCount: 0, unmatchedCount: 0,
    sheetMappings: [testMapping({ sheetName: '3.2E.2.1 分部分项工程项目清单计价表', dataEndRow: 149, totals: { finalTotalRow: 150 } })], warnings: []
  }
}

function line(overrides: Record<string, unknown>) {
  return {
    tenantId: 'tenant-1', organizationId: 'org-1', quotationId: 'quotation-1', sheetName: '3.2E.2.1 分部分项工程项目清单计价表',
    rowNumber: 8, discipline: 'building', kind: 'bill', code: '010101001001', name: '测试清单项', specification: '测试项目特征', unit: 'm2', quantity: '2',
    quantityAddress: 'H8', targetPriceAddress: 'I8', targetAmountAddress: 'J8', matchStatus: 'unmatched', matchedPriceItemId: null, matchedUnitPrice: null,
    calculatedAmount: null, candidateIds: [], knowledgeCandidates: [], matchEvidence: '待匹配', ...overrides
  }
}

function materialLine(overrides: Record<string, unknown>) {
  return line({
    kind: 'material', code: 'MAT-001', name: '镀锌钢管', specification: 'DN50 热镀锌', unit: 'm', quantity: '10',
    sheetName: '3.3E.2.3 材料暂估单价及调整表', ...overrides
  })
}

function knowledgeDocument() {
  return {
    id: 'chunk-12',
    pageContent: '镀锌钢管 DN50 热镀锌，单位m，南京材料价36.80元/m。',
    metadata: { knowledgebaseId: 'kb-price', documentId: 'doc-2026-07', chunkId: 'chunk-12', title: '南京工程造价信息 2026年7月', score: 0.93 }
  }
}

function quotaKnowledgeDocument() {
  return {
    id: 'chunk-15-161',
    pageContent: [
      '定额编号：15-161',
      '定额名称：内墙面乳胶漆 二遍',
      '计量单位：10m2',
      '工作内容：',
      '- 清扫基层、刷乳胶漆、打磨等。',
      '人材机消耗量：',
      '- 人工 | 00150101 | 普工 | 工日 | 0.036',
      '- 材料 | 11010304 | 内墙乳胶漆 | kg | 2.884',
      '来源：docs/source.pdf，PDF 第 617 页',
      '审核状态：机器提取，未经造价人员复核，不得直接用于自动计价。'
    ].join('\n'),
    metadata: {
      knowledgebaseId: 'kb-quota', documentType: 'quota_item', documentId: 'doc-quota', chunkId: 'chunk-15-161',
      quotaCode: '15-161', quotaUnit: '10m2', discipline: '建筑与装饰工程', region: '江苏省', edition: '2026',
      sourceFile: 'docs/source.pdf', sourcePage: 617, reviewStatus: 'unreviewed', ingestionReady: true, score: 0.95
    }
  }
}

function knowledgeCandidate() {
  return {
    id: 'kb_candidate', knowledgebaseId: 'kb-price', documentId: 'doc-2026-07', chunkId: 'chunk-12',
    documentName: '南京工程造价信息 2026年7月', pageContent: knowledgeDocument().pageContent,
    score: 0.93, sourcePages: [], priceItems: [], query: '镀锌钢管 DN50 热镀锌 m', retrievedAt: new Date().toISOString()
  }
}

function knowledgeRecommendationFields(unitPrice: string) {
  return {
    aiRecommendedKnowledgeCandidateId: 'kb_candidate', aiRecommendedKnowledgebaseId: 'kb-price',
    aiRecommendedDocumentId: 'doc-2026-07', aiRecommendedChunkId: 'chunk-12', aiMatchedMaterialName: '镀锌钢管',
    aiMatchedSpecification: 'DN50 热镀锌', aiKnowledgeEvidence: knowledgeCandidate().pageContent,
    aiRecommendedUnitPrice: unitPrice, aiRecommendedSourceUnit: 'm', aiConfidence: 0.94,
    aiRationale: '名称、规格、材质和单位一致。', aiDifferences: [], aiRecommendedAt: new Date()
  }
}

function recognition(mapping: ReturnType<typeof testMapping>) {
  return {
    sheetMappings: [mapping], recognitionConfidence: 0.94,
    recognitionRationale: '根据表内项目编码、项目名称、项目特征描述、工程量、综合单价和合价表头识别。',
    changeSummary: '识别任意名称报价工作表并建立列映射。'
  }
}

function testMapping(overrides: Record<string, unknown> = {}) {
  return {
    sheetName: '任意名称-工程报价明细', discipline: 'building' as const, kind: 'bill' as const,
    headerRow: 2, dataStartRow: 4, dataEndRow: 4,
    columns: { code: 'B', name: 'C', specification: ['D', 'E'], unit: 'G', quantity: 'H', unitPrice: 'I', amount: 'J' },
    totals: { finalTotalRow: 5 }, confidence: 0.96,
    rationale: '表头语义和数据样本与分部分项清单一致。',
    evidence: ['B2=项目编码', 'C2=项目名称', 'D2=项目特征描述', 'H2=工程量', 'I2=综合单价', 'J2=合价'],
    ...overrides
  }
}

function mappedRows() {
  const rows = Array.from({ length: 5 }, (_, rowIndex) => Array.from({ length: 10 }, (_, columnIndex) => ({
    address: `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`,
    value: null as string | number | null
  })))
  rows[1][1].value = '项目编码'
  rows[1][2].value = '项目名称'
  rows[1][3].value = '项目特征描述'
  rows[1][4].value = '补充规格'
  rows[1][6].value = '计量单位'
  rows[1][7].value = '工程量'
  rows[1][8].value = '综合单价'
  rows[1][9].value = '合价'
  rows[3][1].value = 'MAT-001'
  rows[3][2].value = '镀锌钢管'
  rows[3][3].value = '镀锌钢管 DN50'
  rows[3][4].value = '热镀锌'
  rows[3][6].value = 'm'
  rows[3][7].value = 2
  return rows
}

function officeCatalog(sheets: Array<{ name: string; range: string }>) {
  return {
    documentId: 'office-1', fileVersionId: 'file-version-1', versionNumber: 1, fileName: 'quotation.xlsx',
    workbook: { sheets }
  }
}

function officeRead(sheetName: string, range: string, rows: ReturnType<typeof mappedRows>) {
  return {
    ...officeCatalog([{ name: sheetName, range }]),
    workbook: { sheets: [{ name: sheetName, range }], sheetName, range, rows }
  }
}

function createOffice() {
  return {
    importWorkbook: jest.fn(), readExcel: jest.fn(), getExcelFile: jest.fn().mockResolvedValue(null), openDocument: jest.fn().mockResolvedValue(null), saveSnapshot: jest.fn(),
    findOccupiedPatchTargets: jest.fn().mockResolvedValue({ versionNumber: 1, targets: [] }),
    patchExcelPreservingFormat: jest.fn().mockResolvedValue({
      fileVersion: { id: 'file-version-2', versionNumber: 2, fileName: 'quotation.xlsx' },
      file: { fileName: 'quotation.xlsx', filePath: '/quotation.xlsx', fileUrl: '/quotation.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
      replayed: false
    }),
    restoreExcelVersion: jest.fn().mockResolvedValue({
      fileVersion: { id: 'file-version-3', versionNumber: 3, fileName: 'quotation.xlsx' },
      file: { fileName: 'quotation.xlsx', filePath: '/quotation.xlsx', fileUrl: '/quotation.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
      replayed: false
    })
  }
}

class MemoryRepository {
  constructor(public items: Array<Record<string, any>>) {}

  create(value: Record<string, any>) { return { ...value } }

  async save(value: Record<string, any> | Array<Record<string, any>>): Promise<any> {
    if (Array.isArray(value)) return Promise.all(value.map((item) => this.save(item)))
    const existing = value.id ? this.items.findIndex((item) => item.id === value.id) : -1
    const saved = { ...(existing >= 0 ? this.items[existing] : {}), ...value, id: value.id ?? `id-${this.items.length + 1}`, createdAt: value.createdAt ?? (existing >= 0 ? this.items[existing].createdAt : new Date()) }
    if (existing >= 0) this.items[existing] = saved
    else this.items.push(saved)
    return saved
  }

  async findOne(input: { where: Record<string, unknown>; withDeleted?: boolean; order?: Record<string, 'ASC' | 'DESC'> }) {
    const filtered = this.active(input.withDeleted).filter((item) => matches(item, input.where))
    return orderItems(filtered, input.order)[0] ?? null
  }
  async find(input: { where: Record<string, unknown>; withDeleted?: boolean; order?: Record<string, 'ASC' | 'DESC'>; take?: number }) {
    const items = orderItems(this.active(input.withDeleted).filter((item) => matches(item, input.where)), input.order)
    return input.take ? items.slice(0, input.take) : items
  }
  async findAndCount(input: { where: Record<string, unknown>; skip?: number; take?: number }) {
    const filtered = this.active(false).filter((item) => matches(item, input.where))
    const start = input.skip ?? 0
    return [filtered.slice(start, start + (input.take ?? filtered.length)), filtered.length]
  }
  async count(input: { where: Record<string, unknown> }) { return this.active(false).filter((item) => matches(item, input.where)).length }
  async delete(where: Record<string, unknown>) { this.items = this.items.filter((item) => !matches(item, where)); return { affected: 1 } }
  async softDelete(where: Record<string, unknown>) { this.items = this.items.map((item) => matches(item, where) ? { ...item, deletedAt: new Date() } : item); return { affected: 1 } }
  async restore(where: Record<string, unknown>) { this.items = this.items.map((item) => matches(item, where) ? { ...item, deletedAt: null } : item); return { affected: 1 } }
  private active(withDeleted = false) { return withDeleted ? [...this.items] : this.items.filter((item) => !item.deletedAt) }
}

function matches(item: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && '_type' in value && value._type === 'in' && '_value' in value) {
      return Array.isArray(value._value) && value._value.includes(item[key])
    }
    if (value && typeof value === 'object' && '_type' in value && value._type === 'isNull') return item[key] == null
    return item[key] === value
  })
}

function orderItems(items: Array<Record<string, any>>, order?: Record<string, 'ASC' | 'DESC'>) {
  if (!order) return items
  return [...items].sort((left, right) => {
    for (const [key, direction] of Object.entries(order)) {
      const comparison = String(left[key] ?? '').localeCompare(String(right[key] ?? ''))
      if (comparison) return direction === 'DESC' ? -comparison : comparison
    }
    return 0
  })
}

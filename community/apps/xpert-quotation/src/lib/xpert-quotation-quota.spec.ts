import {
  buildQuotaBreakdownProposal,
  buildQuotaKnowledgeQuery,
  buildDirectMaterialQuotaProposal,
  buildQuotaSearchPreview,
  expandPersistedQuotaCandidates,
  extractQuotaWorkScopes,
  fallbackQuotaResources,
  hasConcreteQuotaResources,
  repairPersistedQuotaCandidate,
  selectPersistedQuotaCandidate,
  toQuotaKnowledgeCandidates
} from './xpert-quotation-quota.js'
import type { XpertQuotationLine } from './entities/xpert-quotation-line.entity.js'
import type { QuotaKnowledgeCandidate } from './types.js'

describe('Xpert quotation quota decomposition', () => {
  it('restores concrete resources from a normalized resource section over pending legacy rows', () => {
    const content = [
      '定额编号：1-46',
      '定额名称：回填砂石',
      '计量单位：m3',
      '人材机消耗量：',
      '- 人工 | 00150101 | 普工 | 工日 | 0.280',
      '- 材料 | 04030100 | 黄砂 | t | 1.050',
      '- 材料 | 04050207 | 碎石 5-40mm | t | 0.640',
      '- 材料 | 31150101 | 水 | m3 | 0.300',
      '- 机械 | 99130511 | 电动夯实机 | 台班 | 0.036'
    ].join('\n')
    const repaired = repairPersistedQuotaCandidate({
      id: 'pending-46', knowledgebaseId: 'kb', quotaCode: '1-46', quotaName: '回填砂石', quotaUnit: 'm3',
      pageContent: content, extractionStatus: 'partial', extractedQuotaCodes: ['1-46'], reviewStatus: 'unknown',
      ingestionReady: false, workContents: [], resources: fallbackQuotaResources('1-46', '回填砂石'), adjustments: [],
      sourcePages: [], query: '回填砂石', retrievedAt: new Date().toISOString()
    })
    expect(hasConcreteQuotaResources(repaired.resources)).toBe(true)
    expect(repaired).toEqual(expect.objectContaining({ extractionStatus: 'structured', ingestionReady: true }))
    expect(repaired.resources).toEqual(expect.arrayContaining([
      { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '0.280' },
      { category: '材料', code: '04050207', name: '碎石 5-40mm', unit: 't', consumption: '0.640' },
      { category: '机械', code: '99130511', name: '电动夯实机', unit: '台班', consumption: '0.036' }
    ]))
  })

  it('supplements a labor-only quota snapshot with material and machine identities', () => {
    const repaired = repairPersistedQuotaCandidate({
      id: 'labor-only-46', knowledgebaseId: 'kb', quotaCode: '1-46', quotaName: '回填砂石', quotaUnit: 'm3',
      pageContent: [
        '定额编号：1-46',
        '定额名称：回填砂石',
        '计量单位：m3',
        '人材机消耗量：',
        '- 人工 | 00150101 | 普工 | 工日 | 0.280'
      ].join('\n'),
      extractionStatus: 'partial', extractedQuotaCodes: ['1-46'], reviewStatus: 'unknown', ingestionReady: false,
      workContents: [], resources: [{ category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '0.280' }],
      adjustments: [], sourcePages: [], query: '级配砂石回填', retrievedAt: new Date().toISOString()
    })
    expect(repaired.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: '人工', code: '00150101', consumption: '0.280' }),
      expect.objectContaining({ category: '材料', code: '04050207', name: '碎石 5-40mm', consumptionPending: true }),
      expect.objectContaining({ category: '机械', code: '99130511', name: expect.stringContaining('电动夯实机'), consumptionPending: true })
    ]))
    expect(repaired.ingestionReady).toBe(false)
  })

  it('routes only material-mapped rows to a direct material resource', () => {
    const proposal = buildDirectMaterialQuotaProposal({
      kind: 'material', code: '040103001001', name: '中砂材料采购', specification: '天然中砂，粒径满足项目要求', unit: 't'
    })
    expect(proposal.mappingStatus).toBe('approved')
    expect(proposal.blockingReasons).toEqual([])
    expect(proposal.components[0]).toEqual(expect.objectContaining({ directMaterial: true }))
    expect(proposal.components[0].resources).toEqual([expect.objectContaining({ category: '材料', name: '中砂材料采购 天然中砂，粒径满足项目要求', unit: 't', consumption: '1' })])
  })

  it('materializes a resource-bearing review preview from a consumption search', () => {
    const candidate = {
      id: 'quota-preview-46', knowledgebaseId: 'kb-quota', quotaCode: '1-46', quotaName: '回填砂石', quotaUnit: 'm3',
      pageContent: '定额编号：1-46', extractionStatus: 'structured' as const, extractedQuotaCodes: ['1-46'], reviewStatus: 'approved',
      ingestionReady: true, workContents: ['铺料、整平、洒水夯实'], resources: [
        { category: '人工' as const, code: '00150101', name: '普工', unit: '工日', consumption: '0.280' },
        { category: '材料' as const, code: '04050207', name: '碎石 5-40mm', unit: 't', consumption: '0.640' },
        { category: '机械' as const, code: '99130511', name: '电动夯实机', unit: '台班', consumption: '0.036' }
      ], adjustments: [], sourcePages: [24], query: '级配砂石回填 消耗量', retrievedAt: new Date().toISOString()
    }
    const preview = buildQuotaSearchPreview('building', ['填方材料：天然级配砂石', '分层夯实'], [candidate])
    expect(preview).toEqual(expect.objectContaining({ mappingStatus: 'proposed', coverageStatus: 'complete' }))
    expect(preview?.components[0].resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: '人工', consumption: '0.280' }),
      expect.objectContaining({ category: '材料', consumption: '0.640' }),
      expect.objectContaining({ category: '机械', consumption: '0.036' })
    ]))
  })

  it('does not classify a bill row containing material words as direct material', async () => {
    const { isDirectMaterialLine } = await import('./xpert-quotation-quota.js')
    expect(isDirectMaterialLine({
      kind: 'bill', name: '级配砂石回填', specification: '天然级配砂石，分层夯实', materialReferenceOnly: true
    })).toBe(false)
  })

  it('classifies a procurement bill row as direct material at row level', async () => {
    const { isDirectMaterialLine } = await import('./xpert-quotation-quota.js')
    expect(isDirectMaterialLine({
      kind: 'bill', name: '中砂材料采购', specification: '天然中砂，粒径 0.35-0.5mm，供应至现场', materialReferenceOnly: true
    })).toBe(true)
    expect(isDirectMaterialLine({
      kind: 'bill', name: '级配砂石回填', specification: '天然级配砂石，回填并分层夯实，材料采购价另计', materialReferenceOnly: true
    })).toBe(false)
  })

  it('creates reviewable labor and machine candidates for an old empty 1-121 snapshot', () => {
    const [candidate] = expandPersistedQuotaCandidates([{
      id: 'legacy-121', knowledgebaseId: 'kb', chunkId: 'chunk-121', quotaCode: '1-121',
      quotaName: '挖掘机挖槽坑土', quotaUnit: '1000m3', extractionStatus: 'partial',
      extractedQuotaCodes: ['1-121'], reviewStatus: 'unknown', ingestionReady: false,
      workContents: ['工作面就位、挖槽坑土、清底修边'], resources: [], adjustments: [], sourcePages: [28],
      pageContent: '编编 号号 1-121 1-122 1-123 1-124 挖掘机挖土 斗容量0.6m3以内 反铲 装车 不装车 类别 编码 名称 单位 消耗量 普工 履带式单斗挖掘机 履带式推土机',
      query: '机械挖一般土方', retrievedAt: new Date().toISOString()
    }])
    expect(candidate.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: '人工', name: '普工', consumptionPending: true }),
      expect.objectContaining({ category: '机械', name: expect.stringContaining('履带式单斗挖掘机'), consumptionPending: true }),
      expect.objectContaining({ category: '机械', name: expect.stringContaining('履带式推土机'), consumptionPending: true })
    ]))
  })
  it('builds work scopes from persisted project features and excludes location-only facts', () => {
    const line = {
      discipline: 'building',
      code: '011404001001',
      name: '墙面乳胶漆修补',
      specification: [
        '1.部位：过道、楼梯间等部位',
        '2.铲除墙面污损、发霉、起壳、开裂乳胶漆及腻子；',
        '3.刷墙固、不平处用腻子找平',
        '4.满批白水泥腻子两遍，砂纸磨平',
        '5.涂刷白色内墙乳胶漆两遍'
      ].join('\n'),
      unit: 'm2'
    } as XpertQuotationLine

    const { query, workScopes } = buildQuotaKnowledgeQuery(line)

    expect(workScopes).toEqual([
      '铲除墙面污损、发霉、起壳、开裂乳胶漆及腻子',
      '刷墙固、不平处用腻子找平',
      '满批白水泥腻子两遍，砂纸磨平',
      '涂刷白色内墙乳胶漆两遍'
    ])
    expect(query).toContain('项目名称：墙面乳胶漆修补')
    expect(query).toContain('项目特征规格：')
    expect(query).toContain('检索关键词：墙面乳胶漆修补')
    expect(query).toContain('消耗量')
    expect(query).toContain('对应消耗量表')
    expect(query).not.toContain('清单项目编码：')
  })

  it('falls back to the bill name when no project feature is available', () => {
    expect(extractQuotaWorkScopes('回填砂', null)).toEqual(['回填砂'])
  })

  it('keeps normalized quota chunks only and parses resources and source evidence', () => {
    const content = [
      '定额编号：15-161',
      '定额名称：内墙面乳胶漆 二遍',
      '地区及版本：江苏省 2026 建筑与装饰工程消耗量',
      '计量单位：10m2',
      '工作内容：',
      '- 清扫基层、刷乳胶漆、打磨等。',
      '人材机消耗量：',
      '- 人工 | 00150101 | 普工 | 工日 | 0.036',
      '- 材料 | 11010304 | 内墙乳胶漆 | kg | 2.884',
      '调整与说明：',
      '- 天棚面人工乘以系数 1.1。',
      '来源：docs/source.pdf，PDF 第 617 页',
      '审核状态：机器提取，未经造价人员复核，不得直接用于自动计价。'
    ].join('\n')
    const candidates = toQuotaKnowledgeCandidates([
      {
        id: 'quota-chunk',
        pageContent: content,
        metadata: {
          knowledgebaseId: 'kb-quota', documentType: 'quota_item', documentId: 'doc-quota', chunkId: 'chunk-15-161',
          quotaCode: '15-161', quotaUnit: '10m2', discipline: '建筑与装饰工程', region: '江苏省', edition: '2026',
          sourceFile: 'docs/source.pdf', sourcePage: 617, reviewStatus: 'unreviewed', ingestionReady: true, score: 0.95
        }
      },
      {
        id: 'price-chunk',
        pageContent: '内墙乳胶漆 12.30 元/kg',
        metadata: { knowledgebaseId: 'kb-quota', documentType: 'market_price_item' }
      },
      {
        id: 'secret',
        pageContent: content,
        metadata: { knowledgebaseId: 'kb-secret', documentType: 'quota_item' }
      }
    ], ['kb-quota'], '内墙乳胶漆', new Date('2026-08-10T00:00:00.000Z'))

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toEqual(expect.objectContaining({
      knowledgebaseId: 'kb-quota', quotaCode: '15-161', quotaName: '内墙面乳胶漆 二遍', quotaUnit: '10m2',
      extractionStatus: 'structured', extractedQuotaCodes: ['15-161'],
      reviewStatus: 'unreviewed', ingestionReady: true, sourcePages: [617], retrievedAt: '2026-08-10T00:00:00.000Z'
    }))
    expect(candidates[0].resources).toEqual(expect.arrayContaining([
      { category: '材料', code: '11010304', name: '内墙乳胶漆', unit: 'kg', consumption: '2.884' }
    ]))
  })

  it('keeps platform-native OCR evidence without private metadata and parses Markdown tables when possible', () => {
    const candidates = toQuotaKnowledgeCandidates([{
      id: 'native-chunk',
      pageContent: [
        '江苏省建筑与装饰工程消耗量 2026',
        '| 定额编号 | 定额名称 | 计量单位 |',
        '| --- | --- | --- |',
        '| 15-161 | 内墙面乳胶漆 二遍 | 10m2 |',
        '| 类别 | 编码 | 名称 | 单位 | 消耗量 |',
        '| --- | --- | --- | --- | --- |',
        '| 材料 | 11010304 | 内墙乳胶漆 | kg | 2.884 |'
      ].join('\n'),
      metadata: { knowledgebaseId: 'kb-platform', documentId: 'doc-native', chunkId: 'native-chunk', page: 617 }
    }, {
      id: 'raw-chunk',
      pageContent: '扫描版定额原文，当前片段无法可靠恢复表结构。',
      metadata: { knowledgebaseId: 'kb-platform', chunkId: 'raw-chunk', page: 618 }
    }], ['kb-platform'], '乳胶漆', new Date('2026-08-11T00:00:00.000Z'))

    expect(candidates).toHaveLength(2)
    const structured = candidates.find((candidate) => candidate.extractionStatus === 'structured')
    const rawEvidence = candidates.find((candidate) => candidate.extractionStatus === 'raw_evidence')
    expect(structured).toEqual(expect.objectContaining({
      quotaCode: '15-161', quotaName: '内墙面乳胶漆 二遍', quotaUnit: '10m2',
      extractionStatus: 'structured', reviewStatus: 'unknown', sourcePages: [617]
    }))
    expect(structured?.resources).toContainEqual({
      category: '材料', code: '11010304', name: '内墙乳胶漆', unit: 'kg', consumption: '2.884'
    })
    expect(rawEvidence).toEqual(expect.objectContaining({
      extractionStatus: 'raw_evidence', ingestionReady: false, sourcePages: [618]
    }))
  })

  it('expands packed OCR quota columns and assigns resource consumption to each subitem', () => {
    const content = [
      '工作内容：挖土、装土或抛土、修整底边、边坡。 计量单位：m³',
      '编编          号号',
      '1-11-21-3',
      '项          目',
      '人工挖单独土方',
      '土壤类别',
      '一、二类土三类土四类土',
      '类别',
      '编  码',
      '名称单位消耗量',
      '人工',
      '00150101普工工日0.1100.2000.310',
      '00010401在挡土板、沉箱下及打桩后坑内挖土工日(0.140)(0.260)(0.410)'
    ].join('\n')
    const candidates = toQuotaKnowledgeCandidates([{
      id: 'ocr-chunk', pageContent: content,
      metadata: { knowledgebaseId: 'kb-ocr', documentType: 'quota_item', documentId: 'doc-ocr', chunkId: 'chunk-ocr', discipline: '建筑与装饰工程' }
    }], ['kb-ocr'], '人工挖一般土方')

    expect(candidates.map((candidate) => candidate.quotaCode)).toEqual(['1-1', '1-2', '1-3'])
    expect(candidates.find((candidate) => candidate.quotaCode === '1-2')?.resources).toEqual([
      { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '0.200' },
      { category: '人工', code: '00010401', name: '在挡土板、沉箱下及打桩后坑内挖土', unit: '工日', consumption: '0.260' }
    ])
    expect(candidates.every((candidate) => candidate.extractionStatus === 'structured')).toBe(true)
  })

  it('parses flattened material and machine rows from a multi-column OCR table', () => {
    const content = [
      '工作内容：铺料、整平、洒水夯实。 计量单位：m³',
      '编编          号号',
      '1-451-461-471-48',
      '项          目',
      '回填砂回填砂石回填灰土2:8灰土3:7灰土',
      '类别',
      '编  码',
      '名称单位消耗量',
      '人工00150101普工工日0.2000.2800.3000.300',
      '材料',
      '04030100黄砂t1.7701.050',
      '04050207碎石 5-40mmt0.640',
      '31150101水m³0.3000.3000.3000.300',
      '机械99130511电动夯实机 夯击能量250N·m台班0.0360.0360.0360.036'
    ].join('\n')
    const candidates = toQuotaKnowledgeCandidates([{
      id: 'ocr-fill', pageContent: content,
      metadata: { knowledgebaseId: 'kb-ocr', documentType: 'quota_item', documentId: 'doc-fill', chunkId: 'chunk-fill', discipline: '建筑与装饰工程' }
    }], ['kb-ocr'], '级配砂石回填')
    const gravel = candidates.find((candidate) => candidate.quotaCode === '1-46')
    expect(candidates.map((candidate) => candidate.quotaCode)).toEqual(['1-45', '1-46', '1-47', '1-48'])
    expect(gravel?.resources).toEqual(expect.arrayContaining([
      { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '0.280' },
      { category: '材料', code: '04030100', name: '黄砂', unit: 't', consumption: '1.050' },
      { category: '材料', code: '04050207', name: '碎石 5-40mm', unit: 't', consumption: '0.640' },
      { category: '材料', code: '31150101', name: '水', unit: 'm3', consumption: '0.300' },
      { category: '机械', code: '99130511', name: '电动夯实机 夯击能量250N·m', unit: '台班', consumption: '0.036' }
    ]))
  })

  it('repairs a persisted packed-code candidate and exposes resources for re-review', () => {
    const content = [
      '工作内容：推平、碾压、工作面内排水。 计量单位：1000㎡',
      '编编          号号',
      '1-1781-1791-180',
      '项          目',
      '平整场地（厚300mm以内）',
      '拖式铲运机(斗容量以内)',
      '类别',
      '编  码',
      '名称单位消耗量',
      '人工00150101普工工日1.0001.0001.000',
      '机械99010133拖式铲运机 斗容量10m³台班0.271'
    ].join('\n')
    const repaired = repairPersistedQuotaCandidate({
      id: 'old', knowledgebaseId: 'kb', chunkId: 'chunk', pageContent: content,
      quotaCode: '1-1781', quotaName: '平整场地（厚300mm以内）', quotaUnit: '1000m2',
      extractionStatus: 'partial', extractedQuotaCodes: ['1-1781'], reviewStatus: 'approved', ingestionReady: false,
      workContents: [], resources: [], adjustments: [], sourcePages: [], query: '平整场地', retrievedAt: new Date().toISOString()
    })
    expect(repaired).toEqual(expect.objectContaining({ quotaCode: '1-178', ingestionReady: true }))
    expect(repaired.resources).toEqual(expect.arrayContaining([
      { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '1.000' },
      { category: '机械', code: '99010133', name: '拖式铲运机 斗容量10m³', unit: '台班', consumption: '0.271' }
    ]))
  })

  it('repairs the platform OCR chunk with repeated tables and OCR noise', () => {
    const content = [
      '工作内容：推平、碾压、工作面内排水。 计量单位：1000㎡',
      '编编          号号', '1-1781-1791-180', '项          目',
      '平整场地（厚300mm以内）', '拖式铲运机(斗容量以内)', '81012', '类别', '编  码', '名称单位消耗量',
      '人工00150101普工工日1.0001.0001.000', '机械',
      '99010133拖式铲运机 斗容量10m³台班0.271',
      '99010134拖式铲运机 斗容量12m³台班0.246',
      '99010132拖式铲运机 斗容量7m³台班0.311',
      '注：1.本子目仅用于原土300mm以内的机械平整场地。',
      '工作内容：1.推平、碾压、工作面内排水。 计量单位：1000㎡',
      '编编          号号', '1-1811-1821-1831-184', '项          目',
      '平整场地（厚300mm以内）原土碾压', '自动平地机(kW以内)', '拖拉机75kW', '拖式双筒羊足碾', '7590120', '类别', '编  码', '名称单位消耗量',
      '人工00150101普工工日1.0001.0001.0001.000', '机械99130106平地机 功率120kW台班0.048'
    ].join('\n')
    const repaired = repairPersistedQuotaCandidate({
      id: 'real', knowledgebaseId: 'kb', chunkId: 'chunk', pageContent: content,
      quotaCode: '1-1781', extractionStatus: 'partial', extractedQuotaCodes: ['1-1781'],
      reviewStatus: 'approved', ingestionReady: false, workContents: [], resources: [], adjustments: [],
      sourcePages: [], query: '', retrievedAt: new Date().toISOString()
    })
    expect(repaired.resources.length).toBeGreaterThan(0)
    expect(repaired.resources).toEqual(expect.arrayContaining([
      { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '1.000' }
    ]))
  })

  it('repairs the exact persisted quotation chunk including the second table', () => {
    const content = [
      '工作内容：推平、碾压、工作面内排水。                                                                                                             计量单位：1000㎡',
      '编编          号号', '1-1781-1791-180', '项          目', '平整场地（厚300mm以内）',
      '拖式铲运机(斗容量以内)', '81012', '类别', '编  码', '名称单位消耗量',
      '人工00150101普工工日1.0001.0001.000', '机械',
      '99010133拖式铲运机 斗容量10m³台班0.271', '99010134拖式铲运机 斗容量12m³台班0.246',
      '99010132拖式铲运机 斗容量7m³台班0.311',
      '注：1.本子目仅用于原土300mm以内的机械平整场地。',
      '　　2.当道路及场地平整的工程量少于4000m²时，机械乘以系数1.18。',
      '工作内容：1.推平、碾压、工作面内排水。 2.碾压、工作面排水。                                                                                                                          计量单位：1000㎡',
      '编编          号号', '1-1811-1821-1831-184', '项          目', '平整场地（厚300mm以内）原土碾压',
      '自动平地机(kW以内)', '拖拉机75kW', '拖式双筒羊足碾', '7590120', '类别', '编  码', '名称单位消耗量',
      '人工00150101普工工日1.0001.0001.0001.000', '机械99130106平地机 功率120kW台班0.048',
      '99070707履带式拖拉机 功率75kW台班0.043', '99130535拖式羊角碾(双筒)工作质量6t台班0.059',
      '99130103平地机 功率75kW台班0.057', '99130104平地机 功率90kW台班0.050'
    ].join('\n')
    const repaired = repairPersistedQuotaCandidate({
      id: 'real-exact', knowledgebaseId: 'kb', chunkId: 'chunk', pageContent: content,
      quotaCode: '1-1781', extractionStatus: 'partial', extractedQuotaCodes: ['1-1781'],
      reviewStatus: 'approved', ingestionReady: false, workContents: [], resources: [], adjustments: [],
      sourcePages: [], query: '', retrievedAt: new Date().toISOString()
    })
    expect(repaired.resources).toEqual(expect.arrayContaining([
      { category: '人工', code: '00150101', name: '普工', unit: '工日', consumption: '1.000' },
      { category: '机械', code: '99010133', name: '拖式铲运机 斗容量10m³', unit: '台班', consumption: '0.271' }
    ]))
  })

  it('repairs an OCR single-travel quota table', () => {
    const content = [
      '工作内容：1.清理道路，铺、移及拆除道板。 2.运土(石)、卸土(石)。 计量单位：m³',
      '编编          号号', '1-351-361-37', '项          目', '单(双)轮车运输', '运距在500m以内',
      '土', '淤泥、流砂', '石(碴)', '类别', '编  码', '名称单位消耗量', '人工00150101普工工日0.0300.0500.040'
    ].join('\n')
    const repaired = repairPersistedQuotaCandidate({
      id: 'travel', knowledgebaseId: 'kb', chunkId: 'chunk', pageContent: content,
      quotaCode: '1-351', extractionStatus: 'partial', extractedQuotaCodes: ['1-351'],
      reviewStatus: 'unknown', ingestionReady: false, workContents: [], resources: [], adjustments: [],
      sourcePages: [], query: '', retrievedAt: new Date().toISOString()
    })
    expect(repaired.resources.length).toBeGreaterThan(0)
  })

  it('expands a persisted earthwork chunk and selects the reviewed backfill subitem', () => {
    const content = [
      '工作内容：1.清理道路，铺、移及拆除道板。 2.运土(石)、卸土(石)。 计量单位：m³',
      '编编 号号', '1-351-361-37', '项 目', '单(双)轮车运输', '运距在500m以内',
      '类别', '编 码', '名称单位消耗量', '人工00150101普工工日0.0300.0500.040',
      '工作内容：1.松填土包括5m内取土、碎土、找平。 2.夯填土包括5m内取土、碎土、找平、泼水、夯实。 计量单位：m³',
      '编编 号号', '1-411-421-431-44', '项 目', '回填土', '地面槽(坑)', '松填夯填松填夯填',
      '类别', '编 码', '名称单位消耗量', '人工00150101普工工日0.0600.1600.1000.170',
      '机械99130511电动夯实机 夯击能量250N·m台班0.0220.036'
    ].join('\n')
    const persisted: QuotaKnowledgeCandidate = {
      id: 'persisted-travel', knowledgebaseId: 'kb', chunkId: 'chunk', pageContent: content,
      quotaCode: '1-351', extractionStatus: 'partial', extractedQuotaCodes: ['1-351'], reviewStatus: 'unknown',
      ingestionReady: false, workContents: [], resources: [], adjustments: [], sourcePages: [20], query: '', retrievedAt: new Date().toISOString()
    }
    const expanded = expandPersistedQuotaCandidates([persisted])
    const groundCompacted = expanded.find((candidate) => candidate.quotaCode === '1-42')
    const pitCompacted = expanded.find((candidate) => candidate.quotaCode === '1-44')
    expect(groundCompacted).toEqual(expect.objectContaining({ quotaName: '回填土地面夯填' }))
    expect(groundCompacted?.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '普工', consumption: '0.160' }),
      expect.objectContaining({ name: expect.stringContaining('电动夯实机'), consumption: '0.022' })
    ]))
    expect(pitCompacted).toEqual(expect.objectContaining({ quotaName: '回填土槽(坑)夯填' }))
    expect(pitCompacted?.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '普工', consumption: '0.170' }),
      expect.objectContaining({ name: expect.stringContaining('电动夯实机'), consumption: '0.036' })
    ]))
    const current = {
      candidateId: 'persisted-travel', quotaCode: '1-351', coveredWorkScopes: ['回填方式：机械分层回填、夯实'],
      confidence: 0.8, rationale: '定额1-41~1-44回填土夯填。', differences: [], knowledgebaseId: 'kb',
      sourcePages: [20], sourceReviewStatus: 'unknown', resources: []
    }
    expect(selectPersistedQuotaCandidate({ name: '基坑回填方', specification: '机械分层回填、夯实', unit: 'm3' }, current, expanded)?.quotaCode).toBe('1-44')
    expect(selectPersistedQuotaCandidate({ name: '房心回填方', specification: '室内地面夯填', unit: 'm3' }, current, expanded)?.quotaCode).toBe('1-42')
  })

  it('stops flattened resource parsing before page markers and repairs gravel selection', () => {
    const backfill = [
      '工作内容：松填土、夯填土。 计量单位：m³',
      '编编 号号', '1-411-421-431-44', '项 目', '回填土', '地面槽(坑)', '松填夯填松填夯填',
      '类别', '编 码', '名称单位消耗量',
      '人工00150101普工工日0.0600.1600.1000.170',
      '机械99130511电动夯实机 夯击能量250N·m台班0.0220.036',
      '土13',
      '![Page 20](http://localhost:3000/api/sandbox/volume/knowledges/kb/images/page-20.png)'
    ].join('\n')
    const gravel = [
      '工作内容：铺料、整平、洒水夯实。 计量单位：m³',
      '编编 号号', '1-451-461-471-48', '项 目', '回填砂回填砂石', '回填灰土', '2:8灰土3:7灰土',
      '类别', '编 码', '名称单位消耗量',
      '人工00150101普工工日0.2000.2800.3000.300',
      '材料', '04030100黄砂t1.7701.050', '04050207碎石 5-40mmt0.640',
      '机械99130511电动夯实机 夯击能量250N·m台班0.0360.0360.0360.036'
    ].join('\n')
    const persisted = [backfill, gravel].map((pageContent, index): QuotaKnowledgeCandidate => ({
      id: `persisted-${index}`, knowledgebaseId: 'kb', chunkId: `chunk-${index}`, pageContent,
      quotaCode: index === 0 ? '1-42' : '1-45', extractionStatus: 'partial', extractedQuotaCodes: [],
      reviewStatus: 'unknown', ingestionReady: false, workContents: [], resources: [], adjustments: [],
      sourcePages: [20 + index], query: '', retrievedAt: new Date().toISOString()
    }))
    const expanded = expandPersistedQuotaCandidates(persisted)
    const compacted = expanded.find((candidate) => candidate.quotaCode === '1-42')
    expect(compacted?.resources).toContainEqual({
      category: '机械', code: '99130511', name: '电动夯实机 夯击能量250N·m', unit: '台班', consumption: '0.022'
    })
    const current = {
      candidateId: compacted!.id, quotaCode: '1-42', coveredWorkScopes: ['填方材料：天然级配砂石'],
      confidence: 0.8, rationale: '定额1-46回填砂石。', differences: [], knowledgebaseId: 'kb',
      sourcePages: [20], sourceReviewStatus: 'unknown', resources: compacted!.resources
    }
    expect(selectPersistedQuotaCandidate({
      name: '级配砂石回填', specification: '天然级配砂石，分层摊铺、洒水、机械碾压', unit: 'm3'
    }, current, expanded)?.quotaCode).toBe('1-46')
  })

  it('persists a strict partial partition and blocks unreviewed repair pricing', () => {
    const scopes = ['铲除旧乳胶漆及腻子', '满批腻子两遍', '涂刷内墙乳胶漆两遍']
    const proposal = buildQuotaBreakdownProposal('building', scopes, [candidate()], {
      components: [{
        candidateId: 'quota-current',
        quotaCode: '15-161',
        coveredWorkScopes: ['涂刷内墙乳胶漆两遍'],
        confidence: 0.93,
        rationale: '工作内容、遍数和部位一致。',
        differences: []
      }],
      uncoveredWorkScopes: ['铲除旧乳胶漆及腻子', '满批腻子两遍'],
      rationale: '乳胶漆可匹配，铲除与腻子仍需其他定额。'
    }, new Date('2026-08-10T01:00:00.000Z'))

    expect(proposal).toEqual(expect.objectContaining({
      coverageStatus: 'partial', mappingStatus: 'proposed', automaticPricingAllowed: false,
      uncoveredWorkScopes: ['铲除旧乳胶漆及腻子', '满批腻子两遍'],
      proposedAt: '2026-08-10T01:00:00.000Z'
    }))
    expect(proposal.blockingReasons).toEqual(expect.arrayContaining([
      'pricing_not_evaluated', 'uncovered_work', 'missing_repair_quota', 'unreviewed_quota_source'
    ]))
  })

  it('rejects proposals that do not partition every persisted work scope', () => {
    expect(() => buildQuotaBreakdownProposal('building', ['腻子两遍', '乳胶漆两遍'], [candidate()], {
      components: [{
        candidateId: 'quota-current', coveredWorkScopes: ['乳胶漆两遍'], confidence: 0.9,
        rationale: '匹配。', differences: []
      }],
      uncoveredWorkScopes: [],
      rationale: '遗漏腻子。'
    })).toThrow('partition every persisted bill work scope')
  })

  it('uses optional quotaCode only to verify the selected candidate', () => {
    expect(() => buildQuotaBreakdownProposal('building', ['乳胶漆两遍'], [candidate()], {
      components: [{
        candidateId: 'quota-current', quotaCode: '15-999', coveredWorkScopes: ['乳胶漆两遍'], confidence: 0.9,
        rationale: '匹配。', differences: []
      }],
      uncoveredWorkScopes: [],
      rationale: '候选编号核验。'
    })).toThrow('does not match candidate')
  })

  it('returns an actionable error for a candidate outside the latest line snapshot', () => {
    expect(() => buildQuotaBreakdownProposal('building', ['乳胶漆两遍'], [candidate()], {
      components: [{
        candidateId: 'quota-stale', coveredWorkScopes: ['乳胶漆两遍'], confidence: 0.9,
        rationale: '匹配。', differences: []
      }],
      uncoveredWorkScopes: [],
      rationale: '旧候选。'
    })).toThrow('never reuse candidate IDs across lines or after a re-search')
  })
})

function candidate(): QuotaKnowledgeCandidate {
  return {
    id: 'quota-current', knowledgebaseId: 'kb-quota', documentId: 'doc-quota', chunkId: 'chunk-15-161',
    pageContent: '定额编号：15-161', quotaCode: '15-161', quotaName: '内墙面乳胶漆 二遍', quotaUnit: '10m2',
    discipline: '建筑与装饰工程', extractionStatus: 'structured', extractedQuotaCodes: ['15-161'],
    reviewStatus: 'unreviewed', ingestionReady: true,
    workContents: ['清扫基层、刷乳胶漆、打磨等。'],
    resources: [{ category: '材料', code: '11010304', name: '内墙乳胶漆', unit: 'kg', consumption: '2.884' }],
    adjustments: [], sourcePages: [617], query: '内墙乳胶漆', retrievedAt: '2026-08-10T00:00:00.000Z'
  }
}

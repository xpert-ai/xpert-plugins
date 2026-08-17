jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, tableKey: string) => `plugin_${namespace}_${tableKey}`
}))

import {
  buildKnowledgePriceQuery,
  hasMaterialReference,
  parseKnowledgePriceItems,
  parseHtmlPriceTableItems,
  parseFlatPriceTableItems,
  priceEvidenceSupports,
  toKnowledgePriceCandidates
} from './xpert-quotation-knowledge.js'
import type { XpertQuotationLine } from './entities/xpert-quotation-line.entity.js'

describe('Xpert quotation knowledge pricing', () => {
  it('keeps the material specification, unit, and code in a bounded retrieval query', () => {
    const query = buildKnowledgePriceQuery({
      name: '镀锌钢管',
      specification: `DN50 热镀锌 ${'完整项目特征 '.repeat(200)}`,
      unit: 'm',
      code: 'MAT-001'
    } as XpertQuotationLine)

    expect(query.length).toBeLessThanOrEqual(1_200)
    expect(query).toContain('项目特征描述及规格：DN50 热镀锌')
    expect(query).toContain('计量单位：m')
    expect(query).toContain('材料编码：MAT-001')
  })

  it('keeps only connected knowledgebase chunks and preserves source identifiers', () => {
    const candidates = toKnowledgePriceCandidates([
      {
        id: 'chunk-1',
        pageContent: '镀锌钢管 DN50，36.80 元/m。',
        metadata: { knowledgebaseId: 'kb-price', documentId: 'doc-1', chunkId: 'chunk-1', score: 0.93 }
      },
      {
        id: 'chunk-secret',
        pageContent: '不应返回的材料价格。',
        metadata: { knowledgebaseId: 'kb-secret', documentId: 'doc-secret', chunkId: 'chunk-secret' }
      }
    ], ['kb-price'], '镀锌钢管 DN50 m', new Date('2026-08-07T00:00:00.000Z'))

    expect(candidates).toEqual([expect.objectContaining({
      knowledgebaseId: 'kb-price',
      documentId: 'doc-1',
      chunkId: 'chunk-1',
      sourcePages: [],
      priceItems: [],
      retrievedAt: '2026-08-07T00:00:00.000Z'
    })])
  })

  it('extracts auditable price rows and page evidence from platform Markdown chunks', () => {
    const [candidate] = toKnowledgePriceCandidates([{
      id: 'chunk-table',
      pageContent: [
        '| 序号 | 名称及规格 | 单位 | 税前综合价格（元） |',
        '| --- | --- | --- | --- |',
        '| 8 | 热镀锌钢管DN15~DN32 | t | 4251.94 |',
        '| 9 | 热镀锌钢管DN40~DN80 | t | 4209.44 |'
      ].join('\n'),
      metadata: { knowledgebaseId: 'kb-price', documentId: 'doc-price', chunkId: 'chunk-table', page: 12 }
    }], ['kb-price'], '热镀锌钢管 DN50 t')

    expect(candidate.sourcePages).toEqual([12])
    expect(candidate.priceItems).toEqual([
      expect.objectContaining({ name: '热镀锌钢管DN15~DN32', unit: 't', unitPrice: '4251.94', evidenceQuote: '| 8 | 热镀锌钢管DN15~DN32 | t | 4251.94 |', id: expect.stringMatching(/^price_/) }),
      expect.objectContaining({ name: '热镀锌钢管DN40~DN80', unit: 't', unitPrice: '4209.44', evidenceQuote: '| 9 | 热镀锌钢管DN40~DN80 | t | 4209.44 |', id: expect.stringMatching(/^price_/) })
    ])
  })

  it('does not mistake price identifiers for unit prices in structured Markdown price books', () => {
    const items = parseKnowledgePriceItems([
      '| 价格 ID | 类别 | 关联定额资源编码 | 价格名称 | 别名或规格 | 单位 | 税前单价（元） | 匹配等级 | 审核状态 | 来源 | 适用范围与说明 |',
      '|---|---|---|---|---|---:|---:|---|---|---|---|',
      '| P-LAB-001 | 人工 | 00150101 | 建筑、装饰工程普工 | 普工；日工资按 10 小时 | 工日 | 254.00 | exact | published | 《官网价格.pdf》第 71 页 | 可精确匹配普工。 |',
      '| P-MAT-002 | 材料 | 04030100 | 中砂 | 黄砂；细度模数 3.0-2.3 | t | 174.92 | exact_for_bill | pending_review | 《官网价格.pdf》第 3 页 | 黄砂近似匹配。 |',
      '| P-MAC-002 | 机械 | 99070106 | 履带式推土机 | 功率 75kW | 台班 | 440.81 | exact | published | 《官网价格.pdf》第 67 页 | 推土机精确匹配。 |',
      '| MISSING-MAT-04050207 | 材料 | 04050207 | 碎石 | 5-40mm | t | 缺失 | missing | missing | 当前资料无可靠来源 | 不得按零元处理。 |'
    ].join('\n'))

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceCategory: 'labor', code: '00150101', name: '建筑、装饰工程普工',
        aliases: expect.arrayContaining(['普工']), unit: '工日', unitPrice: '254.00', workdayHours: 10
      }),
      expect.objectContaining({
        resourceCategory: 'material', code: '04030100', name: '中砂',
        aliases: expect.arrayContaining(['黄砂']), unit: 't', unitPrice: '174.92'
      }),
      expect.objectContaining({
        resourceCategory: 'machine', code: '99070106', name: '履带式推土机',
        aliases: expect.arrayContaining(['功率 75kW']), unit: '台班', unitPrice: '440.81'
      })
    ]))
    expect(items).toHaveLength(3)
    expect(items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ unitPrice: '001' }),
      expect.objectContaining({ unitPrice: '002' })
    ]))
  })

  it('does not treat engineering dimensions as materials without a named material', () => {
    expect(hasMaterialReference('平整场地', '三类土，场地厚度±300mm以内')).toBe(false)
    expect(hasMaterialReference('管沟土方', '管外径DN300以内，场内运距1km')).toBe(false)
    expect(hasMaterialReference('级配砂石回填', '分层夯实，厚度300mm')).toBe(true)
    expect(hasMaterialReference('镀锌钢管', 'DN300')).toBe(true)
  })

  it('extracts flat labor wage rows, aliases, and the stated workday-hour basis', () => {
    const items = parseKnowledgePriceItems([
      '序号 名称 单位 日工资（元）',
      '1建筑、装饰工程普工 元254.00',
      '2木工（模板工） 元340.00',
      '注：日工资按照10小时计算。'
    ].join('\n'))

    expect(items).toEqual([
      expect.objectContaining({
        resourceCategory: 'labor', name: '建筑、装饰工程普工', aliases: ['普工'], unit: '工日',
        unitPrice: '254.00', workdayHours: 10, id: expect.stringMatching(/^price_/)
      }),
      expect.objectContaining({
        resourceCategory: 'labor', name: '木工(模板工)', aliases: ['木工', '模板工'], unit: '工日',
        unitPrice: '340.00', workdayHours: 10, id: expect.stringMatching(/^price_/)
      })
    ])
  })

  it('parses flattened official material, machine, and labor price pages', () => {
    const material = parseFlatPriceTableItems('南京市建设工程材料市场信息价格 税前综合价格(元) 16 粗砂（细度模数3.7-3.1） t 177.03 17 中砂（细度模数3.0-2.3） t 174.92 本信息价仅作为编制工程概预算参考')
    expect(material).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceCategory: 'material', name: '粗砂(细度模数3.7-3.1)', unit: 't', unitPrice: '177.03' }),
      expect.objectContaining({ resourceCategory: 'material', name: '中砂(细度模数3.0-2.3)', unit: 't', unitPrice: '174.92' })
    ]))

    const machine = parseFlatPriceTableItems('南京市机械租赁信息价格 税前综合价格(元) 120 自卸汽车装载质量5t 台班 447.34 121 自卸汽车装载质量8t 台班 587.20')
    expect(machine).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceCategory: 'machine', name: '自卸汽车装载质量5t', unit: '台班', unitPrice: '447.34' })
    ]))

    const labor = parseKnowledgePriceItems('建筑工种劳务市场人工信息价格 序号 名称 单位 日工资（元） 1 建筑、装饰工程普工 元 254.00 2 木工（模板工） 元 340.00 注：日工资按照10小时计算。')
    expect(labor).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceCategory: 'labor', name: '建筑、装饰工程普工', unitPrice: '254.00', workdayHours: 10 })
    ]))

    const continuation = parseFlatPriceTableItems('18 平地机功率180kW 台班 1383.21 29 履带式单斗挖掘机(液压)斗容量0.6m3 台班 865.42 41 光轮压路机(内燃)工作质量6t 台班 478.38 53 夯实机(电动)夯击能力20-62Nm 台班 24.81')
    expect(continuation).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceCategory: 'machine', name: '夯实机(电动)夯击能力20-62Nm', unitPrice: '24.81' })
    ]))
  })

  it('parses platform HTML price tables and rejects quota consumption tables', () => {
    const machine = parseHtmlPriceTableItems([
      '## 南京市二〇二六年六月机械租赁信息价格',
      '<table><tr><td>序号</td><td>名称及规格</td><td>单位</td><td>税前综合价格(元)</td></tr>',
      '<tr><td>18</td><td>平地机功率180kW</td><td>台班</td><td>1383.21</td></tr>',
      '<tr><td>53</td><td>夯实机(电动)夯击能力20-62Nm</td><td>台班</td><td>24.81</td></tr></table>'
    ].join('\n'))
    expect(machine).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceCategory: 'machine', name: '夯实机(电动)夯击能力20-62Nm', unit: '台班', unitPrice: '24.81', evidenceQuote: '夯实机(电动)夯击能力20-62Nm 台班 24.81' })
    ]))

    const labor = parseHtmlPriceTableItems([
      '## 南京市建筑工种劳务市场人工信息价格',
      '<table><tr><td>序号</td><td>名称</td><td>单位</td><td>日工资(元)</td></tr>',
      '<tr><td>1</td><td>建筑、装饰工程普工</td><td>元</td><td>254.00</td></tr></table>',
      '注：日工资按照10小时计算。'
    ].join('\n'))
    expect(labor).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceCategory: 'labor', name: '建筑、装饰工程普工', aliases: ['普工'], unit: '工日', unitPrice: '254.00', workdayHours: 10 })
    ]))

    const quota = parseHtmlPriceTableItems([
      '类别 编码 名称 单位 消耗量',
      '<table><tr><td>人工</td><td>00150101</td><td>普工</td><td>工日</td><td>0.170</td></tr></table>'
    ].join('\n'))
    expect(quota).toEqual([])
  })

  it('parses a labor table after the old candidate excerpt boundary and keeps its evidence', () => {
    const prefix = `<table><tr><td>138</td><td>电动卷扬机</td><td>台班</td><td>103.08</td></tr></table>${'机械价格说明'.repeat(300)}`
    const [candidate] = toKnowledgePriceCandidates([{
      id: 'mixed-price-chunk',
      pageContent: `${prefix}\n## 南京市建筑工种劳务市场人工信息价格\n<table><tr><td>序号</td><td>名称</td><td>单位</td><td>日工资(元)</td></tr><tr><td>1</td><td>建筑、装饰工程普工</td><td>元</td><td>254.00</td></tr><tr><td colspan="4">注:日工资按照10小时计算。</td></tr></table>`,
      metadata: { knowledgebaseId: 'kb-price', documentId: 'price-book', chunkId: 'mixed-price-chunk' }
    }], ['kb-price'], '建筑、装饰工程普工 日工资')

    expect(candidate.priceItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '建筑、装饰工程普工', unit: '工日', unitPrice: '254.00', workdayHours: 10 })
    ]))
    expect(candidate.pageContent).toContain('建筑、装饰工程普工 工日 254.00')
    expect(candidate.pageContent).toContain('日工资按照10小时计算')
  })

  it('requires an exact price token and the quotation unit in evidence text', () => {
    expect(priceEvidenceSupports('DN50 热镀锌钢管，材料价 36.80 元/m。', '36.8', 'm')).toBe(true)
    expect(priceEvidenceSupports('DN50 热镀锌钢管，材料价 136.80 元/m。', '36.8', 'm')).toBe(false)
    expect(priceEvidenceSupports('DN50 热镀锌钢管，材料价 36.80 元/kg。', '36.8', 'm')).toBe(false)
  })
})

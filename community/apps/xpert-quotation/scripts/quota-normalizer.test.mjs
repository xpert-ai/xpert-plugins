import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKnowledgeChunk,
  groupPdfTokens,
  parseQuotaPageLayout,
  uniqueWarnings
} from './quota-normalizer.mjs'

test('groups PDF tokens into top-to-bottom lines', () => {
  const lines = groupPdfTokens([
    token('B', 40, 100),
    token('A', 20, 100.5),
    token('C', 20, 80)
  ])
  assert.equal(lines.length, 2)
  assert.equal(lines[0].text, 'A B')
  assert.equal(lines[1].text, 'C')
})

test('normalizes a multi-column quota table with evidence and resource alignment', () => {
  const tokens = [
    token('15.1.3.1', 208, 430, 48), token('封油刮腻子、补钉眼、封底', 261, 430, 150),
    token('工作内容：1.清扫、打磨、满刮腻子等。', 53, 413, 220),
    token('2.清扫、打磨、板缝贴自粘胶带、满刮腻子等。', 98, 401, 270),
    token('计量单位：10m', 482, 401, 57), token('2', 540, 406, 5),
    token('编', 176, 381), token('号', 221, 381), token('15-152', 391, 381, 36), token('15-153', 485, 381, 36),
    token('满批成品腻子', 425, 363, 70),
    token('项', 176, 344), token('目', 221, 344), token('抹灰面', 391, 344, 36), token('夹板面', 485, 344, 36),
    token('二遍', 443, 326, 24),
    token('类别', 55, 307), token('编码', 91, 307), token('名称', 203, 307), token('单位', 321, 307), token('消耗量', 438, 307),
    token('00150101', 82, 288, 40), token('普工', 124, 288), token('工日', 321, 288), token('0.052', 393, 288), token('0.064', 487, 288),
    token('人工', 55, 270), token('00150105', 82, 270, 40), token('一般技工', 124, 270), token('工日', 321, 270), token('0.259', 393, 270), token('0.322', 487, 270),
    token('材料', 55, 232), token('11450342', 82, 232, 40), token('成品腻子粉', 124, 232), token('kg', 326, 232), token('19.845', 391, 232), token('18.290', 485, 232),
    token('03270205', 82, 213, 40), token('水砂纸', 124, 213), token('张', 326, 213), token('0.400', 393, 213), token('0.400', 487, 213),
    token('注：1.柱、梁、天棚面上批腻子，各工种人工乘以系数 1.1。', 53, 98, 330),
    token('油 608', 50, 43, 35)
  ]
  const lines = groupPdfTokens(tokens)
  const result = parseQuotaPageLayout({
    pageNumber: 615,
    lines,
    tokens,
    state: { chapter: '第十五章 油漆、涂料及裱糊工程', sectionCode: null, sectionTitle: null }
  })

  assert.equal(result.items.length, 2)
  const plaster = result.items.find((item) => item.quotaCode === '15-152')
  const plywood = result.items.find((item) => item.quotaCode === '15-153')
  assert.equal(plaster.quotaName, '满批成品腻子 抹灰面 二遍')
  assert.equal(plaster.quotaUnit, '10m2')
  assert.deepEqual(plaster.workContents, [
    '清扫、打磨、满刮腻子等。',
    '清扫、打磨、板缝贴自粘胶带、满刮腻子等。'
  ])
  assert.deepEqual(plaster.resources.find((resource) => resource.code === '11450342'), {
    category: '材料',
    code: '11450342',
    name: '成品腻子粉',
    unit: 'kg',
    consumption: '19.845',
    consumptionKind: 'quantity'
  })
  assert.equal(plaster.resources.find((resource) => resource.code === '11450342').category, '材料')
  assert.equal(plywood.resources.find((resource) => resource.code === '11450342').consumption, '18.290')
  assert.match(plaster.adjustments[0], /人工乘以系数 1\.1/)
  assert.equal(result.resourceRowCount, 4)
})

test('creates an unreviewed idempotent knowledge chunk', () => {
  const chunk = buildKnowledgeChunk({
    quotaCode: '15-161',
    quotaName: '内墙面乳胶漆 二遍',
    quotaUnit: '10m2',
    chapter: '第十五章 油漆、涂料及裱糊工程',
    sectionCode: '15.1.3.2',
    sectionTitle: '乳胶漆',
    workContents: ['清扫基层、刷乳胶漆、打磨等。'],
    resources: [{ category: '材料', code: '11010304', name: '内墙乳胶漆', unit: 'kg', consumption: '2.884', consumptionKind: 'quantity' }],
    adjustments: [],
    sourcePages: [617],
    printedPages: ['油 610'],
    sourceExcerpt: '15-161 内墙面乳胶漆二遍',
    warnings: []
  }, {
    sourceFile: 'docs/source.pdf',
    sourceHash: 'abc123'
  })

  assert.equal(chunk.writeKey, 'quota:jiangsu:building-decoration:2026:15-161')
  assert.equal(chunk.metadata.reviewStatus, 'unreviewed')
  assert.equal(chunk.metadata.ingestionReady, true)
  assert.match(chunk.text, /11010304 \| 内墙乳胶漆 \| kg \| 2\.884/)
  assert.match(chunk.metadata.contentHash, /^[a-f0-9]{64}$/)
})

test('deduplicates warnings only within the same page and quota item', () => {
  const base = {
    code: 'missing_resources',
    page: 10,
    quotaCodes: ['1-1'],
    message: 'No resource consumption rows were associated with this item.'
  }
  const warnings = uniqueWarnings([
    base,
    { ...base },
    { ...base, quotaCodes: ['1-2'] },
    { ...base, page: 11 }
  ])

  assert.equal(warnings.length, 3)
})

function token(text, x, y, width = Math.max(8, text.length * 6), height = 10) {
  return { text, x, y, width, height }
}

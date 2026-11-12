import { describe, expect, it } from 'vitest'
import type { Catalog, ProposalLine } from '../src/contracts.js'
import { sourceRows, validateProposal } from '../src/proposal-validation.js'

const tee: Catalog['products'][number] = {
  id: 'synthetic-tee', category: '玛钢', productName: '三通', specification: '25', priceMarker: 'b', aliases: [], status: 'enabled'
}
const catalog: Catalog = {
  catalogVersion: 'a'.repeat(64), synthetic: true, products: [
    tee,
    { ...tee, id: 'synthetic-tee-a', priceMarker: 'a' },
    { ...tee, id: 'synthetic-elbow', productName: '90°弯头' },
    { ...tee, id: 'synthetic-elbow-a', productName: '90°弯头', priceMarker: 'a' },
    { ...tee, id: 'synthetic-iron', category: '球铁', productName: '球铁三通' },
    { ...tee, id: 'synthetic-grooved', category: '沟槽' }
  ]
}
const defaultText = '三通 25 1箱'

function line(evidence = defaultText, fields: Partial<ProposalLine> = {}): ProposalLine {
  return {
    category: '玛钢', productName: '三通', specification: '25', quantityCartons: 1, priceMarker: 'b', gradeRaw: '', evidence,
    ...fields
  }
}

describe('original inquiry evidence', () => {
  it('supports anchored grade headings and the recognized box-equivalent unit', () => {
    const evidence = '三通 25 1件'
    const inquiry = `l 中：\n${evidence}`
    expect(sourceRows(inquiry)).toMatchObject([{ text: evidence, category: '玛钢', contextGrade: '中' }])
    expect(() => validateProposal([line(evidence, { priceMarker: 'a' })], catalog, inquiry)).not.toThrow()
  })

  it('uses each section category and blocks mismatched or ambiguous section evidence', () => {
    const evidence = '球铁三通 25 1件'
    const inquiry = `QT：\n${evidence}\n玛钢：\n${defaultText}`
    const ironLine = line(evidence, { category: '球铁', productName: '球铁三通' })
    expect(sourceRows(inquiry).map(({ category }) => category)).toEqual(['球铁', '玛钢'])
    expect(() => validateProposal([ironLine, line()], catalog, inquiry)).not.toThrow()
    expect(() => validateProposal([ironLine, line(defaultText, { category: '球铁' })], catalog, inquiry)).toThrow('invalid_proposal')
    const ambiguous = `沟槽：\n${defaultText}\n玛钢：\n${defaultText}`
    expect(() => validateProposal([line(defaultText, { category: '沟槽' }), line()], catalog, ambiguous)).toThrow('invalid_proposal')
  })

  it('keeps duplicate source rows and blocks omissions or extra copies', () => {
    expect(() => validateProposal([line()], catalog, `合成询价\n${defaultText}`)).not.toThrow()
    const duplicate = [defaultText, defaultText].join('\n')
    expect(() => validateProposal([line(), line()], catalog, duplicate)).not.toThrow()
    expect(() => validateProposal([line()], catalog, duplicate)).toThrow('incomplete_coverage')
    expect(() => validateProposal([line(), line()], catalog, defaultText)).toThrow('incomplete_coverage')
    expect(() => validateProposal([line()], catalog, `${defaultText}\n90°弯头 25 2箱`)).toThrow('incomplete_coverage')
  })

  it('keeps the original comma-separated specification and count format', () => {
    const evidence = '三通，规格 25，1 箱。'
    expect(() => validateProposal([line(evidence)], catalog, evidence)).not.toThrow()
  })

  it.each(['', '黑袋 '])('supports both acceptance rows with %j before the elbow count', (bag) => {
    const elbow = `玛钢 90°弯头，规格 25，${bag}1 箱`
    const tee = '玛钢三通，规格 25，1 箱。'
    const lines = [line(elbow, { productName: '90°弯头', priceMarker: bag ? 'a' : 'b', gradeRaw: bag.trim() }), line(tee)]
    expect(() => validateProposal(lines, catalog, `${elbow}；${tee}`)).not.toThrow()
  })

  it('blocks unknown or conflicting grade evidence without applying the default', () => {
    const unknown = '三通 25 1箱 等级：X'
    expect(() => validateProposal([line(unknown, { gradeRaw: 'X' })], catalog, unknown)).toThrow('invalid_grade')
    expect(() => validateProposal([line(unknown)], catalog, unknown)).toThrow('invalid_grade')
    for (const evidence of ['三通 25 紫袋1箱', '三通 25 F 1箱']) {
      expect(() => validateProposal([line(evidence)], catalog, evidence)).toThrow('invalid_grade')
    }
    const blue = '三通 25 1箱 蓝袋'
    expect(() => validateProposal([line(blue, { gradeRaw: '蓝袋' })], catalog, `L中：\n${blue}`)).toThrow('invalid_grade')
    const black = '三通 25 1箱 等级：黑袋'
    expect(() => validateProposal([line(black, { priceMarker: 'a', gradeRaw: '黑袋' })], catalog, black)).not.toThrow()
    const nameOnly = '黑三通 25 1箱'
    expect(() => validateProposal([line(nameOnly, { priceMarker: 'a', gradeRaw: '黑' })], catalog, nameOnly)).toThrow('invalid_grade')
    const compact = '三通 25 黑袋1箱'
    expect(() => validateProposal([line(compact, { priceMarker: 'a', gradeRaw: '黑袋' })], catalog, compact)).not.toThrow()
  })

  it('checks specification and quantities as independent values and retains grounded corrections', () => {
    for (const evidence of ['三通 125 1箱', '三通 1箱', '三通 25 -1箱', '三通 25 1个']) {
      expect(() => validateProposal([line(evidence)], catalog, evidence)).toThrow('invalid_proposal')
    }
    expect(() => validateProposal([line(defaultText, { productName: '弯头', correctionReason: '合成纠错' })], catalog, defaultText))
      .toThrow('invalid_proposal')
    const explicitAngle = '45°弯头 25 1箱'
    expect(() => validateProposal([line(explicitAngle, { productName: '弯头' })], catalog, explicitAngle)).toThrow('invalid_proposal')
    const ocrText = '三涌 25 1箱'
    expect(() => validateProposal([line(ocrText)], catalog, ocrText)).toThrow('invalid_proposal')
    expect(() => validateProposal([line(ocrText, { correctionReason: '原字涌与通形近，合成目录有对应规格' })], catalog, ocrText))
      .not.toThrow()
  })

  it.each([
    ['黑袋弯头', '黑袋', 'a'], ['弯头黑袋', '黑袋', 'a'],
    ['蓝袋弯头', '蓝袋', 'b'], ['弯头蓝袋', '蓝袋', 'b']
  ] as const)('keeps the explicit bag grade in %s', (name, gradeRaw, priceMarker) => {
    const evidence = `${name} 25 1箱`
    const proposed = line(evidence, { productName: '90°弯头', gradeRaw, priceMarker })
    expect(() => validateProposal([proposed], catalog, evidence)).not.toThrow()
    expect(() => validateProposal([line(evidence, { productName: '90°弯头' })], catalog, evidence)).toThrow('invalid_grade')
  })

  it.each(['蓝袋弯头', '弯头蓝袋'])('blocks %s under a conflicting grade heading', (name) => {
    const evidence = `${name} 25 1箱`
    const proposed = line(evidence, { productName: '90°弯头', gradeRaw: '蓝袋' })
    expect(() => validateProposal([proposed], catalog, `L中：\n${evidence}`)).toThrow('invalid_grade')
  })

  it.each(['紫袋弯头', '弯头紫袋'])('blocks an unknown compact bag grade in %s', (name) => {
    const evidence = `${name} 25 1箱`
    expect(() => validateProposal([line(evidence, { productName: '90°弯头' })], catalog, evidence)).toThrow('invalid_grade')
  })

  it('preserves a bag token when it is part of an exact catalog name', () => {
    const productName = '弯头黑袋'
    const evidence = `${productName} 25 1箱`
    const withExactName = { ...catalog, products: [...catalog.products, { ...tee, id: 'synthetic-bag-name', productName }] }
    expect(() => validateProposal([line(evidence, { productName })], withExactName, evidence)).not.toThrow()
    expect(() => validateProposal([line(evidence, { productName: '90°弯头' })], withExactName, evidence))
      .toThrow('invalid_proposal')
  })

  it('recognizes a compact bag grade when a colon separates the product and specification', () => {
    const evidence = '黑袋弯头：25 1箱'
    const elbow = line(evidence, { productName: '90°弯头' })
    expect(() => validateProposal([{ ...elbow, gradeRaw: '黑袋', priceMarker: 'a' }], catalog, evidence)).not.toThrow()
    expect(() => validateProposal([elbow], catalog, evidence)).toThrow('invalid_grade')
  })

  it.each([
    ['法兰', '90°弯头'], ['特种三涌', '三通']
  ])('rejects changing the source product %s to %s based on a correction reason alone', (source, productName) => {
    const evidence = `${source} 25 1箱`
    const proposed = line(evidence, { productName, correctionReason: '原文字形相似，合成目录有对应规格' })
    expect(() => validateProposal([proposed], catalog, evidence)).toThrow('invalid_proposal')
  })

  it('requires a unique compatible catalog record for an OCR correction', () => {
    const correctionReason = '原字涌与通形近，合成目录有对应规格'
    const evidence = '三涌 25 1箱'
    const ambiguous = { ...catalog, products: [...catalog.products, { ...tee, id: 'another-synthetic-tee' }] }
    expect(() => validateProposal([line(evidence, { correctionReason })], ambiguous, evidence)).toThrow('invalid_proposal')
    const unavailable = '三涌 32 1箱'
    expect(() => validateProposal([line(unavailable, { specification: '32', correctionReason })], catalog, unavailable))
      .toThrow('invalid_proposal')
    const withExactName = { ...catalog, products: [...catalog.products, { ...tee, id: 'synthetic-source-name', productName: '三涌' }] }
    expect(() => validateProposal([line(evidence, { correctionReason })], withExactName, evidence)).toThrow('invalid_proposal')
  })

  it('requires the selected name in the source product position', () => {
    const text = '法兰 25 三通 1箱'
    expect(() => validateProposal([line(text)], catalog, text)).toThrow('invalid_proposal')
    const table = '法兰三通\t25\t1'
    expect(() => validateProposal([line(table)], catalog, `品名\t规格\t箱数\n${table}`)).toThrow('invalid_proposal')
  })

  it.each([
    ['1,234箱', 234], ['1，234箱', 234], ['1–2箱', 2], ['1 – 2箱', 2],
    ['−1箱', 1], ['− 1箱', 1], ['- 1箱', 1], ['+ 1箱', 1],
    ['１2箱', 2], ['１２3箱', 3], ['１２箱', 12]
  ] as const)('rejects the unsupported quantity token %s', (quantity, quantityCartons) => {
    const evidence = `三通 25 ${quantity}`
    expect(() => validateProposal([line(evidence, { quantityCartons })], catalog, evidence)).toThrow('invalid_proposal')
  })

  it.each([
    ['数量1或2箱', 2], ['数量1x2箱', 2], ['数量1万2箱', 2],
    ['数量1_234箱', 234], ['数量1 234箱', 234], ['规格 1,234箱', 234],
    ['1÷2箱', 2], ['1 ÷ 2箱', 2], ['备注备用2箱', 2], ['备注 2箱', 2],
    ['1箱半 备注：周五发货', 1], ['1件 半。请报价', 1], ['1箱。另加半箱', 1]
  ] as const)('does not accept the numeric suffix of %s', (quantity, quantityCartons) => {
    const evidence = `三通 25 ${quantity}`
    expect(() => validateProposal([line(evidence, { quantityCartons })], catalog, evidence)).toThrow('invalid_proposal')
  })

  it('takes a bare integer from an explicit box-count table column', () => {
    const evidence = '三通\t25\t2\t黑袋'
    const inquiry = `产品名称\t规格\t箱数\t等级\n${evidence}`
    expect(() => validateProposal([line(evidence, { quantityCartons: 2, priceMarker: 'a', gradeRaw: '黑袋' })], catalog, inquiry))
      .not.toThrow()
  })

  it('takes the unit from the quantity cell when the header gives none', () => {
    const evidence = '三通\t25\t2箱'
    expect(() => validateProposal([line(evidence, { quantityCartons: 2 })], catalog, `品名\t规格\t数量\n${evidence}`))
      .not.toThrow()
  })

  it('uses the grade cell and compact product grade without interpreting table notes as grades', () => {
    const header = '品名\t规格\t箱数\t等级\t备注'
    const evidence = '三通\t25\t1\t\t黑袋'
    expect(() => validateProposal([line(evidence)], catalog, `${header}\n${evidence}`)).not.toThrow()
    expect(() => validateProposal([line(evidence, { priceMarker: 'a', gradeRaw: '黑袋' })], catalog, `${header}\n${evidence}`))
      .toThrow('invalid_grade')

    const compact = '黑袋弯头\t25\t1\t\t蓝袋'
    const proposed = line(compact, { productName: '90°弯头', priceMarker: 'a', gradeRaw: '黑袋' })
    expect(() => validateProposal([proposed], catalog, `${header}\n${compact}`)).not.toThrow()
  })

  it.each([
    ['品名\t规格\t箱数\t备注', '三通\t\t1\t25'],
    ['品名\t产品名称\t规格\t箱数', '三通\t弯头\t25\t1'],
    ['品名\t规格\t规格\t箱数', '三通\t25\t32\t1'],
    ['品名\t规格\t箱数\t数量', '三通\t25\t1\t2箱'],
    ['品名\t规格\t箱数\t单位\t单位', '三通\t25\t1\t箱\t个'],
    ['品名\t规格\t箱数\t等级\t袋色', '三通\t25\t1\tb\t黑袋']
  ])('rejects missing specification evidence or duplicate fact columns in %s', (header, evidence) => {
    expect(() => validateProposal([line(evidence)], catalog, `${header}\n${evidence}`)).toThrow('invalid_proposal')
  })

  it.each([
    ['产品名称\t规格\t箱数\t备注', '三通\t25\t\t2'],
    ['产品名称\t规格\t箱数\t备注', '三通\t25\t\t补2箱'],
    ['产品名称\t规格\t箱数\t单位', '三通\t25\t2\t个'],
    ['产品名称\t规格\t箱数\t单位', '三通\t25\t2箱\t个'],
    ['产品名称\t规格\t数量\t单位', '三通\t25\t2\t'],
    ['| 产品名称 | 规格 | 箱数 | 备注 |', '| 三通 | 25 | | 2 |']
  ])('rejects a missing box count or conflicting unit in %s, %s', (header, evidence) => {
    expect(() => validateProposal([line(evidence, { quantityCartons: 2 })], catalog, `${header}\n${evidence}`))
      .toThrow('invalid_proposal')
  })

  it.each([
    '三通 1箱 备注 25', '三通 25 1箱 规格 32', '三通 25 规格32 1箱',
    '三通 25 1箱规格32。请报价', '三通 25 1箱（规格32）。请报价'
  ])('rejects missing or conflicting specification fields in %s', (evidence) => {
    expect(() => validateProposal([line(evidence)], catalog, evidence)).toThrow('invalid_proposal')
  })

  it.each(['A档', '（A）', '(A)'])('does not default an unsupported grade spelling %s to b', (grade) => {
    const evidence = `90°弯头 25 ${grade} 1箱`
    expect(() => validateProposal([line(evidence, { productName: '90°弯头' })], catalog, evidence)).toThrow('invalid_grade')
  })

  it.each([
    '三通 25 （A）数量：1箱', '三通 25 A数量：1箱', '三通 25 黑袋数量：1箱',
    '三通 25 F 数量：1箱', '三通 25 1箱（A） 备注', '三通 25 1箱。A档',
    '三通 25 1箱 A档。 备注', '三通 25 1箱F。请报价', '三通 25 1箱 F。请报价'
  ])('keeps grade evidence next to a quantity label or unit in %s', (evidence) => {
    expect(() => validateProposal([line(evidence)], catalog, evidence)).toThrow('invalid_grade')
  })

  it.each([
    ['1箱 A。请报价', 'A', 'A'], ['1箱A。请报价', 'A', 'A'],
    ['1箱。黑。请报价', '黑', 'a'], ['1箱黑袋', '黑袋', 'a'],
    ['1箱A. 请报价', 'A', 'A'], ['1箱 黑袋. 请报价', '黑袋', 'a']
  ] as const)('keeps a complete grade after the count in %s', (quantity, gradeRaw, priceMarker) => {
    const evidence = `90°弯头 25 ${quantity}`
    const proposed = line(evidence, { productName: '90°弯头' })
    expect(() => validateProposal([proposed], catalog, evidence)).toThrow('invalid_grade')
    expect(() => validateProposal([{ ...proposed, gradeRaw, priceMarker }], catalog, evidence)).not.toThrow()
  })

  it.each([
    ['三通 25 数量：2箱', 2, 'b', ''],
    ['三通 25 黑袋1箱', 1, 'a', '黑袋'],
    ['三通 25 A 1箱', 1, 'A', 'A'],
    ['三通 25 1箱', 1, 'b', ''],
    ['三通 25 黑袋，数量：1箱', 1, 'a', '黑袋'],
    ['三通 25 A，数量：1箱', 1, 'A', 'A'],
    ['三通 25：1箱', 1, 'b', ''],
    ['三通 规格:25:1箱', 1, 'b', ''],
    ['三通 25 1箱 备注：按原规格 发货。', 1, 'b', '']
  ] as const)('preserves complete supported fields in %s', (evidence, quantityCartons, priceMarker, gradeRaw) => {
    expect(() => validateProposal([line(evidence, { quantityCartons, priceMarker, gradeRaw })], catalog, evidence)).not.toThrow()
  })

  it.each([
    ['产品名称\t规格\t备注\t箱数\t等级\t单位', '三通\t25\t\t2\t\t'],
    ['| 产品名称 | 规格 | 备注 | 数量 | 单位 |', '| 三通 | 25 | | 2 | 件 |'],
    ['产品名称\t规格\t箱数\t备注', '三通\t25\t2\t补9箱'],
    ['| 品名 | 规格 | 箱数 | 备注 |', '| 三通 | 25 | 2 | 备用1箱，待确认 |']
  ])('uses the aligned box count and keeps duplicate rows in %s', (header, evidence) => {
    const inquiry = [header, evidence, evidence].join('\n')
    const proposed = line(evidence, { quantityCartons: 2 })
    expect(() => validateProposal([proposed, proposed], catalog, inquiry)).not.toThrow()
    expect(() => validateProposal([proposed], catalog, inquiry)).toThrow('incomplete_coverage')
  })
})

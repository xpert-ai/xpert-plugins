import { createRequire } from 'node:module'
import { parsePriceBook } from './price-book.parser.js'

const XLSX = createRequire(import.meta.url)('xlsx') as typeof import('xlsx')

describe('parsePriceBook', () => {
  it('imports Chinese headers and explicit price kinds', () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['项目编码', '项目名称', '规格型号', '计量单位', '综合单价', '价格类型'],
      ['010101001', '挖一般土方', '三类土', 'm3', 18.25, '综合单价'],
      ['M-1', '预拌混凝土', 'C30', 'm3', 420, '材料']
    ]), '价格清单')
    const items = parsePriceBook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
    expect(items).toEqual([
      expect.objectContaining({ kind: 'project_rate', code: '010101001', unitPrice: '18.25' }),
      expect.objectContaining({ kind: 'material', code: 'M-1', unitPrice: '420' })
    ])
  })
})

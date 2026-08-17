import { matchPrice, multiplyAmount, sumAmounts } from './pricing.js'

describe('quotation pricing', () => {
  it('matches exact project codes without treating material prices as comprehensive rates', () => {
    const line = { sheetName: 'sheet', rowNumber: 8, discipline: 'building' as const, kind: 'bill' as const, code: '010101001', name: '土方', unit: 'm3', quantity: '2', targetPriceAddress: 'I8', targetAmountAddress: 'J8' }
    const result = matchPrice(line, [
      { id: 'material', kind: 'material', code: '010101001', name: '土方材料', unitPrice: '5', sourceSheet: '价格', sourceRow: 2 },
      { id: 'rate', kind: 'project_rate', code: '010101001', name: '土方', unit: 'm3', unitPrice: '12.345', sourceSheet: '价格', sourceRow: 3 }
    ])
    expect(result.status).toBe('matched')
    expect(result.status === 'matched' && result.item.id).toBe('rate')
  })

  it('uses half-up decimal arithmetic for amounts and totals', () => {
    expect(multiplyAmount('2.5', '12.345')).toBe('30.86')
    expect(sumAmounts(['30.86', '0.14', '9.00'])).toBe('40.00')
  })
})

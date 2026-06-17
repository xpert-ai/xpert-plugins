import { buildCustomsWorkbookModel, createCustomsWorkbookBuffer } from './trade-compliance-workbook.js'
import type { CustomsWorkbookSource, TradeTemplateDefaults } from './types.js'

describe('buildCustomsWorkbookModel', () => {
  it('merges extracted sales contract fields with template defaults', () => {
    const model = buildCustomsWorkbookModel(source(), defaults())

    expect(model.invoiceNo).toBe('INV-2026-001')
    expect(model.contractNo).toBe('SC-2026-001')
    expect(model.sellerEnglishName).toBe('Yuneec Technology (Shenzhen) Co., Ltd.')
    expect(model.paymentTerm).toBe('30% upfront deposit, 70% balance payable prior to shipment.')
    expect(model.tradeTerm).toBe('EXW Shenzhen')
    expect(model.items[0]?.englishName).toBe('Server')
  })

  it('creates an xlsx workbook buffer with the required four sheets', () => {
    const model = buildCustomsWorkbookModel(source(), defaults())
    const result = createCustomsWorkbookBuffer(model)

    expect(result.fileName).toBe('INV-2026-001-customs-workbook.xlsx')
    expect(result.sheetNames).toEqual(['报关单', 'CI', 'Contract', 'PL'])
    expect(result.buffer.length).toBeGreaterThan(0)
  })
})

function source(): CustomsWorkbookSource {
  return {
    invoiceNo: 'INV-2026-001',
    contractNo: 'SC-2026-001',
    buyerName: 'Limited Liability Company',
    sellerName: '闰镁科技（深圳）有限公司',
    items: [
      {
        productName: '服务器',
        englishName: 'Server',
        model: 'HPC-8208',
        description: 'Chassis and motherboard server configuration',
        quantity: 15,
        unit: 'set',
        unitPrice: 30975,
        amount: 464625,
        hsCode: '8471499100'
      }
    ]
  }
}

function defaults(): TradeTemplateDefaults {
  return {
    sellerEnglishName: 'Yuneec Technology (Shenzhen) Co., Ltd.',
    sellerEnglishAddress: 'Room 602, Building 16, Shenzhen, Guangdong',
    phone: '+86 15112619120',
    email: 'sales03@yuneectech.com',
    bankBeneficiary: 'YUNEEC TECHNOLOGY(SHENZHEN)CO.,LTD',
    bankName: 'BANK (PJSC) SHANGHAI BRANCH',
    bankAddress: 'Yincheng Road, Pudong New Area, Shanghai, China',
    bankAccountNo: '40807156400610004941',
    cnapsCode: '7672900000',
    swiftCode: '',
    paymentTerm: '30% upfront deposit, 70% balance payable prior to shipment.',
    tradeTerm: 'EXW Shenzhen',
    origin: 'CHINA',
    destination: 'MOSCOW',
    packageType: '纸制或纤维板制盒/箱',
    supervisionMode: '一般贸易',
    taxExemptionNature: '一般征税',
    domesticSourceLocation: '深圳',
    exchangeRate: 7.21
  }
}

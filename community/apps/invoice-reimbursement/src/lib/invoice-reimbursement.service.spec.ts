import { InvoiceReimbursementService } from './invoice-reimbursement.service.js'
import { DEFAULT_COMPANY_TAX_NO } from './constants.js'

describe('InvoiceReimbursementService Unit Tests', () => {
  let service: InvoiceReimbursementService

  beforeEach(() => {
    service = new InvoiceReimbursementService()
  })

  test('should parse a valid taxi invoice and pass tax compliance check', () => {
    const raw = `【增值税电子普通发票】
发票代码：011002300111
发票号码：88992233
开票日期：2026-10-30
购买方名称：某某科技有限公司
纳税人识别号：91110108MA00000000
销售方名称：北京首汽约车科技有限公司
金额：¥141.51
税率：6%
税额：¥8.49
价税合计：¥150.00`

    const result = service.parseInvoiceText({
      text: raw,
      companyTaxNo: DEFAULT_COMPANY_TAX_NO
    })

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data?.invoiceNumber).toBe('88992233')
    expect(result.data?.totalAmount).toBe(150.0)
    expect(result.data?.category).toBe('差旅交通')
    expect(result.data?.compliance.isTaxNoMatched).toBe(true)
    expect(result.data?.compliance.riskLevel).toBe('PASS')
  })

  test('should flag WARN on restaurant meal invoice requiring attendees list', () => {
    const raw = `增值税普通发票 发票号码: 45678912 开票日期: 2026-10-31 购买方: 某某科技有限公司 税号: 91110108MA00000000 销售方: 海底捞餐饮股份有限公司 金额: 366.04 税额: 21.96 价税合计: 388.00 品目: 餐饮工作餐`

    const result = service.parseInvoiceText({
      text: raw,
      companyTaxNo: DEFAULT_COMPANY_TAX_NO
    })

    expect(result.success).toBe(true)
    expect(result.data?.category).toBe('餐饮招待')
    expect(result.data?.compliance.riskLevel).toBe('WARN')
    expect(result.data?.compliance.messages.some((m) => m.includes('随行人员'))).toBe(true)
  })

  test('should reject invalid or non-invoice text with a clear error', () => {
    const raw = `今天天气真好，我们开会讨论了架构，下午去喝了咖啡。`
    const result = service.parseInvoiceText({ text: raw })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  test('should save and retrieve invoice records in ledger', async () => {
    const saved = await service.createInvoiceRecord({
      invoiceNumber: '99887766',
      issueDate: '2026-10-31',
      buyerName: '某某科技有限公司',
      buyerTaxNo: DEFAULT_COMPANY_TAX_NO,
      sellerName: '京东世纪贸易有限公司',
      pretaxAmount: 200,
      taxAmount: 26,
      totalAmount: 226,
      category: '办公耗材',
      remark: '研发团队机械键盘'
    })

    expect(saved.id).toBeDefined()

    const list = await service.listInvoiceRecords()
    expect(list.length).toBeGreaterThan(0)
    expect(list.some((r) => r.invoiceNumber === '99887766')).toBe(true)

    const fetched = await service.getInvoiceRecordById(saved.id!)
    expect(fetched).not.toBeNull()
    expect(fetched?.totalAmount).toBe(226)
  })
})

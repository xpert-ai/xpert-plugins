import { strict as assert } from 'node:assert'

import { TradeComplianceWorkbenchMiddleware } from '../dist/lib/trade-compliance-workbench.middleware.js'

let capturedInput
const service = {
  async createReviewBatch(_scope, input) {
    capturedInput = input
    return {
      batch: { id: input.batchId ?? 'batch-sales', type: input.type, status: 'pending_review', sourceFileName: input.sourceFileName },
      items: input.items.map((item, index) => ({ ...item, id: `item-${index + 1}` }))
    }
  }
}

const middleware = new TradeComplianceWorkbenchMiddleware(service, { resolve: () => ({}) })
const runtime = middleware.createMiddleware({}, { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', xpertId: 'assistant-1' })
const saveTool = runtime.tools.find((tool) => tool.name === 'trade_compliance_save_sales_contract_extraction')
assert.ok(saveTool, 'sales contract save tool should exist')

const output = await saveTool.invoke({
  batchId: 'batch-sales',
  sourceFileName: 'sales.docx',
  items: [
    {
      type: 'customs_workbook',
      title: '购销合同 YC20260302',
      extractedData: {
        contractNo: 'YC20260302',
        buyerName: '买方公司',
        sellerName: '卖方公司',
        currency: 'CNY'
      }
    },
    {
      type: 'customs_workbook',
      title: '商品明细 - 服务器 HPC',
      extractedData: {
        contractNo: 'YC20260302',
        productName: '服务器 HPC',
        quantity: 15,
        unit: '台',
        unitPrice: 30975,
        amount: 464625,
        hsCode: '8471499100'
      }
    }
  ]
})
const parsed = JSON.parse(output)

assert.equal(parsed.savedCount, 1)
assert.equal(capturedInput.type, 'sales_contract')
assert.equal(capturedInput.items.length, 1)
assert.equal(capturedInput.items[0].type, 'customs_workbook')
assert.equal(capturedInput.items[0].extractedData.contractNo, 'YC20260302')
assert.equal(capturedInput.items[0].extractedData.items.length, 1)
assert.equal(capturedInput.items[0].extractedData.items[0].productName, '服务器 HPC')

console.log('sales contract single review item verification passed')

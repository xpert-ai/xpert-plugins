import { strict as assert } from 'node:assert'

import { TradeComplianceWorkbenchMiddleware } from '../dist/lib/trade-compliance-workbench.middleware.js'

let capturedInput
const service = {
  async createReviewBatch(_scope, input) {
    capturedInput = input
    return {
      batch: { id: input.batchId ?? 'batch-1', type: input.type, status: 'pending_review', sourceFileName: input.sourceFileName },
      items: input.items.map((item, index) => ({ ...item, id: `item-${index + 1}` }))
    }
  }
}
const middleware = new TradeComplianceWorkbenchMiddleware(service, { resolve: () => ({}) })
const runtime = middleware.createMiddleware({}, { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', xpertId: 'assistant-1' })
const saveTool = runtime.tools.find((tool) => tool.name === 'trade_compliance_save_controlled_goods_extraction')
assert.ok(saveTool, 'controlled goods save tool should exist')

const rows = Array.from({ length: 100 }, (_, index) => ({
  productName: `商品${index + 1}`,
  hsCode: `${82070000 + index}`,
  controlNote: '制裁管控商品',
  sequence: String(index + 1),
  rawText: `${82070000 + index} 商品${index + 1}`,
  sourceLocation: `Sheet1, 行号${index + 2}`,
  confidence: 0.95
}))
const output = await saveTool.invoke({ batchId: 'batch-1', sourceFileName: 'sanctions.xlsx', rows })
const parsed = JSON.parse(output)

assert.equal(parsed.savedCount, 100)
assert.equal(capturedInput.type, 'controlled_goods_file')
assert.equal(capturedInput.items.length, 100)
assert.equal(capturedInput.items[0].type, 'controlled_goods')
assert.equal(capturedInput.items[0].title, '商品1')
assert.equal(capturedInput.items[0].extractedData.productName, '商品1')
assert.equal(capturedInput.items[0].extractedData.hsCode, '82070000')
assert.equal(capturedInput.items[0].extractedData.controlNote, '制裁管控商品')
assert.equal(capturedInput.items[0].sourceLocation, 'Sheet1, 行号2')
assert.equal(capturedInput.metadata.inputMode, 'compact_rows')
assert.equal(capturedInput.metadata.rowCount, 100)

await saveTool.invoke({
  batchId: 'batch-2',
  sourceFileName: 'sanctions.xlsx',
  rows: [{
    productName: '章节商品',
    hsCode: '25000000',
    sequence: '25',
    sectionPath: 'Chapter 25',
    rawText: '25 章节商品 25000000',
    sourceLocation: 'Sheet1, 行号4'
  }]
})
assert.equal(capturedInput.items[0].extractedData.controlNote, undefined)
assert.equal(capturedInput.items[0].extractedData.sectionPath, 'Chapter 25')
assert.equal(capturedInput.items[0].extractedData.rawText, '25 章节商品 25000000')

console.log('controlled goods compact rows save verification passed')

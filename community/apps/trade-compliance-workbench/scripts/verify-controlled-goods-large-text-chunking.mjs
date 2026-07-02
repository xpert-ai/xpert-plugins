import { strict as assert } from 'node:assert'

import * as XLSX from 'xlsx'

import { TradeComplianceWorkbenchViewProvider } from '../dist/lib/trade-compliance-workbench-view.provider.js'
import { TRADE_COMPLIANCE_TOOL_NAMES, TRADE_COMPLIANCE_VIEW_KEY } from '../dist/lib/constants.js'

const created = []
const service = {
  async createReviewBatch(_scope, input) {
    created.push(input)
    return {
      batch: { id: input.batchId ?? 'batch-large', type: input.type, status: 'pending_review', sourceFileName: input.sourceFileName },
      items: input.items.map((item, index) => ({ ...item, id: `item-${index + 1}` }))
    }
  }
}

const rows = [['HS Code', '商品描述']]
for (let index = 1; index <= 900; index += 1) {
  rows.push([String(84000000 + index), `LONG CONTROLLED GOODS DESCRIPTION ${index} `.repeat(12)])
}

const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Large')
const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

const provider = new TradeComplianceWorkbenchViewProvider(service)
const response = await provider.executeViewFileAction(
  { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', hostType: 'agent', hostId: 'assistant-1' },
  TRADE_COMPLIANCE_VIEW_KEY,
  'upload_controlled_goods_file',
  { input: { name: 'large-sanctions.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } },
  { name: 'large-sanctions.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: buffer.length, buffer }
)

assert.equal(response.success, true)
const text = response.data?.payload?.text ?? ''
assert.ok(TRADE_COMPLIANCE_TOOL_NAMES.includes('trade_compliance_get_controlled_goods_extracted_text_chunk'))
assert.ok(text.includes('trade_compliance_get_controlled_goods_extracted_text_chunk'))
assert.ok(text.includes('第 1 块'))
assert.ok(text.includes('先调用 trade_compliance_get_controlled_goods_extracted_text_chunk 读取第 1 块'))
assert.ok(!text.includes('LONG CONTROLLED GOODS DESCRIPTION'))
assert.ok(!text.includes('已截断到消息上限'))
assert.equal(created[0].metadata.extractedTextTruncated, false)
assert.ok(created[0].metadata.extractedTextChunkCount > 1)

console.log('controlled goods large text chunking verification passed')

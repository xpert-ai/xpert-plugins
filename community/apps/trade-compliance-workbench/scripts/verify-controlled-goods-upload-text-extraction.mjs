import { strict as assert } from 'node:assert'

import * as XLSX from 'xlsx'

import { TradeComplianceWorkbenchViewProvider } from '../dist/lib/trade-compliance-workbench-view.provider.js'
import { TRADE_COMPLIANCE_VIEW_KEY } from '../dist/lib/constants.js'

const created = []
const service = {
  async createReviewBatch(_scope, input) {
    created.push(input)
    return {
      batch: { id: input.batchId ?? 'batch-1', type: input.type, status: 'pending_review', sourceFileName: input.sourceFileName },
      items: input.items.map((item, index) => ({ ...item, id: `item-${index + 1}` }))
    }
  }
}

const workbook = XLSX.utils.book_new()
const sheet = XLSX.utils.aoa_to_sheet([
  ['HS Code', '商品描述'],
  ['82071300', 'INTERCHANGEABLE ROCK DRILLING TOOLS'],
  ['84012000', 'ISOTOPE SEPARATION MACHINERY']
])
XLSX.utils.book_append_sheet(workbook, sheet, 'Sanctions')
const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

const provider = new TradeComplianceWorkbenchViewProvider(service)
const response = await provider.executeViewFileAction(
  { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', hostType: 'agent', hostId: 'assistant-1' },
  TRADE_COMPLIANCE_VIEW_KEY,
  'upload_controlled_goods_file',
  { input: { name: 'sanctions.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } },
  { name: 'sanctions.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: buffer.length, buffer }
)

assert.equal(response.success, true)
assert.equal(response.data?.commandKey, 'assistant.chat.send_message')
const text = response.data?.payload?.text ?? ''
assert.ok(text.includes('以下是插件从上传文件中转换出的文本'))
assert.ok(text.includes('工作表：Sanctions'))
assert.ok(text.includes('| 行号 | HS Code | 商品描述 |'))
assert.ok(text.includes('| 2 | 82071300 | INTERCHANGEABLE ROCK DRILLING TOOLS |'))
assert.ok(text.includes('不要重新读取附件'))
assert.ok(text.includes('基于下方文本提取'))
assert.equal(created[0].items.length, 0)

console.log('controlled goods upload text extraction verification passed')

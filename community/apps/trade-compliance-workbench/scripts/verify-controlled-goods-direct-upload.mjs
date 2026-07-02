import { strict as assert } from 'node:assert'

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

const provider = new TradeComplianceWorkbenchViewProvider(service)
const content = [
  '-- 1 of 1 --',
  '序号 管制编码 物项名称及描述 参考商品名称 海关商品编号 单位',
  '1 1A202 具有以下两种特性的管状复合结构： 管状复合结构 千克'
].join('\n')
const buffer = new TextEncoder().encode(content).buffer

const response = await provider.executeViewFileAction(
  { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', hostType: 'agent', hostId: 'assistant-1' },
  TRADE_COMPLIANCE_VIEW_KEY,
  'upload_controlled_goods_file',
  { input: { name: 'controlled.txt', mimeType: 'text/plain' } },
  { name: 'controlled.txt', type: 'text/plain', size: content.length, buffer }
)

assert.equal(response.success, true)
assert.equal(response.refresh, false)
assert.equal(response.data?.commandKey, 'assistant.chat.send_message')
assert.ok(response.data?.payload?.text?.includes('一次性识别'))
assert.ok(response.data?.payload?.text?.includes('一次性调用 trade_compliance_save_controlled_goods_extraction'))
assert.ok(response.data?.payload?.text?.includes('rows 紧凑入参'))
assert.ok(response.data?.payload?.text?.includes('不要为每条记录手写完整 items 结构'))
assert.ok(response.data?.payload?.text?.includes('同一个 batchId'))
assert.ok(response.data?.payload?.text?.includes('禁止摘要'))
assert.ok(response.data?.payload?.text?.includes('trade_compliance_save_controlled_goods_extraction'))
assert.ok(response.data?.payload?.text?.includes('不要调用代码解析工具'))
assert.ok((response.data?.payload?.files?.length ?? 0) > 0)
assert.equal(response.data?.role, 'controlled_goods_file')
assert.equal(created[0].type, 'controlled_goods_file')
assert.equal(created[0].items.length, 0)

console.log('controlled goods llm one-shot upload verification passed')

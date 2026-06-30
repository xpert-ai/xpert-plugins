import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { TradeComplianceWorkbenchMiddleware } from '../dist/lib/trade-compliance-workbench.middleware.js'

const dir = await mkdtemp(join(tmpdir(), 'tcw-controlled-'))
const filePath = join(dir, 'catalog.txt')
await writeFile(filePath, [
  '-- 16 of 168 --',
  '- 17 -',
  'Ⅱ、两用物项和技术出口许可证管理目录',
  '1A 系统、设备和部件',
  '序号 管制编码 物项名称及描述 参考商品名称 海关商品编号 单位',
  '1 1A202',
  '具有以下两种特性的管状复合结构：',
  'a．内径 75～400 mm；',
  '管状复合结构 千克',
  '2 1A225 镀铂催化剂 38151200 千克'
].join('\n'))

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

const middleware = new TradeComplianceWorkbenchMiddleware(service)
const result = await middleware.parseControlledGoodsSourceFile(
  { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' },
  { batchId: 'batch-1', sourceFileName: 'catalog.txt', filePath, mimeType: 'text/plain' }
)

assert.equal(result.savedCount, 2)
assert.equal(result.parsedCandidateCount, 2)
assert.equal(created[0].items[0].extractedData.controlCode, '1A202')
assert.equal(created[0].items[0].extractedData.hsCode, '')
assert.equal(created[0].items[0].sourceLocation, '第 17 页')
assert.equal(created[0].items[1].extractedData.hsCode, '38151200')

console.log('controlled goods direct save verification passed')

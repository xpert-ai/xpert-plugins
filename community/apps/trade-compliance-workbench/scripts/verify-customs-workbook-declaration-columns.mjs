import { strict as assert } from 'node:assert'
import * as XLSX from 'xlsx'

import {
  buildCustomsWorkbookModel,
  createCustomsWorkbookFromTemplateBuffer
} from '../dist/lib/trade-compliance-workbook.js'

const model = buildCustomsWorkbookModel({
  invoiceNo: 'INV-1',
  contractNo: 'YC20260302',
  sellerName: '深圳市***科技有限公司',
  buyerName: '闰镁科技（深圳）有限公司',
  currency: 'CNY',
  origin: '中国',
  destination: '俄罗斯',
  domesticSourceLocation: '未识别',
  items: [
    {
      productName: '服务器',
      description: '机箱：HPC-8208-80RA1',
      quantity: 15,
      unit: '台',
      unitPrice: 30975,
      amount: 464625,
      hsCode: '8471499100'
    }
  ]
}, {})

const result = await createCustomsWorkbookFromTemplateBuffer(model, Buffer.alloc(0))
const workbook = XLSX.read(result.buffer, { type: 'buffer' })
const sheet = workbook.Sheets['报关单']

assert.equal(sheet.D14?.v, '15 台')
assert.equal(sheet.E14?.v, 30975)
assert.equal(sheet.F14?.v, 464625)
assert.equal(sheet.G14?.v, 'CNY')
assert.equal(sheet.H14?.v, '中国')
assert.equal(sheet.I14?.v, '俄罗斯')
assert.equal(sheet.J14?.v, '未识别')
assert.equal(sheet.K14?.v, '照章征免')

console.log('customs workbook declaration column verification passed')

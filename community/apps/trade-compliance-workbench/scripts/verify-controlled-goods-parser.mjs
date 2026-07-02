import { strict as assert } from 'node:assert'

import { parseControlledGoodsText } from '../dist/lib/controlled-goods-file-parser.js'

const sample = [
  '-- 16 of 168 --',
  '- 17 -',
  'Ⅱ、两用物项和技术出口许可证管理目录',
  '一、两用物项出口管制清单所列物项',
  '（一）专用材料和相关设备、化学制品、微生物和毒素',
  '1A 系统、设备和部件',
  '序号 管制编码 物项名称及描述 参考商品名称 海关商品编号 单位',
  '1 1A202',
  '具有以下两种特性的管状复合结构：',
  'a．内径 75～400 mm；',
  'b．用 1C210.a 项所管制的任何一种“纤维或纤丝材料”制造。',
  '管状复合结构 千克',
  '2 1A225 为从重水中回收氚或为生产重水而专门设计或制备，用于',
  '加速氢和水之间的氢同位素交换反应的镀铂催化剂。 镀铂催化剂 38151200',
  '千克'
].join('\n')

const result = parseControlledGoodsText(sample)

assert.equal(result.candidates.length, 2)
assert.equal(result.candidates[0].sequence, '1')
assert.equal(result.candidates[0].controlCode, '1A202')
assert.equal(result.candidates[0].productName, '管状复合结构')
assert.deepEqual(result.candidates[0].hsCodes, [])
assert.equal(result.candidates[0].sourceLocation, '第 17 页')
assert.equal(result.candidates[1].controlCode, '1A225')
assert.deepEqual(result.candidates[1].hsCodes, ['38151200'])

const wrappedUnitSample = [
  '-- 87 of 168 --',
  '序号 管制编码 物项名称及描述 参考商品名称 海关商品编号 单位',
  '610 2B352.f.1',
  'f．防护设备：',
  '1．依靠外部空气供应，并在正压下操作使用的全身或半身防护服或防护罩；',
  '全身或半身防护服或防护罩',
  '6506100010',
  '8414701010',
  '件 ，',
  '个/千',
  '克'
].join('\n')

const wrappedUnitResult = parseControlledGoodsText(wrappedUnitSample)
assert.equal(wrappedUnitResult.candidates.length, 1)
assert.equal(wrappedUnitResult.candidates[0].controlCode, '2B352.f.1')
assert.equal(wrappedUnitResult.candidates[0].productName, '全身或半身防护服或防护罩')
assert.equal(wrappedUnitResult.candidates[0].unit, '件，个/千克')
assert.deepEqual(wrappedUnitResult.candidates[0].hsCodes, ['6506100010', '8414701010'])

const facilitySample = [
  '-- 86 of 168 --',
  '序号 管制编码 物项名称及描述 参考商品名称 海关商品编号 单位',
  '603 2B352.a',
  '生物材料处理设备：',
  'a．符合世界卫生组织标准的全密闭设施；',
  '全密闭设施 套/间'
].join('\n')
const facilityResult = parseControlledGoodsText(facilitySample)
assert.equal(facilityResult.candidates[0].productName, '全密闭设施')
assert.equal(facilityResult.candidates[0].unit, '套/间')

const technicalNoteSample = [
  '-- 87 of 168 --',
  '序号 管制编码 物项名称及描述 参考商品名称 海关商品编号 单位',
  '607 2B352.d.1',
  'd．交叉流（切向流）过滤设备及其组件：',
  '技术说明：2B352.d.1.b 项所述的“灭菌”是指通过交叉流（切向流）过滤设备；',
  '交叉流（切向流）过滤设备 8421299040 台/千',
  '克'
].join('\n')
const technicalNoteResult = parseControlledGoodsText(technicalNoteSample)
assert.equal(technicalNoteResult.candidates[0].productName, '交叉流（切向流）过滤设备')
assert.equal(technicalNoteResult.candidates[0].unit, '台/千克')

const uncertainReferenceSample = [
  '-- 88 of 168 --',
  '序号 管制编码 物项名称及描述 参考商品名称 海关商品编号 单位',
  '613 2B352.h.1 h．喷雾或雾化 1．专门设计或改进 全套喷雾或雾 台/套',
  '-- 89 of 168 --',
  '系统及其组件：',
  '技术说明：1．“轻于航空器的飞行器”是指依赖热气或轻于空气的气体。',
  '后可安装在轻于航空器的飞行器上的全套喷雾或雾化系统。'
].join('\n')
const uncertainReferenceResult = parseControlledGoodsText(uncertainReferenceSample)
assert.equal(uncertainReferenceResult.candidates[0].controlCode, '2B352.h.1')
assert.equal(uncertainReferenceResult.candidates[0].productName, undefined)
assert.ok(uncertainReferenceResult.candidates[0].referenceNameCandidate)
assert.ok(uncertainReferenceResult.candidates[0].parseWarnings.includes('cross_page_record'))

console.log('controlled goods parser verification passed')

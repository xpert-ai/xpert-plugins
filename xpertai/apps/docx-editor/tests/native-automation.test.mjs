import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { automate } from '../dist/lib/native/automation.js'
import { DocxEngine } from '../dist/lib/native/ai-engine.js'
import { DocxFormat } from '../dist/lib/native/format.js'
import { createSchema } from '../dist/lib/native/ai-schema.js'
import { recordReceipt, readReceipts, matchReceipt } from '../dist/lib/native/ai-receipts.js'
const plan = { operationId: '10000000-0000-4000-8000-000000000001', title: '企业报告', templateId: 'report',
  blocks: [{ kind: 'heading', text: '业务结果', level: 1 }, { kind: 'paragraph', text: '保留人工内容。' },
    { kind: 'list', items: ['第一项', '第二项'] }, { kind: 'table', rows: [['对象', '结果'], ['Word', '可编辑']] }] }
const inspect = buffer => automate({ action: 'inspect', buffer, offset: 0, limit: 30 })
test('creates actual headings, numbered lists and native tables through an isolated upstream engine', async () => {
  const result = await new DocxEngine().run({ action: 'create', input: createSchema.parse(plan) })
  const buffer = Buffer.from(result.buffer), format = new DocxFormat()
  await format.validateFile(buffer)
  const zip = await JSZip.loadAsync(buffer), xml = await zip.file('word/document.xml').async('string')
  assert.match(xml, /<w:tbl>/); assert.match(xml, /<w:numPr>/); assert.match(xml, /Heading1/)
  assert.ok(inspect(buffer).paragraphs.some(p => p.text === '可编辑'))
})
test('targeted edits retain non-target text and package parts; ambiguous or stale targets fail without output', async () => {
  const created = automate({ action: 'create', input: createSchema.parse(plan) })
  const zip = await JSZip.loadAsync(created.buffer)
  zip.file('customXml/unrelated.xml', '<retained>UNCHANGED</retained>')
  const original = await zip.generateAsync({ type: 'nodebuffer' })
  const target = inspect(original).paragraphs.find(p => p.text === '业务结果')
  const edits = [{ paragraphId: target.paragraphId, expectedText: target.text, text: '只改标题', style: 'preserve' }]
  const result = automate({ action: 'apply', buffer: original, edits })
  assert.ok(inspect(result.buffer).paragraphs.some(p => p.text === '保留人工内容。'))
  assert.equal(await (await JSZip.loadAsync(result.buffer)).file('customXml/unrelated.xml').async('string'), '<retained>UNCHANGED</retained>')
  assert.throws(() => automate({ action: 'apply', buffer: original, edits: [{ ...edits[0], expectedText: 'stale' }] }), /target_changed/)
  assert.throws(() => automate({ action: 'apply', buffer: original, edits: [edits[0], edits[0]] }), /invalid_target/)
  assert.ok(inspect(original).paragraphs.some(p => p.text === '业务结果'))
})
test('operation receipts survive native manual-style round trips and reject reused operation IDs', async () => {
  const original = Buffer.from(automate({ action: 'create', input: createSchema.parse(plan) }).buffer)
  const receipt = { id: plan.operationId, actor: 'a'.repeat(64), hash: 'b'.repeat(64) }
  const recorded = await recordReceipt(original, receipt, true)
  const target = inspect(recorded).paragraphs[1]
  const edited = automate({ action: 'apply', buffer: recorded, edits: [{ paragraphId: target.paragraphId, expectedText: target.text, text: '人工修改', style: 'preserve' }] })
  const journal = await readReceipts(Buffer.from(edited.buffer))
  assert.equal(matchReceipt(journal, receipt, true), true)
  assert.throws(() => matchReceipt(journal, { ...receipt, hash: 'c'.repeat(64) }, true), /operation_reused/)
})

test('heading and list formatting never leaks into subsequent paragraphs or table anchors', async () => {
  const result=await new DocxEngine().run({action:'create',input:{operationId:'10000000-0000-4000-8000-000000000099',title:'Title',templateId:'report',blocks:[{kind:'heading',level:1,text:'Heading'},{kind:'paragraph',text:'Body'},{kind:'list',items:['Item']},{kind:'paragraph',text:'After list'},{kind:'table',rows:[['Cell']]}]}})
  const zip=await JSZip.loadAsync(result.buffer), xml=await zip.file('word/document.xml').async('string')
  for(const value of ['Body','After list']) {
    const paragraph=xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g).find(p=>p.includes(`<w:t>${value}</w:t>`))
    assert.ok(paragraph);assert.doesNotMatch(paragraph, /w:numPr|w:pStyle|w:color/)
  }
})

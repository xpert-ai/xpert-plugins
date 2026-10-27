import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { MarkdownDocumentModel } from '../src/model.js'

const model = new MarkdownDocumentModel()
const encode = (doc: Y.Doc) => Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')
const clone = (state: string) => { const doc = new Y.Doc(); Y.applyUpdate(doc, Buffer.from(state, 'base64')); return doc }

test('supported Markdown round-trips with stable anchors, nested lists, links, quotes and fenced code', () => {
  const source = '# 中文标题\n\nHello **bold** and *italic* with [link](https://example.com).\n\n- first\n  - nested\n\n1. ordered\n\n> quote\n\n```ts\nconst n = 1\n```'
  const state = model.initialize(source), first = model.read(state)
  const second = model.read(model.initialize(first.markdown, first.blocks))
  assert.equal(first.markdown, second.markdown)
  assert.deepEqual(first.blocks, second.blocks)
  assert.ok(first.markdown.includes('**bold**'))
  assert.ok(first.blocks.some((block) => block.type === 'codeBlock'))
})

test('unsupported syntax, unsafe links and malformed snapshots fail before a file can be overwritten', () => {
  for (const source of ['<script>alert(1)</script>', '![image](https://example.com/a.png)',
    '- [ ] ![nested](https://example.com/a.png)', '- [x] <b>raw</b>', '| A |\n|---|\n| ![nested](https://example.com/a.png) |', '[bad](javascript:alert)'])
    assert.throws(() => model.initialize(source), source)
  assert.throws(() => model.validate('not-base64!'))
  const state = clone(model.initialize('plain')); state.getMap('unrecognized').set('a', 'b')
  assert.throws(() => model.validate(encode(state)))
  state.destroy()
})

test('migration preserves matching old block IDs and rejects stale exact-text patches', () => {
  const state = model.initialize('Legacy paragraph', [{ id: 'legacy-block', text: 'Legacy paragraph' }])
  assert.equal(model.read(state).blocks[0].id, 'legacy-block')
  assert.throws(() => model.patch(state, { blockId: 'legacy-block', before: 'stale', after: 'replacement' }))
})

test('two clients converge, replaying an accepted proposal is idempotent and unchanged marks survive', () => {
  const state = model.initialize('Hello **team**\n\nSecond paragraph'), blocks = model.read(state).blocks
  const first = clone(state), second = clone(state)
  const updateA = model.patch(state, { blockId: blocks[0].id, before: 'Hello team', after: 'Welcome team' })
  const updateB = model.patch(state, { blockId: blocks[1].id, before: 'Second paragraph', after: 'Another paragraph' })
  for (const update of [updateA, updateB, updateA]) Y.applyUpdate(first, Buffer.from(update, 'base64'))
  for (const update of [updateB, updateA]) Y.applyUpdate(second, Buffer.from(update, 'base64'))
  assert.deepEqual(model.read(encode(first)), model.read(encode(second)))
  assert.match(model.read(encode(first)).markdown, /Welcome \*\*team\*\*/)
  first.destroy(); second.destroy()
})

test('duplicate anchors and excessive document size are rejected', () => {
  const state = clone(model.initialize('first\n\nsecond'))
  const nodes = state.getXmlFragment('body').toArray()
  assert.ok(nodes[0] instanceof Y.XmlElement && nodes[1] instanceof Y.XmlElement)
  if (nodes[0] instanceof Y.XmlElement && nodes[1] instanceof Y.XmlElement)
    nodes[1].setAttribute('blockId', nodes[0].getAttribute('blockId')!)
  assert.throws(() => model.validate(encode(state)))
  assert.throws(() => model.initialize('x'.repeat(1024 * 1024 + 1)))
  state.destroy()
})

test('unknown CRDT nodes and marks cannot be silently dropped by the renderer', () => {
  const state = clone(model.initialize('valid'))
  state.getXmlFragment('body').insert(0, [new Y.XmlElement('unknown-plugin-node')])
  assert.throws(() => model.validate(encode(state)), /unknown_node/)
  state.destroy()
  const marked = clone(model.initialize('valid'))
  const paragraph = marked.getXmlFragment('body').get(0)
  assert.ok(paragraph instanceof Y.XmlElement)
  const text = paragraph.get(0); assert.ok(text instanceof Y.XmlText)
  text.format(0, 1, { unsafeUnknownMark: true })
  assert.throws(() => model.validate(encode(marked)), /unknown_mark/)
  marked.destroy()
})

test('GFM tasks, tables, aligned columns and callout templates survive reimport with stable block IDs', () => {
  const source = '- [ ] 准备\n- [x] **完成**\n  - [ ] 子任务\n\n| 任务 | 状态 |\n| :--- | ---: |\n| A \\| B | `ready` |\n\n> **提示：** 阅读原文\n\n> **重要：** 保持格式'
  const first = model.read(model.initialize(source))
  const second = model.read(model.initialize(first.markdown, first.blocks))
  assert.deepEqual(second, first)
  assert.match(first.markdown, /- \[x\] \*\*完成\*\*/)
  assert.match(first.markdown, /A \\\| B/)
})

test('v1 upgrade preserves the exact CRDT and anchors and rejects unknown versions', () => {
  const original = model.initialize('# Heading\n\nOld **text**')
  assert.equal(model.upgrade(original, 1), original)
  assert.equal(model.upgrade(original, 2), original)
  assert.equal(model.descriptor.schemaVersion, 4)
  assert.equal(model.upgrade(original, 3), original)
  assert.throws(() => model.upgrade(original, 4), /unsupported_schema_upgrade/)
})

test('concurrent checkbox and table cell edits converge without dropping either change', () => {
  const initial = model.initialize('- [ ] 待完成\n\n| 项目 | 状态 |\n| --- | --- |\n| 文档 | 待审核 |')
  const first = clone(initial), second = clone(initial)
  const taskList = first.getXmlFragment('body').get(0)
  assert.ok(taskList instanceof Y.XmlElement)
  const task = taskList.get(0); assert.ok(task instanceof Y.XmlElement)
  task.setAttribute('checked', true)
  const target = model.read(initial).blocks.find((block) => block.text === '待审核')!
  Y.applyUpdate(second, Buffer.from(model.patch(initial, { blockId: target.id, before: '待审核', after: '已审核' }), 'base64'))
  Y.applyUpdate(first, Y.encodeStateAsUpdate(second)); Y.applyUpdate(second, Y.encodeStateAsUpdate(first))
  assert.deepEqual(model.read(encode(first)), model.read(encode(second)))
  assert.match(model.read(encode(first)).markdown, /- \[x\] 待完成/)
  assert.match(model.read(encode(first)).markdown, /已审核/)
  first.destroy(); second.destroy()
})

test('rejects merged cells, inconsistent alignment and invalid checkbox attributes before publication', () => {
  for (const [attr, value] of [['colspan', 2], ['align', 'javascript:bad'], ['colwidth', [200]]] as const) {
    const doc = clone(model.initialize('| A | B |\n|---|---|\n| C | D |'))
    const table = doc.getXmlFragment('body').get(0); assert.ok(table instanceof Y.XmlElement)
    const row = table.get(0); assert.ok(row instanceof Y.XmlElement)
    const cell = row.get(0); assert.ok(cell instanceof Y.XmlElement)
    Reflect.apply(cell.setAttribute, cell, [attr, value])
    assert.throws(() => model.validate(encode(doc)), /table_/)
    doc.destroy()
  }
  const doc = clone(model.initialize('- [ ] 任务'))
  const list = doc.getXmlFragment('body').get(0); assert.ok(list instanceof Y.XmlElement)
  const task = list.get(0); assert.ok(task instanceof Y.XmlElement)
  task.setAttribute('checked', 'true')
  assert.throws(() => model.validate(encode(doc)), /invalid_task/)
  doc.destroy()
})

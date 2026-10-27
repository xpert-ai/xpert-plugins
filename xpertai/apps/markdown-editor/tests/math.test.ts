import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { MarkdownDocumentModel } from '../src/model.js'
import { validateMath, mathOptions } from '../src/math.js'
import katex from 'katex'
const model = new MarkdownDocumentModel()
const encode = (doc: Y.Doc) => Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')

test('inline and display math preserve LaTeX, anchors and tables through file round trips', () => {
  const source = '# 公式\n\n面积 $S=\\pi r^2$。\n\n$$\n\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\n$$\n\n| 公式 | 说明 |\n| --- | --- |\n| $x^2$ | 平方 |'
  const first = model.read(model.initialize(source))
  assert.match(first.markdown, /\$S=\\pi r\^2\$/u)
  const second = model.read(model.initialize(first.markdown, first.blocks))
  assert.deepEqual(second, first)
  assert.ok(first.blocks.some((block) => block.type === 'blockMath' && block.text.includes('frac')))
})
test('currency, code and escaped dollars are not formulas; math does not bypass nested HTML/image rejection', () => {
  const result = model.read(model.initialize('价格 $5 和 $10。\n\n`$x$`\n\n\\$literal\\$\n\n$$\nx < y\n$$'))
  assert.match(result.markdown, /价格/u)
  assert.match(result.markdown, /\\\$literal\\\$/u)
  assert.deepEqual(model.read(model.initialize(result.markdown, result.blocks)), result)
  assert.equal(result.blocks.filter((block) => block.type === 'blockMath').length, 1)
  for (const source of ['- [ ] ![bad](https://example.com/a.png)', '- [ ] <script>bad</script>']) assert.throws(() => model.initialize(source))
})
test('invalid or excessive formulas fail validation and trusted HTML is never emitted', () => {
  for (const value of ['', 'a'.repeat(4097), '$x$', '\\unknownCommand{x}']) assert.throws(() => validateMath(value))
  assert.throws(() => validateMath('a\nb', true))
  const rendered = katex.renderToString('\\href{javascript:alert(1)}{x}', mathOptions)
  assert.doesNotMatch(rendered, /href=/u)
})
test('formula proposals use stable block IDs and concurrent body changes survive', () => {
  const state = model.initialize('正文\n\n$$\nx^2\n$$'), original = model.read(state)
  const math = original.blocks.find((block) => block.type === 'blockMath')!
  const a = new Y.Doc(), b = new Y.Doc()
  for (const doc of [a, b]) Y.applyUpdate(doc, Buffer.from(state, 'base64'))
  Y.applyUpdate(a, Buffer.from(model.patch(state, { blockId: math.id, before: math.text, after: 'x^3' }), 'base64'))
  Y.applyUpdate(b, Buffer.from(model.patch(state, { blockId: original.blocks[0].id, before: '正文', after: '团队正文' }), 'base64'))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b)); Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  assert.deepEqual(model.read(encode(a)), model.read(encode(b)))
  assert.match(model.read(encode(a)).markdown, /x\^3/u); assert.match(model.read(encode(a)).markdown, /团队正文/u)
  assert.throws(() => model.patch(encode(a), { blockId: math.id, before: 'x^2', after: 'x^4' }), /conflict/u)
  a.destroy(); b.destroy()
})

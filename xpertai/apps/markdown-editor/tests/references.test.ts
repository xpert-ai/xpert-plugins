import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import * as Y from 'yjs'
import { MarkdownDocumentModel } from '../src/model.js'
import { schema } from '../src/schema.js'
import { referenceUri, parseReference, parseReferenceFileKey, referenceFileKey } from '../src/references.js'
import { slashMatch, consumeSlash } from '../remote/slash-content.js'
const id = 'f0f07e56-501c-4369-81f2-9377d8e5bb86'
const model = new MarkdownDocumentModel()
const uri = (kind: 'image' | 'file' | 'page') => referenceUri({ kind, providerKey: 'spaces', resourceId: id })

test('image, file and page identities survive Markdown export/reimport including inline image context', () => {
  const source = `# 资源\n\n前文 ![流程图](${uri('image')}) 后文\n\n[附件](${uri('file')})\n\n[页面](${uri('page')})\n\n| 图片 |\n| --- |\n| ![图](${uri('image')}) |`
  const first = model.read(model.initialize(source)), next = model.read(model.initialize(first.markdown, first.blocks))
  assert.deepEqual(next, first)
  for (const kind of ['image', 'file', 'page'] as const) assert.ok(first.markdown.includes(uri(kind)))
  assert.ok(first.markdown.includes('前文')); assert.ok(first.markdown.includes('后文'))
  const quoted = model.read(model.initialize(`![方括号\\[与\\]符号](${uri('image')} "标题")`))
  assert.equal(model.read(model.initialize(quoted.markdown)).markdown, quoted.markdown)
})
test('malformed targets, signed URLs, other schemes and forged image CRDT nodes are rejected', () => {
  for (const bad of [uri('image') + '?token=secret', uri('image') + '#x', uri('image').replace('/spaces/', '/%73paces/'),
    uri('image').replace('/image/', '/chat/'), 'javascript:alert(1)', 'https://example.com/image']) assert.equal(parseReference(bad), null)
  assert.deepEqual(parseReferenceFileKey(referenceFileKey(id, uri('image'))), { resourceId: id, target: parseReference(uri('image')) })
  assert.throws(() => parseReferenceFileKey('reference:../file:bad'))
  for (const target of [uri('file'), 'https://example.com/image', 'data:image/svg+xml,<svg/>'])
    assert.throws(() => model.initialize(`![image](${target})`))
  const doc = new Y.Doc(); Y.applyUpdate(doc, Buffer.from(model.initialize(`![image](${uri('image')})`), 'base64'))
  const paragraph = doc.getXmlFragment('body').get(0); assert.ok(paragraph instanceof Y.XmlElement)
  const image = paragraph.get(0); assert.ok(image instanceof Y.XmlElement)
  image.setAttribute('src', 'https://example.com/evil')
  assert.throws(() => model.validate(Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')), /invalid_image/)
  doc.destroy()
})
test('schema v3 upgrade retains Yjs state exactly and image edits converge with simultaneous body edits', () => {
  const initial = model.initialize(`正文\n\n![旧标题](${uri('image')})`), first = new Y.Doc(), second = new Y.Doc()
  assert.equal(model.upgrade(initial, 3), initial)
  for (const doc of [first, second]) Y.applyUpdate(doc, Buffer.from(initial, 'base64'))
  const block = first.getXmlFragment('body').get(1); assert.ok(block instanceof Y.XmlElement)
  const image = block.get(0); assert.ok(image instanceof Y.XmlElement); image.setAttribute('alt', '新标题')
  Y.applyUpdate(second, Buffer.from(model.patch(initial, { blockId: model.read(initial).blocks[0].id, before: '正文', after: '协同正文' }), 'base64'))
  Y.applyUpdate(first, Y.encodeStateAsUpdate(second)); Y.applyUpdate(second, Y.encodeStateAsUpdate(first))
  const read = (doc: Y.Doc) => model.read(Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'))
  assert.deepEqual(read(first), read(second)); assert.match(read(first).markdown, /协同正文/); assert.match(read(first).markdown, /新标题/)
  first.destroy(); second.destroy()
})
test('slash commands never consume ordinary prose, code or collaborator changes', () => {
  const state = (text: string, type = 'paragraph') => {
    const doc = schema.nodeFromJSON({ type: 'doc', content: [{ type, attrs: { blockId: id }, content: [{ type: 'text', text }] }] })
    return EditorState.create({ schema, doc, selection: TextSelection.create(doc, text.length + 1) })
  }
  for (const text of ['正文 /table', 'https://example.com', '//']) assert.equal(slashMatch(state(text)), null)
  assert.equal(slashMatch(state('/table', 'codeBlock')), null)
  const expected = slashMatch(state('/table'))!; let dispatched = false
  const editor = { state: state('/table 已被协作编辑'), schema, isEditable: true, view: { dispatch: () => { dispatched = true } } } as unknown as Editor
  assert.throws(() => consumeSlash(editor, expected, 'table'), { name: 'ViewMessageError', key: 'slash.positionChanged' }); assert.equal(dispatched, false)
  const valid = { ...editor, state: state('/table'), commands: { focus: () => true }, view: { dispatch: (tr: import('@tiptap/pm/state').Transaction) => {
    tr.doc.check(); assert.equal(tr.doc.firstChild?.type.name, 'table'); dispatched = true
  } } } as unknown as Editor
  consumeSlash(valid, expected, 'table'); assert.equal(dispatched, true)
})

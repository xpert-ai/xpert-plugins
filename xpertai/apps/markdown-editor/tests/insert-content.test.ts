import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { schema } from '../src/schema.js'
import { insertedContent, insertionTransaction } from '../remote/insert-content.js'
import { linkedDocument, safeHref } from '../remote/content-links.js'
import { MarkdownDocumentModel } from '../src/model.js'
import { prosemirrorToYDoc } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
const paragraph = (id: string, text: string) => ({ type: 'paragraph', attrs: { blockId: id }, content: [{ type: 'text', text }] })

test('insertion preserves selected text and resolves the block anchor after concurrent position shifts', () => {
  const doc = schema.nodeFromJSON({ type: 'doc', content: [paragraph('new', 'Concurrent'), paragraph('chosen', 'Keep this text')] })
  const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 13, 17) })
  const tr = insertionTransaction(state, 'chosen', insertedContent('taskList'))
  assert.equal(tr.doc.child(1).textContent, 'Keep this text')
  assert.equal(tr.doc.lastChild?.type.name, 'taskList')
  assert.throws(() => insertionTransaction(state, 'deleted', insertedContent('table')), { name: 'ViewMessageError', key: 'insert.anchorDeleted' })
})

test('inserts after a whole nested list/table instead of corrupting a child container', () => {
  for (const content of [
    { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('chosen', 'Keep')] }] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph('chosen', 'Keep')] }] }] }
  ]) {
    const state = EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content: [content] }) })
    const tr = insertionTransaction(state, 'chosen', insertedContent('heading2'))
    assert.equal(tr.doc.childCount, 2)
    assert.equal(tr.doc.child(0).textContent, 'Keep')
    assert.equal(tr.doc.child(1).type.name, 'heading')
    tr.doc.check()
  }
})

test('internal routing uses the explicit platform discriminator and rejects unsafe URLs', () => {
  const id = 'cef1b690-fde3-4cc0-982a-e930e6206d8d'
  assert.equal(linkedDocument(`https://example.test/chat?contentResource=${id}`), id)
  assert.equal(linkedDocument(`https://example.test/chat?viewSelection=${id}`), null)
  assert.equal(linkedDocument('javascript:alert(1)'), null)
  for (const bad of ['javascript:alert(1)', 'data:text/html,bad', 'java\nscript:bad', '//example.com']) assert.throws(() => safeHref(bad))
  assert.equal(safeHref(' https://example.com '), 'https://example.com')
})

test('empty task/table templates remain editable after file export and labels place the caret at the end', () => {
  const model = new MarkdownDocumentModel()
  for (const kind of ['taskList', 'table', 'hint', 'callout'] as const) {
    const json = { type: 'doc', content: [paragraph('chosen', 'Original'), insertedContent(kind)] }
    let next = 0
    const identify = (node: import('@tiptap/core').JSONContent) => {
      if (node.type === 'paragraph') node.attrs = { blockId: `block-${++next}` }
      node.content?.forEach(identify)
    }
    identify(json)
    const doc = prosemirrorToYDoc(schema.nodeFromJSON(json), 'body')
    const first = model.read(Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'))
    assert.equal(model.read(model.initialize(first.markdown)).markdown, first.markdown)
    doc.destroy()
  }
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content: [paragraph('chosen', 'Keep')] }) })
  const tr = insertionTransaction(state, 'chosen', insertedContent('hint'))
  assert.equal(tr.selection.$from.parentOffset, tr.selection.$from.parent.content.size)
})

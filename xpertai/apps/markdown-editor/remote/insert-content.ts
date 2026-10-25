import { t, i18n } from './i18n'
import type { Editor, JSONContent } from '@tiptap/core'
import { NodeSelection, TextSelection, type EditorState } from '@tiptap/pm/state'

export type InsertKind = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'bulletList' | 'orderedList' |
  'taskList' | 'blockquote' | 'codeBlock' | 'horizontalRule' | 'table' | 'hint' | 'callout'
const paragraph = (): JSONContent => ({ type: 'paragraph' })
/** Pure content factories: the same nodes travel through collaboration and Markdown export. */
export function insertedContent(kind: InsertKind): JSONContent {
  switch (kind) {
    case 'heading1': return { type: 'heading', attrs: { level: 1 } }
    case 'heading2': return { type: 'heading', attrs: { level: 2 } }
    case 'heading3': return { type: 'heading', attrs: { level: 3 } }
    case 'bulletList': case 'orderedList': return { type: kind, content: [{ type: 'listItem', content: [paragraph()] }] }
    case 'taskList': return { type: kind, content: [{ type: 'taskItem', attrs: { checked: false }, content: [paragraph()] }] }
    case 'blockquote': return { type: kind, content: [paragraph()] }
    case 'hint': case 'callout': return { type: 'blockquote', content: [{ type: 'paragraph', content: [
      { type: 'text', text: kind === 'hint' ? t('insert.hintText') : t('insert.calloutText'), marks: [{ type: 'bold' }] }, { type: 'text', text: ' ' }
    ] }] }
    case 'table': return { type: 'table', content: Array.from({ length: 3 }, (_, row) => ({ type: 'tableRow',
      content: Array.from({ length: 3 }, () => ({ type: row === 0 ? 'tableHeader' : 'tableCell', content: [paragraph()] })) })) }
    default: return { type: kind }
  }
}
/** Capture a stable text-block anchor before a menu/dialog takes focus; positions go stale under CRDT. */
export function insertionAnchor(editor: Editor): string {
  const direct: unknown = editor.state.selection.$from.parent.attrs.blockId
  if (typeof direct === 'string') return direct
  let last = '', first = ''
  editor.state.doc.descendants((node, pos) => {
    if (typeof node.attrs.blockId !== 'string') return
    first ||= node.attrs.blockId
    if (pos <= editor.state.selection.from) last = node.attrs.blockId
  })
  return last || first
}
/** Insert AFTER the containing top-level block. Never replace a user's selected text or split a table/list. */
export function insertionTransaction(state: EditorState, anchor: string, content: JSONContent) {
  let position: number | undefined
  state.doc.descendants((node, pos) => { if (anchor && node.attrs.blockId === anchor) position = pos })
  if (position === undefined) throw i18n.error('insert.anchorDeleted')
  const resolved = state.doc.resolve(position + 1), at = resolved.after(1)
  const node = state.schema.nodeFromJSON(content)
  node.check()
  const tr = state.tr.insert(at, node)
  if (node.type.name === 'blockMath') return tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView()
  if (node.type.name === 'horizontalRule') tr.insert(at + node.nodeSize, state.schema.nodes.paragraph.create())
  // Templates already contain a label/link. Place the caret after it, so typing
  // continues the template instead of prepending text before “提示/重要”.
  const cursor = node.textContent ? at + node.nodeSize - 1 : at + 1
  return tr.setSelection(TextSelection.near(tr.doc.resolve(cursor), node.textContent ? -1 : 1)).scrollIntoView()
}
export function insertAtAnchor(editor: Editor, anchor: string, content: JSONContent) {
  if (!editor.isEditable) throw i18n.error('insert.notEditable')
  editor.view.dispatch(insertionTransaction(editor.state, anchor, content))
  editor.commands.focus()
}

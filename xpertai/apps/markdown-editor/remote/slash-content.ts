import { i18n } from './i18n'
import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'
import { insertedContent, type InsertKind } from './insert-content'

export type Match = { anchor: string; text: string; query: string }
/** Only a top-level paragraph wholly occupied by /query is a command. Selection text and
 * slash characters inside tables, code, URLs or normal prose are never consumed. */
export function slashMatch(state: EditorState): Match | null {
  const { $from, empty } = state.selection, node = $from.parent
  if (!empty || $from.depth !== 1 || node.type.name !== 'paragraph' || $from.parentOffset !== node.content.size ||
    typeof node.attrs.blockId !== 'string' || !/^\/[^\n/]{0,40}$/u.test(node.textContent)) return null
  return { anchor: node.attrs.blockId, text: node.textContent, query: node.textContent.slice(1).toLowerCase().trim() }
}
export function consumeSlash(editor: Editor, expected: Match, kind?: InsertKind) {
  const current = slashMatch(editor.state)
  if (!editor.isEditable || !current || current.anchor !== expected.anchor || current.text !== expected.text)
    throw i18n.error('slash.positionChanged')
  const from = editor.state.selection.$from.before(1), old = editor.state.selection.$from.parent
  const node = kind ? editor.schema.nodeFromJSON(insertedContent(kind)) : editor.schema.nodes.paragraph.create({ blockId: expected.anchor })
  const tr = editor.state.tr.replaceWith(from, from + old.nodeSize, node)
  if (node.type.name === 'horizontalRule') tr.insert(from + node.nodeSize, editor.schema.nodes.paragraph.create())
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(from + 1, tr.doc.content.size))))
  editor.view.dispatch(tr); editor.commands.focus()
}

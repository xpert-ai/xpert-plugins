import { i18n } from './i18n'
import type { Editor } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'

export type BlockFormat = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'bulletList' | 'orderedList' | 'taskList' | 'blockquote' | 'codeBlock'
export function findBlock(editor: Editor, blockId: string): { node: Node; pos: number } | null {
  let result: { node: Node; pos: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if ((node.isTextblock || node.type.name === 'blockMath') && node.attrs.blockId === blockId) result = { node, pos }
  })
  return result
}
export function formatBlock(editor: Editor, blockId: string, format: BlockFormat) {
  const block = findBlock(editor, blockId)
  if (!block) throw i18n.error('block.deleted')
  if (!editor.isEditable) throw i18n.error('editor.notEditable')
  const position = editor.state.doc.resolve(block.pos)
  if (['tableCell', 'tableHeader'].includes(position.parent.type.name) && format !== 'paragraph')
    throw i18n.error('table.cellConstraint')
  editor.commands.setTextSelection(block.pos + 1)
  // Unwrap only the selected list item/quote before applying the requested type.
  if (editor.isActive('listItem')) editor.commands.liftListItem('listItem')
  if (editor.isActive('taskItem')) editor.commands.liftListItem('taskItem')
  if (editor.isActive('blockquote')) editor.commands.lift('blockquote')
  const chain = editor.chain().focus()
  if (format === 'heading1') return chain.setHeading({ level: 1 }).run()
  if (format === 'heading2') return chain.setHeading({ level: 2 }).run()
  if (format === 'heading3') return chain.setHeading({ level: 3 }).run()
  if (format === 'codeBlock') return chain.setCodeBlock().run()
  if (format === 'bulletList') return chain.setParagraph().toggleBulletList().run()
  if (format === 'orderedList') return chain.setParagraph().toggleOrderedList().run()
  if (format === 'taskList') return chain.setParagraph().toggleTaskList().run()
  if (format === 'blockquote') return chain.setParagraph().toggleBlockquote().run()
  return chain.setParagraph().run()
}
export function insertBelow(editor: Editor, blockId: string) {
  const block = findBlock(editor, blockId)
  if (!block) throw i18n.error('block.deleted')
  const at = block.pos + block.node.nodeSize
  return editor.chain().focus().insertContentAt(at, { type: 'paragraph' }).setTextSelection(at + 1).run()
}
export function deleteBlock(editor: Editor, blockId: string) {
  if (!editor.isEditable) throw i18n.error('editor.notEditable')
  const block = findBlock(editor, blockId)
  if (!block) return
  const at = editor.state.doc.resolve(block.pos)
  const item = ['listItem', 'taskItem'].includes(at.parent.type.name) && at.parent.childCount === 1
  const from = item ? at.before() : block.pos
  const to = item ? at.after() : block.pos + block.node.nodeSize
  editor.chain().focus().deleteRange({ from, to }).run()
}

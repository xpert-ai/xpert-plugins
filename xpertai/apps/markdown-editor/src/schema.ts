import { Extension, getSchema } from '@tiptap/core'
import Paragraph from '@tiptap/extension-paragraph'
import StarterKit from '@tiptap/starter-kit'
import { Plugin } from '@tiptap/pm/state'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { checkTables } from './tables.js'
import { ResourceImage } from './references.js'
import { mathExtensions } from './math.js'

export const MODEL_KEY = 'markdown.tiptap'
export const SCHEMA_VERSION = 4
export const FRAGMENT = 'body'
const textBlocks = ['paragraph', 'heading', 'codeBlock', 'blockMath']

/** Stable resource anchors are independent of Markdown formatting and DOM positions. */
export const BlockIdentity = Extension.create({
  name: 'blockIdentity',
  addGlobalAttributes() {
    return [{ types: textBlocks, attributes: { blockId: { default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute('data-block-id'),
      renderHTML: (attributes: { blockId?: string }) => attributes.blockId ? { 'data-block-id': attributes.blockId } : {}
    } } }]
  },
  addProseMirrorPlugins() {
    return [new Plugin({ appendTransaction(transactions, _old, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null
      const seen = new Set<string>(), tr = state.tr
      state.doc.descendants((node, pos) => {
        if (!textBlocks.includes(node.type.name)) return
        let id: unknown = node.attrs.blockId
        if (typeof id !== 'string' || !id || seen.has(id)) {
          id = globalThis.crypto.randomUUID()
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: id })
        }
        if (typeof id === 'string') seen.add(id)
      })
      return tr.docChanged ? tr : null
    } })]
  }
})

/** The UI and server share the same GFM subset. Prevent edits that would lose data on export. */
const MarkdownTables = Extension.create({
  name: 'markdownTables',
  addProseMirrorPlugins() {
    return [new Plugin({ filterTransaction(tr) {
      if (!tr.docChanged) return true
      try { checkTables(tr.doc); return true } catch { return false }
    } })]
  }
})
export const extensions = [StarterKit.configure({ undoRedo: false, trailingNode: false, paragraph: false,
  link: { openOnClick: false, protocols: ['https', 'http', 'mailto', 'xpert-resource'] } }),
  // Upstream Paragraph unwraps a standalone image into a block. Our authorized image
  // node is inline, so retain its paragraph for identical standalone/inline round trips.
  Paragraph.extend({ parseMarkdown(token, helpers) {
    if (token.tokens?.length === 1 && token.tokens[0].type === 'image')
      return helpers.createNode('paragraph', undefined, helpers.parseInline(token.tokens))
    return this.parent?.(token, helpers) ?? helpers.createNode('paragraph', undefined, helpers.parseInline(token.tokens ?? []))
  } }),
  TaskList, TaskItem.configure({ nested: true, a11y: { checkboxLabel: (node) => `任务：${node.textContent || '未命名'}` } }),
  Table.configure({ resizable: false, renderWrapper: true }), TableRow,
  TableHeader.extend({ content: 'paragraph' }), TableCell.extend({ content: 'paragraph' }),
  ...mathExtensions, ResourceImage, MarkdownTables, BlockIdentity]
export const schema = getSchema(extensions)

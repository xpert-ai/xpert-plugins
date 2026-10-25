import { BadRequestException, Injectable } from '@nestjs/common'
import { ContentEditorProvider, type ContentDocumentModel } from '@xpert-ai/plugin-sdk'
import type { ContentDocumentBlock, TextContentEditorRegistration } from '@xpert-ai/contracts'
import { MarkdownManager } from '@tiptap/markdown'
import type { JSONContent } from '@tiptap/core'
import { prosemirrorToYDoc, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { extensions, FRAGMENT, MODEL_KEY, SCHEMA_VERSION, schema } from './schema.js'
import { checkTables } from './tables.js'
import { blockMathTokenizer, inlineMathTokenizer, validateMath } from './math.js'
import { parseReference, validateImage } from './references.js'
import { serializeMarkdown } from './serialize.js'

const markdown = new MarkdownManager({ extensions })
const safeLink = (href: string) => /^(https?:\/\/|mailto:|#)/iu.test(href) || parseReference(href) !== null
const encode = (doc: Y.Doc) => Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')

function decode(value: string) {
  if (value.length > 4 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) throw new Error('markdown.invalid_state')
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, Buffer.from(value, 'base64'))
    if ([...doc.share.keys()].some((key) => key !== FRAGMENT)) throw new Error('markdown.invalid_state')
    return doc
  } catch (error) { doc.destroy(); throw error }
}

function checked(doc: Y.Doc) {
  let structures = 0
  const inspect = (parent: Y.XmlFragment | Y.XmlElement, depth = 0) => {
    if (depth > 40) throw new Error('markdown.too_deep')
    for (const child of parent.toArray()) {
      if (++structures > 50000) throw new Error('markdown.too_many_nodes')
      if (child instanceof Y.XmlElement) {
        const type = schema.nodes[child.nodeName]
        if (!type) throw new Error('markdown.unknown_node')
        const attrs = child.getAttributes()
        if (Object.keys(attrs).some((key) => !(key in (type.spec.attrs ?? {})))) throw new Error('markdown.unknown_attribute')
        if (child.nodeName === 'heading' && (!Number.isInteger(attrs.level) || Number(attrs.level) < 1 || Number(attrs.level) > 6))
          throw new Error('markdown.invalid_heading')
        inspect(child, depth + 1)
      } else if (child instanceof Y.XmlText) {
        for (const delta of child.toDelta()) {
          if (typeof delta.insert !== 'string') throw new Error('markdown.invalid_text')
          for (const key of Object.keys(delta.attributes ?? {})) if (!schema.marks[key]) throw new Error('markdown.unknown_mark')
        }
      } else throw new Error('markdown.unknown_node')
    }
  }
  inspect(doc.getXmlFragment(FRAGMENT))
  const root = yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment(FRAGMENT), schema)
  root.check()
  checkTables(root)
  const ids = new Set<string>(), blocks: ContentDocumentBlock[] = []
  let count = 0, mathCount = 0
  const mathIds = new Set<string>()
  root.descendants((node) => {
    if (++count > 50000) throw new Error('markdown.too_many_nodes')
    if (node.type.name === 'image') validateImage(node.attrs)
    if (node.type.name === 'taskItem' && typeof node.attrs.checked !== 'boolean') throw new Error('markdown.invalid_task')
    if (['inlineMath', 'blockMath'].includes(node.type.name)) {
      if (++mathCount > 200) throw new Error('markdown.too_many_formulas')
      const id: unknown = node.attrs.mathId
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/u.test(id) || mathIds.has(id)) throw new Error('markdown.invalid_math_id')
      mathIds.add(id); validateMath(node.attrs.latex, node.type.name === 'inlineMath')
    }
    for (const mark of node.marks) {
      if (mark.type.name === 'link' && (typeof mark.attrs.href !== 'string' || !safeLink(mark.attrs.href)))
        throw new Error('markdown.unsafe_link')
    }
    if (node.isTextblock || node.type.name === 'blockMath') {
      const id: unknown = node.attrs.blockId
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/u.test(id) || ids.has(id)) throw new Error('markdown.invalid_anchor')
      ids.add(id)
      blocks.push({ id, type: node.type.name, text: node.type.name === 'blockMath' ? node.attrs.latex :
        node.textBetween(0, node.content.size, '', (leaf) => leaf.type.name === 'inlineMath' ? `$${leaf.attrs.latex}$` : '') })
    }
  })
  const text = serializeMarkdown(markdown, root.toJSON())
  if (Buffer.byteLength(text, 'utf8') > 1024 * 1024) throw new Error('markdown.too_large')
  return { markdown: text, blocks }
}

function identify(node: JSONContent, anchors: Array<{ id: string; text: string }>, used: Set<string>, depth = 0): void {
  if (depth > 40) throw new Error('markdown.too_deep')
  if (node.type && ['paragraph', 'heading', 'codeBlock', 'blockMath'].includes(node.type)) {
    const text = node.type === 'blockMath' ? String(node.attrs?.latex ?? '') : (node.content ?? []).map((child) => child.type === 'inlineMath' ? `$${child.attrs?.latex}$` : child.text ?? '').join('')
    const old = anchors.find((anchor) => anchor.text === text && !used.has(anchor.id))
    const blockId = old?.id ?? globalThis.crypto.randomUUID()
    used.add(blockId)
    node.attrs = { ...node.attrs, blockId }
  }
  if (node.type === 'inlineMath' || node.type === 'blockMath') node.attrs = { ...node.attrs, mathId: globalThis.crypto.randomUUID() }
  for (const child of node.content ?? []) identify(child, anchors, used, depth + 1)
}

@Injectable()
@ContentEditorProvider(MODEL_KEY)
export class MarkdownDocumentModel implements ContentDocumentModel {
  readonly descriptor: TextContentEditorRegistration = {
    key: MODEL_KEY, kind: 'text-document', protocolVersion: 2, title: 'Markdown', formatId: 'markdown', mimeType: 'text/markdown',
    extension: 'md', schemaVersion: SCHEMA_VERSION, concurrency: 'crdt', engine: 'yjs',
    view: { providerKey: 'markdown.views', viewKey: 'markdown.editor', entry: 'markdown-editor' }
  }
  initialize(text: string, anchors: Array<{ id: string; text: string }> = []) {
    if (Buffer.byteLength(text, 'utf8') > 1024 * 1024) throw new Error('markdown.too_large')
    // Supplying explicit lexer options bypasses Marked's shared defaults/custom
    // tokenizers. walkTokens understands standard list/table children, but not
    // TaskList's custom child fields; scanning that tree silently misses images.
    const tokens = new markdown.instance.Lexer({ gfm: true, extensions: {
      renderers: {}, childTokens: {},
      block: [blockMathTokenizer], inline: [inlineMathTokenizer],
      startBlock: [(src) => src.indexOf('$$')], startInline: [(src) => src.indexOf('$')]
    } }).lex(text)
    markdown.instance.walkTokens(tokens, (token) => {
      if (token.type === 'html' || (token.type === 'image' && parseReference(token.href)?.kind !== 'image'))
        throw new BadRequestException({ code: 'markdown.unsupported_syntax', message: 'markdown.unsupported_syntax: HTML and external images are not editable. Use project image references. The original file is preserved.' })
    })
    const json = markdown.parse(text)
    if (!json.content?.length) json.content = [{ type: 'paragraph' }]
    identify(json, anchors, new Set())
    const doc = prosemirrorToYDoc(schema.nodeFromJSON(json), FRAGMENT)
    try { checked(doc); return encode(doc) } finally { doc.destroy() }
  }
  validate(stateBase64: string) { const doc = decode(stateBase64); try { checked(doc) } finally { doc.destroy() } }
  upgrade(stateBase64: string, fromSchemaVersion: number) {
    if (![1, 2, 3].includes(fromSchemaVersion)) throw new Error('markdown.unsupported_schema_upgrade')
    // v4 only adds nodes. Preserve every Yjs item/anchor; the platform fences old clients with a new epoch.
    this.validate(stateBase64)
    return stateBase64
  }
  read(stateBase64: string) { const doc = decode(stateBase64); try { return checked(doc) } finally { doc.destroy() } }
  patch(stateBase64: string, patch: { blockId: string; before: string; after: string }) {
    const doc = decode(stateBase64)
    try {
      const block = checked(doc).blocks.find((entry) => entry.id === patch.blockId)
      if (!block || block.text !== patch.before) throw new Error('markdown.selection_conflict')
      const vector = Y.encodeStateVector(doc)
      let target: Y.XmlElement | undefined
      const visit = (fragment: Y.XmlFragment | Y.XmlElement) => {
        for (const node of fragment.toArray()) if (node instanceof Y.XmlElement) {
          if (node.getAttribute('blockId') === patch.blockId) target = node
          visit(node)
        }
      }
      visit(doc.getXmlFragment(FRAGMENT))
      if (!target) throw new Error('markdown.anchor_missing')
      const element = target
      if (element.nodeName === 'blockMath') {
        validateMath(patch.after)
        element.setAttribute('latex', patch.after)
        checked(doc)
        return Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString('base64')
      }
      doc.transact(() => {
        const children = element.toArray()
        // Preserve marks and untouched characters. Complex inline structures need a model-specific proposal.
        if (children.some((child) => !(child instanceof Y.XmlText)) || children.length > 1)
          throw new Error('markdown.complex_selection')
        const text = children[0] instanceof Y.XmlText ? children[0] : new Y.XmlText()
        if (!children.length) element.insert(0, [text])
        let start = 0, end = 0
        while (start < patch.before.length && start < patch.after.length && patch.before[start] === patch.after[start]) start++
        while (end < patch.before.length - start && end < patch.after.length - start &&
          patch.before[patch.before.length - end - 1] === patch.after[patch.after.length - end - 1]) end++
        text.delete(start, patch.before.length - start - end)
        text.insert(start, patch.after.slice(start, patch.after.length - end))
      })
      checked(doc)
      return Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString('base64')
    } finally { doc.destroy() }
  }
}

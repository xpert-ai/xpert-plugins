import type { JSONContent } from '@tiptap/core'
import type { MarkdownManager } from '@tiptap/markdown'

/** Tiptap's text serializer escapes common Markdown delimiters but not Mathematics' `$`.
 * Protect only literal text nodes (never code, links or math attributes). A fresh sentinel avoids
 * altering user content and keeps this compatibility fix outside upstream private methods.
 */
export function serializeMarkdown(manager: MarkdownManager, document: JSONContent) {
  let sentinel: string
  const original = JSON.stringify(document)
  do { sentinel = `XPERTDOLLAR${crypto.randomUUID().replaceAll('-', '')}END` } while (original.includes(sentinel))
  const protect = (node: JSONContent, code = false): JSONContent => {
    const inCode = code || node.type === 'codeBlock' || !!node.marks?.some((mark) => mark.type === 'code')
    return { ...node, ...(node.text !== undefined ? { text: inCode ? node.text : node.text.replaceAll('$', sentinel) } : {}),
      ...(node.content ? { content: node.content.map((child) => protect(child, inCode)) } : {}) }
  }
  return manager.serialize(protect(document)).replaceAll(sentinel, '\\$')
}

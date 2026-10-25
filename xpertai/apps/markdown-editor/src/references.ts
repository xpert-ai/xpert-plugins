import { Node, mergeAttributes } from '@tiptap/core'
import type { ContentReferenceTarget } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

export const referenceTarget = z.object({ kind: z.enum(['image', 'file', 'page']), providerKey: z.string().regex(/^[a-z][a-z0-9.-]{0,79}$/u), resourceId: z.string().uuid() }).strict()
export const referenceEntry = referenceTarget.extend({ title: z.string(), path: z.string(), mimeType: z.string(), size: z.number().nullable() })
export const referencePage = z.object({ items: z.array(referenceEntry), nextCursor: z.string().uuid().nullable() })
/** Versioned identity, independent of deployment origin, file path, and access grants. */
export function referenceUri(target: ContentReferenceTarget): string {
  const checked = referenceTarget.parse({ kind: target.kind, providerKey: target.providerKey, resourceId: target.resourceId })
  return `xpert-resource://v1/${checked.kind}/${checked.providerKey}/${checked.resourceId}`
}
export function parseReference(value: unknown): ContentReferenceTarget | null {
  if (typeof value !== 'string') return null
  const match = /^xpert-resource:\/\/v1\/(image|file|page)\/([a-z][a-z0-9.-]{0,79})\/([a-fA-F0-9-]+)$/u.exec(value)
  if (!match) return null
  const result = referenceTarget.safeParse({ kind: match[1], providerKey: match[2], resourceId: match[3] })
  return result.success ? result.data : null
}
export const referenceFileKey = (documentId: string, uri: string) => `reference:${documentId}:${uri}`
export function parseReferenceFileKey(value: string) {
  const match = /^reference:([a-fA-F0-9-]{36}):(.*)$/u.exec(value)
  const target = match && parseReference(match[2])
  if (!match || !target) throw new Error('markdown.invalid_reference')
  return { resourceId: z.string().uuid().parse(match[1]), target }
}
export function validateImage(attrs: { src?: unknown; alt?: unknown; title?: unknown }) {
  if (parseReference(attrs.src)?.kind !== 'image' || typeof attrs.alt !== 'string' || attrs.alt.length > 1000 ||
    (attrs.title !== null && (typeof attrs.title !== 'string' || attrs.title.length > 1000))) throw new Error('markdown.invalid_image')
}
const escapeAlt = (text: string) => text.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]').replace(/[\r\n]/gu, ' ')
/** Only durable resource identities enter the Yjs schema. The browser node view resolves a
 * temporary preview separately; server rendering never emits an unauthenticated image URL.
 * Inline layout also preserves existing Markdown with text on either side of an image.
 */
export const ResourceImage = Node.create({
  name: 'image', inline: true, group: 'inline', atom: true, draggable: true,
  addAttributes() { return { src: { default: '' }, alt: { default: '' }, title: { default: null } } },
  parseHTML() { return [{ tag: 'span[data-resource-image]', getAttrs: (element) => {
    const src = element.getAttribute('data-resource-image')
    return parseReference(src)?.kind === 'image' ? { src, alt: element.getAttribute('data-alt') ?? '' } : false
  } }] },
  renderHTML({ node, HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-resource-image': node.attrs.src, 'data-alt': node.attrs.alt }), node.attrs.alt || '图片'] },
  markdownTokenName: 'image',
  parseMarkdown: (token) => ({ type: 'image', attrs: { src: token.href, alt: token.text ?? '', title: token.title ?? null } }),
  renderMarkdown: (node) => `![${escapeAlt(String(node.attrs?.alt ?? ''))}](${node.attrs?.src}${node.attrs?.title ? ` "${String(node.attrs.title).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replace(/[\r\n]/gu, ' ')}"` : ''})`
})

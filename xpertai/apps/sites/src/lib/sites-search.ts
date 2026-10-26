import { createHash } from 'node:crypto'
import { parse, type DefaultTreeAdapterMap } from 'parse5'
import type { ContentSearchProjection } from '@xpert-ai/contracts'
type Source = { files: Array<{ path: string; content: string; encoding: 'utf8' | 'base64'; sha256: string }> }
export function siteSourceRevision(source: Source) {
  return createHash('sha256').update(JSON.stringify(source.files.map(file => [file.path, file.sha256]).sort((a, b) => a[0].localeCompare(b[0])))).digest('hex')
}
/** Static text projection only: never run scripts, load linked resources or index hidden
 * form values. Dynamic content and external CSS visibility cannot be inferred here. */
export function siteSearchProjection(source: Source): ContentSearchProjection {
  const sections = source.files.filter(file => file.encoding === 'utf8' && /\.html?$/i.test(file.path)).map(file => {
    const fragments: string[] = []
    function walk(node: DefaultTreeAdapterMap['node']) {
      if ('tagName' in node && (['head', 'script', 'style', 'template', 'noscript', 'svg', 'input', 'textarea', 'select'].includes(node.tagName) ||
        node.attrs.some(attr => attr.name === 'hidden' || attr.name === 'aria-hidden' && attr.value === 'true' ||
          attr.name === 'style' && /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr.value)))) return
      if ('value' in node) fragments.push(node.value)
      if ('childNodes' in node) node.childNodes.forEach(walk)
    }
    walk(parse(file.content))
    return { anchor: { kind: 'page', id: file.path }, text: fragments.join(' ').replace(/\s+/g, ' ').trim().slice(0, 100000) }
  }).filter(section => section.text)
  return { revision: siteSourceRevision(source), sections }
}

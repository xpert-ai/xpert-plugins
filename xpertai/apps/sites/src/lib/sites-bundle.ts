import { posix } from 'node:path'
import { build, type Loader, type Plugin } from 'esbuild'
import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5'
import { BadRequestException } from '@nestjs/common'
import type { SitesSourceFile } from './types.js'

type Element = DefaultTreeAdapterMap['element']
type Node = DefaultTreeAdapterMap['node']
const mime: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json' }
const remote = (value: string) => /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)
const attr = (node: Element, name: string) => node.attrs.find(a => a.name === name)?.value
const set = (node: Element, name: string, value: string) => { const found = node.attrs.find(a => a.name === name); if (found) found.value = value; else node.attrs.push({ name, value }) }

/** Package already-built sandbox output. Never execute package scripts or source code in the API process. */
export async function buildPreviewHtml(files: SitesSourceFile[]) {
  const source = new Map(files.map(f => [f.path, f]))
  const index = source.get('index.html')
  if (!index || index.encoding === 'base64') throw new BadRequestException('A UTF-8 root index.html is required')
  const resolve = (value: string, from = 'index.html') => {
    if (remote(value)) throw new BadRequestException('External script imports are not supported in isolated Sites artifacts')
    const path = posix.normalize(value.startsWith('/') ? value.split(/[?#]/)[0].slice(1) : posix.join(posix.dirname(from), value.split(/[?#]/)[0]))
    if (path.startsWith('../') || !source.has(path)) throw new BadRequestException(`Missing Sites asset: ${path}`)
    return path
  }
  const bytes = (path: string) => { const f = source.get(path)!; return Buffer.from(f.content, f.encoding === 'base64' ? 'base64' : 'utf8') }
  const dataUrl = (value: string, from = 'index.html') => {
    if (remote(value)) {
      if (!value.startsWith('data:') && !value.startsWith('#')) throw new BadRequestException('Embed remote images/media before saving; isolated Sites cannot load network resources')
      return value
    }
    const path = resolve(value, from), type = mime[posix.extname(path)]
    if (!type) throw new BadRequestException(`Unsupported embedded asset: ${path}`)
    return `data:${type};base64,${bytes(path).toString('base64')}`
  }
  const plugin: Plugin = { name: 'sites-memory-files', setup(build) {
    build.onResolve({ filter: /.*/ }, args => ({ path: resolve(args.path, args.importer || 'index.html'), namespace: 'sites' }))
    build.onLoad({ filter: /.*/, namespace: 'sites' }, args => {
      const ext = posix.extname(args.path), loader: Loader = ext === '.css' ? 'css' : ext === '.json' ? 'json' : ['.js', '.mjs', '.cjs'].includes(ext) ? 'js' : 'dataurl'
      return { contents: bytes(args.path), loader }
    })
  } }
  async function bundle(path: string, type: 'css' | 'script', module = false) {
    try {
      const result = await build({ entryPoints: [path], bundle: true, write: false, plugins: [plugin], format: module ? 'esm' : 'iife', platform: 'browser', target: 'es2022', outdir: '/virtual', logLevel: 'silent', legalComments: 'none' })
      const extension = type === 'css' ? '.css' : '.js'
      const output = result.outputFiles?.find(f => f.path.endsWith(extension))
      if (!output) throw new Error('No output')
      return { code: output.text, css: type === 'script' ? result.outputFiles?.find(f => f.path.endsWith('.css'))?.text : undefined }
    } catch { throw new BadRequestException(`Unable to bundle ${path}. Save compiled static output with local imports and embedded assets.`) }
  }
  const document = parse(index.content)
  const nodes: Element[] = []
  function walk(node: Node) { if ('tagName' in node) nodes.push(node); if ('childNodes' in node) node.childNodes.forEach(walk) }
  walk(document)
  const head = nodes.find(n => n.tagName === 'head')!
  function style(css: string) {
    const child = parseFragment(`<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`).childNodes[0]
    child.parentNode = head; head.childNodes.push(child)
  }
  for (const node of nodes) {
    const src = attr(node, 'src'), href = attr(node, 'href')
    if (node.tagName === 'script' && src) {
      const path = resolve(src)
      // Classic scripts share the document's global environment with inline
      // handlers and later scripts. Bundling them in an IIFE also tree-shakes
      // declarations whose callers live in HTML or a different script.
      const result = attr(node, 'type') === 'module'
        ? await bundle(path, 'script', true)
        : { code: bytes(path).toString('utf8'), css: undefined }
      node.attrs = node.attrs.filter(a => !['src', 'integrity', 'crossorigin'].includes(a.name))
      node.childNodes = [{ nodeName: '#text', value: result.code.replace(/<\/script/gi, '<\\/script'), parentNode: node }]
      if (result.css) style(result.css)
    } else if (node.tagName === 'link' && attr(node, 'rel') === 'stylesheet' && href && !remote(href)) {
      const result = await bundle(resolve(href), 'css')
      // Replace in place: moving this sheet to the end changes the cascade.
      // Keep media/title and other presentation attributes on the same node.
      node.tagName = node.nodeName = 'style'
      node.attrs = node.attrs.filter(a => !['href', 'rel', 'integrity', 'crossorigin'].includes(a.name))
      node.childNodes = [{ nodeName: '#text', value: result.code.replace(/<\/style/gi, '<\\/style'), parentNode: node }]
    } else if (node.tagName === 'link' && ['modulepreload', 'preload'].includes(attr(node, 'rel') ?? '')) {
      // Assets have been bundled inline; retaining build preloads requests inaccessible paths.
      if (node.parentNode) node.parentNode.childNodes = node.parentNode.childNodes.filter(child => child !== node)
    } else if (['img', 'source', 'video', 'audio'].includes(node.tagName) && src) set(node, 'src', dataUrl(src))
    if (attr(node, 'poster')) set(node, 'poster', dataUrl(attr(node, 'poster')!))
    if (node.tagName === 'link' && attr(node, 'rel')?.includes('icon') && href) set(node, 'href', dataUrl(href))
    const srcset = attr(node, 'srcset')
    if (srcset && !srcset.startsWith('data:')) set(node, 'srcset', srcset.split(',').map(item => { const [url, ...descriptor] = item.trim().split(/\s+/); return [dataUrl(url), ...descriptor].join(' ') }).join(', '))
    if (node.tagName === 'style') for (const child of node.childNodes) {
      if ('value' in child) child.value = child.value.replace(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g, (_match, url: string) => 'url("' + dataUrl(url) + '")')
    }
    const inlineStyle = attr(node, 'style')
    if (inlineStyle) set(node, 'style', inlineStyle.replace(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g, (_match, url: string) => `url("${dataUrl(url)}")`))
  }
  const html = serialize(document)
  if (Buffer.byteLength(html) > 10 * 1024 * 1024) throw new BadRequestException('Bundled Sites artifact exceeds 10 MiB')
  return html
}

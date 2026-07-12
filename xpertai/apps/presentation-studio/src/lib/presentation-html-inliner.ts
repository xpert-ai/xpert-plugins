import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, relative, sep } from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain'
}

export async function inlinePresentationHtml(directory: string, maxBytes = Number.POSITIVE_INFINITY) {
  return inlineFiles(directory, maxBytes, new Map())
}

export async function inlinePresentationPreviewHtml(directory: string, maxBytes: number) {
  const files = await listFiles(directory)
  let retainedBytes = files.reduce((sum, file) => sum + file.size, 0)
  const placeholders = new Map<string, string>()
  const media = files
    .filter((file) => isUserMedia(file.relativePath))
    .sort((left, right) => right.size - left.size)
  for (const file of media) {
    if (retainedBytes <= maxBytes) break
    retainedBytes -= file.size
    placeholders.set(file.relativePath, previewPlaceholder(file.relativePath))
  }
  return inlineFiles(directory, maxBytes, placeholders)
}

async function inlineFiles(directory: string, maxBytes: number, placeholders: Map<string, string>) {
  const files = await listFiles(directory)
  const retainedBytes = files.reduce(
    (sum, file) => sum + (placeholders.has(file.relativePath) ? 0 : file.size),
    0,
  )
  if (retainedBytes > maxBytes) {
    throw new Error(`Presentation preview exceeds the configured ${maxBytes} byte limit.`)
  }
  const indexPath = join(directory, 'index.html')
  let html = await readFile(indexPath, 'utf8')
  const content = new Map<string, Buffer>()
  for (const file of files) {
    if (file.path !== indexPath && !placeholders.has(file.relativePath)) {
      content.set(file.relativePath, await readFile(file.path))
    }
  }

  const dataUrls = new Map<string, string>(placeholders)
  for (const [pathName, buffer] of content.entries()) {
    if (!isTextAsset(pathName)) dataUrls.set(pathName, toDataUrl(pathName, buffer))
  }
  for (const extension of ['.json', '.svg', '.css', '.js', '.mjs']) {
    for (const [pathName, buffer] of content.entries()) {
      if (extname(pathName).toLowerCase() !== extension) continue
      const rewritten = rewriteAssetReferences(buffer.toString('utf8'), dataUrls, pathName)
      dataUrls.set(pathName, toDataUrl(pathName, Buffer.from(rewritten)))
    }
  }

  html = inlineScriptAndStyles(html, content, dataUrls)
  html = rewriteAssetReferences(html, dataUrls)
  if (placeholders.size) html = injectPreviewWarning(html, placeholders.size)
  return html
}

function inlineScriptAndStyles(html: string, content: Map<string, Buffer>, dataUrls: Map<string, string>) {
  let result = html.replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi, (tag, before: string, src: string, after: string) => {
    const key = normalizeReference(src)
    const buffer = content.get(key)
    if (!buffer) return tag
    const rewritten = rewriteAssetReferences(buffer.toString('utf8'), dataUrls, key).replace(/<\/script/gi, '<\\/script')
    return `<script${before}${after}>${rewritten}</script>`
  })
  result = result.replace(/<link\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>/gi, (tag, before: string, href: string, after: string) => {
    const key = normalizeReference(href)
    if (!/stylesheet/i.test(`${before} ${after}`)) return tag
    const buffer = content.get(key)
    if (!buffer) return tag
    return `<style>${rewriteAssetReferences(buffer.toString('utf8'), dataUrls, key)}</style>`
  })
  return result
}

function rewriteAssetReferences(text: string, dataUrls: Map<string, string>, sourcePath?: string) {
  let result = text
  const entries = [...dataUrls.entries()].sort((left, right) => right[0].length - left[0].length)
  for (const [pathName, dataUrl] of entries) {
    const candidates = new Set([pathName, `./${pathName}`, `/${pathName}`])
    if (sourcePath) {
      const fromSource = relative(dirname(sourcePath), pathName).split(sep).join('/')
      candidates.add(fromSource)
      candidates.add(`./${fromSource}`)
    }
    for (const candidate of candidates) result = result.split(candidate).join(dataUrl)
  }
  return result
}

function toDataUrl(pathName: string, buffer: Buffer) {
  const mime = MIME_TYPES[extname(pathName).toLowerCase()] ?? 'application/octet-stream'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

function isTextAsset(pathName: string) {
  return ['.css', '.js', '.mjs', '.json', '.svg'].includes(extname(pathName).toLowerCase())
}

function isUserMedia(pathName: string) {
  return /^(?:assets|images)\/user-media\//.test(pathName)
}

function previewPlaceholder(pathName: string) {
  if (/\.(?:mp4|webm|mov)$/i.test(pathName)) return 'data:video/mp4;base64,'
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="100%" height="100%" fill="#111827"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#e5e7eb" font-family="sans-serif" font-size="36">Media omitted from preview</text></svg>'
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function injectPreviewWarning(html: string, count: number) {
  const warning = `<div role="status" style="position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 14px;border-radius:10px;background:#111827;color:#fff;font:13px/1.4 sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.28)">${count} media item${count === 1 ? '' : 's'} replaced in preview; exports use original media.</div>`
  return html.includes('</body>') ? html.replace('</body>', `${warning}</body>`) : `${html}${warning}`
}

function normalizeReference(value: string) {
  return decodeURIComponent(value.split(/[?#]/)[0]).replace(/^\.\//, '').replace(/^\//, '')
}

async function listFiles(directory: string) {
  const output: Array<{ path: string; relativePath: string; size: number }> = []
  async function visit(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) {
        const info = await stat(path)
        output.push({ path, relativePath: relative(directory, path).split(sep).join('/'), size: info.size })
      }
    }
  }
  await visit(directory)
  return output
}

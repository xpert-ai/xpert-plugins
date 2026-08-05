import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'
import type { DrawioDrawingVersion } from './entities/index.js'

export const DRAWIO_ARTIFACT_VIEWER_VERSION = 2
export const DRAWIO_ARTIFACT_MAX_SOURCE_BYTES = 10 * 1024 * 1024
export const DRAWIO_ARTIFACT_MAX_HTML_BYTES = 50 * 1024 * 1024
const DRAWIO_ARTIFACT_MAX_EXPANDED_XML_BYTES = 20 * 1024 * 1024

const moduleDir = dirname(fileURLToPath(import.meta.url))
const viewerAssetDir = join(moduleDir, 'artifact-viewer')

type ViewerAssets = { javascript: string; stencils: Record<string, string> }

@Injectable()
export class DrawioArtifactViewerService {
  private javascriptPromise?: Promise<string>

  async render(input: { title: string; description?: string | null; version: DrawioDrawingVersion }) {
    const sourceSize = Buffer.byteLength(
      JSON.stringify({
        xml: input.version.xml,
        mermaidSource: input.version.mermaidSource,
        previewSvg: input.version.previewSvg,
        previewPng: input.version.previewPng
      }),
      'utf8'
    )
    if (sourceSize > DRAWIO_ARTIFACT_MAX_SOURCE_BYTES) {
      throw new BadRequestException('Published draw.io source exceeds the 10 MiB limit.')
    }
    const xml = input.version.xml?.trim() || null
    const previewSvg = !xml && input.version.previewSvg ? validatePublishedSvg(input.version.previewSvg) : null
    const previewPng = !xml ? normalizePngDataUri(input.version.previewPng) : null
    const assets = xml ? await this.loadAssets(xml) : null
    const html = renderViewerHtml({
      title: normalizeText(input.title, 'Untitled draw.io diagram'),
      description: normalizeOptionalText(input.description),
      versionNumber: input.version.versionNumber,
      previewSvg,
      previewPng,
      xml,
      mermaidSource: input.version.mermaidSource ?? null,
      assets
    })
    const buffer = Buffer.from(html, 'utf8')
    if (buffer.byteLength > DRAWIO_ARTIFACT_MAX_HTML_BYTES) {
      throw new BadRequestException('Published draw.io HTML exceeds the 50 MiB limit.')
    }
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    return {
      buffer,
      checksum: sha256,
      sha256,
      size: buffer.byteLength,
      mimeType: 'text/html' as const,
      viewerVersion: DRAWIO_ARTIFACT_VIEWER_VERSION,
      sourceType: xml ? 'xml' : previewSvg ? 'svg' : previewPng ? 'png' : 'mermaid'
    }
  }

  private async loadAssets(xml: string): Promise<ViewerAssets> {
    this.javascriptPromise ??= readFile(join(viewerAssetDir, 'viewer-static.min.js'), 'utf8')
    const stencilNames = findReferencedStencilNames(xml)
    const stencilEntries = await Promise.all(
      stencilNames.map(async (name) => {
        try {
          return [name, await readFile(join(viewerAssetDir, 'stencils', `${name}.xml`), 'utf8')] as const
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
          throw error
        }
      })
    )
    return {
      javascript: await this.javascriptPromise,
      stencils: Object.fromEntries(stencilEntries.filter((entry): entry is readonly [string, string] => entry !== null))
    }
  }
}

export function validatePublishedSvg(svg: string) {
  const forbidden = [
    /<\s*script\b/i,
    /<\s*foreignObject\b/i,
    /<\s*(?:iframe|object|embed)\b/i,
    /\son[a-z]+\s*=/i,
    /javascript\s*:/i,
    /@import\b/i
  ]
  const referencesAreSafe = Array.from(svg.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)).every(
    (match) =>
      (match[1]?.trim() ?? '').startsWith('#') || /^data:image\/(?:gif|jpe?g|png|webp);base64,/i.test(match[1] ?? '')
  )
  const cssUrlsAreSafe = Array.from(svg.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi)).every(
    (match) =>
      (match[1]?.trim() ?? '').startsWith('#') || /^data:image\/(?:gif|jpe?g|png|webp);base64,/i.test(match[1] ?? '')
  )
  if (
    !/^\s*<svg\b/i.test(svg) ||
    !/<\/svg>\s*$/i.test(svg) ||
    forbidden.some((pattern) => pattern.test(svg)) ||
    !referencesAreSafe ||
    !cssUrlsAreSafe
  ) {
    throw new BadRequestException('draw.io preview contains unsafe SVG content or an external resource.')
  }
  return svg
}

function renderViewerHtml(input: {
  title: string
  description?: string
  versionNumber: number
  previewSvg: string | null
  previewPng: string | null
  xml: string | null
  mermaidSource: string | null
  assets: ViewerAssets | null
}) {
  const preview = input.xml
    ? `<div class="mxgraph" role="img" aria-label="${escapeHtml(input.title)}" data-mxgraph="${escapeHtml(
        JSON.stringify({
          highlight: '#0000ff',
          nav: true,
          resize: true,
          toolbar: 'zoom layers tags lightbox',
          xml: input.xml
        })
      )}"></div>`
    : input.previewSvg
    ? `<div class="static-preview">${input.previewSvg}</div>`
    : input.previewPng
    ? `<div class="static-preview"><img src="${escapeHtml(input.previewPng)}" alt="${escapeHtml(input.title)}"></div>`
    : `<pre class="source">${escapeHtml(input.mermaidSource ?? 'No previewable diagram content is available.')}</pre>`
  const script = input.xml && input.assets
    ? `<script>window.STENCIL_PATH='stencils';window.onDrawioViewerLoad=function(){var sets=${serializeForScript(
        Object.fromEntries(Object.entries(input.assets.stencils).map(([name, xml]) => [`stencils/${name}.xml`, xml]))
      )};mxStencilRegistry.loadStencil=function(url,callback){var key=Object.keys(sets).find(function(candidate){return String(url).endsWith(candidate)}),doc=key?mxUtils.parseXml(sets[key]):null;if(callback){callback(doc);return}return doc};GraphViewer.processElements()};</script><script>${escapeInlineScript(
        input.assets.javascript
      )}</script>`
    : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(
    input.title
  )}</title><style>${VIEWER_CSS}</style></head><body><header><div><span>DRAW.IO · VERSION ${
    input.versionNumber
  }</span><h1>${escapeHtml(input.title)}</h1>${
    input.description ? `<p>${escapeHtml(input.description)}</p>` : ''
  }</div><span class="readonly">Read only</span></header><main>${preview}</main><footer>Read-only diagram published from XpertAI</footer>${script}</body></html>`
}

const VIEWER_CSS = `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#182230;background:#f7f8fb}*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:flex;flex-direction:column}header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 24px;background:#fff;border-bottom:1px solid #e4e7ec}header span{font-size:11px;font-weight:700;letter-spacing:.13em;color:#f59e0b}header .readonly{flex:none;padding:6px 10px;border:1px solid #d0d5dd;border-radius:999px;color:#667085;letter-spacing:0;text-transform:uppercase}h1{margin:5px 0 0;font-size:20px;letter-spacing:-.02em}header p{margin:5px 0 0;color:#667085;font-size:13px}main{position:relative;display:grid;place-items:center;min-height:0;flex:1;padding:24px;overflow:auto;background:#f7f8fb}.mxgraph{position:relative;max-width:100%;border:1px solid transparent;background:#fff;box-shadow:0 18px 50px #1018281f}.static-preview{max-width:100%;max-height:100%;padding:18px;background:#fff;box-shadow:0 18px 50px #1018281f}.static-preview svg,.static-preview img{display:block;max-width:min(100%,1200px);max-height:calc(100vh - 190px)}.source{max-width:900px;max-height:100%;overflow:auto;margin:0;padding:28px;border:1px solid #d0d5dd;border-radius:12px;background:#fff;white-space:pre-wrap}footer{padding:10px;text-align:center;background:#fff;color:#98a2b3;font-size:11px;border-top:1px solid #e4e7ec}@media(max-width:640px){header{padding:14px 16px}header p{display:none}main{padding:10px}}`

function normalizePngDataUri(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return /^data:image\/png;base64,[a-z0-9+/=\s]+$/i.test(normalized) ? normalized : null
}

export function findReferencedStencilNames(xml: string) {
  const names = new Set<string>()
  for (const source of expandDrawioXmlForStencilScan(xml)) {
    for (const match of source.matchAll(/=mxgraph\.([a-z0-9_-]+(?:\.[a-z0-9_-]+)+)(?:;|&quot;|["'])/gi)) {
      const parts = match[1]?.split('.') ?? []
      if (parts.length < 2) continue
      const name = parts.slice(0, -1).join('/').replaceAll('_-_', '_')
      if (/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i.test(name)) names.add(name)
    }
  }
  return [...names].sort()
}

function expandDrawioXmlForStencilScan(xml: string) {
  const sources = [xml]
  for (const match of xml.matchAll(/<diagram\b[^>]*>([\s\S]*?)<\/diagram>/gi)) {
    const content = decodeXmlText(match[1]?.trim() ?? '')
    if (!content || content.startsWith('<')) {
      if (content) sources.push(content)
      continue
    }
    try {
      const encoded = inflateRawSync(Buffer.from(content, 'base64'), {
        maxOutputLength: DRAWIO_ARTIFACT_MAX_EXPANDED_XML_BYTES
      }).toString('utf8')
      const expanded = decodeURIComponent(encoded)
      if (Buffer.byteLength(expanded, 'utf8') > DRAWIO_ARTIFACT_MAX_EXPANDED_XML_BYTES) {
        throw new Error('expanded XML exceeds the scan limit')
      }
      sources.push(expanded)
    } catch {
      throw new BadRequestException('Published draw.io XML contains an invalid or oversized compressed diagram page.')
    }
  }
  return sources
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function serializeForScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

function escapeInlineScript(value: string) {
  return value.replace(/<\/script/gi, '<\\/script')
}

function normalizeText(value: string | null | undefined, fallback: string) {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return normalized?.slice(0, 500) || fallback
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return normalized ? normalized.slice(0, 2_000) : undefined
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character)
  )
}

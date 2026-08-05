import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const mammoth = require('mammoth') as typeof import('mammoth')

export const DOCX_EDITOR_ARTIFACT_VIEWER_VERSION = 2
export const DOCX_EDITOR_ARTIFACT_MAX_HTML_BYTES = 8 * 1024 * 1024

export type DocxEditorArtifactViewerRenderInput = {
  title: string
  description?: string | null
  versionNumber: number
  docxBuffer: Buffer
}

export type DocxEditorArtifactViewerRenderResult = {
  buffer: Buffer
  checksum: string
  sha256: string
  size: number
  mimeType: 'text/html'
  viewerVersion: number
  paragraphCount: number
}

@Injectable()
export class DocxEditorArtifactViewerService {
  async render(input: DocxEditorArtifactViewerRenderInput): Promise<DocxEditorArtifactViewerRenderResult> {
    let converted: Awaited<ReturnType<typeof mammoth.convertToHtml>>
    try {
      converted = await mammoth.convertToHtml(
        { buffer: input.docxBuffer },
        {
          convertImage: mammoth.images.dataUri,
          externalFileAccess: false,
          ignoreEmptyParagraphs: false,
          includeEmbeddedStyleMap: false,
          includeDefaultStyleMap: true,
          styleMap: [
            "p.Title => h1.document-title:fresh",
            "p[style-name='Title'] => h1.document-title:fresh",
            "p.Subtitle => p.document-subtitle:fresh",
            "p[style-name='Subtitle'] => p.document-subtitle:fresh"
          ]
        }
      )
    } catch (error) {
      throw new BadRequestException(
        `DOCX could not be converted to a public viewer: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    const contentHtml = sanitizeGeneratedLinks(converted.value).trim()
    const html = renderViewerHtml({
      title: normalizeText(input.title, 'Untitled DOCX document'),
      description: normalizeOptionalText(input.description),
      versionNumber: normalizeVersionNumber(input.versionNumber),
      contentHtml
    })
    const buffer = Buffer.from(html, 'utf8')
    if (buffer.byteLength > DOCX_EDITOR_ARTIFACT_MAX_HTML_BYTES) {
      throw new BadRequestException('Published DOCX HTML exceeds the 8 MiB limit.')
    }
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    return {
      buffer,
      checksum: sha256,
      sha256,
      size: buffer.byteLength,
      mimeType: 'text/html',
      viewerVersion: DOCX_EDITOR_ARTIFACT_VIEWER_VERSION,
      paragraphCount: countReadableBlocks(contentHtml)
    }
  }
}

export function renderViewerHtml(input: {
  title: string
  description?: string
  versionNumber: number
  contentHtml: string
}) {
  const content = input.contentHtml || '<p class="empty">This document does not contain readable content.</p>'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(input.title)}</title><style>${VIEWER_CSS}</style></head>
<body><header><div><span class="eyebrow">DOCX · VERSION ${input.versionNumber}</span><h1>${escapeHtml(
    input.title
  )}</h1>${input.description ? `<p class="description">${escapeHtml(input.description)}</p>` : ''}</div></header>
<main><article class="docx-content">${content}</article></main><footer>Read-only document published from XpertAI</footer></body></html>`
}

const VIEWER_CSS = `
:root{color-scheme:light;font-family:Inter,"PingFang SC","Microsoft YaHei",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#eef2f7;color:#172033}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0,#fff 0,#eef2f7 54%,#e7edf5 100%)}header{max-width:960px;margin:0 auto;padding:48px 28px 22px}.eyebrow{display:block;color:#2563eb;font-size:12px;font-weight:700;letter-spacing:.14em}header h1{margin:10px 0 0;font-size:clamp(30px,5vw,46px);line-height:1.16;letter-spacing:-.025em}.description{max-width:720px;margin:14px 0 0;color:#667085;font-size:15px;line-height:1.7}main{padding:0 20px 60px}.docx-content{max-width:900px;min-height:70vh;margin:0 auto;padding:68px clamp(30px,7vw,84px);border:1px solid #dce3ec;border-radius:6px;background:#fff;box-shadow:0 28px 70px #29446c1a;font-family:Georgia,"Songti SC",SimSun,"Times New Roman",serif;font-size:16px;line-height:1.75;overflow-wrap:anywhere}.docx-content h1,.docx-content h2,.docx-content h3,.docx-content h4,.docx-content h5,.docx-content h6{font-family:Inter,"PingFang SC","Microsoft YaHei",ui-sans-serif,system-ui,sans-serif;color:#101828;line-height:1.3;break-after:avoid-page}.docx-content h1{margin:0 0 .8em;font-size:2em}.docx-content h2{margin:1.6em 0 .7em;font-size:1.65em}.docx-content h3{margin:1.45em 0 .65em;font-size:1.38em}.docx-content h4{margin:1.35em 0 .6em;font-size:1.18em}.docx-content h5,.docx-content h6{margin:1.25em 0 .55em;font-size:1em}.docx-content .document-title{margin-bottom:.35em;text-align:center;font-size:2.25em}.docx-content .document-subtitle{margin:-.2em 0 2em;text-align:center;color:#667085;font-size:1.1em}.docx-content p{margin:0 0 1em;white-space:pre-wrap}.docx-content ul,.docx-content ol{margin:.6em 0 1.2em;padding-left:2em}.docx-content li{margin:.25em 0}.docx-content li>p{margin:.2em 0}.docx-content table{width:100%;margin:1.35em 0;border-collapse:collapse;table-layout:auto;font-family:Inter,"PingFang SC","Microsoft YaHei",ui-sans-serif,system-ui,sans-serif;font-size:.92em;line-height:1.55}.docx-content th,.docx-content td{min-width:3em;padding:.65em .75em;border:1px solid #98a2b3;text-align:left;vertical-align:top}.docx-content th{background:#f2f4f7;font-weight:700}.docx-content td>p,.docx-content th>p{margin:0 0 .45em}.docx-content td>p:last-child,.docx-content th>p:last-child{margin-bottom:0}.docx-content img{display:block;max-width:100%;height:auto;margin:1.25em auto}.docx-content a{color:#175cd3;text-decoration:underline;text-underline-offset:2px}.docx-content blockquote{margin:1.25em 0;padding:.2em 0 .2em 1.2em;border-left:4px solid #d0d5dd;color:#475467}.docx-content pre{max-width:100%;overflow:auto;padding:1em;border-radius:6px;background:#f2f4f7;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;line-height:1.6;white-space:pre-wrap}.docx-content sup,.docx-content sub{font-size:.75em}.docx-content hr{margin:2em 0;border:0;border-top:1px solid #d0d5dd}.empty{color:#98a2b3;font-family:inherit;font-style:italic}footer{padding:0 20px 28px;text-align:center;color:#98a2b3;font-size:12px}@media(max-width:640px){header{padding:32px 20px 18px}main{padding:0 8px 36px}.docx-content{padding:38px 22px;border-radius:4px;font-size:15px;overflow-x:auto}.docx-content table{min-width:520px;font-size:13px}}@media print{body{background:#fff}header,footer{display:none}main{padding:0}.docx-content{max-width:none;min-height:0;padding:0;border:0;box-shadow:none}}`

export function sanitizeGeneratedLinks(html: string) {
  return html.replace(/(<a\b[^>]*\bhref=")([^"]*)(")/gi, (match, prefix: string, href: string, suffix: string) =>
    isSafeHref(href) ? match : `${prefix}#${suffix}`
  )
}

function isSafeHref(value: string) {
  const normalized = decodeHtmlAttribute(value)
    .replace(/[\u0000-\u0020\u007f]+/g, '')
    .toLowerCase()
  return normalized.startsWith('#') || /^(https?:|mailto:|tel:)/.test(normalized)
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);?/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);?/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&colon;/gi, ':')
}

function countReadableBlocks(html: string) {
  return html.match(/<(?:p|h[1-6]|li)\b/gi)?.length ?? 0
}

function normalizeVersionNumber(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
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

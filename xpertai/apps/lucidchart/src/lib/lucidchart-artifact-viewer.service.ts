import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { LucidchartDocumentVersion } from './entities/index.js'
import {
  createLucidchartPreview,
  renderLucidchartPreviewSvg,
  type LucidchartPreviewModel
} from './lucidchart-preview.js'

export const LUCIDCHART_ARTIFACT_VIEWER_VERSION = 1
export const LUCIDCHART_ARTIFACT_MAX_SOURCE_BYTES = 10 * 1024 * 1024

@Injectable()
export class LucidchartArtifactViewerService {
  render(input: { title: string; description?: string | null; version: LucidchartDocumentVersion }) {
    const serialized = JSON.stringify(input.version.standardImport ?? {})
    if (Buffer.byteLength(serialized, 'utf8') > LUCIDCHART_ARTIFACT_MAX_SOURCE_BYTES) {
      throw new BadRequestException('Published Lucidchart source exceeds the 10 MiB limit.')
    }
    const preview = createLucidchartPreview(input.version.standardImport ?? {})
    const html = renderViewerHtml({
      title: normalizeText(input.title, 'Untitled Lucidchart document'),
      description: normalizeOptionalText(input.description),
      versionNumber: input.version.versionNumber,
      preview,
      previewUrl: normalizeHttpsUrl(input.version.previewUrl),
      lucidDocumentUrl: normalizeHttpsUrl(input.version.lucidDocumentUrl),
      mermaidSource: input.version.mermaidSource ?? null,
      standardImport: input.version.standardImport ?? null
    })
    const buffer = Buffer.from(html, 'utf8')
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    return {
      buffer,
      checksum: sha256,
      sha256,
      size: buffer.byteLength,
      mimeType: 'text/html' as const,
      viewerVersion: LUCIDCHART_ARTIFACT_VIEWER_VERSION,
      shapeCount: preview?.shapeCount ?? 0
    }
  }
}

function renderViewerHtml(input: {
  title: string
  description?: string
  versionNumber: number
  preview: LucidchartPreviewModel | null
  previewUrl: string | null
  lucidDocumentUrl: string | null
  mermaidSource: string | null
  standardImport: Record<string, unknown> | null
}) {
  const content = input.preview
    ? renderPreviewPages(input.preview)
    : input.previewUrl
    ? `<img class="image-preview" src="${escapeHtml(input.previewUrl)}" alt="${escapeHtml(input.title)}">`
    : `<section class="source"><h2>${
        input.mermaidSource ? 'Mermaid draft' : 'Standard Import draft'
      }</h2><pre>${escapeHtml(
        input.mermaidSource ?? JSON.stringify(input.standardImport ?? {}, null, 2)
      )}</pre></section>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(
    input.title
  )}</title><style>${VIEWER_CSS}</style></head><body><header><div><span>LUCIDCHART · VERSION ${
    input.versionNumber
  }</span><h1>${escapeHtml(input.title)}</h1>${
    input.description ? `<p>${escapeHtml(input.description)}</p>` : ''
  }</div>${
    input.lucidDocumentUrl
      ? `<a href="${escapeHtml(input.lucidDocumentUrl)}" target="_blank" rel="noopener noreferrer">Open in Lucid ↗</a>`
      : ''
  }</header><main>${content}</main><footer>Read-only document published from XpertAI</footer></body></html>`
}

function renderPreviewPages(model: LucidchartPreviewModel) {
  if (model.pages.length === 1) {
    const page = model.pages[0]
    return `<section class="preview-surface" style="--page-background:${escapeHtml(page.backgroundColor)}">${renderLucidchartPreviewSvg(
      page,
      { className: 'diagram', markerPrefix: 'public-page-1' }
    )}</section>`
  }
  const radioInputs = model.pages
    .map(
      (_, index) =>
        `<input class="page-radio" type="radio" name="page" id="page-${index + 1}"${index === 0 ? ' checked' : ''}>`
    )
    .join('')
  const pageTabs = model.pages
    .map((page, index) => `<label class="page-tab page-tab-${index + 1}" for="page-${index + 1}">${escapeHtml(page.title)}</label>`)
    .join('')
  const pages = model.pages
    .map(
      (page, index) =>
        `<section class="preview-surface page-panel page-panel-${index + 1}" style="--page-background:${escapeHtml(
          page.backgroundColor
        )}">${renderLucidchartPreviewSvg(page, { className: 'diagram', markerPrefix: `public-page-${index + 1}` })}</section>`
    )
    .join('')
  const pageRules = model.pages
    .map(
      (_, index) =>
        `#page-${index + 1}:checked~.page-tabs .page-tab-${index + 1}{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}#page-${index + 1}:checked~.page-panel-${index + 1}{display:grid}`
    )
    .join('')
  return `<div class="page-viewer"><style>${pageRules}</style>${radioInputs}<nav class="page-tabs" aria-label="Diagram pages">${pageTabs}</nav>${pages}</div>`
}

const VIEWER_CSS = `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#182230;background:#f6f8fc}*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:flex;flex-direction:column}header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 24px;background:#fff;border-bottom:1px solid #e4e7ec}header span{font-size:11px;font-weight:700;letter-spacing:.13em;color:#2563eb}h1{margin:5px 0 0;font-size:20px;letter-spacing:-.02em}header p{margin:5px 0 0;color:#667085;font-size:13px}header a{flex:0 0 auto;border-radius:9px;background:#2563eb;padding:9px 14px;color:#fff;text-decoration:none;font-size:13px}main{display:grid;place-items:stretch;min-height:0;flex:1;padding:32px;overflow:auto;background:radial-gradient(circle at 50% 30%,#fff,#edf2fb)}.preview-surface{display:grid;place-items:center;width:100%;height:100%;min-height:280px;overflow:auto;background:linear-gradient(#d0d5dd5c 1px,transparent 1px),linear-gradient(90deg,#d0d5dd5c 1px,transparent 1px),var(--page-background,#fff);background-size:24px 24px}.diagram{display:block;width:100%;min-width:680px;height:100%;min-height:260px}.lw-preview-shape{filter:drop-shadow(0 5px 14px #1018281a)}.lw-preview-label{font-family:Inter,system-ui,sans-serif;font-weight:600;pointer-events:none}.lw-preview-line-label{fill:#667085;font:600 11px Inter,system-ui,sans-serif;paint-order:stroke;stroke:var(--page-background,#fff);stroke-width:4px;stroke-linejoin:round;pointer-events:none}.image-preview{display:block;max-width:min(1200px,100%);max-height:calc(100vh - 190px);margin:auto;background:#fff;box-shadow:0 20px 55px #1018281f}.page-viewer{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0;height:100%}.page-tabs{display:flex;gap:6px;padding:0 0 12px;overflow:auto}.page-radio{position:absolute;inline-size:1px;block-size:1px;opacity:0}.page-tab{padding:7px 12px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:#667085;font-size:12px;font-weight:600;cursor:pointer}.page-radio:focus-visible~.page-tabs .page-tab{outline:2px solid #60a5fa;outline-offset:2px}.page-panel{display:none;min-height:0}.source{width:min(900px,100%);max-height:100%;margin:auto;padding:28px;border:1px solid #d0d5dd;border-radius:12px;background:#fff;overflow:auto}.source h2{margin:0 0 16px;font-size:16px}.source pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.6}footer{padding:10px;text-align:center;background:#fff;color:#98a2b3;font-size:11px;border-top:1px solid #e4e7ec}@media(max-width:640px){header{padding:14px 16px}header p{display:none}main{padding:14px}.diagram{min-width:520px}}`

function normalizeHttpsUrl(value: string | null | undefined) {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
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

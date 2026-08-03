import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { createReviewerBridge, DocxReviewer } from '@eigenpal/docx-editor-agents/server'

export const DOCX_EDITOR_ARTIFACT_VIEWER_VERSION = 1
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
    const reviewer = await DocxReviewer.fromBuffer(toArrayBuffer(input.docxBuffer), 'Xpert DOCX Viewer')
    const bridge = createReviewerBridge(reviewer)
    const paragraphs = bridge
      .getContentAsText({ includeTrackedChanges: false, includeCommentAnchors: false })
      .split('\n')
      .map(stripParagraphId)
      .map((value) => value.trim())
      .filter(Boolean)
    const html = renderViewerHtml({
      title: normalizeText(input.title, 'Untitled DOCX document'),
      description: normalizeOptionalText(input.description),
      versionNumber: normalizeVersionNumber(input.versionNumber),
      paragraphs
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
      paragraphCount: paragraphs.length
    }
  }
}

function renderViewerHtml(input: { title: string; description?: string; versionNumber: number; paragraphs: string[] }) {
  const content = input.paragraphs.length
    ? input.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')
    : '<p class="empty">This document does not contain readable paragraph text.</p>'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(input.title)}</title><style>${VIEWER_CSS}</style></head>
<body><header><div><span class="eyebrow">DOCX · VERSION ${input.versionNumber}</span><h1>${escapeHtml(
    input.title
  )}</h1>${input.description ? `<p class="description">${escapeHtml(input.description)}</p>` : ''}</div></header>
<main><article>${content}</article></main><footer>Read-only document published from XpertAI</footer></body></html>`
}

const VIEWER_CSS = `
:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#eef2f7;color:#172033}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0,#fff 0,#eef2f7 54%,#e7edf5 100%)}header{max-width:900px;margin:0 auto;padding:56px 28px 24px}.eyebrow{display:block;color:#2563eb;font-size:12px;font-weight:700;letter-spacing:.14em}h1{margin:10px 0 0;font-size:clamp(30px,5vw,48px);line-height:1.12;letter-spacing:-.035em}.description{max-width:680px;margin:14px 0 0;color:#667085;font-size:15px;line-height:1.7}main{padding:0 20px 60px}article{max-width:820px;min-height:70vh;margin:0 auto;padding:72px clamp(28px,7vw,86px);border:1px solid #dce3ec;border-radius:6px;background:#fff;box-shadow:0 28px 70px #29446c1a}article p{margin:0 0 1em;font-family:Georgia,"Times New Roman",serif;font-size:17px;line-height:1.82;white-space:pre-wrap;overflow-wrap:anywhere}article p:last-child{margin-bottom:0}.empty{color:#98a2b3;font-family:inherit;font-style:italic}footer{padding:0 20px 28px;text-align:center;color:#98a2b3;font-size:12px}@media(max-width:640px){header{padding:34px 20px 18px}main{padding:0 10px 36px}article{padding:42px 24px;border-radius:4px}article p{font-size:16px}}`

function stripParagraphId(value: string) {
  return value.replace(/^\[[^\]]+\]\s?/, '')
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

function toArrayBuffer(buffer: Buffer) {
  const copy = new Uint8Array(buffer.byteLength)
  copy.set(buffer)
  return copy.buffer
}

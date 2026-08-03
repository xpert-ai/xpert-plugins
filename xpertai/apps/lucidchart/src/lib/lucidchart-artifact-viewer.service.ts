import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { LucidchartDocumentVersion } from './entities/index.js'

export const LUCIDCHART_ARTIFACT_VIEWER_VERSION = 1
export const LUCIDCHART_ARTIFACT_MAX_SOURCE_BYTES = 10 * 1024 * 1024

type PreviewShape = {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  shape: 'rect' | 'ellipse'
  fill: string
  stroke: string
}
type PreviewLine = { x1: number; y1: number; x2: number; y2: number; text?: string }

@Injectable()
export class LucidchartArtifactViewerService {
  render(input: { title: string; description?: string | null; version: LucidchartDocumentVersion }) {
    const serialized = JSON.stringify(input.version.standardImport ?? {})
    if (Buffer.byteLength(serialized, 'utf8') > LUCIDCHART_ARTIFACT_MAX_SOURCE_BYTES) {
      throw new BadRequestException('Published Lucidchart source exceeds the 10 MiB limit.')
    }
    const preview = createStandardImportPreview(input.version.standardImport ?? {})
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
      shapeCount: preview?.shapes.length ?? 0
    }
  }
}

function renderViewerHtml(input: {
  title: string
  description?: string
  versionNumber: number
  preview: { shapes: PreviewShape[]; lines: PreviewLine[]; viewBox: string } | null
  previewUrl: string | null
  lucidDocumentUrl: string | null
  mermaidSource: string | null
  standardImport: Record<string, unknown> | null
}) {
  const content = input.preview
    ? renderSvg(input.preview)
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

function renderSvg(model: { shapes: PreviewShape[]; lines: PreviewLine[]; viewBox: string }) {
  const lines = model.lines
    .map(
      (line) =>
        `<g><line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" marker-end="url(#arrow)"/>${
          line.text
            ? `<text x="${(line.x1 + line.x2) / 2}" y="${(line.y1 + line.y2) / 2 - 8}">${escapeHtml(line.text)}</text>`
            : ''
        }</g>`
    )
    .join('')
  const shapes = model.shapes
    .map(
      (shape) =>
        `<g>${
          shape.shape === 'ellipse'
            ? `<ellipse cx="${shape.x + shape.width / 2}" cy="${shape.y + shape.height / 2}" rx="${
                shape.width / 2
              }" ry="${shape.height / 2}" fill="${shape.fill}" stroke="${shape.stroke}"/>`
            : `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="10" fill="${shape.fill}" stroke="${shape.stroke}"/>`
        }<text x="${shape.x + shape.width / 2}" y="${
          shape.y + shape.height / 2
        }" dominant-baseline="middle" text-anchor="middle">${escapeHtml(shape.text.slice(0, 80))}</text></g>`
    )
    .join('')
  return `<svg class="diagram" viewBox="${model.viewBox}" role="img" aria-label="Lucidchart Standard Import preview"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#667085"/></marker></defs>${lines}${shapes}</svg>`
}

function createStandardImportPreview(source: Record<string, unknown>) {
  const rawShapes: Record<string, unknown>[] = []
  const rawLines: Record<string, unknown>[] = []
  collectPreviewItems(source, rawShapes, rawLines, 0, new Set())
  const shapes = rawShapes.map(normalizePreviewShape).filter((value): value is PreviewShape => Boolean(value))
  const shapeMap = new Map(shapes.map((shape) => [shape.id, shape]))
  const lines = rawLines
    .map((line) => normalizePreviewLine(line, shapeMap))
    .filter((value): value is PreviewLine => Boolean(value))
  if (!shapes.length && !lines.length) return null
  const xs = shapes
    .flatMap((shape) => [shape.x, shape.x + shape.width])
    .concat(lines.flatMap((line) => [line.x1, line.x2]))
  const ys = shapes
    .flatMap((shape) => [shape.y, shape.y + shape.height])
    .concat(lines.flatMap((line) => [line.y1, line.y2]))
  const minX = Math.min(...xs) - 40,
    minY = Math.min(...ys) - 40,
    maxX = Math.max(...xs) + 40,
    maxY = Math.max(...ys) + 40
  return { shapes, lines, viewBox: `${minX} ${minY} ${Math.max(320, maxX - minX)} ${Math.max(220, maxY - minY)}` }
}

function collectPreviewItems(
  value: unknown,
  shapes: Record<string, unknown>[],
  lines: Record<string, unknown>[],
  depth: number,
  seen: Set<object>
) {
  if (depth > 8 || !value || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item) => collectPreviewItems(item, shapes, lines, depth + 1, seen))
    return
  }
  const record = value as Record<string, unknown>
  const type = firstString(record['type'], record['kind'], record['shapeType']).toLowerCase()
  if (type.includes('line') || type.includes('connector') || record['endpoint1'] || record['endpoint2'])
    lines.push(record)
  else if (readBounds(record)) shapes.push(record)
  for (const key of [
    'pages',
    'layers',
    'groups',
    'children',
    'items',
    'objects',
    'blocks',
    'shapes',
    'lines',
    'connectors'
  ])
    collectPreviewItems(record[key], shapes, lines, depth + 1, seen)
}

function normalizePreviewShape(input: Record<string, unknown>, index: number): PreviewShape | null {
  const bounds = readBounds(input)
  if (!bounds) return null
  const type = firstString(input['type'], input['kind'], input['shapeType']).toLowerCase()
  return {
    id: firstString(input['id'], input['shapeId']) || `shape-${index}`,
    ...bounds,
    text: firstString(input['text'], input['label'], input['name']),
    shape: type.includes('ellipse') || type.includes('circle') ? 'ellipse' : 'rect',
    fill: safeColor(input['fill'], '#eff6ff'),
    stroke: safeColor(input['stroke'], '#2563eb')
  }
}

function normalizePreviewLine(input: Record<string, unknown>, shapes: Map<string, PreviewShape>): PreviewLine | null {
  const start = readPoint(input['endpoint1'] ?? input['start'] ?? input['from'])
  const end = readPoint(input['endpoint2'] ?? input['end'] ?? input['to'])
  const source = shapes.get(firstString(input['sourceId'], input['source'], input['fromId']))
  const target = shapes.get(firstString(input['targetId'], input['target'], input['toId']))
  const a = start ?? (source ? center(source) : null),
    b = end ?? (target ? center(target) : null)
  return a && b
    ? { x1: a.x, y1: a.y, x2: b.x, y2: b.y, text: firstString(input['text'], input['label']) || undefined }
    : null
}

function readBounds(input: Record<string, unknown>) {
  const box = isRecord(input['boundingBox'])
    ? input['boundingBox']
    : isRecord(input['bounds'])
    ? input['bounds']
    : input
  const x = firstNumber(box['x'], box['left']),
    y = firstNumber(box['y'], box['top']),
    width = firstNumber(box['w'], box['width']),
    height = firstNumber(box['h'], box['height'])
  return x != null && y != null && width != null && height != null && width > 0 && height > 0
    ? { x, y, width, height }
    : null
}

function readPoint(value: unknown) {
  if (!isRecord(value)) return null
  const x = firstNumber(value['x']),
    y = firstNumber(value['y'])
  return x != null && y != null ? { x, y } : null
}

function center(shape: PreviewShape) {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
}
function firstNumber(...values: unknown[]) {
  for (const value of values) if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}
function firstString(...values: unknown[]) {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim()
  return ''
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
function safeColor(value: unknown, fallback: string) {
  const color = firstString(value)
  return /^(?:#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(color) ? color : fallback
}

const VIEWER_CSS = `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#182230;background:#f6f8fc}*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:flex;flex-direction:column}header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 24px;background:#fff;border-bottom:1px solid #e4e7ec}header span{font-size:11px;font-weight:700;letter-spacing:.13em;color:#2563eb}h1{margin:5px 0 0;font-size:20px;letter-spacing:-.02em}header p{margin:5px 0 0;color:#667085;font-size:13px}header a{flex:0 0 auto;border-radius:9px;background:#2563eb;padding:9px 14px;color:#fff;text-decoration:none;font-size:13px}main{display:grid;place-items:center;min-height:0;flex:1;padding:32px;overflow:auto;background:radial-gradient(circle at 50% 30%,#fff,#edf2fb)}.diagram,.image-preview{display:block;max-width:min(1200px,100%);max-height:calc(100vh - 190px);background:#fff;box-shadow:0 20px 55px #1018281f}.diagram line{stroke:#667085;stroke-width:2}.diagram rect,.diagram ellipse{stroke-width:2}.diagram text{font:14px Inter,system-ui,sans-serif;fill:#172033}.source{width:min(900px,100%);max-height:100%;padding:28px;border:1px solid #d0d5dd;border-radius:12px;background:#fff;overflow:auto}.source h2{margin:0 0 16px;font-size:16px}.source pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.6}footer{padding:10px;text-align:center;background:#fff;color:#98a2b3;font-size:11px;border-top:1px solid #e4e7ec}@media(max-width:640px){header{padding:14px 16px}header p{display:none}main{padding:14px}}`

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

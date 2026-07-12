import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isPlainObject, type NormalizedExcalidrawScene } from './excalidraw-scene.validation.js'

export const EXCALIDRAW_ARTIFACT_VIEWER_VERSION = 1
export const EXCALIDRAW_ARTIFACT_MAX_HTML_BYTES = 50 * 1024 * 1024

const moduleDir = dirname(fileURLToPath(import.meta.url))
const viewerAssetDir = join(moduleDir, 'artifact-viewer')
const allowedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml'
])

type ViewerAssets = { javascript: string; css: string }

export type ExcalidrawArtifactViewerRenderInput = {
  title: string
  description?: string | null
  revision: number
  versionNumber: number
  scene: NormalizedExcalidrawScene
}

export type ExcalidrawArtifactViewerRenderResult = {
  buffer: Buffer
  checksum: string
  sha256: string
  size: number
  mimeType: 'text/html'
  viewerVersion: number
  theme: 'light' | 'dark'
}

@Injectable()
export class ExcalidrawArtifactViewerService {
  private assetsPromise?: Promise<ViewerAssets>

  async render(input: ExcalidrawArtifactViewerRenderInput): Promise<ExcalidrawArtifactViewerRenderResult> {
    const scene = sanitizeArtifactScene(input.scene)
    const theme: 'light' | 'dark' = scene.appState.theme === 'dark' ? 'dark' : 'light'
    const payload = {
      viewerVersion: EXCALIDRAW_ARTIFACT_VIEWER_VERSION,
      title: normalizeDisplayText(input.title, 'Untitled drawing'),
      description: normalizeOptionalDisplayText(input.description),
      revision: normalizeNonNegativeInteger(input.revision),
      versionNumber: normalizeNonNegativeInteger(input.versionNumber),
      theme,
      scene
    }
    const assets = await this.loadAssets()
    const html = renderArtifactHtml(payload, assets)
    const buffer = Buffer.from(html, 'utf8')
    if (buffer.byteLength > EXCALIDRAW_ARTIFACT_MAX_HTML_BYTES) {
      throw new BadRequestException('Published Excalidraw HTML exceeds the 50 MiB limit.')
    }
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    return {
      buffer,
      checksum: sha256,
      sha256,
      size: buffer.byteLength,
      mimeType: 'text/html',
      viewerVersion: EXCALIDRAW_ARTIFACT_VIEWER_VERSION,
      theme
    }
  }

  private loadAssets() {
    this.assetsPromise ??= Promise.all([
      readFile(join(viewerAssetDir, 'app.js'), 'utf8'),
      readFile(join(viewerAssetDir, 'app.css'), 'utf8')
    ]).then(([javascript, css]) => ({ javascript, css }))
    return this.assetsPromise
  }
}

export function sanitizeArtifactScene(scene: NormalizedExcalidrawScene): NormalizedExcalidrawScene {
  const elements = scene.elements.map((element) => sanitizeArtifactElement(element))
  const referencedFileIds = new Set(
    elements
      .map((element) => typeof element.fileId === 'string' ? element.fileId : null)
      .filter((fileId): fileId is string => Boolean(fileId))
  )
  const files = Object.fromEntries(
    [...referencedFileIds]
      .sort()
      .map((fileId) => [fileId, sanitizeArtifactFile(fileId, scene.files[fileId])])
  )
  const sourceAppState = isPlainObject(scene.appState) ? scene.appState : {}
  const theme = sourceAppState.theme === 'dark' ? 'dark' : 'light'
  const appState: Record<string, unknown> = {
    theme,
    viewBackgroundColor: sanitizeCanvasColor(sourceAppState.viewBackgroundColor, theme)
  }
  if (typeof sourceAppState.gridSize === 'number' && Number.isFinite(sourceAppState.gridSize)) {
    appState.gridSize = sourceAppState.gridSize
  }
  if (typeof sourceAppState.gridStep === 'number' && Number.isFinite(sourceAppState.gridStep)) {
    appState.gridStep = sourceAppState.gridStep
  }
  if (typeof sourceAppState.gridModeEnabled === 'boolean') {
    appState.gridModeEnabled = sourceAppState.gridModeEnabled
  }
  return { elements, appState, files }
}

function sanitizeArtifactElement(element: Record<string, unknown>) {
  const sanitized = cloneJsonObject(element)
  delete sanitized.customData
  const type = typeof sanitized.type === 'string' ? sanitized.type : ''
  sanitized.link = type === 'iframe' || type === 'embeddable'
    ? null
    : sanitizeHttpUrl(sanitized.link)
  if (type === 'iframe' || type === 'embeddable') {
    sanitized.validated = null
  }
  return sanitized
}

function sanitizeArtifactFile(fileId: string, value: unknown) {
  if (!isPlainObject(value)) {
    throw new BadRequestException(`Excalidraw image file "${fileId}" is missing from the published scene.`)
  }
  const dataURL = typeof value.dataURL === 'string' ? value.dataURL : ''
  const match = /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([a-z0-9+/=\r\n]+)$/i.exec(dataURL)
  if (!match) {
    throw new BadRequestException(`Excalidraw image file "${fileId}" must use an inline supported image data URL.`)
  }
  const mimeType = match[1].toLowerCase()
  if (!allowedImageMimeTypes.has(mimeType)) {
    throw new BadRequestException(`Excalidraw image file "${fileId}" uses an unsupported MIME type.`)
  }
  if (mimeType === 'image/svg+xml') validateEmbeddedSvg(fileId, match[2])
  const created = typeof value.created === 'number' && Number.isFinite(value.created) ? value.created : 0
  return {
    id: fileId,
    dataURL,
    mimeType,
    created
  }
}

function validateEmbeddedSvg(fileId: string, base64: string) {
  let svg: string
  try {
    svg = Buffer.from(base64, 'base64').toString('utf8')
  } catch {
    throw new BadRequestException(`Excalidraw SVG image file "${fileId}" is not valid base64.`)
  }
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(svg)) {
    throw new BadRequestException(`Excalidraw SVG image file "${fileId}" is invalid.`)
  }
  const unsafe = [
    /<script\b/i,
    /<foreignObject\b/i,
    /\bon[a-z]+\s*=/i,
    /javascript\s*:/i,
    /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/)/i
  ]
  if (unsafe.some((pattern) => pattern.test(svg))) {
    throw new BadRequestException(`Excalidraw SVG image file "${fileId}" contains unsafe or external content.`)
  }
}

function sanitizeHttpUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function sanitizeCanvasColor(value: unknown, theme: 'light' | 'dark') {
  if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim())) return value.trim()
  return theme === 'dark' ? '#121212' : '#ffffff'
}

function cloneJsonObject(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function renderArtifactHtml(
  payload: {
    viewerVersion: number
    title: string
    description?: string | null
    revision: number
    versionNumber: number
    theme: 'light' | 'dark'
    scene: NormalizedExcalidrawScene
  },
  assets: ViewerAssets
) {
  const serializedPayload = serializeForInlineScript(payload)
  const title = escapeHtml(payload.title)
  const css = assets.css.replace(/<\/style/gi, '<\\/style')
  const javascript = assets.javascript.replace(/<\/script/gi, '<\\/script')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; worker-src blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>
  <div id="root"></div>
  <script>window.__XPERT_EXCALIDRAW_ARTIFACT__=${serializedPayload};</script>
  <script>${javascript}</script>
</body>
</html>`
}

export function serializeForInlineScript(value: unknown) {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeDisplayText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 240) : fallback
}

function normalizeOptionalDisplayText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 1_000) : null
}

function normalizeNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0
}

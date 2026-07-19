import { BadRequestException } from '@nestjs/common'

export const HYPERFRAMES_COMPOSITION_MAX_BYTES = 2 * 1024 * 1024

export interface HyperframesCompositionMetadata {
  id: string
  width: number
  height: number
  duration: number
}

/**
 * Enforces the native HyperFrames composition contract before persistence.
 * Production rendering is network-isolated and the first runtime milestone only
 * stages index.html, so compositions must be fully self-contained.
 */
export function validateHyperframesComposition(html: string): string {
  const normalized = typeof html === 'string' ? html.trim() : ''
  if (!normalized) throw new BadRequestException('HyperFrames composition HTML is required.')
  if (Buffer.byteLength(normalized, 'utf8') > HYPERFRAMES_COMPOSITION_MAX_BYTES) {
    throw new BadRequestException('HyperFrames composition exceeds the 2 MB project limit.')
  }
  const root = compositionRootAttributes(normalized)
  if (!root) throw new BadRequestException('HyperFrames composition requires a data-composition-id root.')
  requirePositiveAttribute(root, 'data-width')
  requirePositiveAttribute(root, 'data-height')
  requirePositiveAttribute(root, 'data-duration')
  if (hasExternalAttributeSource(normalized) || hasExternalCssSource(normalized)) {
    throw new BadRequestException(
      'Production HyperFrames compositions must embed assets as data URIs; external or relative asset sources are not supported yet.'
    )
  }
  return normalized
}

export function readHyperframesCompositionMetadata(html: string): HyperframesCompositionMetadata {
  const normalized = validateHyperframesComposition(html)
  const attributes = compositionRootAttributes(normalized)
  if (!attributes) throw new BadRequestException('HyperFrames composition root is missing.')
  return {
    id: readAttribute(attributes, 'data-composition-id') ?? 'main',
    width: requirePositiveAttribute(attributes, 'data-width'),
    height: requirePositiveAttribute(attributes, 'data-height'),
    duration: requirePositiveAttribute(attributes, 'data-duration')
  }
}

export function createStarterHyperframesComposition(title: string, brief?: string | null): string {
  const safeTitle = escapeHtml(title)
  const safeBrief = escapeHtml(brief || 'Build, preview, and render one deterministic composition.')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#07111f}
    [data-composition-id]{position:relative;width:1280px;height:720px;overflow:hidden;color:#f8fafc;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:radial-gradient(circle at 72% 22%,#2563eb 0,transparent 32%),linear-gradient(135deg,#07111f,#172554)}
    .orb{position:absolute;width:420px;height:420px;border-radius:50%;left:760px;top:130px;background:linear-gradient(135deg,#60a5fa,#8b5cf6);filter:blur(2px);animation:orb 6s ease-in-out both}
    .copy{position:absolute;left:92px;top:180px;width:760px}.eyebrow{font-size:22px;letter-spacing:.24em;text-transform:uppercase;color:#93c5fd}.title{margin:22px 0 18px;font-size:88px;line-height:.94;letter-spacing:-.055em}.brief{width:650px;font-size:26px;line-height:1.45;color:#cbd5e1}
    @keyframes orb{0%{transform:translate3d(90px,60px,0) scale(.72);opacity:0}25%{opacity:1}100%{transform:translate3d(-40px,-24px,0) scale(1.08);opacity:.9}}
    @keyframes rise{0%{transform:translateY(42px);opacity:0}24%{transform:none;opacity:1}100%{transform:none;opacity:1}}
    .copy>*{animation:rise 6s cubic-bezier(.2,.8,.2,1) both}.title{animation-delay:.12s}.brief{animation-delay:.25s}
  </style>
</head>
<body>
  <main data-composition-id="main" data-width="1280" data-height="720" data-duration="6" data-no-timeline>
    <div class="orb" data-hf-id="hero-orb" data-start="0" data-duration="6"></div>
    <section class="copy" data-hf-id="hero-copy" data-start="0" data-duration="6">
      <div class="eyebrow" data-hf-id="eyebrow">Motion × HyperFrames</div>
      <h1 class="title" data-hf-id="title">${safeTitle}</h1>
      <p class="brief" data-hf-id="brief">${safeBrief}</p>
    </section>
  </main>
</body>
</html>`
}

function compositionRootAttributes(html: string): string | null {
  const match = html.match(/<[^>]+\bdata-composition-id\s*=\s*["'][^"']+["'][^>]*>/i)
  return match?.[0] ?? null
}

function hasExternalAttributeSource(html: string) {
  const matches = html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)
  for (const match of matches) {
    const value = match[1]?.trim() ?? ''
    if (!value || value.startsWith('#') || value.startsWith('data:')) continue
    return true
  }
  return false
}

function hasExternalCssSource(html: string) {
  const matches = html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)
  for (const match of matches) {
    const value = match[1]?.trim() ?? ''
    if (!value || value.startsWith('data:')) continue
    return true
  }
  return false
}

function readAttribute(attributes: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return attributes.match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1]?.trim() ?? null
}

function requirePositiveAttribute(attributes: string, name: string): number {
  const value = Number(readAttribute(attributes, name))
  if (!Number.isFinite(value) || value <= 0)
    throw new BadRequestException(`HyperFrames composition ${name} must be positive.`)
  return value
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character)
  )
}

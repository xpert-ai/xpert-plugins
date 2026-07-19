import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'

export const CANVAS_ARTIFACT_VIEWER_VERSION = 1
export const CANVAS_ARTIFACT_MAX_SVG_BYTES = 36 * 1024 * 1024
export const CANVAS_ARTIFACT_MAX_HTML_BYTES = 50 * 1024 * 1024

export type CanvasArtifactViewerRenderInput = {
  title: string
  description?: string | null
  revision: number
  pageName?: string | null
  svg: string
  width: number
  height: number
}

export type CanvasArtifactViewerRenderResult = {
  buffer: Buffer
  checksum: string
  sha256: string
  size: number
  mimeType: 'text/html'
  viewerVersion: number
}

@Injectable()
export class CanvasArtifactViewerService {
  render(input: CanvasArtifactViewerRenderInput): CanvasArtifactViewerRenderResult {
    const svg = validateCanvasArtifactSvg(input.svg)
    const width = normalizeDimension(input.width)
    const height = normalizeDimension(input.height)
    const html = renderViewerHtml({
      title: normalizeText(input.title, 'Untitled Canvas'),
      description: normalizeOptionalText(input.description),
      revision: normalizeRevision(input.revision),
      pageName: normalizeText(input.pageName, 'Canvas'),
      svgDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
      width,
      height
    })
    const buffer = Buffer.from(html, 'utf8')
    if (buffer.byteLength > CANVAS_ARTIFACT_MAX_HTML_BYTES) {
      throw new BadRequestException('Published Canvas HTML exceeds the 50 MiB limit.')
    }
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    return {
      buffer,
      checksum: sha256,
      sha256,
      size: buffer.byteLength,
      mimeType: 'text/html',
      viewerVersion: CANVAS_ARTIFACT_VIEWER_VERSION
    }
  }
}

export function validateCanvasArtifactSvg(svg: string) {
  const size = Buffer.byteLength(svg, 'utf8')
  const forbidden: Array<[RegExp, string]> = [
    [/<\s*script\b/i, 'script elements are not allowed'],
    [/<\s*(?:iframe|object|embed)\b/i, 'embedded browsing or object elements are not allowed'],
    [/\son[a-z]+\s*=/i, 'inline event handlers are not allowed'],
    [/javascript\s*:/i, 'javascript URLs are not allowed'],
    [/@import\b/i, 'CSS @import is not allowed'],
    [/image-set\s*\(/i, 'CSS image-set is not allowed'],
    [/\s(?:href|xlink:href|src)\s*=\s*(?:[^"'\s]|$)/i, 'unquoted or malformed resource references are not allowed']
  ]
  const unsafeReference = Array.from(svg.matchAll(/(?:href|xlink:href|src)\s*=\s*["']([^"']+)["']/gi))
    .map((match) => match[1])
    .find((value) => !isSafeEmbeddedReference(value))
  const unsafeCssUrl = Array.from(svg.matchAll(/url\(\s*([^)]*?)\s*\)/gi))
    .map((match) => normalizeCssUrlReference(match[1]))
    .find((value) => !isSafeEmbeddedReference(value))
  const reasons = [
    ...(size <= 0 ? ['SVG is empty'] : []),
    ...(size > CANVAS_ARTIFACT_MAX_SVG_BYTES ? ['oversized SVG exceeds 36 MiB'] : []),
    ...(!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg) ? ['SVG root markup is invalid'] : []),
    ...forbidden.filter(([pattern]) => pattern.test(svg)).map(([, reason]) => reason),
    ...(unsafeReference ? [`external or unsafe resource reference: ${summarizeReference(unsafeReference)}`] : []),
    ...(unsafeCssUrl !== undefined ? [`external or unsafe CSS URL: ${summarizeReference(unsafeCssUrl)}`] : [])
  ]
  if (reasons.length) throw new BadRequestException(`Canvas export SVG validation failed: ${reasons.join('; ')}.`)
  return svg
}

function renderViewerHtml(input: {
  title: string
  description?: string
  revision: number
  pageName: string
  svgDataUrl: string
  width: number
  height: number
}) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(input.title)}</title><style>${VIEWER_CSS}</style></head>
<body><header><div class="title-block"><span class="mark" aria-hidden="true">◇</span><div><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.description ?? input.pageName)}</p></div></div><span class="revision">Published Canvas · r${input.revision}</span></header>
<main><div class="viewport" aria-label="${escapeHtml(input.pageName)}"><img class="stage" src="${input.svgDataUrl}" alt="${escapeHtml(input.pageName)}" width="${input.width}" height="${input.height}"></div><div class="controls" aria-label="View controls"><button type="button" data-action="out" aria-label="Zoom out">−</button><button type="button" data-action="reset" aria-label="Reset zoom">100%</button><button type="button" data-action="fit" aria-label="Fit canvas">Fit</button><button type="button" data-action="in" aria-label="Zoom in">+</button><button type="button" data-action="fullscreen" aria-label="Enter fullscreen" title="Enter fullscreen">⛶</button></div></main>
<script>${VIEWER_SCRIPT}</script></body></html>`
}

const VIEWER_CSS = `
:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f8fa;color:#17181a}*{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden}body{display:flex;flex-direction:column}header{height:64px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:10px 18px;background:#fff;border-bottom:1px solid #e4e7eb}.title-block{display:flex;align-items:center;gap:10px;min-width:0}.mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#e8f7f4;color:#0f766e;font-size:22px}h1{font-size:16px;line-height:1.2;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}header p,.revision{font-size:12px;color:#69707a;margin:3px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}main{position:relative;min-height:0;flex:1}.viewport{position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:grab;background-color:#f6f7f9;background-image:radial-gradient(#cfd4db 1px,transparent 1px);background-size:20px 20px}.viewport.dragging{cursor:grabbing}.stage{position:absolute;left:0;top:0;display:block;max-width:none;transform-origin:0 0;will-change:transform;filter:drop-shadow(0 12px 30px #0002)}.controls{position:absolute;right:18px;bottom:18px;display:flex;overflow:hidden;border:1px solid #d8dbe0;border-radius:10px;background:#fff;box-shadow:0 5px 18px #0002}.controls button{border:0;border-right:1px solid #e3e5e8;background:#fff;color:#25272b;min-width:42px;height:38px;cursor:pointer}.controls button:last-child{border-right:0}.controls button:hover{background:#f3f5f7}body.viewer-fullscreen header{display:none}body.viewer-fullscreen main{position:fixed;inset:0;z-index:20;background:#f6f7f9}@media(max-width:700px){header p,.revision{display:none}}`

const VIEWER_SCRIPT = `(()=>{const viewport=document.querySelector('.viewport');const stage=document.querySelector('.stage');const fullscreenButton=document.querySelector('[data-action="fullscreen"]');let scale=1,x=0,y=0,drag=null,fallbackFullscreen=false;const size=()=>({width:Math.max(1,Number(stage.getAttribute('width'))||stage.naturalWidth||1),height:Math.max(1,Number(stage.getAttribute('height'))||stage.naturalHeight||1)});const draw=()=>{stage.style.transform='translate('+x+'px,'+y+'px) scale('+scale+')'};const center=s=>{x=(viewport.clientWidth-s.width*scale)/2;y=(viewport.clientHeight-s.height*scale)/2;draw()};const fit=()=>{const s=size();scale=Math.max(.02,Math.min(8,Math.min((viewport.clientWidth-64)/s.width,(viewport.clientHeight-64)/s.height)));center(s)};const reset=()=>{scale=1;center(size())};const zoom=(factor,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2)=>{const next=Math.max(.02,Math.min(8,scale*factor));x=cx-(cx-x)*(next/scale);y=cy-(cy-y)*(next/scale);scale=next;draw()};const syncFullscreen=()=>{const enabled=Boolean(document.fullscreenElement)||fallbackFullscreen;document.body.classList.toggle('viewer-fullscreen',enabled);if(fullscreenButton){const label=enabled?'Exit fullscreen':'Enter fullscreen';fullscreenButton.setAttribute('aria-label',label);fullscreenButton.setAttribute('title',label)}requestAnimationFrame(fit)};const toggleFullscreen=async()=>{if(document.fullscreenElement){await document.exitFullscreen?.();return}if(fallbackFullscreen){fallbackFullscreen=false;syncFullscreen();return}try{if(document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen();return}}catch{}fallbackFullscreen=true;syncFullscreen()};document.querySelector('[data-action="in"]')?.addEventListener('click',()=>zoom(1.2));document.querySelector('[data-action="out"]')?.addEventListener('click',()=>zoom(1/1.2));document.querySelector('[data-action="reset"]')?.addEventListener('click',reset);document.querySelector('[data-action="fit"]')?.addEventListener('click',fit);fullscreenButton?.addEventListener('click',()=>void toggleFullscreen());document.addEventListener('fullscreenchange',()=>{fallbackFullscreen=false;syncFullscreen()});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&fallbackFullscreen){fallbackFullscreen=false;syncFullscreen()}});viewport.addEventListener('wheel',event=>{event.preventDefault();const rect=viewport.getBoundingClientRect();zoom(event.deltaY<0?1.12:1/1.12,event.clientX-rect.left,event.clientY-rect.top)},{passive:false});viewport.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={px:event.clientX,py:event.clientY,x,y};viewport.setPointerCapture(event.pointerId);viewport.classList.add('dragging')});viewport.addEventListener('pointermove',event=>{if(!drag)return;x=drag.x+event.clientX-drag.px;y=drag.y+event.clientY-drag.py;draw()});const stop=()=>{drag=null;viewport.classList.remove('dragging')};viewport.addEventListener('pointerup',stop);viewport.addEventListener('pointercancel',stop);window.addEventListener('resize',fit);stage.addEventListener('load',fit,{once:true});requestAnimationFrame(fit)})();`

function isSafeEmbeddedReference(value: string | undefined) {
  const normalized = value?.trim() ?? ''
  return /^#[a-z_][a-z0-9_.:-]*$/i.test(normalized)
    || /^data:(?:image|font)\/[a-z0-9.+-]+(?:;charset=[a-z0-9._-]+)?;base64,[a-z0-9+/=\s]+$/i.test(normalized)
}

function normalizeCssUrlReference(value: string | undefined) {
  const normalized = value?.trim() ?? ''
  const first = normalized[0]
  if ((first === '"' || first === "'") && normalized.at(-1) === first) {
    return normalized.slice(1, -1).trim()
  }

  // XML serializers encode quotes inside a quoted style attribute. Decode only
  // a matching quote wrapper; the URL payload itself remains unescaped and validated.
  const entityQuoted = normalized.match(/^(&(?:quot|apos|#(?:34|39|x22|x27));)([\s\S]*)\1$/i)
  return entityQuoted ? entityQuoted[2].trim() : normalized
}

function summarizeReference(value: string) {
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) || '(empty)'
}

function normalizeRevision(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function normalizeDimension(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 100_000) {
    throw new BadRequestException('Canvas Artifact dimensions must be between 1 and 100000 pixels.')
  }
  return Math.round(value)
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
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

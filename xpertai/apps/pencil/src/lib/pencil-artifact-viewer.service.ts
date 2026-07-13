import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { graphFromSnapshot } from './pencil-graph.js'
import type { PencilGraphSnapshot } from './types.js'

export const PENCIL_ARTIFACT_VIEWER_VERSION = 2
export const PENCIL_ARTIFACT_MAX_HTML_BYTES = 50 * 1024 * 1024
type PencilCoreIoModule = typeof import('@open-pencil/core/io')
let pencilCoreIoModulePromise: Promise<PencilCoreIoModule> | null = null

export type PencilArtifactViewerRenderInput = {
  title: string
  description?: string | null
  revision: number
  graphSnapshot: PencilGraphSnapshot
}

export type PencilArtifactViewerRenderResult = {
  buffer: Buffer
  checksum: string
  sha256: string
  size: number
  mimeType: 'text/html'
  viewerVersion: number
  pageCount: number
}

@Injectable()
export class PencilArtifactViewerService {
  async render(input: PencilArtifactViewerRenderInput): Promise<PencilArtifactViewerRenderResult> {
    const graph = await graphFromSnapshot(input.graphSnapshot)
    const { renderNodesToSVG } = await loadPencilCoreIo()
    const pages = graph
      .getPages()
      .filter((page) => page.internalOnly !== true)
      .map((page) => {
        const svg = renderNodesToSVG(graph, page.id, page.childIds, { xmlDeclaration: false, colorSpace: 'srgb' })
        return {
          id: page.id,
          name: normalizeText(page.name, 'Untitled page'),
          svg: validatePublishedSvg(svg ?? emptyPageSvg())
        }
      })
    const html = renderViewerHtml({
      title: normalizeText(input.title, 'Untitled Pencil design'),
      description: normalizeOptionalText(input.description),
      revision: normalizeRevision(input.revision),
      pages
    })
    const buffer = Buffer.from(html, 'utf8')
    assertPublishedHtmlSize(buffer.byteLength)
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    return {
      buffer,
      checksum: sha256,
      sha256,
      size: buffer.byteLength,
      mimeType: 'text/html',
      viewerVersion: PENCIL_ARTIFACT_VIEWER_VERSION,
      pageCount: pages.length
    }
  }
}

function loadPencilCoreIo() {
  pencilCoreIoModulePromise ??= import('@open-pencil/core/io')
  return pencilCoreIoModulePromise
}

export function validatePublishedSvg(svg: string) {
  const forbidden = [
    /<\s*script\b/i,
    /<\s*foreignObject\b/i,
    /<\s*(?:iframe|object|embed)\b/i,
    /\son[a-z]+\s*=/i,
    /javascript\s*:/i,
    /@import\b/i,
    /image-set\s*\(/i,
    /\s(?:href|src)\s*=\s*(?:[^"'\s]|$)/i
  ]
  const referencesAreSafe = Array.from(svg.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi))
    .every((match) => isSafeEmbeddedReference(match[1]))
  const cssUrlsAreSafe = Array.from(svg.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi))
    .every((match) => isSafeEmbeddedReference(match[1]))
  if (
    !/^\s*<svg\b/i.test(svg) ||
    !/<\/svg>\s*$/i.test(svg) ||
    forbidden.some((pattern) => pattern.test(svg)) ||
    !referencesAreSafe ||
    !cssUrlsAreSafe
  ) {
    throw new BadRequestException('Pencil design contains SVG content or an external resource that cannot be shared safely.')
  }
  return svg
}

export function assertPublishedHtmlSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 0 || size > PENCIL_ARTIFACT_MAX_HTML_BYTES) {
    throw new BadRequestException('Published Pencil HTML exceeds the 50 MiB limit.')
  }
}

function renderViewerHtml(input: {
  title: string
  description?: string
  revision: number
  pages: Array<{ id: string; name: string; svg: string }>
}) {
  const navigation = input.pages
    .map((page, index) => `<button type="button" class="page-button${index === 0 ? ' active' : ''}" data-page="${escapeHtml(page.id)}">${escapeHtml(page.name)}</button>`)
    .join('')
  const pages = input.pages
    .map((page, index) => `<section class="page${index === 0 ? ' active' : ''}" data-page="${escapeHtml(page.id)}" aria-label="${escapeHtml(page.name)}"><div class="stage">${page.svg}</div></section>`)
    .join('')
  const empty = input.pages.length ? '' : '<div class="empty">This design has no pages.</div>'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.title)}</title><style>${VIEWER_CSS}</style></head>
<body><header><div><h1>${escapeHtml(input.title)}</h1>${input.description ? `<p>${escapeHtml(input.description)}</p>` : ''}</div><span>Revision ${input.revision}</span></header>
<main><aside aria-label="Pages">${navigation}</aside><div class="viewer"><div class="viewport">${pages}${empty}</div><div class="controls" aria-label="View controls"><button type="button" data-action="out" aria-label="Zoom out">−</button><button type="button" data-action="reset" aria-label="Reset zoom">100%</button><button type="button" data-action="fit" aria-label="Fit page">Fit</button><button type="button" data-action="in" aria-label="Zoom in">+</button><button type="button" data-action="fullscreen" aria-label="Enter fullscreen" title="Enter fullscreen">⛶</button></div></div></main>
<script>${VIEWER_SCRIPT}</script></body></html>`
}

const VIEWER_CSS = `
:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f6f7f9;color:#17181a}*{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden}body{display:flex;flex-direction:column}header{height:64px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:10px 18px;background:#fff;border-bottom:1px solid #e3e5e8}h1{font-size:16px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}header p{font-size:12px;color:#6d727a;margin:3px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}header span{font-size:12px;color:#6d727a}main{display:grid;grid-template-columns:220px 1fr;min-height:0;flex:1}aside{padding:12px;background:#fff;border-right:1px solid #e3e5e8;overflow:auto}.page-button{width:100%;border:0;border-radius:8px;padding:9px 10px;text-align:left;background:transparent;color:inherit;cursor:pointer}.page-button:hover,.page-button.active{background:#eef2ff;color:#3157d5}.viewer{position:relative;min-width:0;min-height:0}.viewport{position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:grab;background-image:linear-gradient(#dfe2e7 1px,transparent 1px),linear-gradient(90deg,#dfe2e7 1px,transparent 1px);background-size:20px 20px}.viewport.dragging{cursor:grabbing}.page{display:none;position:absolute;inset:0}.page.active{display:block}.stage{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}.stage svg{display:block;max-width:none;box-shadow:0 12px 35px #0002;background:#fff}.controls{position:absolute;right:18px;bottom:18px;display:flex;overflow:hidden;border:1px solid #d8dbe0;border-radius:10px;background:#fff;box-shadow:0 5px 18px #0002}.controls button{border:0;border-right:1px solid #e3e5e8;background:#fff;color:#25272b;min-width:42px;height:38px;cursor:pointer}.controls button:last-child{border-right:0}.empty{display:grid;place-items:center;height:100%;color:#6d727a}body.viewer-fullscreen header,body.viewer-fullscreen aside{display:none}body.viewer-fullscreen main{grid-template-columns:1fr}body.viewer-fullscreen .viewer{position:fixed;inset:0;z-index:20;background:#f6f7f9}@media(max-width:700px){main{grid-template-columns:1fr}aside{display:flex;gap:6px;border-right:0;border-bottom:1px solid #e3e5e8;overflow:auto}.page-button{width:auto;white-space:nowrap}header p,header span{display:none}}`

const VIEWER_SCRIPT = `(()=>{const viewport=document.querySelector('.viewport');const buttons=[...document.querySelectorAll('.page-button')];const pages=[...document.querySelectorAll('.page')];const fullscreenButton=document.querySelector('[data-action="fullscreen"]');let scale=1,x=0,y=0,drag=null,fallbackFullscreen=false;const active=()=>document.querySelector('.page.active .stage');const draw=()=>{const stage=active();if(stage)stage.style.transform='translate('+x+'px,'+y+'px) scale('+scale+')'};const dimensions=()=>{const svg=active()?.querySelector('svg');if(!svg)return null;const viewBox=svg.viewBox?.baseVal;return{width:viewBox?.width||Number(svg.getAttribute('width'))||svg.getBoundingClientRect().width||1,height:viewBox?.height||Number(svg.getAttribute('height'))||svg.getBoundingClientRect().height||1}};const center=size=>{x=(viewport.clientWidth-size.width*scale)/2;y=(viewport.clientHeight-size.height*scale)/2;draw()};const fit=()=>{const size=dimensions();if(!size)return;scale=Math.max(.05,Math.min(8,Math.min((viewport.clientWidth-64)/size.width,(viewport.clientHeight-64)/size.height)));center(size)};const reset=()=>{const size=dimensions();if(!size)return;scale=1;center(size)};const zoom=(factor,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2)=>{const next=Math.max(.05,Math.min(8,scale*factor));x=cx-(cx-x)*(next/scale);y=cy-(cy-y)*(next/scale);scale=next;draw()};const syncFullscreen=()=>{const enabled=Boolean(document.fullscreenElement)||fallbackFullscreen;document.body.classList.toggle('viewer-fullscreen',enabled);if(fullscreenButton){const label=enabled?'Exit fullscreen':'Enter fullscreen';fullscreenButton.setAttribute('aria-label',label);fullscreenButton.setAttribute('title',label)}requestAnimationFrame(fit)};const toggleFullscreen=async()=>{if(document.fullscreenElement){await document.exitFullscreen?.();return}if(fallbackFullscreen){fallbackFullscreen=false;syncFullscreen();return}try{if(document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen();return}}catch{}fallbackFullscreen=true;syncFullscreen()};buttons.forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.page;buttons.forEach(item=>item.classList.toggle('active',item===button));pages.forEach(page=>page.classList.toggle('active',page.dataset.page===id));requestAnimationFrame(fit)}));document.querySelector('[data-action="in"]')?.addEventListener('click',()=>zoom(1.2));document.querySelector('[data-action="out"]')?.addEventListener('click',()=>zoom(1/1.2));document.querySelector('[data-action="reset"]')?.addEventListener('click',reset);document.querySelector('[data-action="fit"]')?.addEventListener('click',fit);fullscreenButton?.addEventListener('click',()=>void toggleFullscreen());document.addEventListener('fullscreenchange',()=>{fallbackFullscreen=false;syncFullscreen()});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&fallbackFullscreen){fallbackFullscreen=false;syncFullscreen()}});viewport.addEventListener('wheel',event=>{event.preventDefault();const rect=viewport.getBoundingClientRect();zoom(event.deltaY<0?1.12:1/1.12,event.clientX-rect.left,event.clientY-rect.top)},{passive:false});viewport.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={px:event.clientX,py:event.clientY,x,y};viewport.setPointerCapture(event.pointerId);viewport.classList.add('dragging')});viewport.addEventListener('pointermove',event=>{if(!drag)return;x=drag.x+event.clientX-drag.px;y=drag.y+event.clientY-drag.py;draw()});const stop=()=>{drag=null;viewport.classList.remove('dragging')};viewport.addEventListener('pointerup',stop);viewport.addEventListener('pointercancel',stop);window.addEventListener('resize',fit);requestAnimationFrame(fit)})();`

function isSafeEmbeddedReference(value: string | undefined) {
  const normalized = value?.trim() ?? ''
  return normalized.startsWith('#') || /^data:image\/(?:avif|gif|jpe?g|png|webp);base64,/i.test(normalized)
}

function emptyPageSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#fff"/></svg>'
}

function normalizeRevision(value: number) {
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
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

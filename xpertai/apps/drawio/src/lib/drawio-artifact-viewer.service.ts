import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { DrawioDrawingVersion } from './entities/index.js'

export const DRAWIO_ARTIFACT_VIEWER_VERSION = 1
export const DRAWIO_ARTIFACT_MAX_SOURCE_BYTES = 10 * 1024 * 1024

@Injectable()
export class DrawioArtifactViewerService {
  render(input: { title: string; description?: string | null; version: DrawioDrawingVersion }) {
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
    const previewSvg = input.version.previewSvg ? validatePublishedSvg(input.version.previewSvg) : null
    const previewPng = normalizePngDataUri(input.version.previewPng)
    const html = renderViewerHtml({
      title: normalizeText(input.title, 'Untitled draw.io diagram'),
      description: normalizeOptionalText(input.description),
      versionNumber: input.version.versionNumber,
      previewSvg,
      previewPng,
      xml: input.version.xml ?? null,
      mermaidSource: input.version.mermaidSource ?? null
    })
    const buffer = Buffer.from(html, 'utf8')
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    return {
      buffer,
      checksum: sha256,
      sha256,
      size: buffer.byteLength,
      mimeType: 'text/html' as const,
      viewerVersion: DRAWIO_ARTIFACT_VIEWER_VERSION,
      sourceType: previewSvg ? 'svg' : previewPng ? 'png' : input.version.xml ? 'xml' : 'mermaid'
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
}) {
  const preview = input.previewSvg
    ? `<div class="static-preview">${input.previewSvg}</div>`
    : input.previewPng
    ? `<div class="static-preview"><img src="${escapeHtml(input.previewPng)}" alt="${escapeHtml(input.title)}"></div>`
    : input.xml
    ? '<svg id="diagram" role="img" aria-label="draw.io diagram"></svg><div id="error" hidden></div>'
    : `<pre class="source">${escapeHtml(input.mermaidSource ?? 'No previewable diagram content is available.')}</pre>`
  const script = input.xml
    ? `<script>window.__DRAWIO_XML__=${serializeForScript(input.xml)};${DRAWIO_RENDER_SCRIPT}</script>`
    : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(
    input.title
  )}</title><style>${VIEWER_CSS}</style></head><body><header><div><span>DRAW.IO · VERSION ${
    input.versionNumber
  }</span><h1>${escapeHtml(input.title)}</h1>${
    input.description ? `<p>${escapeHtml(input.description)}</p>` : ''
  }</div><button type="button" id="fit" aria-label="Fit diagram">Fit</button></header><main>${preview}</main><footer>Read-only diagram published from XpertAI</footer>${script}</body></html>`
}

const VIEWER_CSS = `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#182230;background:#f7f8fb}*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:flex;flex-direction:column}header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 24px;background:#fff;border-bottom:1px solid #e4e7ec}header span{font-size:11px;font-weight:700;letter-spacing:.13em;color:#f59e0b}h1{margin:5px 0 0;font-size:20px;letter-spacing:-.02em}header p{margin:5px 0 0;color:#667085;font-size:13px}button{border:1px solid #d0d5dd;border-radius:9px;background:#fff;padding:8px 14px;color:#344054;cursor:pointer}main{position:relative;display:grid;place-items:center;min-height:0;flex:1;padding:32px;overflow:auto;background-image:linear-gradient(#e5e7eb 1px,transparent 1px),linear-gradient(90deg,#e5e7eb 1px,transparent 1px);background-size:20px 20px}.static-preview{max-width:100%;max-height:100%;padding:18px;background:#fff;box-shadow:0 18px 50px #1018281f}.static-preview svg,.static-preview img{display:block;max-width:min(100%,1200px);max-height:calc(100vh - 190px)}#diagram{display:block;min-width:320px;min-height:220px;overflow:visible;background:#fff;box-shadow:0 18px 50px #1018281f}.source{max-width:900px;max-height:100%;overflow:auto;margin:0;padding:28px;border:1px solid #d0d5dd;border-radius:12px;background:#fff;white-space:pre-wrap}#error{padding:24px;border-radius:12px;background:#fff;color:#b42318}footer{padding:10px;text-align:center;background:#fff;color:#98a2b3;font-size:11px;border-top:1px solid #e4e7ec}@media(max-width:640px){header{padding:14px 16px}header p{display:none}main{padding:14px}}`

const DRAWIO_RENDER_SCRIPT = `(()=>{const xml=window.__DRAWIO_XML__,svg=document.getElementById('diagram'),error=document.getElementById('error'),ns='http://www.w3.org/2000/svg';const attr=(el,n)=>el?.getAttribute(n)||'';const num=(v,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f};const styles=value=>Object.fromEntries(String(value||'').split(';').map(x=>x.split('=')).filter(x=>x[0]).map(([k,...v])=>[k,v.join('=')]));const clean=value=>{const div=document.createElement('div');div.innerHTML=String(value||'');return div.textContent||''};const node=(name,attrs={})=>{const el=document.createElementNS(ns,name);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));return el};try{const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw new Error('Invalid draw.io XML');const cells=[...doc.querySelectorAll('mxCell')];const shapes=new Map();cells.filter(c=>attr(c,'vertex')==='1').forEach((cell,index)=>{const g=cell.querySelector(':scope > mxGeometry')||cell.querySelector('mxGeometry'),x=num(attr(g,'x'),40+(index%4)*190),y=num(attr(g,'y'),40+Math.floor(index/4)*110),w=Math.max(40,num(attr(g,'width'),140)),h=Math.max(30,num(attr(g,'height'),64)),s=styles(attr(cell,'style')),id=attr(cell,'id')||String(index),label=clean(attr(cell,'value')),fill=s.fillColor&&s.fillColor!=='none'?s.fillColor:'#fff7ed',stroke=s.strokeColor&&s.strokeColor!=='none'?s.strokeColor:'#f59e0b';shapes.set(id,{x,y,w,h});const group=node('g');const shape=s.shape==='ellipse'?node('ellipse',{cx:x+w/2,cy:y+h/2,rx:w/2,ry:h/2,fill,stroke,'stroke-width':2}):node('rect',{x,y,width:w,height:h,rx:s.rounded==='1'?12:4,fill,stroke,'stroke-width':2});group.append(shape);const text=node('text',{x:x+w/2,y:y+h/2,'text-anchor':'middle','dominant-baseline':'middle',fill:s.fontColor||'#172033','font-size':14,'font-family':'Inter,system-ui,sans-serif'});text.textContent=label.slice(0,80);group.append(text);svg.append(group)});cells.filter(c=>attr(c,'edge')==='1').forEach(cell=>{const a=shapes.get(attr(cell,'source')),b=shapes.get(attr(cell,'target'));if(!a||!b)return;const line=node('line',{x1:a.x+a.w/2,y1:a.y+a.h/2,x2:b.x+b.w/2,y2:b.y+b.h/2,stroke:'#667085','stroke-width':2,'marker-end':'url(#arrow)'});svg.prepend(line)});const defs=node('defs'),marker=node('marker',{id:'arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'}),path=node('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#667085'});marker.append(path);defs.append(marker);svg.prepend(defs);const boxes=[...shapes.values()];if(!boxes.length)throw new Error('No previewable draw.io shapes were found.');const minX=Math.min(...boxes.map(v=>v.x))-30,minY=Math.min(...boxes.map(v=>v.y))-30,maxX=Math.max(...boxes.map(v=>v.x+v.w))+30,maxY=Math.max(...boxes.map(v=>v.y+v.h))+30;svg.setAttribute('viewBox',[minX,minY,maxX-minX,maxY-minY].join(' '));svg.setAttribute('width',Math.max(320,maxX-minX));svg.setAttribute('height',Math.max(220,maxY-minY));document.getElementById('fit')?.addEventListener('click',()=>svg.scrollIntoView({block:'center',inline:'center'}))}catch(e){svg.hidden=true;error.hidden=false;error.textContent=e instanceof Error?e.message:'Diagram preview failed.'}})();`

function normalizePngDataUri(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return /^data:image\/png;base64,[a-z0-9+/=\s]+$/i.test(normalized) ? normalized : null
}

function serializeForScript(value: string) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
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

import type { MotionExportKind, MotionJsonObject } from './types.js'

export const MOTION_TRIGGERS = ['load', 'scroll', 'hover', 'click'] as const
export const MOTION_VERBS = [
  'fade',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'zoom',
  'rotate',
  'blur',
  'pop',
  'pulse',
  'shake',
  'wobble',
  'sink'
] as const
export const MOTION_KEYFRAME_PROPS = ['opacity', 'x', 'y', 'scale', 'rotate', 'blur'] as const
export type MotionKeyframeProp = (typeof MOTION_KEYFRAME_PROPS)[number]
export type MotionKeyframePoint = { t?: number; v?: number; ease?: string }
export type MotionKeyframeTracks = Partial<Record<MotionKeyframeProp, MotionKeyframePoint[]>>

const MOTION_KEYFRAMES = `
@keyframes ma-fade{from{opacity:0}to{opacity:1}}
@keyframes ma-slide-up{from{opacity:0;transform:translateY(var(--ma-d,24px))}to{opacity:1;transform:none}}
@keyframes ma-slide-down{from{opacity:0;transform:translateY(calc(var(--ma-d,24px)*-1))}to{opacity:1;transform:none}}
@keyframes ma-slide-left{from{opacity:0;transform:translateX(calc(var(--ma-d,24px)*-1))}to{opacity:1;transform:none}}
@keyframes ma-slide-right{from{opacity:0;transform:translateX(var(--ma-d,24px))}to{opacity:1;transform:none}}
@keyframes ma-zoom{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
@keyframes ma-rotate{from{opacity:0;transform:rotate(-8deg) scale(.96)}to{opacity:1;transform:none}}
@keyframes ma-blur{from{opacity:0;filter:blur(10px)}to{opacity:1;filter:blur(0)}}
@keyframes ma-pop{0%{transform:none}45%{transform:translateY(calc(var(--ma-d,8px)*-1)) scale(1.06)}100%{transform:none}}
@keyframes ma-pulse{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes ma-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
@keyframes ma-wobble{0%,100%{transform:rotate(0)}25%{transform:rotate(-4deg)}50%{transform:rotate(3deg)}75%{transform:rotate(-2deg)}}
@keyframes ma-sink{0%{transform:none}50%{transform:scale(.94)}100%{transform:none}}
@media(prefers-reduced-motion:reduce){[data-ma-anim]{animation:none!important;opacity:1!important;filter:none!important;transform:none!important}}
`.trim()

const MOTION_RUNTIME = `(function(){
  if(window.maMotion) return;
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function animName(el){
    var kf=el.getAttribute('data-ma-kf');
    if(kf) return kf;
    var anim=el.getAttribute('data-ma-anim');
    return anim ? 'ma-'+anim : '';
  }
  function play(el){
    if(RM) return;
    var name=animName(el); if(!name) return;
    var dur=el.getAttribute('data-ma-dur')||'520';
    var ease=el.getAttribute('data-ma-ease')||'cubic-bezier(.16,1,.3,1)';
    var delay=el.getAttribute('data-ma-delay')||'0';
    var dist=el.getAttribute('data-ma-dist'); if(dist!=null&&dist!=='') el.style.setProperty('--ma-d', dist+'px');
    var fill=el.getAttribute('data-ma-fill')||'both';
    el.style.animation='none'; void el.offsetWidth;
    el.style.animation=name+' '+dur+'ms '+ease+' '+delay+'ms '+fill;
  }
  var io=null;
  function ensureIO(){ if(io) return io; io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ play(e.target); io.unobserve(e.target); } }); }, {threshold:.18}); return io; }
  function wire(el){
    if(el.__maOff){ el.__maOff(); el.__maOff=null; }
    var trig=el.getAttribute('data-ma-trigger')||'load';
    if(trig==='load') play(el);
    else if(trig==='scroll'){ if(!RM && (el.getAttribute('data-ma-fill')||'both')==='both') el.style.opacity='0'; ensureIO().observe(el); el.__maOff=function(){ if(io) io.unobserve(el); el.style.opacity=''; }; }
    else if(trig==='hover'){ var h=function(){ play(el); }; el.addEventListener('mouseenter',h); el.__maOff=function(){ el.removeEventListener('mouseenter',h); }; }
    else if(trig==='click'){ var c=function(){ play(el); }; el.addEventListener('click',c); el.__maOff=function(){ el.removeEventListener('click',c); }; }
  }
  function motionEls(){ return document.querySelectorAll('[data-ma-anim],[data-ma-kf]'); }
  function wireAll(){ var els=motionEls(); for(var i=0;i<els.length;i++) wire(els[i]); }
  function timelineDuration(){ var m=0, els=motionEls(); for(var i=0;i<els.length;i++){ var d=(+(els[i].getAttribute('data-ma-dur')||520))+(+(els[i].getAttribute('data-ma-delay')||0)); if(d>m)m=d; } return m||1000; }
  function seek(T){ var els=motionEls(); for(var i=0;i<els.length;i++){ var el=els[i], name=animName(el); if(!name) continue; var dur=el.getAttribute('data-ma-dur')||'520', ease=el.getAttribute('data-ma-ease')||'cubic-bezier(.16,1,.3,1)', delay=+(el.getAttribute('data-ma-delay')||0); el.style.animation=name+' '+dur+'ms '+ease+' 0ms both'; el.style.animationPlayState='paused'; el.style.animationDelay=(-(T-delay))+'ms'; } }
  function resume(){ var els=motionEls(); for(var i=0;i<els.length;i++){ els[i].style.animationPlayState=''; els[i].style.animationDelay=''; els[i].style.animation='none'; } wireAll(); }
  window.__maTimeline={seek:seek,duration:timelineDuration,resume:resume};
  window.maMotion={play:play,wire:wire,wireAll:wireAll,seek:seek,timelineDuration:timelineDuration};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', wireAll); else wireAll();
})();`

export function validateHtmlArtifact(html: string) {
  const trimmed = html.trim()
  if (!trimmed) {
    throw new Error('HTML artifact is empty.')
  }
  if (trimmed.length > 5 * 1024 * 1024) {
    throw new Error('HTML artifact is too large.')
  }
  if (!/<html[\s>]|<!doctype html/i.test(trimmed)) {
    throw new Error('HTML artifact must be a complete HTML document.')
  }
  return trimmed
}

export function injectMotionRuntime(html: string) {
  let next = validateHtmlArtifact(html)
  if (!/id=["']ma-motion-kf["']/.test(next)) {
    const style = `<style id="ma-motion-kf">\n${MOTION_KEYFRAMES}\n</style>`
    next = /<\/head>/i.test(next) ? next.replace(/<\/head>/i, `${style}\n</head>`) : `${style}\n${next}`
  }
  if (!/id=["']ma-motion-runtime["']/.test(next)) {
    const script = `<script id="ma-motion-runtime">\n${MOTION_RUNTIME}\n</script>`
    next = /<\/body>/i.test(next) ? next.replace(/<\/body>/i, `${script}\n</body>`) : `${next}\n${script}`
  }
  return next
}

export function normalizeMotionKeyframeTracks(input: MotionJsonObject | MotionKeyframeTracks | null | undefined): MotionKeyframeTracks {
  const tracks: MotionKeyframeTracks = {}
  const source = input ?? {}
  for (const prop of MOTION_KEYFRAME_PROPS) {
    const value = source[prop]
    if (Array.isArray(value)) {
      const points = value
        .filter((point): point is MotionKeyframePoint => typeof point === 'object' && point !== null)
        .map((point) => ({
          t: clampNumber(Number(point.t ?? 0), 0, 999),
          v: Number.isFinite(Number(point.v)) ? Number(point.v) : 0,
          ...(typeof point.ease === 'string' && point.ease.trim() ? { ease: point.ease.trim() } : {})
        }))
        .sort((a, b) => Number(a.t ?? 0) - Number(b.t ?? 0))
      if (points.length > 0) {
        tracks[prop] = points
      }
    }
  }
  return tracks
}

export function customKeyframeName(id: string) {
  const safeId = id.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'custom'
  return `ma-kf-${safeId}`
}

export function buildMotionCustomKeyframes(name: string, tracks: MotionKeyframeTracks | MotionJsonObject) {
  const normalized = normalizeMotionKeyframeTracks(tracks)
  const times = new Set<number>()
  for (const points of Object.values(normalized)) {
    for (const point of points || []) {
      times.add(clampNumber(Number(point.t ?? 0), 0, 1))
    }
  }
  if (times.size === 0) {
    return ''
  }
  const sortedTimes = Array.from(times).sort((a, b) => a - b)
  const blocks = sortedTimes.map((time) => {
    const percent = Math.round(time * 1000) / 10
    const opacity = sampleTrack(normalized.opacity, time, undefined)
    const x = sampleTrack(normalized.x, time, 0) ?? 0
    const y = sampleTrack(normalized.y, time, 0) ?? 0
    const scale = sampleTrack(normalized.scale, time, 1) ?? 1
    const rotate = sampleTrack(normalized.rotate, time, 0) ?? 0
    const blur = sampleTrack(normalized.blur, time, 0) ?? 0
    const declarations = [
      opacity !== undefined ? `opacity:${round(opacity)}` : '',
      `transform:translate(${round(x)}px,${round(y)}px) scale(${round(scale)}) rotate(${round(rotate)}deg)`,
      blur > 0 ? `filter:blur(${round(blur)}px)` : 'filter:blur(0)'
    ].filter(Boolean)
    return `${percent}%{${declarations.join(';')}}`
  })
  return `@keyframes ${name}{${blocks.join('')}}`
}

export function injectCustomMotionKeyframes(html: string, keyframeName: string, tracks: MotionKeyframeTracks | MotionJsonObject) {
  const css = buildMotionCustomKeyframes(keyframeName, tracks)
  if (!css) {
    return html
  }
  const id = `ma-custom-${keyframeName}`
  const style = `<style id="${id}">\n${css}\n</style>`
  const existingPattern = new RegExp(`<style\\s+id=["']${escapeRegExp(id)}["'][\\s\\S]*?<\\/style>`, 'i')
  const next = existingPattern.test(html) ? html.replace(existingPattern, style) : /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${style}\n</head>`) : `${style}\n${html}`
  return next
}

export function exportTextArtifact(input: {
  kind: Exclude<MotionExportKind, 'mp4' | 'gif'>
  title: string
  html?: string | null
  videoComposition?: MotionJsonObject | null
}) {
  if (input.kind === 'html') {
    return {
      mimeType: 'text/html; charset=utf-8',
      extension: 'html',
      content: injectMotionRuntime(input.html ?? minimalHtml(input.title))
    }
  }
  if (input.kind === 'json') {
    return {
      mimeType: 'application/json; charset=utf-8',
      extension: 'json',
      content: JSON.stringify(
        {
          title: input.title,
          html: input.html ?? null,
          videoComposition: input.videoComposition ?? null
        },
        null,
        2
      )
    }
  }
  if (input.kind === 'css') {
    return {
      mimeType: 'text/css; charset=utf-8',
      extension: 'css',
      content: `/* Motion runtime keyframes */\n${MOTION_KEYFRAMES}\n`
    }
  }
  if (input.kind === 'react') {
    return {
      mimeType: 'text/plain; charset=utf-8',
      extension: 'tsx',
      content: `export function MotionArtifact() {\n  return <div data-ma-anim="slide-up" data-ma-trigger="load" data-ma-dur="520">Motion artifact</div>\n}\n`
    }
  }
  return {
    mimeType: 'application/json; charset=utf-8',
    extension: 'lottie.json',
    content: JSON.stringify(createLottiePlaceholder(input.title), null, 2)
  }
}

export function motionProfileGuidance(profile?: string | null) {
  switch (profile) {
    case 'subtle':
      return 'Subtle: quick fades, short distances, lean toward stillness.'
    case 'lively':
      return 'Lively: more spring and delight, still keep one attention moment per view.'
    case 'playful':
      return 'Playful: bouncy and characterful, avoid clutter.'
    case 'cinematic':
      return 'Cinematic: slower deliberate reveals, fewer bigger moments.'
    case 'none':
      return 'Static: no animation; preserve reduced-motion behavior.'
    default:
      return 'Default: balanced, restrained, useful motion.'
  }
}

function minimalHtml(title: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body></body></html>`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function sampleTrack(points: MotionKeyframePoint[] | undefined, time: number, fallback: number | undefined) {
  if (!points || points.length === 0) {
    return fallback
  }
  const sorted = points.map((point) => ({ t: Number(point.t ?? 0), v: Number(point.v ?? fallback ?? 0) })).sort((a, b) => a.t - b.t)
  if (time <= sorted[0].t) {
    return sorted[0].v
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const next = sorted[index]
    if (time <= next.t) {
      const span = Math.max(0.001, next.t - previous.t)
      const progress = clampNumber((time - previous.t) / span, 0, 1)
      return previous.v + (next.v - previous.v) * progress
    }
  }
  return sorted[sorted.length - 1].v
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createLottiePlaceholder(title: string) {
  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 60,
    w: 512,
    h: 512,
    nm: title,
    ddd: 0,
    assets: [],
    layers: []
  }
}

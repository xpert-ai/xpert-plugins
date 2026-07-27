import type { StoryAspectRatio } from './types.js'
import type { StoryProductionDocument, StoryShot } from './production-types.js'

const DIMENSIONS: Record<StoryAspectRatio, { width: number; height: number }> = {
  '9:16': { width: 720, height: 1280 },
  '16:9': { width: 1280, height: 720 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 960, height: 720 },
  '3:4': { width: 720, height: 960 },
  custom: { width: 1280, height: 720 }
}

type FlatShot = {
  sceneTitle: string
  sceneSummary: string
  sceneLocation: string
  shot: StoryShot
  start: number
  end: number
}

export function createStoryboardComposition(input: {
  title: string
  aspectRatio: StoryAspectRatio
  production: StoryProductionDocument
  mediaSources?: Record<string, string>
}) {
  const { width, height } = DIMENSIONS[input.aspectRatio]
  const shots = flattenShots(input.production)
  const duration = shots.at(-1)?.end ?? 0
  const landscape = width >= height
  const titleSize = landscape ? 54 : 58
  const bodySize = landscape ? 25 : 29
  const shotMarkup = shots
    .map((item, index) => {
      const shotDuration = item.shot.durationSeconds
      const keyframes = globalKeyframeWindow(
        item.start,
        item.end,
        duration
      )
      const accent = palette(index)
      const selectedMedia = (item.shot.candidates ?? []).find(
        (candidate) =>
          candidate.selected === true &&
          Boolean(input.mediaSources?.[candidate.id]) &&
          (candidate.kind === 'image' || candidate.kind === 'video')
      )
      const mediaSource = selectedMedia
        ? input.mediaSources?.[selectedMedia.id]
        : undefined
      return `<article class="shot shot-${index}" data-hf-id="shot-${escapeAttribute(item.shot.id)}">
  ${mediaSource ? renderMedia(selectedMedia?.kind === 'video' ? 'video' : 'image', mediaSource, selectedMedia?.label ?? item.shot.title, item.shot.id, item.start, shotDuration) : ''}
  <div class="ambient" aria-hidden="true"></div>
  <div class="frame">
    <div class="meta"><span>${String(index + 1).padStart(2, '0')}</span><span>${escapeHtml(item.sceneTitle)}</span></div>
    <div class="copy">
      <p class="location">${escapeHtml(item.sceneLocation || input.production.visualStyle)}</p>
      <h2>${escapeHtml(item.shot.title)}</h2>
      <p class="composition">${escapeHtml(item.shot.composition)}</p>
      <p class="action">${escapeHtml(item.shot.action)}</p>
      ${item.shot.dialogue ? `<blockquote>“${escapeHtml(item.shot.dialogue)}”</blockquote>` : ''}
    </div>
    <div class="camera"><span>CAMERA</span>${escapeHtml(item.shot.camera)}</div>
    <div class="progress"><i></i></div>
  </div>
</article>
<style>
  .shot-${index}{--accent:${accent};animation:shot-${index} ${duration}s linear both}
  .shot-${index} .ambient{animation:drift-${index} ${duration}s ease-in-out both}
  @keyframes shot-${index}{${keyframes}}
  @keyframes drift-${index}{0%{transform:translate3d(-6%,-4%,0) scale(1.02)}100%{transform:translate3d(6%,4%,0) scale(1.18)}}
</style>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#070b16}
    [data-composition-id]{position:relative;width:${width}px;height:${height}px;overflow:hidden;color:#f8fafc;background:#070b16;font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif}
    .shot{position:absolute;inset:0;opacity:0;pointer-events:none;background:radial-gradient(circle at 85% 15%,color-mix(in srgb,var(--accent) 52%,transparent),transparent 36%),linear-gradient(145deg,#080d1b 0%,#111936 52%,#080d1b 100%)}
    .visual{position:absolute;inset:0;overflow:hidden;background:#070b16}.visual img,.visual video{width:100%;height:100%;object-fit:cover;display:block;transform:scale(1.025);animation:media-drift ${duration}s ease-in-out both}.visual:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,7,18,.12) 0%,rgba(3,7,18,.05) 42%,rgba(3,7,18,.78) 100%),linear-gradient(90deg,rgba(3,7,18,.3),transparent 48%)}
    .ambient{position:absolute;width:75%;aspect-ratio:1;border-radius:42%;right:-18%;top:-12%;background:linear-gradient(135deg,var(--accent),#7c3aed 55%,#f97316);filter:blur(${landscape ? 60 : 80}px);opacity:.48}
    .visual~.ambient{opacity:.12}.frame{position:absolute;inset:${landscape ? 48 : 58}px;border:1px solid rgba(255,255,255,.24);border-radius:32px;padding:${landscape ? 46 : 54}px;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(155deg,rgba(15,23,42,.05),rgba(15,23,42,.18));box-shadow:0 30px 90px rgba(0,0,0,.18)}
    .meta{display:flex;justify-content:space-between;gap:24px;font-size:${landscape ? 18 : 22}px;letter-spacing:.16em;text-transform:uppercase;color:#cbd5e1}.meta span:first-child{color:var(--accent);font-weight:800}
    .copy{max-width:${landscape ? 780 : 570}px;margin-top:auto;padding:28px;border-radius:24px;background:linear-gradient(145deg,rgba(2,6,23,.24),rgba(2,6,23,.72));backdrop-filter:blur(6px)}.location{margin:0 0 12px;color:var(--accent);font-size:${landscape ? 18 : 22}px;letter-spacing:.12em;text-transform:uppercase}
    h2{margin:0;font-size:${titleSize}px;line-height:1.03;letter-spacing:-.04em}.composition{display:none}.action{margin:14px 0 0;font-size:${bodySize - 3}px;line-height:1.5;color:#e2e8f0}
    blockquote{margin:26px 0 0;padding:18px 22px;border-left:5px solid var(--accent);background:rgba(255,255,255,.07);font-size:${bodySize}px;line-height:1.45}
    .camera{display:flex;gap:18px;align-items:center;font-size:${landscape ? 18 : 21}px;color:#cbd5e1}.camera span{font-size:13px;letter-spacing:.16em;color:var(--accent);font-weight:800}
    .progress{position:absolute;left:0;right:0;bottom:0;height:7px;background:rgba(255,255,255,.08);overflow:hidden}.progress i{display:block;width:100%;height:100%;background:var(--accent);transform-origin:left;animation:progress ${duration}s linear both}
    @keyframes progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}@keyframes media-drift{0%{transform:scale(1.025) translate3d(0,0,0)}100%{transform:scale(1.12) translate3d(-1.5%,-1%,0)}}
  </style>
</head>
<body>
  <main data-composition-id="story-studio" data-width="${width}" data-height="${height}" data-duration="${duration}" data-no-timeline>
    ${shotMarkup}
  </main>
</body>
</html>`
}

function renderMedia(
  kind: 'image' | 'video',
  source: string,
  label: string,
  shotId: string,
  start: number,
  duration: number
) {
  if (kind === 'video') {
    return `<div class="visual"><video id="media-${escapeAttribute(shotId)}" src="${escapeAttribute(source)}" aria-label="${escapeAttribute(label)}" data-start="${start}" data-duration="${duration}" data-media-start="0" data-track-index="0" muted playsinline preload="auto"></video></div>`
  }
  return `<div class="visual"><img src="${escapeAttribute(source)}" alt="${escapeAttribute(label)}"></div>`
}

export function totalProductionDuration(production: StoryProductionDocument) {
  return production.scenes.reduce(
    (total, scene) =>
      total + scene.shots.reduce((sceneTotal, shot) => sceneTotal + shot.durationSeconds, 0),
    0
  )
}

function flattenShots(production: StoryProductionDocument): FlatShot[] {
  let cursor = 0
  return [...production.scenes]
    .sort((left, right) => left.order - right.order)
    .flatMap((scene) =>
      scene.shots.map((shot) => {
        const start = cursor
        cursor += shot.durationSeconds
        return {
          sceneTitle: scene.title,
          sceneSummary: scene.summary,
          sceneLocation: [scene.location, scene.timeOfDay].filter(Boolean).join(' · '),
          shot,
          start,
          end: cursor
        }
      })
    )
}

function globalKeyframeWindow(start: number, end: number, totalDuration: number) {
  const shotDuration = end - start
  const fade = Math.min(1.2, shotDuration * 0.18)
  const percent = (seconds: number) =>
    ((seconds / totalDuration) * 100).toFixed(4)
  return [
    `0%,${percent(start)}%{opacity:0;transform:scale(1.025)}`,
    `${percent(start + fade)}%,${percent(end - fade)}%{opacity:1;transform:scale(1)}`,
    `${percent(end)}%,100%{opacity:0;transform:scale(.99)}`
  ].join('')
}

function palette(index: number) {
  return ['#22d3ee', '#a78bfa', '#fb7185', '#fbbf24', '#34d399'][index % 5]
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character
  )
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/\s+/g, '-')
}

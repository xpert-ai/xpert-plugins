import type { MotionJsonObject, MotionVideoComposition, MotionVideoLayer, MotionVideoScene } from './types.js'
import { MOTION_KEYFRAME_PROPS, type MotionKeyframeProp } from './html-motion.js'

export type MotionTrackPoint = {
  t?: number
  v?: number
  ease?: string
}

export type MotionTrackMap = Partial<Record<MotionKeyframeProp | 'offset', MotionTrackPoint[]>>

export type HtmlMotionEdit = {
  id: string
  verb: string
  trigger: string
  duration: number
  delay: number
  distance: number
  tracks: MotionTrackMap
}

export type HtmlTimelineItem = {
  id: string
  label: string
  verb: string
  trigger: string
  delay: number
  duration: number
}

export type HtmlEditableCandidate = {
  tagName: string
  text?: string | null
  className?: string | null
  alt?: string | null
  width?: number
  height?: number
  index?: number
}

export type HtmlEditableComponent = {
  id: string
  label: string
  element: Element
}

export type HtmlTimelineLayoutItem = HtmlTimelineItem & {
  leftPct: number
  widthPct: number
  startsEarly: boolean
}

export type HtmlTimelineLayout = {
  duration: number
  items: HtmlTimelineLayoutItem[]
  earlyLoadCount: number
  restraintWarning: string | null
}

export type VideoLayerType = NonNullable<MotionVideoLayer['type']>
export type MotionTemplateKey =
  | 'fade-in'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in'
  | 'rotate-in'
  | 'pop'
  | 'bounce-in'
  | 'pulse'
  | 'float'
  | 'wobble'
  | 'shake'
  | 'heartbeat'
  | 'fade-out'
  | 'zoom-out'

export type LayerBounds = {
  x: number
  y: number
  w: number
  h: number
  rotate: number
}

export const VIDEO_LAYER_TYPES: VideoLayerType[] = ['text', 'rect', 'ellipse', 'image', 'video']
export const VIDEO_TRACK_PROPS = ['opacity', 'x', 'y', 'scale', 'rotate', 'blur', 'offset'] as const
export const UPSTREAM_HTML_EDITABLE_SELECTOR = 'h1,h2,h3,p,button,a.btn,a.button,[class*="btn"],[class*="button"],[class*="card"],img,[data-ma-anim],[data-ma-kf]'
export const UPSTREAM_HTML_MAX_COMPONENTS = 14

export const MOTION_TEMPLATE_GROUPS: Array<{ group: string; templates: MotionTemplateKey[] }> = [
  { group: 'Entrance', templates: ['fade-in', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom-in', 'rotate-in', 'pop', 'bounce-in'] },
  { group: 'Emphasis', templates: ['pulse', 'float', 'wobble'] },
  { group: 'Attention', templates: ['shake', 'heartbeat'] },
  { group: 'Exit', templates: ['fade-out', 'zoom-out'] }
]

export function normalizeHtmlTracks(value: MotionJsonObject | MotionTrackMap | null | undefined): MotionTrackMap {
  const tracks: MotionTrackMap = {}
  const source = value ?? {}
  for (const prop of MOTION_KEYFRAME_PROPS) {
    const points = source[prop]
    if (Array.isArray(points)) {
      const normalized = normalizePoints(points)
      if (normalized.length > 0) {
        tracks[prop] = normalized
      }
    }
  }
  return tracks
}

export function htmlTimelineItems(html: string): HtmlTimelineItem[] {
  const items: HtmlTimelineItem[] = []
  const pattern = /<([a-zA-Z0-9-]+)\b([^>]*(?:data-ma-anim|data-ma-kf)[^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9-]+)\b([^>]*(?:data-ma-anim|data-ma-kf)[^>]*)\/?>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    const tag = match[1] || match[4] || 'element'
    const attrs = match[2] || match[5] || ''
    const verb = readAttribute(attrs, 'data-ma-anim')
    const keyframe = readAttribute(attrs, 'data-ma-kf')
    if (!verb && !keyframe) {
      continue
    }
    const id = readAttribute(attrs, 'data-ma-id') || `${tag}-${items.length + 1}`
    const text = stripTags(match[3] || '').trim()
    items.push({
      id,
      label: text ? `${tag} · ${text.slice(0, 32)}` : tag,
      verb: verb || keyframe || 'custom',
      trigger: readAttribute(attrs, 'data-ma-trigger') || 'load',
      delay: numberValue(readAttribute(attrs, 'data-ma-delay'), 0),
      duration: numberValue(readAttribute(attrs, 'data-ma-dur'), 520)
    })
  }
  return items
}

export function friendlyHtmlComponentName(candidate: HtmlEditableCandidate): string {
  const tag = candidate.tagName.toLowerCase()
  const text = (candidate.text || '').replace(/\s+/g, ' ').trim()
  const className = candidate.className || ''
  const index = Math.max(0, Number(candidate.index || 0))
  if (tag === 'img') {
    return `Image${candidate.alt ? ` · ${candidate.alt.slice(0, 36)}` : ` ${index + 1}`}`
  }
  if (tag === 'button' || tag === 'a' || /\b(btn|button)\b/i.test(className)) {
    return `Button${text ? ` · ${text.slice(0, 36)}` : ` ${index + 1}`}`
  }
  if (/\b(card|tile|panel)\b/i.test(className)) {
    return `Card${text ? ` · ${text.slice(0, 36)}` : ` ${index + 1}`}`
  }
  if (/^h[1-3]$/.test(tag)) {
    return `Headline${text ? ` · ${text.slice(0, 42)}` : ` ${index + 1}`}`
  }
  if (tag === 'p') {
    return `Text${text ? ` · ${text.slice(0, 42)}` : ` ${index + 1}`}`
  }
  return `${tag}${text ? ` · ${text.slice(0, 42)}` : ` ${index + 1}`}`
}

export function shouldKeepHtmlEditableCandidate(candidate: HtmlEditableCandidate): boolean {
  const width = candidate.width ?? 999
  const height = candidate.height ?? 999
  return width >= 24 && height >= 12
}

export function detectHtmlEditableComponents(doc: Document): { changed: boolean; components: HtmlEditableComponent[] } {
  let changed = false
  const candidates = Array.from(doc.querySelectorAll(UPSTREAM_HTML_EDITABLE_SELECTOR)) as HTMLElement[]
  const kept: HTMLElement[] = []

  for (const element of candidates) {
    if (kept.length >= UPSTREAM_HTML_MAX_COMPONENTS) {
      break
    }
    const rect = element.getBoundingClientRect()
    if (!shouldKeepHtmlEditableCandidate({ tagName: element.tagName, width: rect.width, height: rect.height })) {
      continue
    }
    if (kept.some((keptElement) => keptElement !== element && keptElement.contains(element))) {
      continue
    }
    if (!element.getAttribute('data-ma-id')) {
      element.setAttribute('data-ma-id', `c${kept.length}`)
      changed = true
    }
    kept.push(element)
  }

  return {
    changed,
    components: kept.map((element, index) => ({
      id: element.getAttribute('data-ma-id') || `c${index}`,
      label: friendlyHtmlComponentName({
        tagName: element.tagName,
        text: element.textContent,
        className: element.getAttribute('class'),
        alt: element.getAttribute('alt'),
        index
      }),
      element
    }))
  }
}

export function computeHtmlTimelineLayout(items: HtmlTimelineItem[], minimumDuration = 1200): HtmlTimelineLayout {
  const duration = Math.max(minimumDuration, ...items.map((item) => Math.max(0, item.delay) + Math.max(80, item.duration)))
  const earlyLoadCount = items.filter((item) => item.trigger === 'load' && item.delay < 150).length
  return {
    duration,
    earlyLoadCount,
    restraintWarning: earlyLoadCount > 4 ? 'More than four load motions start early; consider delaying or changing some triggers.' : null,
    items: items.map((item) => ({
      ...item,
      leftPct: clamp((Math.max(0, item.delay) / duration) * 100, 0, 100),
      widthPct: clamp((Math.max(80, item.duration) / duration) * 100, 2, 100),
      startsEarly: item.trigger === 'load' && item.delay < 150
    }))
  }
}

export function createDefaultHtmlTracks(): MotionTrackMap {
  return {
    opacity: [
      { t: 0, v: 0 },
      { t: 0.5, v: 1 }
    ],
    x: [
      { t: 0, v: 0 },
      { t: 0.5, v: 0 }
    ],
    y: [
      { t: 0, v: 24 },
      { t: 0.5, v: 0, ease: 'ease-out' }
    ],
    scale: [
      { t: 0, v: 0.96 },
      { t: 0.5, v: 1 }
    ],
    rotate: [
      { t: 0, v: 0 },
      { t: 0.5, v: 0 }
    ],
    blur: [
      { t: 0, v: 8 },
      { t: 0.5, v: 0 }
    ]
  }
}

export function getCompositionSize(composition: MotionVideoComposition) {
  return {
    w: positiveNumber(composition.w, 1280),
    h: positiveNumber(composition.h, 720),
    fps: positiveNumber(composition.fps, 30)
  }
}

export function getSceneList(composition: MotionVideoComposition): MotionVideoScene[] {
  return Array.isArray(composition.scenes) && composition.scenes.length > 0 ? composition.scenes : []
}

export function resolveSceneAtTime(composition: MotionVideoComposition, time: number) {
  const scenes = getSceneList(composition)
  if (scenes.length === 0) {
    return { scene: null as MotionVideoScene | null, sceneIndex: -1, sceneStart: 0, sceneDuration: compositionDuration(composition), localTime: time }
  }
  let cursor = 0
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index]
    const duration = positiveNumber(scene.duration, 3)
    if (time <= cursor + duration || index === scenes.length - 1) {
      return { scene, sceneIndex: index, sceneStart: cursor, sceneDuration: duration, localTime: Math.max(0, time - cursor) }
    }
    cursor += duration
  }
  return { scene: null, sceneIndex: -1, sceneStart: 0, sceneDuration: compositionDuration(composition), localTime: time }
}

export function compositionDuration(composition: MotionVideoComposition) {
  const scenes = getSceneList(composition)
  if (scenes.length > 0) {
    return scenes.reduce((sum, scene) => sum + positiveNumber(scene.duration, 3), 0)
  }
  const layerDuration = getLayerList(composition, -1).reduce((max, layer) => Math.max(max, numberValue(layer.end, numberValue(layer.start, 0) + 3)), 0)
  return positiveNumber(composition.duration, layerDuration || 5)
}

export function getLayerList(composition: MotionVideoComposition, sceneIndex: number): MotionVideoLayer[] {
  const scenes = getSceneList(composition)
  if (sceneIndex >= 0 && scenes[sceneIndex]) {
    return scenes[sceneIndex].layers || []
  }
  return composition.layers || []
}

export function findLayer(composition: MotionVideoComposition, layerId: string, sceneIndex?: number): MotionVideoLayer | null {
  const layers =
    sceneIndex !== undefined
      ? [...(composition.shared || []), ...getLayerList(composition, sceneIndex)]
      : [...(composition.layers || []), ...(composition.shared || []), ...getSceneList(composition).flatMap((scene) => scene.layers || [])]
  return layers.find((layer) => layer.id === layerId) ?? null
}

export function createVideoLayer(type: VideoLayerType, composition: MotionVideoComposition, index = 0): MotionVideoLayer {
  const { w, h } = getCompositionSize(composition)
  const id = `${type}-${Date.now().toString(36)}-${index}`
  const base: MotionVideoLayer = {
    id,
    type,
    start: 0,
    end: Math.min(4, compositionDuration(composition)),
    x: w / 2,
    y: h / 2,
    opacity: 1,
    scale: 1,
    rotate: 0,
    tracks: {
      opacity: [
        { t: 0, v: 0 },
        { t: 0.45, v: 1, ease: 'ease-out' }
      ]
    }
  }
  if (type === 'text') {
    return { ...base, text: 'New text', w: 720, h: 96, size: 64, weight: 800, color: '#ffffff', kinetic: { type: 'word-rise', stagger: 0.04 } }
  }
  if (type === 'rect') {
    return { ...base, w: 360, h: 180, color: '#8b5cf6', radius: 28 }
  }
  if (type === 'ellipse') {
    return { ...base, w: 220, h: 220, color: '#22c55e' }
  }
  return { ...base, w: 480, h: 270, color: '#e2e8f0' }
}

export function addLayerToComposition(composition: MotionVideoComposition, sceneIndex: number, layer: MotionVideoLayer): MotionVideoComposition {
  const scenes = getSceneList(composition)
  if (sceneIndex >= 0 && scenes[sceneIndex]) {
    return {
      ...composition,
      scenes: scenes.map((scene, index) => (index === sceneIndex ? { ...scene, layers: [...(scene.layers || []), layer] } : scene))
    }
  }
  return { ...composition, layers: [...(composition.layers || []), layer] }
}

export function updateLayerInComposition(
  composition: MotionVideoComposition,
  sceneIndex: number,
  layerId: string,
  updater: (layer: MotionVideoLayer) => MotionVideoLayer
): MotionVideoComposition {
  const update = (layers: MotionVideoLayer[] | undefined) => (layers || []).map((layer) => (layer.id === layerId ? updater(layer) : layer))
  const scenes = getSceneList(composition)
  const sharedUpdated = (composition.shared || []).some((layer) => layer.id === layerId)
  if (sharedUpdated) {
    return { ...composition, shared: update(composition.shared) }
  }
  if (sceneIndex >= 0 && scenes[sceneIndex]) {
    return { ...composition, scenes: scenes.map((scene, index) => (index === sceneIndex ? { ...scene, layers: update(scene.layers) } : scene)) }
  }
  return { ...composition, layers: update(composition.layers) }
}

export function removeLayerFromComposition(composition: MotionVideoComposition, sceneIndex: number, layerId: string): MotionVideoComposition {
  const drop = (layers: MotionVideoLayer[] | undefined) => (layers || []).filter((layer) => layer.id !== layerId)
  const scenes = getSceneList(composition)
  if ((composition.shared || []).some((layer) => layer.id === layerId)) {
    return { ...composition, shared: drop(composition.shared) }
  }
  if (sceneIndex >= 0 && scenes[sceneIndex]) {
    return { ...composition, scenes: scenes.map((scene, index) => (index === sceneIndex ? { ...scene, layers: drop(scene.layers) } : scene)) }
  }
  return { ...composition, layers: drop(composition.layers) }
}

export function moveLayerInComposition(composition: MotionVideoComposition, sceneIndex: number, layerId: string, direction: -1 | 1): MotionVideoComposition {
  const reorder = (layers: MotionVideoLayer[] | undefined) => {
    const next = [...(layers || [])]
    const index = next.findIndex((layer) => layer.id === layerId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= next.length) {
      return next
    }
    const [layer] = next.splice(index, 1)
    next.splice(target, 0, layer)
    return next
  }
  const scenes = getSceneList(composition)
  if (sceneIndex >= 0 && scenes[sceneIndex]) {
    return { ...composition, scenes: scenes.map((scene, index) => (index === sceneIndex ? { ...scene, layers: reorder(scene.layers) } : scene)) }
  }
  return { ...composition, layers: reorder(composition.layers) }
}

export function moveLayerAtTime(layer: MotionVideoLayer, dx: number, dy: number, time: number): MotionVideoLayer {
  const nextX = numberValue(layer.x, 0) + dx
  const nextY = numberValue(layer.y, 0) + dy
  return {
    ...layer,
    x: nextX,
    y: nextY,
    tracks: {
      ...(layer.tracks || {}),
      x: upsertTrackPoint(layer.tracks?.x, time, nextX),
      y: upsertTrackPoint(layer.tracks?.y, time, nextY)
    }
  }
}

export function setLayerTrackPoint(layer: MotionVideoLayer, prop: (typeof VIDEO_TRACK_PROPS)[number], time: number, value: number): MotionVideoLayer {
  return {
    ...layer,
    tracks: {
      ...(layer.tracks || {}),
      [prop]: upsertTrackPoint(layer.tracks?.[prop], time, value)
    }
  }
}

export function applyMotionTemplate(layer: MotionVideoLayer, template: MotionTemplateKey): MotionVideoLayer {
  const x = numberValue(layer.x, 0)
  const y = numberValue(layer.y, 0)
  const tracks: MotionTrackMap = { ...(layer.tracks || {}) }
  if (template === 'fade-in') tracks.opacity = [{ t: 0, v: 0 }, { t: 0.5, v: 1, ease: 'ease-out' }]
  if (template === 'slide-up') Object.assign(tracks, { opacity: [{ t: 0, v: 0 }, { t: 0.55, v: 1 }], y: [{ t: 0, v: y + 56 }, { t: 0.55, v: y, ease: 'ease-out' }] })
  if (template === 'slide-down') Object.assign(tracks, { opacity: [{ t: 0, v: 0 }, { t: 0.55, v: 1 }], y: [{ t: 0, v: y - 56 }, { t: 0.55, v: y, ease: 'ease-out' }] })
  if (template === 'slide-left') Object.assign(tracks, { opacity: [{ t: 0, v: 0 }, { t: 0.55, v: 1 }], x: [{ t: 0, v: x + 72 }, { t: 0.55, v: x, ease: 'ease-out' }] })
  if (template === 'slide-right') Object.assign(tracks, { opacity: [{ t: 0, v: 0 }, { t: 0.55, v: 1 }], x: [{ t: 0, v: x - 72 }, { t: 0.55, v: x, ease: 'ease-out' }] })
  if (template === 'zoom-in') Object.assign(tracks, { opacity: [{ t: 0, v: 0 }, { t: 0.5, v: 1 }], scale: [{ t: 0, v: 0.82 }, { t: 0.5, v: 1, ease: 'ease-out' }] })
  if (template === 'rotate-in') Object.assign(tracks, { opacity: [{ t: 0, v: 0 }, { t: 0.55, v: 1 }], rotate: [{ t: 0, v: -10 }, { t: 0.55, v: 0, ease: 'ease-out' }] })
  if (template === 'pop' || template === 'bounce-in') Object.assign(tracks, { scale: [{ t: 0, v: 0.82 }, { t: 0.28, v: 1.08 }, { t: 0.48, v: 1 }] })
  if (template === 'pulse') tracks.scale = [{ t: 0, v: 1 }, { t: 0.35, v: 1.08 }, { t: 0.7, v: 1 }]
  if (template === 'float') tracks.y = [{ t: 0, v: y }, { t: 1, v: y - 22 }, { t: 2, v: y }]
  if (template === 'wobble') tracks.rotate = [{ t: 0, v: 0 }, { t: 0.18, v: -5 }, { t: 0.38, v: 4 }, { t: 0.6, v: 0 }]
  if (template === 'shake') tracks.x = [{ t: 0, v: x }, { t: 0.12, v: x - 14 }, { t: 0.24, v: x + 14 }, { t: 0.36, v: x }]
  if (template === 'heartbeat') tracks.scale = [{ t: 0, v: 1 }, { t: 0.2, v: 1.12 }, { t: 0.36, v: 1 }, { t: 0.52, v: 1.08 }, { t: 0.7, v: 1 }]
  if (template === 'fade-out') tracks.opacity = [{ t: 0, v: 1 }, { t: 0.55, v: 0 }]
  if (template === 'zoom-out') Object.assign(tracks, { opacity: [{ t: 0, v: 1 }, { t: 0.55, v: 0 }], scale: [{ t: 0, v: 1 }, { t: 0.55, v: 0.84 }] })
  return { ...layer, tracks }
}

export function attachMotionPath(layer: MotionVideoLayer, points: Array<{ x: number; y: number }>, kind = 'line'): MotionVideoLayer {
  const safePoints = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)).slice(0, 80)
  return {
    ...layer,
    path: { kind, points: safePoints },
    tracks: {
      ...(layer.tracks || {}),
      offset: layer.tracks?.offset || [
        { t: 0, v: 0 },
        { t: Math.max(0.5, numberValue(layer.end, 3) - numberValue(layer.start, 0)), v: 1, ease: 'ease-out' }
      ]
    }
  }
}

export function layerBounds(layer: MotionVideoLayer): LayerBounds {
  const type = layer.type || 'text'
  const fallbackW = type === 'text' ? 520 : type === 'ellipse' ? 220 : 360
  const fallbackH = type === 'text' ? positiveNumber(layer.size, 64) * 1.4 : type === 'ellipse' ? 220 : 180
  return {
    x: numberValue(layer.x, 0),
    y: numberValue(layer.y, 0),
    w: positiveNumber(layer.w, fallbackW),
    h: positiveNumber(layer.h, fallbackH),
    rotate: numberValue(layer.rotate, 0)
  }
}

export function hitTestLayer(layers: MotionVideoLayer[], x: number, y: number): MotionVideoLayer | null {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]
    const bounds = layerBounds(layer)
    if (x >= bounds.x - bounds.w / 2 && x <= bounds.x + bounds.w / 2 && y >= bounds.y - bounds.h / 2 && y <= bounds.y + bounds.h / 2) {
      return layer
    }
  }
  return null
}

export function addSceneToComposition(composition: MotionVideoComposition): MotionVideoComposition {
  const scenes = getSceneList(composition)
  const { w, h } = getCompositionSize(composition)
  const sceneNumber = scenes.length + 1
  return {
    ...composition,
    layers: scenes.length ? composition.layers : undefined,
    duration: undefined,
    scenes: [
      ...scenes,
      {
        id: `scene-${sceneNumber}`,
        name: `Scene ${sceneNumber}`,
        duration: 4,
        transition: sceneNumber % 2 === 0 ? 'push' : 'dissolve',
        bg: sceneNumber % 2 === 0 ? '#111827' : '#0f766e',
        layers: [
          {
            id: `scene-${sceneNumber}-title`,
            type: 'text',
            text: `Scene ${sceneNumber}`,
            x: w / 2,
            y: h / 2,
            size: 64,
            weight: 800,
            color: '#ffffff',
            tracks: createDefaultHtmlTracks()
          }
        ]
      }
    ]
  }
}

export function setSceneDuration(composition: MotionVideoComposition, sceneIndex: number, duration: number): MotionVideoComposition {
  const scenes = getSceneList(composition)
  if (!scenes[sceneIndex]) {
    return composition
  }
  return { ...composition, scenes: scenes.map((scene, index) => (index === sceneIndex ? { ...scene, duration: clamp(duration, 0.5, 30) } : scene)) }
}

export function setSceneTransition(composition: MotionVideoComposition, sceneIndex: number, transition: string): MotionVideoComposition {
  const scenes = getSceneList(composition)
  if (!scenes[sceneIndex]) {
    return composition
  }
  return { ...composition, scenes: scenes.map((scene, index) => (index === sceneIndex ? { ...scene, transition } : scene)) }
}

function upsertTrackPoint(points: MotionTrackPoint[] | undefined, time: number, value: number): MotionTrackPoint[] {
  const safeTime = Math.max(0, Math.round(time * 100) / 100)
  const next = normalizePoints(points || [])
  const existing = next.find((point) => Math.abs(numberValue(point.t, 0) - safeTime) < 0.02)
  if (existing) {
    existing.v = value
  } else {
    next.push({ t: safeTime, v: value })
  }
  return next.sort((a, b) => numberValue(a.t, 0) - numberValue(b.t, 0))
}

function normalizePoints(value: unknown[]): MotionTrackPoint[] {
  return value
    .filter((point): point is MotionTrackPoint => typeof point === 'object' && point !== null)
    .map((point) => ({
      t: Math.max(0, numberValue(point.t, 0)),
      v: numberValue(point.v, 0),
      ...(typeof point.ease === 'string' && point.ease.trim() ? { ease: point.ease.trim() } : {})
    }))
    .sort((a, b) => numberValue(a.t, 0) - numberValue(b.t, 0))
}

function readAttribute(attrs: string, name: string) {
  const pattern = new RegExp(`${name}=(["'])(.*?)\\1`, 'i')
  return pattern.exec(attrs)?.[2]
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
}

function numberValue(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function positiveNumber(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}

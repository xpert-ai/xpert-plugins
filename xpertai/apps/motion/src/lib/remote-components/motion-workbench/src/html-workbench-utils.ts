import {
  createDefaultHtmlTracks,
  detectHtmlEditableComponents,
  friendlyHtmlComponentName
} from '../../../workbench-model'
import {
  customKeyframeName,
  injectCustomMotionKeyframes,
  normalizeMotionKeyframeTracks,
  type MotionKeyframePoint,
  type MotionKeyframeTracks
} from '../../../html-motion'
import type { MotionJsonObject } from '../../../types'
import type { HtmlControls } from './motion-types'

export function ensureIframeEditable(doc: Document) {
  const style = doc.getElementById('ma-workbench-edit-style') || doc.createElement('style')
  style.id = 'ma-workbench-edit-style'
  style.textContent = `
    .ma-editable{cursor:pointer}
    .ma-selected{outline:3px solid #8b5cf6!important;outline-offset:4px!important}
    .ma-hover{outline:2px dashed rgba(139,92,246,.55)!important;outline-offset:3px!important}
  `
  if (!style.parentElement) {
    doc.head?.appendChild(style)
  }
  const detection = detectHtmlEditableComponents(doc)
  detection.components.forEach(({ element }) => {
    element.classList.add('ma-editable')
  })
  return detection
}

export function wireIframeSelection(doc: Document, onSelect: (element: Element) => void) {
  const elements = Array.from(doc.querySelectorAll('.ma-editable'))
  elements.forEach((element) => {
    element.addEventListener('mouseenter', () => element.classList.add('ma-hover'))
    element.addEventListener('mouseleave', () => element.classList.remove('ma-hover'))
    element.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onSelect(element)
    })
  })
}

export function outlineIframeSelection(doc: Document, selectedId: string) {
  Array.from(doc.querySelectorAll('.ma-selected')).forEach((element) => element.classList.remove('ma-selected'))
  if (!selectedId) {
    return
  }
  const selected = doc.querySelector(`[data-ma-id="${cssEscape(selectedId)}"]`)
  selected?.classList.add('ma-selected')
}

export function seekIframeMotion(doc: Document, timeMs: number, options?: { selectedId?: string; controls?: HtmlControls }) {
  const motionElements = Array.from(doc.querySelectorAll<HTMLElement>('[data-ma-anim],[data-ma-kf]'))
  const selectedElement = options?.selectedId ? doc.querySelector<HTMLElement>(`[data-ma-id="${cssEscape(options.selectedId)}"]`) : null
  const fallbackElements = motionElements.length > 0
    ? selectedElement && !motionElements.includes(selectedElement)
      ? [selectedElement]
      : []
    : selectedElement
      ? [selectedElement]
      : Array.from(doc.querySelectorAll<HTMLElement>('.ma-editable')).slice(0, 6)
  const elements = [...motionElements, ...fallbackElements]
  for (const element of elements) {
    const source = motionSourceForElement(element, options?.controls)
    const progress = clampNumber((timeMs - source.delay) / source.duration, 0, 1)
    const values = hasTracks(source.tracks) ? valuesFromTracks(source.tracks, progress) : valuesFromVerb(source.verb, progress, source.distance)
    applyScrubValues(element, values)
  }
}

export function applyHtmlSelectionMotion(html: string, selectedId: string, controls: HtmlControls) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const element = doc.querySelector(`[data-ma-id="${cssEscape(selectedId)}"]`)
  if (!element) {
    throw new Error('Selected element was not found in the HTML draft.')
  }
  const tracks = normalizeMotionKeyframeTracks(safeJsonObject(controls.tracksJson) ?? createDefaultHtmlTracks())
  const keyframeName = customKeyframeName(selectedId)
  element.setAttribute('data-ma-id', selectedId)
  element.setAttribute('data-ma-anim', controls.verb)
  element.setAttribute('data-ma-kf', keyframeName)
  element.setAttribute('data-ma-trigger', controls.trigger)
  element.setAttribute('data-ma-dur', String(clampNumber(controls.duration, 80, 4000)))
  element.setAttribute('data-ma-delay', String(clampNumber(controls.delay, 0, 8000)))
  element.setAttribute('data-ma-dist', String(clampNumber(controls.distance, -400, 400)))
  element.setAttribute('data-ma-tracks', JSON.stringify(tracks))
  const serialized = serializeHtmlDocument(doc)
  return injectCustomMotionKeyframes(serialized, keyframeName, tracks)
}

export function serializeHtmlDocument(doc: Document) {
  return `<!doctype html>\n${doc.documentElement.outerHTML}`
}

export function labelForElement(element: Element) {
  return friendlyHtmlComponentName({
    tagName: element.tagName,
    text: element.textContent,
    className: element.getAttribute('class'),
    alt: element.getAttribute('alt')
  })
}

export function safeJsonObject(value: string): MotionJsonObject | null {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as MotionJsonObject) : null
  } catch {
    return null
  }
}

export function lastTrackValue(points: Array<{ v?: number }> | undefined, prop: string) {
  if (points && points.length > 0) {
    return Number(points[points.length - 1].v ?? 0)
  }
  if (prop === 'opacity' || prop === 'scale') {
    return 1
  }
  return 0
}

export function formatTrackValue(prop: string, value: number) {
  if (prop === 'opacity' || prop === 'scale') {
    return value.toFixed(2)
  }
  if (prop === 'rotate') {
    return `${Math.round(value)}°`
  }
  return `${Math.round(value)}px`
}

export function cssEscape(value: string) {
  return value.replace(/["\\]/g, '\\$&')
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

type ScrubValues = {
  opacity?: number
  x: number
  y: number
  scale: number
  rotate: number
  blur: number
}

function hasTracks(tracks: MotionKeyframeTracks) {
  return Object.values(tracks).some((points) => Array.isArray(points) && points.length > 0)
}

function motionSourceForElement(element: HTMLElement, controls?: HtmlControls) {
  const controlsTracks = controls ? safeJsonObject(controls.tracksJson) : null
  const elementTracks = safeJsonObject(element.getAttribute('data-ma-tracks') || '')
  return {
    verb: element.getAttribute('data-ma-anim') || controls?.verb || 'fade',
    duration: clampNumber(Number(element.getAttribute('data-ma-dur') || controls?.duration || 520), 80, 4000),
    delay: clampNumber(Number(element.getAttribute('data-ma-delay') || controls?.delay || 0), 0, 8000),
    distance: clampNumber(Number(element.getAttribute('data-ma-dist') || controls?.distance || 24), -400, 400),
    tracks: normalizeMotionKeyframeTracks(elementTracks ?? controlsTracks ?? createDefaultHtmlTracks())
  }
}

function valuesFromTracks(tracks: MotionKeyframeTracks, progress: number): ScrubValues {
  return {
    opacity: sampleTrack(tracks.opacity, progress, undefined),
    x: sampleTrack(tracks.x, progress, 0) ?? 0,
    y: sampleTrack(tracks.y, progress, 0) ?? 0,
    scale: sampleTrack(tracks.scale, progress, 1) ?? 1,
    rotate: sampleTrack(tracks.rotate, progress, 0) ?? 0,
    blur: sampleTrack(tracks.blur, progress, 0) ?? 0
  }
}

function valuesFromVerb(verb: string, progress: number, distance: number): ScrubValues {
  const p = clampNumber(progress, 0, 1)
  const rest = 1 - p
  switch (verb) {
    case 'slide-up':
      return { opacity: p, x: 0, y: distance * rest, scale: 1, rotate: 0, blur: 0 }
    case 'slide-down':
      return { opacity: p, x: 0, y: -distance * rest, scale: 1, rotate: 0, blur: 0 }
    case 'slide-left':
      return { opacity: p, x: -distance * rest, y: 0, scale: 1, rotate: 0, blur: 0 }
    case 'slide-right':
      return { opacity: p, x: distance * rest, y: 0, scale: 1, rotate: 0, blur: 0 }
    case 'zoom':
      return { opacity: p, x: 0, y: 0, scale: 0.9 + 0.1 * p, rotate: 0, blur: 0 }
    case 'rotate':
      return { opacity: p, x: 0, y: 0, scale: 0.96 + 0.04 * p, rotate: -8 * rest, blur: 0 }
    case 'blur':
      return { opacity: p, x: 0, y: 0, scale: 1, rotate: 0, blur: 10 * rest }
    case 'pop': {
      const lift = p < 0.45 ? p / 0.45 : 1 - (p - 0.45) / 0.55
      return { opacity: 1, x: 0, y: -Math.max(0, lift) * Math.min(Math.abs(distance), 24), scale: 1 + Math.max(0, lift) * 0.06, rotate: 0, blur: 0 }
    }
    case 'pulse':
      return { opacity: 1, x: 0, y: 0, scale: 1 + Math.sin(Math.PI * p) * 0.08, rotate: 0, blur: 0 }
    case 'shake':
      return { opacity: 1, x: Math.sin(Math.PI * p * 8) * 6 * rest, y: 0, scale: 1, rotate: 0, blur: 0 }
    case 'wobble':
      return { opacity: 1, x: 0, y: 0, scale: 1, rotate: Math.sin(Math.PI * p * 6) * 4 * rest, blur: 0 }
    case 'sink':
      return { opacity: 1, x: 0, y: 0, scale: 1 - Math.sin(Math.PI * p) * 0.06, rotate: 0, blur: 0 }
    default:
      return { opacity: p, x: 0, y: 0, scale: 1, rotate: 0, blur: 0 }
  }
}

function applyScrubValues(element: HTMLElement, values: ScrubValues) {
  element.style.animation = 'none'
  element.style.animationPlayState = 'paused'
  if (values.opacity !== undefined) {
    element.style.opacity = String(round(values.opacity))
  }
  element.style.transform = `translate(${round(values.x)}px, ${round(values.y)}px) scale(${round(values.scale)}) rotate(${round(values.rotate)}deg)`
  element.style.filter = values.blur > 0 ? `blur(${round(values.blur)}px)` : 'blur(0)'
  element.style.willChange = 'opacity, transform, filter'
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

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

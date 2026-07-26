import { openComposition, type Composition, type ElementSnapshot } from '@hyperframes/sdk'
import hyperframesRuntimeSource from 'virtual:hyperframes-runtime'

export interface HyperframesEditableElement {
  id: string
  tag: string
  text: string | null
  start: number | null
  duration: number | null
  trackIndex: number | null
  sceneTitle: string | null
  classNames: string[]
  inlineStyles: Record<string, string>
  animationIds: string[]
}

export interface HyperframesInspection {
  html: string
  elementCount: number
  animationCount: number
  width: number | null
  height: number | null
  duration: number | null
  elements: HyperframesEditableElement[]
}

export interface HyperframesElementEdit {
  id: string
  text?: string
  start?: number
  duration?: number
  trackIndex?: number
  styles?: Record<string, string | null>
}

/**
 * Open and serialize through the public SDK so the persisted source follows the
 * same document model used by HyperFrames tooling. Server validation remains
 * the authoritative production-render boundary.
 */
export async function normalizeHyperframesHtml(html: string) {
  const composition = await openComposition(html)
  try {
    return composition.serialize()
  } finally {
    composition.dispose()
  }
}

/**
 * The Player normally fetches the core runtime from a CDN when a composition
 * has authored CSS timing but no GSAP timeline. Workbench previews must also
 * work in isolated/offline hosts, so inject the matching bundled runtime into
 * the ephemeral preview document only. Persisted SDK source stays compact.
 */
export function createHyperframesPreviewHtml(html: string) {
  if (html.includes('data-motion-hyperframes-runtime')) return html
  const runtime = hyperframesRuntimeSource.replace(/<\/script/gi, '<\\/script')
  const script = `<script data-motion-hyperframes-runtime>${runtime}</script>`
  if (/<\/head\s*>/i.test(html)) {
    // A function replacement is required because the minified runtime contains
    // replacement tokens such as "$&", which String.replace would expand.
    return html.replace(/<\/head\s*>/i, () => `${script}</head>`)
  }
  return `${script}${html}`
}

export async function inspectHyperframesHtml(html: string) {
  const composition = await openComposition(html)
  try {
    return inspectComposition(composition)
  } finally {
    composition.dispose()
  }
}

export async function editHyperframesElement(html: string, edit: HyperframesElementEdit) {
  const composition = await openComposition(html)
  try {
    const element = composition.getElement(edit.id)
    if (!element) throw new Error(`HyperFrames element "${edit.id}" no longer exists.`)
    composition.batch(() => {
      if (edit.text !== undefined) composition.setText(edit.id, edit.text)
      if (edit.start !== undefined || edit.duration !== undefined || edit.trackIndex !== undefined) {
        composition.setTiming(edit.id, {
          start: edit.start,
          duration: edit.duration,
          trackIndex: edit.trackIndex
        })
      }
      if (edit.styles && Object.keys(edit.styles).length > 0) composition.setStyle(edit.id, edit.styles)
    })
    return inspectComposition(composition)
  } finally {
    composition.dispose()
  }
}

function inspectComposition(composition: Composition): HyperframesInspection {
  const html = composition.serialize()
  const allElements = composition.getElements()
  const cssAnimationNames = new Set(
    Array.from(html.matchAll(/@keyframes\s+([a-z0-9_-]+)/gi), (match) => match[1]?.toLowerCase()).filter(
      (value): value is string => Boolean(value)
    )
  )
  return {
    html,
    elementCount: allElements.length,
    animationCount: composition.getAllAnimationIds().size + cssAnimationNames.size,
    width: readRootNumber(allElements, 'data-width'),
    height: readRootNumber(allElements, 'data-height'),
    duration: readRootNumber(allElements, 'data-duration'),
    elements: allElements.filter(isWorkbenchEditableElement).map(toEditableElement)
  }
}

function isWorkbenchEditableElement(element: ElementSnapshot) {
  if (element.attributes['data-composition-id']) return false
  if (element.attributes['data-scene-title'] || element.start !== null || element.duration !== null) return true
  if (element.text === null || !element.text.trim()) return false
  return !['html', 'head', 'meta', 'style', 'script', 'title', 'body', 'svg', 'polygon'].includes(element.tag)
}

function toEditableElement(element: ElementSnapshot): HyperframesEditableElement {
  return {
    id: element.scopedId,
    tag: element.tag,
    text: element.text,
    start: element.start,
    // SDK 0.7.63 still derives ElementSnapshot.duration from the legacy
    // data-end attribute. The composition contract and setTiming() use the
    // canonical authored data-duration attribute, so prefer that value.
    duration: readElementNumber(element, 'data-duration') ?? element.duration,
    trackIndex: element.trackIndex,
    sceneTitle: element.attributes['data-scene-title'] ?? null,
    classNames: [...element.classNames],
    inlineStyles: { ...element.inlineStyles },
    animationIds: [...element.animationIds]
  }
}

function readElementNumber(element: ElementSnapshot, attribute: string) {
  const raw = element.attributes[attribute]
  if (raw === undefined || raw === null || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function readRootNumber(elements: ElementSnapshot[], attribute: string) {
  const root = elements.find((element) => element.attributes['data-composition-id'])
  const value = Number(root?.attributes[attribute])
  return Number.isFinite(value) && value > 0 ? value : null
}

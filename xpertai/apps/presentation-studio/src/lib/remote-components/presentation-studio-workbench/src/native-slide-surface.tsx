import * as React from 'react'
import * as Y from 'yjs'
import {
  PRESENTATION_SYSTEM_IMAGE_ALT_PROP,
  PRESENTATION_SYSTEM_IMAGE_ASSET_PROP,
  PRESENTATION_SYSTEM_SLIDE_KIND_PROP,
  themePreviewSlideFromProps
} from '../../../presentation-theme-preview.contract'
import { collectNativeRuntimeStyleText, releaseNativeSlide, renderNativeSlide, type LoadedNativeRuntime } from './native-runtime'
import type { JsonObject, JsonValue, PresenceState } from './types'

type YValue = JsonValue | Y.Map<YValue> | Y.Array<YValue>
type TextMap = Y.Map<string | Y.Text>

type SelectionOverlay = {
  key: string
  color: string
  label?: string
  caret: boolean
  left: number
  top: number
  width: number
  height: number
}
type AgentBadgeOverlay = {
  key: string
  color: string
  label: string
  left: number
  top: number
}
type ElementSelection = { key: string; left: number; top: number; width: number; height: number }
type ElementPosition = { x: number; y: number }
type ActiveElementDrag = {
  key: string
  start: ElementPosition
  startSelection: ElementSelection | null
  startX: number
  startY: number
  latestX: number
  latestY: number
  scale: number
  frame: number
  element: HTMLElement
  selection: HTMLDivElement | null
}

const STUDIO_ELEMENT_POSITIONS_KEY = '__studioElementPositions'

export interface NativeSlideSurfaceProps {
  slideId: string
  layout: string
  props: JsonObject
  index: number
  total: number
  runtime: LoadedNativeRuntime
  doc: Y.Doc
  localOrigin: object
  editable?: boolean
  textRevision: number
  presences: PresenceState[]
  onTextFieldsDiscovered(fields: Record<string, string>): void
  onSelectionChange(selection: PresenceState['selection'] | null, focus: PresenceState['focus'] | null): void
  onPointerChange(pointer: { x: number; y: number; visible: boolean }): void
  onElementMove(key: string, position: ElementPosition): void
  onAssetSlot(): void
}

export function NativeSlideSurface({
  slideId,
  layout,
  props,
  index,
  total,
  runtime,
  doc,
  localOrigin,
  editable = false,
  textRevision,
  presences,
  onTextFieldsDiscovered,
  onSelectionChange,
  onPointerChange,
  onElementMove,
  onAssetSlot
}: NativeSlideSurfaceProps) {
  const surfaceRef = React.useRef<HTMLDivElement | null>(null)
  const shadowHostRef = React.useRef<HTMLDivElement | null>(null)
  const shadowRef = React.useRef<ShadowRoot | null>(null)
  const slideRef = React.useRef<HTMLElement | null>(null)
  const cleanupTextRef = React.useRef<(() => void) | null>(null)
  const lastRenderedPropsKeyRef = React.useRef('')
  const selectionRef = React.useRef<HTMLDivElement | null>(null)
  const dragRef = React.useRef<ActiveElementDrag | null>(null)
  const [mountRevision, setMountRevision] = React.useState(0)
  const [overlays, setOverlays] = React.useState<SelectionOverlay[]>([])
  const [agentBadges, setAgentBadges] = React.useState<AgentBadgeOverlay[]>([])
  const [selectedElement, setSelectedElement] = React.useState<ElementSelection | null>(null)

  React.useLayoutEffect(() => {
    const surface = surfaceRef.current
    const shadowHost = shadowHostRef.current
    if (!surface || !shadowHost) return
    const shadow = shadowHost.shadowRoot ?? shadowHost.attachShadow({ mode: 'open' })
    shadowRef.current = shadow
    const style = document.createElement('style')
    style.dataset.presentationNativeStyles = ''
    style.textContent = `${NATIVE_CANVAS_STYLE}\n${runtime.styleText}`
    const slide = document.createElement('section')
    slide.className = 'slide imported-theme-slide active'
    slide.dataset.presentationNativeSlide = ''
    slide.dataset.deckActive = ''
    slide.dataset.vmSlideId = slideId
    slide.dataset.vmSlideKey = layout
    slide.dataset.vmLayout = layout
    slide.dataset.vmIndex = String(index)
    slide.dataset.vmTotal = String(total)
    slide.dataset.themePack = runtime.themePack
    const root = document.createElement('div')
    root.className = 'imported-theme-root'
    root.dataset.themeKey = runtime.themePack
    root.dataset.pageKey = layout
    root.dataset.propDefaults = '{}'
    slide.appendChild(root)
    shadow.replaceChildren(style, slide)
    slideRef.current = slide

    const resize = new ResizeObserver(() => {
      const scale = Math.max(0.01, surface.clientWidth / 1920)
      shadowHost.style.setProperty('--ps-native-scale', String(scale))
    })
    resize.observe(surface)
    const interceptMedia = (event: Event) => {
      const target = event.composedPath().find((item): item is Element => item instanceof Element && Boolean(item.matches('image-slot,.gxn-slot,[data-dashi-media-slot]')))
      if (!target) return
      event.preventDefault()
      event.stopImmediatePropagation()
      onAssetSlot()
    }
    const selectEditable = (event: Event) => {
      if (!editable) return
      const target = operationTargetFromEvent(event)
      const key = target ? collabElementKey(target) : ''
      setSelectedElement(key && target ? measureElementSelection(surface, target) : null)
      if (key && target) onSelectionChange(null, { kind: target.dataset.editableId ? 'text' : 'element', key })
    }
    shadow.addEventListener('pointerdown', interceptMedia, true)
    shadow.addEventListener('pointerdown', selectEditable, true)
    setMountRevision((value) => value + 1)
    lastRenderedPropsKeyRef.current = ''
    return () => {
      resize.disconnect()
      shadow.removeEventListener('pointerdown', interceptMedia, true)
      shadow.removeEventListener('pointerdown', selectEditable, true)
      cleanupTextRef.current?.()
      cleanupTextRef.current = null
      releaseNativeSlide(slide)
      slideRef.current = null
    }
  }, [slideId, layout, runtime.checksum, runtime.styleText, runtime.themePack, index, total, editable, onAssetSlot, onSelectionChange])

  React.useLayoutEffect(() => {
    const slide = slideRef.current
    if (!slide) return
    const themePreview = themePreviewSlideFromProps(props)
    if (themePreview) {
      const propsKey = stableJsonStringify(props)
      if (lastRenderedPropsKeyRef.current !== propsKey) {
        renderThemePreviewImageSlide(slide, themePreview)
        lastRenderedPropsKeyRef.current = propsKey
        cleanupTextRef.current?.()
        cleanupTextRef.current = null
        setSelectedElement(null)
      }
      return
    }
    const renderProps = omitStudioOnlyProps(props)
    const propsKey = stableJsonStringify(renderProps)
    if (lastRenderedPropsKeyRef.current === propsKey) {
      applyElementPositions(slide, props, dragRef.current?.key)
      if (dragRef.current) paintActiveDrag(dragRef.current, surfaceRef.current, slide, selectionRef.current)
      else refreshElementSelection(surfaceRef.current, slide, selectedElement, setSelectedElement)
      return
    }
    if (!renderNativeSlide(slide, renderProps)) return
    lastRenderedPropsKeyRef.current = propsKey
    const synchronizeRuntimeStyles = () => {
      const style = shadowRef.current?.querySelector<HTMLStyleElement>('style[data-presentation-native-styles]')
      if (!style) return
      const next = `${NATIVE_CANVAS_STYLE}\n${collectNativeRuntimeStyleText(runtime)}`
      if (style.textContent !== next) style.textContent = next
    }
    synchronizeRuntimeStyles()
    const timer = window.setTimeout(synchronizeRuntimeStyles, 0)
    prepareTextElements(slide, layout)
    prepareCollabElements(slide, layout)
    synchronizeTextElements(slide, doc.getMap<string | Y.Text>('texts'))
    applyElementPositions(slide, props, dragRef.current?.key)
    cleanupTextRef.current?.()
    cleanupTextRef.current = null
    if (editable) {
      cleanupTextRef.current = bindEditableText({
        slide,
        slideKey: layout,
        doc,
        localOrigin,
        onTextFieldsDiscovered,
        onSelectionChange
      })
    }
    if (dragRef.current) paintActiveDrag(dragRef.current, surfaceRef.current, slide, selectionRef.current)
    else refreshElementSelection(surfaceRef.current, slide, selectedElement, setSelectedElement)
    return () => window.clearTimeout(timer)
  }, [props, mountRevision, editable, layout, doc, localOrigin, onTextFieldsDiscovered, onSelectionChange, runtime, selectedElement])

  React.useLayoutEffect(() => {
    if (!slideRef.current) return
    prepareTextElements(slideRef.current, layout)
    prepareCollabElements(slideRef.current, layout)
    synchronizeTextElements(slideRef.current, doc.getMap<string | Y.Text>('texts'))
    if (dragRef.current) paintActiveDrag(dragRef.current, surfaceRef.current, slideRef.current, selectionRef.current)
    else refreshElementSelection(surfaceRef.current, slideRef.current, selectedElement, setSelectedElement)
  }, [doc, layout, textRevision, mountRevision])

  const moveSelectedElement = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const surface = surfaceRef.current
    const slide = slideRef.current
    const key = selectedElement?.key
    const element = key && slide ? findCollabElement(slide, key) : null
    if (!surface || !slide || !key || !element) return
    const handle = event.currentTarget
    const pointerId = event.pointerId
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const start = readElementPosition(props, key)
    const startSelection = selectedElement
    const selection = selectionRef.current
    const scale = Math.max(0.01, surface.clientWidth / 1920)
    const drag: ActiveElementDrag = {
      key,
      start,
      startSelection,
      startX,
      startY,
      latestX: startX,
      latestY: startY,
      scale,
      frame: 0,
      element,
      selection
    }
    dragRef.current = drag
    const paint = () => {
      paintActiveDrag(drag, surface, slide, selectionRef.current)
    }
    const schedulePaint = () => {
      if (!drag.frame) drag.frame = window.requestAnimationFrame(paint)
    }
    const move = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      drag.latestX = moveEvent.clientX
      drag.latestY = moveEvent.clientY
      schedulePaint()
    }
    const up = (upEvent: PointerEvent) => {
      upEvent.preventDefault()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (drag.frame) window.cancelAnimationFrame(drag.frame)
      drag.latestX = upEvent.clientX
      drag.latestY = upEvent.clientY
      paint()
      surface.classList.remove('is-moving-element')
      drag.selection?.classList.remove('is-moving')
      delete drag.element.dataset.studioDragging
      try { handle.releasePointerCapture(pointerId) } catch { /* pointer capture may already be released */ }
      const next = currentDragPosition(drag)
      onElementMove(key, next)
      dragRef.current = null
      setSelectedElement(measureElementSelection(surface, drag.element))
    }
    try { handle.setPointerCapture(pointerId) } catch { /* pointer capture is best effort */ }
    surface.classList.add('is-moving-element')
    selection?.classList.add('is-moving')
    element.dataset.studioDragging = 'true'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }, [onElementMove, props, selectedElement])

  React.useLayoutEffect(() => {
    const surface = surfaceRef.current
    const shadow = shadowRef.current
    if (!surface || !shadow) return
    const update = () => {
      setOverlays(calculateSelectionOverlays(surface, shadow, doc, presences))
      setAgentBadges(calculateAgentBadges(surface, shadow, presences))
    }
    update()
    const timer = window.setTimeout(update, 0)
    const resize = new ResizeObserver(update)
    resize.observe(surface)
    return () => { window.clearTimeout(timer); resize.disconnect() }
  }, [doc, presences, textRevision, mountRevision])

  const pointerMove = React.useMemo(() => throttle((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    onPointerChange({
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
      visible: true
    })
  }, 50), [onPointerChange])

  return <div
    ref={surfaceRef}
    className={`ps-native-surface${editable ? ' is-editable' : ''}`}
    onPointerMove={pointerMove}
    onPointerLeave={() => onPointerChange({ x: 0, y: 0, visible: false })}
  >
    <div ref={shadowHostRef} className="ps-native-shadow-host" />
    <div className="ps-presence-layer" aria-hidden="true">
      {presences.filter((presence) => presence.pointer?.visible).map((presence) => <div
        className="ps-remote-pointer"
        key={`pointer-${presence.presenceId}`}
        style={presencePointerStyle(presence)}
      ><span>{presence.displayName}</span></div>)}
      {overlays.map((overlay) => <div
        className={overlay.caret ? 'ps-remote-caret' : 'ps-remote-selection'}
        key={overlay.key}
        style={{ left: overlay.left, top: overlay.top, width: overlay.width, height: overlay.height, background: overlay.color }}
      >{overlay.label ? <span style={{ background: overlay.color }}>{overlay.label}</span> : null}</div>)}
      {agentBadges.map((badge) => <div
        className="ps-agent-presence-badge"
        key={badge.key}
        style={{ left: badge.left, top: badge.top, background: badge.color }}
      >{badge.label}</div>)}
    </div>
    {editable && selectedElement ? <div
      ref={selectionRef}
      className="ps-element-selection"
      style={{ left: selectedElement.left, top: selectedElement.top, width: selectedElement.width, height: selectedElement.height }}
    >
      <button
        type="button"
        className="ps-element-move-handle"
        onPointerDown={moveSelectedElement}
        title="Move element"
        aria-label="Move element"
      />
    </div> : null}
  </div>
}

function prepareTextElements(slide: HTMLElement, slideKey: string) {
  const fields: Record<string, string> = {}
  const claimed = new Set<string>()
  for (const existing of Array.from(slide.querySelectorAll<HTMLElement>('[data-editable-id]'))) {
    if (existing.dataset.editableId) claimed.add(existing.dataset.editableId)
  }
  const candidates = Array.from(slide.querySelectorAll<HTMLElement>('*'))
  for (const element of candidates) {
    if (element.parentElement?.closest('[data-editable-id]')) continue
    if (!element.dataset.editableId && !isTextCandidate(element)) continue
    const base = element.dataset.editableId || explicitTextId(element, slideKey) || pathTextId(element, slide, slideKey)
    let id = base
    let suffix = 0
    while (claimed.has(id) && element.dataset.editableId !== id) id = `${base}-${++suffix}`
    claimed.add(id)
    element.dataset.editableId = id
    fields[id] = element.textContent ?? ''
  }
  return fields
}

function prepareCollabElements(slide: HTMLElement, slideKey: string) {
  const claimed = new Set<string>()
  for (const existing of Array.from(slide.querySelectorAll<HTMLElement>('[data-collab-element-id]'))) {
    if (existing.dataset.collabElementId) claimed.add(existing.dataset.collabElementId)
  }
  for (const textElement of Array.from(slide.querySelectorAll<HTMLElement>('[data-editable-id]'))) {
    const key = textElement.dataset.editableId
    if (!key) continue
    textElement.dataset.collabElementId = key
    claimed.add(key)
  }
  const candidates = Array.from(slide.querySelectorAll<HTMLElement>('*'))
  for (const element of candidates) {
    if (element.dataset.editableId || element.closest('[data-editable-id]')) continue
    if (!element.dataset.collabElementId && !isVisualElementCandidate(element, slide)) continue
    const base = element.dataset.collabElementId || explicitElementId(element, slideKey) || pathElementId(element, slide, slideKey)
    let id = base
    let suffix = 0
    while (claimed.has(id) && element.dataset.collabElementId !== id) id = `${base}-${++suffix}`
    claimed.add(id)
    element.dataset.collabElementId = id
  }
}

function bindEditableText(input: {
  slide: HTMLElement
  slideKey: string
  doc: Y.Doc
  localOrigin: object
  onTextFieldsDiscovered(fields: Record<string, string>): void
  onSelectionChange(selection: PresenceState['selection'] | null, focus: PresenceState['focus'] | null): void
}) {
  const { slide, slideKey, doc, localOrigin, onTextFieldsDiscovered, onSelectionChange } = input
  const fields = prepareTextElements(slide, slideKey)
  if (Object.keys(fields).length) onTextFieldsDiscovered(fields)

  const texts = doc.getMap<string | Y.Text>('texts')
  const composing = new WeakSet<HTMLElement>()
  const cleanups: Array<() => void> = []
  for (const element of Array.from(slide.querySelectorAll<HTMLElement>('[data-editable-id]'))) {
    const key = element.dataset.editableId
    const text = key ? texts.get(key) : undefined
    if (!key || !(text instanceof Y.Text)) continue
    element.textContent = text.toString()
    element.setAttribute('contenteditable', 'plaintext-only')
    element.setAttribute('spellcheck', 'false')
    element.setAttribute('role', 'textbox')
    let selectionTimer: number | null = null
    const compositionStart = () => composing.add(element)
    const scheduleSelectionEvent = () => {
      if (selectionTimer !== null) window.clearTimeout(selectionTimer)
      selectionTimer = window.setTimeout(() => {
        selectionTimer = null
        selectionEvent()
      }, 0)
    }
    const compositionEnd = () => { composing.delete(element); updateYText(text, element.textContent ?? '', doc, localOrigin); scheduleSelectionEvent() }
    const inputEvent = () => { if (!composing.has(element)) updateYText(text, element.textContent ?? '', doc, localOrigin); scheduleSelectionEvent() }
    const focusEvent = () => { onSelectionChange(null, { kind: 'text', key }); scheduleSelectionEvent() }
    const selectionEvent = () => {
      if (document.activeElement !== element && !element.matches(':focus')) return
      const selection = selectionForElement(element)
      if (!selection?.anchorNode || !selection.focusNode || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return
      const anchor = textOffset(element, selection.anchorNode, selection.anchorOffset)
      const head = textOffset(element, selection.focusNode, selection.focusOffset)
      onSelectionChange({
        textKey: key,
        anchorRelativeBase64: bytesToBase64(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, anchor))),
        headRelativeBase64: bytesToBase64(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, head)))
      }, { kind: 'text', key })
    }
    const blurEvent = () => onSelectionChange(null, null)
    element.addEventListener('compositionstart', compositionStart)
    element.addEventListener('compositionend', compositionEnd)
    element.addEventListener('input', inputEvent)
    element.addEventListener('focus', focusEvent)
    element.addEventListener('keyup', selectionEvent)
    element.addEventListener('pointerup', selectionEvent)
    element.addEventListener('blur', blurEvent)
    cleanups.push(() => {
      if (selectionTimer !== null) window.clearTimeout(selectionTimer)
      element.removeEventListener('compositionstart', compositionStart)
      element.removeEventListener('compositionend', compositionEnd)
      element.removeEventListener('input', inputEvent)
      element.removeEventListener('focus', focusEvent)
      element.removeEventListener('keyup', selectionEvent)
      element.removeEventListener('pointerup', selectionEvent)
      element.removeEventListener('blur', blurEvent)
    })
  }
  synchronizeTextElements(slide, texts)
  return () => cleanups.forEach((cleanup) => cleanup())
}

function operationTargetFromEvent(event: Event) {
  for (const item of event.composedPath()) {
    if (!(item instanceof HTMLElement)) continue
    if (item.dataset.editableId) return item
    if (item.dataset.collabElementId) return item
    const closest = item.closest<HTMLElement>('[data-editable-id]')
    if (closest) return closest
    const collabClosest = item.closest<HTMLElement>('[data-collab-element-id]')
    if (collabClosest) return collabClosest
  }
  return null
}

function synchronizeTextElements(slide: HTMLElement, texts: TextMap) {
  for (const element of Array.from(slide.querySelectorAll<HTMLElement>('[data-editable-id]'))) {
    const key = element.dataset.editableId
    const value = key ? texts.get(key) : undefined
    if (!(value instanceof Y.Text) || element.matches(':focus')) continue
    if (element.textContent !== value.toString()) element.textContent = value.toString()
  }
}

function omitStudioOnlyProps(props: JsonObject) {
  const {
    [STUDIO_ELEMENT_POSITIONS_KEY]: _positions,
    [PRESENTATION_SYSTEM_SLIDE_KIND_PROP]: _slideKind,
    [PRESENTATION_SYSTEM_IMAGE_ASSET_PROP]: _imageAsset,
    [PRESENTATION_SYSTEM_IMAGE_ALT_PROP]: _imageAlt,
    ...renderProps
  } = props
  return renderProps
}

function renderThemePreviewImageSlide(slide: HTMLElement, preview: { image: string; alt: string }) {
  const frame = document.createElement('div')
  frame.className = 'presentation-theme-preview-frame'
  const image = document.createElement('img')
  image.className = 'presentation-theme-preview-image'
  image.alt = preview.alt
  if (preview.image) image.src = preview.image
  frame.appendChild(image)
  slide.replaceChildren(frame)
}

function applyElementPositions(slide: HTMLElement, props: JsonObject, activeDragKey?: string) {
  for (const element of Array.from(slide.querySelectorAll<HTMLElement>('[data-collab-element-id]'))) {
    const key = collabElementKey(element)
    if (key && key === activeDragKey) continue
    const position = key ? readElementPosition(props, key) : { x: 0, y: 0 }
    setElementTranslate(element, position)
  }
}

function currentDragPosition(drag: ActiveElementDrag): ElementPosition {
  return {
    x: drag.start.x + (drag.latestX - drag.startX) / drag.scale,
    y: drag.start.y + (drag.latestY - drag.startY) / drag.scale
  }
}

function paintActiveDrag(
  drag: ActiveElementDrag,
  surface: HTMLElement | null,
  slide: HTMLElement | null,
  selectionOverride?: HTMLDivElement | null
) {
  drag.frame = 0
  if (!surface || !slide) return
  const nextElement = findCollabElement(slide, drag.key)
  if (!nextElement) return
  if (drag.element !== nextElement) delete drag.element.dataset.studioDragging
  drag.element = nextElement
  drag.selection = selectionOverride ?? drag.selection
  const deltaX = drag.latestX - drag.startX
  const deltaY = drag.latestY - drag.startY
  setElementTranslate(nextElement, currentDragPosition(drag))
  nextElement.dataset.studioDragging = 'true'
  if (drag.selection && drag.startSelection) {
    drag.selection.classList.add('is-moving')
    drag.selection.style.left = `${drag.startSelection.left + deltaX}px`
    drag.selection.style.top = `${drag.startSelection.top + deltaY}px`
  }
}

function readElementPosition(props: JsonObject, key: string): ElementPosition {
  const positions = props[STUDIO_ELEMENT_POSITIONS_KEY]
  if (!isJsonObject(positions)) return { x: 0, y: 0 }
  const value = positions[key]
  if (!isJsonObject(value)) return { x: 0, y: 0 }
  return {
    x: typeof value.x === 'number' && Number.isFinite(value.x) ? value.x : 0,
    y: typeof value.y === 'number' && Number.isFinite(value.y) ? value.y : 0
  }
}

function setElementTranslate(element: HTMLElement, position: ElementPosition) {
  const x = Math.round(position.x)
  const y = Math.round(position.y)
  const moved = Boolean(x || y)
  const mode = element.dataset.studioPositionMode
  const computedPosition = mode === 'relative' ? 'static' : getComputedStyle(element).position
  if (computedPosition === 'static') {
    if (moved) {
      element.dataset.studioPositionMode = 'relative'
      element.style.position = 'relative'
      element.style.left = `${x}px`
      element.style.top = `${y}px`
      element.style.translate = ''
    } else if (mode === 'relative') {
      delete element.dataset.studioPositionMode
      element.style.position = ''
      element.style.left = ''
      element.style.top = ''
      element.style.translate = ''
    }
    return
  }
  if (mode === 'relative' && !moved) {
    delete element.dataset.studioPositionMode
    element.style.position = ''
    element.style.left = ''
    element.style.top = ''
  }
  element.style.translate = moved ? `${x}px ${y}px` : ''
}

function measureElementSelection(host: HTMLElement, element: HTMLElement): ElementSelection {
  const hostRect = host.getBoundingClientRect()
  const rect = element.getBoundingClientRect()
  return {
    key: collabElementKey(element),
    left: rect.left - hostRect.left,
    top: rect.top - hostRect.top,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height)
  }
}

function refreshElementSelection(
  host: HTMLElement | null,
  slide: HTMLElement,
  current: ElementSelection | null,
  setSelected: React.Dispatch<React.SetStateAction<ElementSelection | null>>
) {
  if (!host || !current?.key) return
  const element = findCollabElement(slide, current.key)
  if (!element) setSelected(null)
  else {
    const next = measureElementSelection(host, element)
    setSelected((value) => {
      if (!value || value.key !== next.key) return next
      if (
        Math.abs(value.left - next.left) < 0.5 &&
        Math.abs(value.top - next.top) < 0.5 &&
        Math.abs(value.width - next.width) < 0.5 &&
        Math.abs(value.height - next.height) < 0.5
      ) return value
      return next
    })
  }
}

function stableJsonStringify(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(stableJsonStringify).join(',')}]`
  if (isJsonObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function updateYText(text: Y.Text, next: string, doc: Y.Doc, origin: object) {
  const current = text.toString()
  if (current === next) return
  let start = 0
  while (start < current.length && start < next.length && current[start] === next[start]) start += 1
  let currentEnd = current.length
  let nextEnd = next.length
  while (currentEnd > start && nextEnd > start && current[currentEnd - 1] === next[nextEnd - 1]) { currentEnd -= 1; nextEnd -= 1 }
  doc.transact(() => {
    if (currentEnd > start) text.delete(start, currentEnd - start)
    if (nextEnd > start) text.insert(start, next.slice(start, nextEnd))
  }, origin)
}

function calculateSelectionOverlays(host: HTMLElement, shadow: ShadowRoot, doc: Y.Doc, presences: PresenceState[]) {
  const hostRect = host.getBoundingClientRect()
  const texts = doc.getMap<string | Y.Text>('texts')
  const overlays: SelectionOverlay[] = []
  for (const presence of presences) {
    const selection = presence.selection
    if (!selection) continue
    const element = shadow.querySelector<HTMLElement>(`[data-editable-id="${CSS.escape(selection.textKey)}"]`)
    const text = texts.get(selection.textKey)
    if (!element || !(text instanceof Y.Text)) continue
    try {
      const anchor = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(base64ToBytes(selection.anchorRelativeBase64)), doc)
      const head = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(base64ToBytes(selection.headRelativeBase64)), doc)
      if (!anchor || !head || anchor.type !== text || head.type !== text) continue
      const start = Math.min(anchor.index, head.index)
      const end = Math.max(anchor.index, head.index)
      if (start === end) {
        const rect = caretRectAtOffset(element, start)
        overlays.push({
          key: `${presence.presenceId}-caret`,
          color: presence.color,
          label: presence.displayName,
          caret: true,
          left: rect.left - hostRect.left,
          top: rect.top - hostRect.top,
          width: 2,
          height: Math.max(14, rect.height)
        })
        continue
      }
      const range = document.createRange()
      const startPoint = domPointAtOffset(element, start)
      const endPoint = domPointAtOffset(element, end)
      range.setStart(startPoint.node, startPoint.offset)
      range.setEnd(endPoint.node, endPoint.offset)
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
      if (!rects.length) {
        const fallback = range.getBoundingClientRect()
        if (fallback.width > 0 || fallback.height > 0) rects.push(fallback)
      }
      rects.forEach((rect, rectIndex) => overlays.push({
        key: `${presence.presenceId}-${rectIndex}`,
        color: presence.color,
        label: rectIndex === 0 ? presence.displayName : undefined,
        caret: false,
        left: rect.left - hostRect.left,
        top: rect.top - hostRect.top,
        width: Math.max(2, rect.width),
        height: Math.max(14, rect.height)
      }))
    } catch {
      // A stale relative selection is ignored until the next awareness update.
    }
  }
  return overlays
}

function calculateAgentBadges(host: HTMLElement, shadow: ShadowRoot, presences: PresenceState[]) {
  const hostRect = host.getBoundingClientRect()
  const badges: AgentBadgeOverlay[] = []
  const agents = presences.filter((presence) => presence.actorType === 'agent' && !presence.pointer?.visible)
  agents.forEach((presence, index) => {
    let left = 14
    let top = 14 + index * 30
    const element = findPresenceFocusElement(shadow, presence.focus)
    if (element) {
      const rect = element.getBoundingClientRect()
      left = clamp(rect.left - hostRect.left, 8, Math.max(8, hostRect.width - 180))
      top = clamp(rect.top - hostRect.top - 26, 8, Math.max(8, hostRect.height - 30))
    }
    badges.push({
      key: `agent-${presence.presenceId}`,
      color: presence.color,
      label: `${presence.displayName} · ${presence.operationLabel ?? presence.status ?? 'Agent'}`,
      left,
      top
    })
  })
  return badges
}

function findPresenceFocusElement(shadow: ShadowRoot, focus: PresenceState['focus'] | null | undefined) {
  const key = focus?.key
  if (!key) return null
  const escaped = CSS.escape(key)
  if (focus.kind === 'text') return shadow.querySelector<HTMLElement>(`[data-editable-id="${escaped}"]`)
  if (focus.kind === 'element') return shadow.querySelector<HTMLElement>(`[data-collab-element-id="${escaped}"],[data-editable-id="${escaped}"]`)
  if (focus.kind === 'control') {
    return shadow.querySelector<HTMLElement>([
      `[data-collab-element-id="${escaped}"]`,
      `[data-collab-element-id="control:${escaped}"]`,
      `[data-collab-element-id="prop:${escaped}"]`,
      `[data-control-key="${escaped}"]`,
      `[data-prop-key="${escaped}"]`,
      `[data-dashi-media-slot="${escaped}"]`,
      `[data-media-slot="${escaped}"]`,
      `[data-image-slot="${escaped}"]`
    ].join(','))
  }
  return null
}

function isTextCandidate(element: HTMLElement) {
  if (element.hasAttribute('data-editable-skip')) return false
  if (element.closest('[data-dashi-page-number]')) return false
  if (element.parentElement?.closest('[data-editable-id]')) return false
  if (['SCRIPT', 'STYLE', 'CANVAS', 'SVG', 'PATH', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'VIDEO', 'IMG'].includes(element.tagName)) return false
  if (!element.textContent?.trim()) return false
  return Array.from(element.children).every((child) => ['BR', 'SPAN', 'B', 'I', 'EM', 'STRONG', 'SMALL'].includes(child.tagName))
}

function explicitTextId(element: HTMLElement, slideKey: string) {
  const path = element.dataset.editablePath
  return path ? `text:${slideKey}:${path}` : ''
}

function pathTextId(element: HTMLElement, slide: HTMLElement, slideKey: string) {
  const segments: number[] = []
  let node: HTMLElement | null = element
  while (node && node !== slide && node.parentElement) {
    segments.push(Array.from(node.parentElement.children).indexOf(node))
    node = node.parentElement
  }
  return `text:${slideKey}:p${segments.reverse().join('-')}`
}

function explicitElementId(element: HTMLElement, slideKey: string) {
  const slot = element.dataset.dashiMediaSlot ?? element.dataset.mediaSlot ?? element.dataset.imageSlot ?? element.dataset.slot
  if (slot) return `control:${slot}`
  const path = element.dataset.collabElementPath ?? element.dataset.propPath ?? element.dataset.controlKey
  return path ? `element:${slideKey}:${path}` : ''
}

function pathElementId(element: HTMLElement, slide: HTMLElement, slideKey: string) {
  const segments: number[] = []
  let node: HTMLElement | null = element
  while (node && node !== slide && node.parentElement) {
    segments.push(Array.from(node.parentElement.children).indexOf(node))
    node = node.parentElement
  }
  return `element:${slideKey}:p${segments.reverse().join('-')}`
}

function isVisualElementCandidate(element: HTMLElement, slide: HTMLElement) {
  if (element === slide || element.classList.contains('imported-theme-root')) return false
  if (element.hasAttribute('data-editable-skip')) return false
  if (element.closest('[data-dashi-page-number]')) return false
  if (['SCRIPT', 'STYLE', 'BR', 'SPAN', 'B', 'I', 'EM', 'STRONG', 'SMALL', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) return false
  if (element.matches('image-slot,.gxn-slot,[data-dashi-media-slot],[data-media-slot],[data-image-slot]')) return true
  if (['IMG', 'VIDEO', 'CANVAS', 'SVG', 'PICTURE'].includes(element.tagName)) return true
  const rect = element.getBoundingClientRect()
  const slideRect = slide.getBoundingClientRect()
  if (rect.width < 18 || rect.height < 14) return false
  if (rect.width > slideRect.width * 0.96 && rect.height > slideRect.height * 0.9) return false
  const style = getComputedStyle(element)
  const hasBackground = style.backgroundImage !== 'none' || !isTransparentColor(style.backgroundColor)
  const hasBorder = parseFloat(style.borderTopWidth) > 0 || parseFloat(style.borderRightWidth) > 0 || parseFloat(style.borderBottomWidth) > 0 || parseFloat(style.borderLeftWidth) > 0
  const hasShadow = style.boxShadow !== 'none' || style.filter !== 'none'
  return hasBackground || hasBorder || hasShadow
}

function collabElementKey(element: HTMLElement) {
  return element.dataset.collabElementId ?? element.dataset.editableId ?? ''
}

function findCollabElement(slide: HTMLElement, key: string) {
  const escaped = CSS.escape(key)
  return slide.querySelector<HTMLElement>(`[data-collab-element-id="${escaped}"],[data-editable-id="${escaped}"]`)
}

function isTransparentColor(value: string) {
  if (!value || value === 'transparent') return true
  if (value === 'rgba(0, 0, 0, 0)' || value === 'rgb(0 0 0 / 0)') return true
  return /rgba?\([^)]*,\s*0\)$/.test(value) || /rgb\([^)]*\/\s*0\s*\)$/.test(value)
}

function textOffset(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange()
  range.selectNodeContents(root)
  range.setEnd(node, offset)
  return range.toString().length
}

function selectionForElement(element: HTMLElement) {
  const root = element.getRootNode()
  if (root instanceof ShadowRoot) {
    const shadowSelection = (root as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.()
    return shadowSelection ?? document.getSelection()
  }
  return document.getSelection()
}

function domPointAtOffset(root: HTMLElement, requestedOffset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, requestedOffset)
  let node = walker.nextNode()
  while (node) {
    const length = node.textContent?.length ?? 0
    if (remaining <= length) return { node, offset: remaining }
    remaining -= length
    node = walker.nextNode()
  }
  return { node: root, offset: root.childNodes.length }
}

function caretRectAtOffset(root: HTMLElement, offset: number) {
  const textLength = root.textContent?.length ?? 0
  if (textLength > 0) {
    const range = document.createRange()
    const startOffset = Math.max(0, Math.min(offset >= textLength ? textLength - 1 : offset, textLength - 1))
    const endOffset = Math.max(startOffset + 1, Math.min(textLength, startOffset + 1))
    const startPoint = domPointAtOffset(root, startOffset)
    const endPoint = domPointAtOffset(root, endOffset)
    range.setStart(startPoint.node, startPoint.offset)
    range.setEnd(endPoint.node, endPoint.offset)
    const rect = Array.from(range.getClientRects()).find((item) => item.width > 0 && item.height > 0) ?? range.getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) {
      return {
        left: offset >= textLength ? rect.right : rect.left,
        top: rect.top,
        width: 2,
        height: rect.height
      }
    }
  }
  const fallback = root.getBoundingClientRect()
  return { left: fallback.left, top: fallback.top, width: 2, height: Math.max(14, fallback.height) }
}

function throttle<T extends (...args: Parameters<T>) => void>(callback: T, delay: number) {
  let previous = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - previous < delay) return
    previous = now
    callback(...args)
  }
}

function bytesToBase64(value: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < value.length; offset += 0x8000) binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000))
  return btoa(binary)
}
function base64ToBytes(value: string) { const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)) }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }

function presencePointerStyle(presence: PresenceState): React.CSSProperties & { '--ps-presence-color': string } {
  return {
    left: `${(presence.pointer?.x ?? 0) * 100}%`,
    top: `${(presence.pointer?.y ?? 0) * 100}%`,
    color: presence.color,
    '--ps-presence-color': presence.color
  }
}

const NATIVE_CANVAS_STYLE = `
  :host { display:block; position:relative; width:100%; height:100%; overflow:hidden; color-scheme:light; }
  *, *::before, *::after { box-sizing:border-box; }
  .slide { position:absolute; left:0; top:0; width:1920px; height:1080px; overflow:hidden; transform:scale(var(--ps-native-scale, 1)); transform-origin:top left; }
  .imported-theme-root { width:100%; height:100%; overflow:hidden; }
  .presentation-theme-preview-frame { width:100%; height:100%; display:grid; place-items:center; padding:34px; background:#f4f2ed; }
  .presentation-theme-preview-image { display:block; width:100%; height:100%; object-fit:contain; border-radius:18px; box-shadow:0 18px 54px rgba(15,23,42,.16); }
  [data-collab-element-id] { outline-offset:4px; }
  [data-collab-element-id]:not([data-editable-id]) { cursor:default; }
  [data-collab-element-id]:not([data-editable-id]):hover { outline:1px dashed rgba(37,99,235,.22); border-radius:6px; }
  [data-editable-id] { cursor:text; outline-offset:4px; }
  [data-editable-id]:hover { outline:1px dashed rgba(37,99,235,.28); border-radius:6px; }
  [data-editable-id]:focus { outline:2px solid rgba(37,99,235,.38); border-radius:6px; box-shadow:0 0 0 4px rgba(37,99,235,.08); }
  [data-studio-dragging="true"] { outline:none !important; box-shadow:none !important; user-select:none; }
`

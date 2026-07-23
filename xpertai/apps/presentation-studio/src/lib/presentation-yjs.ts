import * as Y from 'yjs'
import { PRESENTATION_THEME_PACKS } from './constants.js'
import type {
  PresentationDeckSpec,
  PresentationEditorState,
  PresentationJsonObject,
  PresentationJsonValue,
  PresentationSlideSpec,
  PresentationSlideStatus,
  PresentationStatus,
  PresentationThemePack
} from './types.js'

export const PRESENTATION_YJS_SCHEMA_VERSION = 2
export type PresentationTextMap = Y.Map<string | Y.Text>

export function createPresentationYDoc(spec: PresentationDeckSpec, editorState?: PresentationEditorState | null, status: PresentationStatus = 'draft') {
  const doc = new Y.Doc()
  writeDeckToYDoc(doc, spec, editorState, status)
  return doc
}

export function writeDeckToYDoc(doc: Y.Doc, spec: PresentationDeckSpec, editorState?: PresentationEditorState | null, status: PresentationStatus = 'draft') {
  doc.transact(() => {
    const deck = doc.getMap<PresentationJsonValue>('deck')
    deck.set('title', spec.title)
    deck.set('goal', spec.goal)
    setOptional(deck, 'audience', spec.audience)
    setOptional(deck, 'owner', spec.owner)
    deck.set('themePack', spec.themePack)
    deck.set('status', status)
    deck.set('pageCount', spec.pageCount)
    deck.set('schemaVersion', PRESENTATION_YJS_SCHEMA_VERSION)

    const order = doc.getArray<string>('slideOrder')
    order.delete(0, order.length)
    order.insert(0, spec.slides.map((slide) => slide.id))

    const slides = doc.getMap<Y.Map<PresentationJsonValue>>('slides')
    for (const key of [...slides.keys()]) slides.delete(key)
    for (const slide of spec.slides) slides.set(slide.id, slideToYMap(slide))

    const texts = doc.getMap<string | Y.Text>('texts')
    for (const key of [...texts.keys()]) texts.delete(key)
    for (const [key, value] of Object.entries(editorState?.text ?? {})) texts.set(key, createYText(value))

    const preview = doc.getMap<PresentationJsonValue>('preview')
    replaceYMap(preview, editorState?.preview ?? spec.preview ?? {})
  }, 'presentation:initialize')
}

export function materializePresentationYDoc(doc: Y.Doc): { spec: PresentationDeckSpec; editorState: PresentationEditorState; status: PresentationStatus } {
  const deck = doc.getMap<PresentationJsonValue>('deck')
  const slideOrder = doc.getArray<string>('slideOrder').toArray()
  const slideMap = doc.getMap<Y.Map<PresentationJsonValue>>('slides')
  const slides = slideOrder
    .map((id) => materializeSlide(id, slideMap.get(id)))
    .filter((slide): slide is PresentationSlideSpec => Boolean(slide))
  const text = Object.fromEntries(
    [...doc.getMap<string | Y.Text>('texts').entries()].map(([key, value]) => [key, value instanceof Y.Text ? value.toString() : value])
  )
  const preview = yMapToJson(doc.getMap<PresentationJsonValue>('preview'))
  const skippedSlides = slides.filter((slide) => slide.status === 'skipped').map((slide) => slide.id)
  const deletedSlides = slides.filter((slide) => slide.status === 'deleted').map((slide) => slide.id)
  const duplicatedSlides = slides
    .filter((slide) => slide.sourceSlideId)
    .map((slide) => ({ sourceId: slide.sourceSlideId as string, copyId: slide.id }))
  const props = Object.fromEntries(slides.map((slide) => [slide.id, slide.props]))
  const themePack = readThemePack(deck.get('themePack'))
  const status = presentationStatusFromY(deck.get('status'))
  const title = readString(deck.get('title')) || 'Untitled presentation'
  const goal = readString(deck.get('goal')) || title
  const audience = readNullableString(deck.get('audience'))
  const owner = readNullableString(deck.get('owner'))
  const activeSlideCount = slides.filter((slide) => slide.status === 'active').length
  const pageCountValue = deck.get('pageCount')

  return {
    spec: {
      title,
      goal,
      audience,
      owner,
      themePack,
      pageCount: typeof pageCountValue === 'number' ? pageCountValue : activeSlideCount,
      preview,
      slides
    },
    editorState: { slideOrder, skippedSlides, deletedSlides, duplicatedSlides, text, props, preview },
    status
  }
}

export function encodeYDoc(doc: Y.Doc) {
  return {
    stateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
    stateVectorBase64: Buffer.from(Y.encodeStateVector(doc)).toString('base64')
  }
}

export function decodeYDoc(stateBase64?: string | null) {
  const doc = new Y.Doc()
  if (stateBase64) Y.applyUpdate(doc, Buffer.from(stateBase64, 'base64'))
  return doc
}

export function patchPresentationYDoc(
  doc: Y.Doc,
  mutation: (root: {
    deck: Y.Map<PresentationJsonValue>
    slideOrder: Y.Array<string>
    slides: Y.Map<Y.Map<PresentationJsonValue>>
    texts: PresentationTextMap
    preview: Y.Map<PresentationJsonValue>
  }) => void,
  origin: string
) {
  const before = Y.encodeStateVector(doc)
  doc.transact(() => mutation({
    deck: doc.getMap<PresentationJsonValue>('deck'),
    slideOrder: doc.getArray<string>('slideOrder'),
    slides: doc.getMap<Y.Map<PresentationJsonValue>>('slides'),
    texts: doc.getMap<string | Y.Text>('texts'),
    preview: doc.getMap<PresentationJsonValue>('preview')
  }), origin)
  return Y.encodeStateAsUpdate(doc, before)
}

export function ensurePresentationYDocSchemaV2(doc: Y.Doc) {
  const deck = doc.getMap<PresentationJsonValue>('deck')
  const texts = doc.getMap<string | Y.Text>('texts')
  const needsSchema = deck.get('schemaVersion') !== PRESENTATION_YJS_SCHEMA_VERSION
  const legacyEntries = [...texts.entries()].filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  if (!needsSchema && !legacyEntries.length) return false
  doc.transact(() => {
    deck.set('schemaVersion', PRESENTATION_YJS_SCHEMA_VERSION)
    for (const [key, value] of legacyEntries) texts.set(key, createYText(value))
  }, 'presentation:migrate-schema-v2')
  return true
}

export function ensurePresentationTextFields(doc: Y.Doc, fields: Record<string, string>) {
  const texts = doc.getMap<string | Y.Text>('texts')
  const before = Y.encodeStateVector(doc)
  let changed = doc.getMap<PresentationJsonValue>('deck').get('schemaVersion') !== PRESENTATION_YJS_SCHEMA_VERSION
  doc.transact(() => {
    for (const [key, value] of Object.entries(fields)) {
      const current = texts.get(key)
      if (current instanceof Y.Text) continue
      changed = true
      texts.set(key, createYText(typeof current === 'string' ? current : value))
    }
    doc.getMap<PresentationJsonValue>('deck').set('schemaVersion', PRESENTATION_YJS_SCHEMA_VERSION)
  }, 'presentation:ensure-text-fields')
  return changed ? Y.encodeStateAsUpdate(doc, before) : new Uint8Array()
}

export function setPresentationYText(texts: PresentationTextMap, key: string, value: string) {
  const current = texts.get(key)
  if (current instanceof Y.Text) {
    if (current.toString() === value) return
    current.delete(0, current.length)
    current.insert(0, value)
    return
  }
  texts.set(key, createYText(value))
}

function createYText(value: string) {
  const text = new Y.Text()
  if (value) text.insert(0, value)
  return text
}

export function slideToYMap(slide: PresentationSlideSpec) {
  const value = new Y.Map<PresentationJsonValue>()
  value.set('id', slide.id)
  value.set('layout', slide.layout)
  value.set('status', slide.status)
  if (slide.sourceSlideId) value.set('sourceSlideId', slide.sourceSlideId)
  value.set('props', jsonToY(slide.props))
  return value
}

export function patchSlideYMap(slide: Y.Map<PresentationJsonValue>, patch: PresentationJsonObject) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'props' && isJsonObject(value)) {
      const current = slide.get('props')
      if (current instanceof Y.Map) patchYMap(current, value)
      else slide.set('props', jsonToY(value))
      continue
    }
    slide.set(key, jsonToY(value))
  }
}

function slideToJsonObject(slide: Y.Map<PresentationJsonValue>) {
  return yMapToJson(slide)
}

function materializeSlide(id: string, value?: Y.Map<PresentationJsonValue>): PresentationSlideSpec | null {
  if (!value) return null
  const raw = slideToJsonObject(value)
  const layout = readString(raw.layout)
  if (!layout) return null
  return {
    id,
    layout,
    status: readSlideStatus(raw.status),
    sourceSlideId: readNullableString(raw.sourceSlideId),
    props: isJsonObject(raw.props) ? raw.props : {}
  }
}

function replaceYMap(map: Y.Map<PresentationJsonValue>, value: PresentationJsonObject) {
  for (const key of [...map.keys()]) map.delete(key)
  patchYMap(map, value)
}

function patchYMap(map: Y.Map<PresentationJsonValue>, patch: PresentationJsonObject) {
  for (const [key, value] of Object.entries(patch)) {
    const current = map.get(key)
    if (isJsonObject(value) && current instanceof Y.Map) patchYMap(current, value)
    else map.set(key, jsonToY(value))
  }
}

function jsonToY(value: PresentationJsonValue): PresentationJsonValue {
  if (Array.isArray(value)) {
    const array = new Y.Array<PresentationJsonValue>()
    array.push(value.map(jsonToY))
    return array as never
  }
  if (isJsonObject(value)) {
    const map = new Y.Map<PresentationJsonValue>()
    for (const [key, item] of Object.entries(value)) map.set(key, jsonToY(item))
    return map as never
  }
  return value
}

function yMapToJson(map: Y.Map<PresentationJsonValue>): PresentationJsonObject {
  const value: PresentationJsonObject = {}
  for (const [key, item] of map.entries()) value[key] = yToJson(item)
  return value
}

function yToJson(value: PresentationJsonValue): PresentationJsonValue {
  if (value instanceof Y.Map) return yMapToJson(value)
  if (value instanceof Y.Array) return value.toArray().map((item) => yToJson(item))
  return value
}

function isJsonObject(value: PresentationJsonValue | undefined): value is PresentationJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Y.AbstractType))
}

function readString(value: PresentationJsonValue | undefined) {
  return typeof value === 'string' ? value : ''
}

function readNullableString(value: PresentationJsonValue | undefined) {
  const text = readString(value).trim()
  return text || null
}

function readThemePack(value: PresentationJsonValue | undefined): PresentationThemePack {
  return typeof value === 'string' && (PRESENTATION_THEME_PACKS as readonly string[]).includes(value)
    ? value as PresentationThemePack
    : 'theme01'
}

function readSlideStatus(value: PresentationJsonValue | undefined): PresentationSlideStatus {
  return value === 'skipped' || value === 'deleted' ? value : 'active'
}

function setOptional(map: Y.Map<PresentationJsonValue>, key: string, value: string | null | undefined) {
  if (value) map.set(key, value)
  else map.delete(key)
}

export function presentationStatusFromY(value: PresentationJsonValue | undefined): PresentationStatus {
  return value === 'reviewed' || value === 'archived' || value === 'failed' ? value : 'draft'
}

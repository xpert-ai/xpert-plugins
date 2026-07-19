import { BadRequestException, ConflictException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { generateKeyBetween } from 'fractional-indexing'
import type {
  CanvasJsonObject,
  CanvasJsonValue,
  CanvasRecord,
  CreateCanvasAgentShapeInput,
  CreateCanvasArrowShapeInput,
  CreateCanvasFrameShapeInput,
  CreateCanvasGeoShapeInput,
  CreateCanvasNoteShapeInput,
  CreateCanvasTextShapeInput
} from './types.js'

const DEFAULT_PAGE_ID = 'page:page'

/** Compile simplified Agent shape intents into complete tldraw records inside the candidate store. */
export function createCanvasAgentShapeRecords(
  store: Record<string, CanvasRecord>,
  inputs: CreateCanvasAgentShapeInput[]
) {
  const records: CanvasRecord[] = []
  for (const input of inputs) {
    const id = input.id ?? createUniqueShapeId(store)
    if (store[id]) {
      throw new ConflictException(`[CANVAS_RECORD_CONFLICT] Record ${id} already exists. Read it and use updateRecords instead.`)
    }
    const parentId = resolveShapeParent(store, input.parentId)
    const index = chooseShapeIndex(store, parentId)
    const record = createShapeRecord(input, { id, parentId, index })
    store[id] = record
    records.push(record)
  }
  return records
}

function createShapeRecord(
  input: CreateCanvasAgentShapeInput,
  identity: { id: string; parentId: string; index: string }
): CanvasRecord {
  switch (input.type) {
    case 'text':
      return createTextShapeRecord(input, identity)
    case 'geo':
      return createGeoShapeRecord(input, identity)
    case 'note':
      return createNoteShapeRecord(input, identity)
    case 'frame':
      return createFrameShapeRecord(input, identity)
    case 'arrow':
      return createArrowShapeRecord(input, identity)
  }
}

function createTextShapeRecord(
  input: CreateCanvasTextShapeInput,
  identity: { id: string; parentId: string; index: string }
): CanvasRecord {
  return baseShapeRecord(input, identity, 'text', {
    color: input.color ?? 'black',
    size: input.size ?? 'm',
    font: input.font ?? 'draw',
    textAlign: input.textAlign ?? 'start',
    w: input.width ?? 8,
    richText: createRichText(input.text),
    scale: 1,
    autoSize: input.autoSize ?? input.width === undefined
  })
}

function createGeoShapeRecord(
  input: CreateCanvasGeoShapeInput,
  identity: { id: string; parentId: string; index: string }
): CanvasRecord {
  return baseShapeRecord(input, identity, 'geo', {
    w: input.width ?? 100,
    h: input.height ?? 100,
    geo: input.geo ?? 'rectangle',
    dash: input.dash ?? 'draw',
    growY: 0,
    url: '',
    scale: 1,
    color: input.color ?? 'black',
    labelColor: input.labelColor ?? 'black',
    fill: input.fill ?? 'none',
    size: input.size ?? 'm',
    font: input.font ?? 'draw',
    align: input.align ?? 'middle',
    verticalAlign: input.verticalAlign ?? 'middle',
    richText: createRichText(input.text ?? '')
  })
}

function createNoteShapeRecord(
  input: CreateCanvasNoteShapeInput,
  identity: { id: string; parentId: string; index: string }
): CanvasRecord {
  return baseShapeRecord(input, identity, 'note', {
    color: input.color ?? 'black',
    richText: createRichText(input.text),
    size: input.size ?? 'm',
    font: input.font ?? 'draw',
    align: input.align ?? 'middle',
    verticalAlign: input.verticalAlign ?? 'middle',
    labelColor: input.labelColor ?? 'black',
    growY: 0,
    fontSizeAdjustment: 1,
    url: '',
    scale: 1,
    textFirstEditedBy: null
  })
}

function createFrameShapeRecord(
  input: CreateCanvasFrameShapeInput,
  identity: { id: string; parentId: string; index: string }
): CanvasRecord {
  return baseShapeRecord(input, identity, 'frame', {
    w: input.width ?? 320,
    h: input.height ?? 180,
    name: input.name ?? '',
    color: input.color ?? 'black'
  })
}

function createArrowShapeRecord(
  input: CreateCanvasArrowShapeInput,
  identity: { id: string; parentId: string; index: string }
): CanvasRecord {
  return {
    id: identity.id,
    typeName: 'shape',
    type: 'arrow',
    parentId: identity.parentId,
    index: identity.index,
    x: input.start.x,
    y: input.start.y,
    rotation: input.rotation ?? 0,
    opacity: input.opacity ?? 1,
    isLocked: input.isLocked ?? false,
    props: {
      kind: 'arc',
      elbowMidPoint: 0.5,
      dash: input.dash ?? 'draw',
      size: input.size ?? 'm',
      fill: input.fill ?? 'none',
      color: input.color ?? 'black',
      labelColor: input.labelColor ?? 'black',
      bend: input.bend ?? 0,
      start: { x: 0, y: 0 },
      end: { x: input.end.x - input.start.x, y: input.end.y - input.start.y },
      arrowheadStart: input.arrowheadStart ?? 'none',
      arrowheadEnd: input.arrowheadEnd ?? 'arrow',
      richText: createRichText(input.text ?? ''),
      labelPosition: 0.5,
      font: input.font ?? 'draw',
      scale: 1
    },
    meta: {}
  }
}

function baseShapeRecord(
  input: CreateCanvasTextShapeInput | CreateCanvasGeoShapeInput | CreateCanvasNoteShapeInput | CreateCanvasFrameShapeInput,
  identity: { id: string; parentId: string; index: string },
  type: 'text' | 'geo' | 'note' | 'frame',
  props: CanvasJsonObject
): CanvasRecord {
  return {
    id: identity.id,
    typeName: 'shape',
    type,
    parentId: identity.parentId,
    index: identity.index,
    x: input.x,
    y: input.y,
    rotation: input.rotation ?? 0,
    opacity: input.opacity ?? 1,
    isLocked: input.isLocked ?? false,
    props,
    meta: {}
  }
}

function resolveShapeParent(store: Record<string, CanvasRecord>, requestedParentId?: string) {
  if (requestedParentId) {
    const parent = store[requestedParentId]
    if (!parent || (parent.typeName !== 'page' && parent.typeName !== 'shape')) {
      throw new BadRequestException(
        `[CANVAS_SHAPE_PARENT_NOT_FOUND] Parent ${requestedParentId} is not an existing page or shape. Read pages/containers and retry.`
      )
    }
    return requestedParentId
  }

  const pageIds = Object.values(store).filter((record) => record.typeName === 'page').map((record) => record.id)
  if (pageIds.length === 1) return pageIds[0]
  if (pageIds.length > 1) {
    throw new BadRequestException(
      `[CANVAS_SHAPE_PARENT_REQUIRED] Canvas has ${pageIds.length} pages. Pass parentId from canvas_list_records.`
    )
  }
  if (store[DEFAULT_PAGE_ID]) {
    throw new BadRequestException(`[CANVAS_DEFAULT_PAGE_CONFLICT] Record ${DEFAULT_PAGE_ID} exists but is not a page.`)
  }
  store[DEFAULT_PAGE_ID] = {
    id: DEFAULT_PAGE_ID,
    typeName: 'page',
    name: 'Page 1',
    index: generateKeyBetween(null, null),
    meta: {}
  }
  return DEFAULT_PAGE_ID
}

function chooseShapeIndex(store: Record<string, CanvasRecord>, parentId: string) {
  const siblingIndexes = Object.values(store)
    .filter((record) => record.typeName === 'shape' && record.parentId === parentId)
    .flatMap((record) => typeof record.index === 'string' ? [record.index] : [])
    .sort()
  return generateKeyBetween(siblingIndexes.at(-1) ?? null, null)
}

function createUniqueShapeId(store: Record<string, CanvasRecord>) {
  let id = `shape:${randomUUID()}`
  while (store[id]) id = `shape:${randomUUID()}`
  return id
}

function createRichText(text: string): CanvasJsonObject {
  const content: CanvasJsonValue[] = text.split('\n').map((line) => line
    ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
    : { type: 'paragraph' })
  return { type: 'doc', content }
}

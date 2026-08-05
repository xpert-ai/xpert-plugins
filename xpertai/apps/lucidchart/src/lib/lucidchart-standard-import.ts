import type {
  ApplyLucidchartDiagramStageInput,
  LucidchartAgentLineInput,
  LucidchartAgentShapeInput
} from './types.js'

const MAX_STANDARD_IMPORT_BYTES = 2 * 1024 * 1024
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,35}$/

type StandardImportPage = Record<string, unknown> & {
  id: string
  title: string
  shapes: Record<string, unknown>[]
  lines: Record<string, unknown>[]
}

export function createEmptyStandardImportDraft(): Record<string, unknown> {
  return { version: 1, pages: [] }
}

export function normalizeStandardImportDraft(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return createEmptyStandardImportDraft()
  const draft: Record<string, unknown> = {
    version: 1,
    pages: Array.isArray(value.pages) ? cloneJson(value.pages) : []
  }
  for (const key of ['documentSettings', 'collections', 'extensionBootstrapData']) {
    if (value[key] !== undefined) draft[key] = cloneJson(value[key])
  }
  return draft
}

export function applyStandardImportStage(
  source: unknown,
  input: ApplyLucidchartDiagramStageInput
): Record<string, unknown> {
  const draft = normalizeStandardImportDraft(source)
  const pages = normalizePages(draft.pages)
  draft.pages = pages

  assertUniqueInputIds(input)
  let page = pages.find((candidate) => candidate.id === input.pageId)
  if (!page) {
    if (!input.pageTitle?.trim()) throw new Error(`pageTitle is required when creating page "${input.pageId}".`)
    assertIdAvailableAcrossDocument(pages, input.pageId, input.pageId, 'page')
    page = { id: input.pageId, title: input.pageTitle.trim(), shapes: [], lines: [] }
    pages.push(page)
  } else if (input.pageTitle?.trim()) {
    page.title = input.pageTitle.trim()
  }

  if (input.pageSettings) page.settings = toPageSettings(input.pageSettings)
  page.shapes = normalizeRecords(page.shapes)
  page.lines = normalizeRecords(page.lines)

  const removeShapeIds = new Set(input.removeShapeIds ?? [])
  const removeLineIds = new Set(input.removeLineIds ?? [])
  page.shapes = page.shapes.filter((shape) => !removeShapeIds.has(readId(shape)))
  page.lines = page.lines.filter((line) => !removeLineIds.has(readId(line)))

  for (const shape of input.shapes ?? []) {
    assertIdAvailableAcrossDocument(pages, shape.id, page.id, 'shape')
    upsertById(page.shapes, toStandardImportShape(shape))
  }
  for (const line of input.lines ?? []) {
    assertIdAvailableAcrossDocument(pages, line.id, page.id, 'line')
    upsertById(page.lines, toStandardImportLine(line))
  }

  validatePageLineReferences(page)
  assertStandardImportSize(draft)
  return draft
}

export function validateStandardImportDraft(value: unknown) {
  const draft = normalizeStandardImportDraft(value)
  const pages = normalizePages(draft.pages)
  if (!pages.length) throw new Error('Standard Import must contain at least one page.')

  const ids = new Set<string>()
  let drawableCount = 0
  for (const page of pages) {
    validateId(page.id, 'page')
    addUniqueId(ids, page.id, 'page')
    if (!page.title.trim()) throw new Error(`Page "${page.id}" must have a title.`)
    for (const shape of page.shapes) {
      const id = readRequiredId(shape, 'shape')
      addUniqueId(ids, id, 'shape')
      validateStandardShape(shape, id)
      drawableCount += 1
    }
    for (const line of page.lines) {
      const id = readRequiredId(line, 'line')
      addUniqueId(ids, id, 'line')
      validateStandardLine(line, id)
      drawableCount += 1
    }
    validatePageLineReferences(page)
  }
  if (!drawableCount) throw new Error('Standard Import must contain at least one shape or line.')
  assertStandardImportSize(draft)
  return draft
}

export function summarizeStandardImportDraft(value: unknown) {
  const draft = normalizeStandardImportDraft(value)
  const pages = normalizePages(draft.pages)
  return {
    pageCount: pages.length,
    shapeCount: pages.reduce((total, page) => total + page.shapes.length, 0),
    lineCount: pages.reduce((total, page) => total + page.lines.length, 0),
    pages: pages.map((page) => ({
      id: page.id,
      title: page.title,
      shapeCount: page.shapes.length,
      lineCount: page.lines.length
    })),
    byteSize: Buffer.byteLength(JSON.stringify(draft), 'utf8')
  }
}

export function readStandardImportPage(value: unknown, pageId: string, offset = 0, limit = 20) {
  const draft = normalizeStandardImportDraft(value)
  const page = normalizePages(draft.pages).find((candidate) => candidate.id === pageId)
  if (!page) throw new Error(`Lucidchart page "${pageId}" was not found.`)
  const items = [
    ...page.shapes.map((shape) => ({ kind: 'shape' as const, value: shape })),
    ...page.lines.map((line) => ({ kind: 'line' as const, value: line }))
  ]
  return {
    pageId: page.id,
    title: page.title,
    items: items.slice(offset, offset + limit),
    total: items.length,
    offset,
    limit,
    hasMore: offset + limit < items.length
  }
}

function toStandardImportShape(input: LucidchartAgentShapeInput): Record<string, unknown> {
  const shape: Record<string, unknown> = {
    id: input.id,
    type: input.type,
    boundingBox: {
      x: input.x,
      y: input.y,
      w: input.width,
      h: input.height,
      ...(input.rotation === undefined ? {} : { rotation: input.rotation })
    },
    ...(input.text === undefined ? {} : { text: input.text }),
    ...(input.opacity === undefined ? {} : { opacity: input.opacity }),
    ...(input.zIndex === undefined ? {} : { zIndex: input.zIndex })
  }
  if (input.type !== 'text') {
    const style = {
      ...(input.fillColor ? { fill: { type: 'color', color: input.fillColor } } : {}),
      ...(input.strokeColor || input.strokeWidth !== undefined || input.strokeStyle
        ? {
            stroke: {
              ...(input.strokeColor ? { color: input.strokeColor } : {}),
              ...(input.strokeWidth === undefined ? {} : { width: input.strokeWidth }),
              ...(input.strokeStyle ? { style: input.strokeStyle } : {})
            }
          }
        : {}),
      ...(input.textColor ? { textColor: input.textColor } : {}),
      ...(input.rounding === undefined ? {} : { rounding: input.rounding })
    }
    if (Object.keys(style).length) shape.style = style
  }
  return shape
}

function toStandardImportLine(input: LucidchartAgentLineInput): Record<string, unknown> {
  return {
    id: input.id,
    lineType: input.lineType ?? 'straight',
    endpoint1: { type: 'shapeEndpoint', style: input.startStyle ?? 'none', shapeId: input.fromShapeId },
    endpoint2: { type: 'shapeEndpoint', style: input.endStyle ?? 'arrow', shapeId: input.toShapeId },
    ...(input.strokeColor || input.strokeWidth !== undefined || input.strokeStyle
      ? {
          stroke: {
            ...(input.strokeColor ? { color: input.strokeColor } : {}),
            ...(input.strokeWidth === undefined ? {} : { width: input.strokeWidth }),
            ...(input.strokeStyle ? { style: input.strokeStyle } : {})
          }
        }
      : {}),
    ...(input.label ? { text: [{ text: input.label, position: 0.5, side: 'middle' }] } : {}),
    ...(input.zIndex === undefined ? {} : { zIndex: input.zIndex })
  }
}

function toPageSettings(input: NonNullable<ApplyLucidchartDiagramStageInput['pageSettings']>) {
  return {
    ...(input.fillColor ? { fillColor: input.fillColor } : {}),
    ...(input.infiniteCanvas === undefined ? {} : { infiniteCanvas: input.infiniteCanvas }),
    ...(input.width !== undefined && input.height !== undefined
      ? { size: { type: 'custom', w: input.width, h: input.height } }
      : {})
  }
}

function normalizePages(value: unknown): StandardImportPage[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((page, index) => ({
    ...page,
    id: typeof page.id === 'string' ? page.id : `page-${index + 1}`,
    title: typeof page.title === 'string' ? page.title : `Page ${index + 1}`,
    shapes: normalizeRecords(page.shapes),
    lines: normalizeRecords(page.lines)
  }))
}

function normalizeRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function validatePageLineReferences(page: StandardImportPage) {
  const shapeIds = new Set(page.shapes.map(readId).filter(Boolean))
  for (const line of page.lines) {
    const lineId = readRequiredId(line, 'line')
    const fromId = readEndpointShapeId(line.endpoint1)
    const toId = readEndpointShapeId(line.endpoint2)
    if (!fromId || !toId) throw new Error(`Line "${lineId}" must connect two shape endpoints.`)
    if (!shapeIds.has(fromId)) throw new Error(`Line "${lineId}" references missing source shape "${fromId}" on page "${page.id}".`)
    if (!shapeIds.has(toId)) throw new Error(`Line "${lineId}" references missing target shape "${toId}" on page "${page.id}".`)
  }
}

function validateStandardShape(shape: Record<string, unknown>, id: string) {
  if (typeof shape.type !== 'string' || !shape.type.trim()) throw new Error(`Shape "${id}" must have a type.`)
  if (!isRecord(shape.boundingBox)) throw new Error(`Shape "${id}" must have a boundingBox.`)
  for (const key of ['x', 'y', 'w', 'h']) {
    if (typeof shape.boundingBox[key] !== 'number' || !Number.isFinite(shape.boundingBox[key])) {
      throw new Error(`Shape "${id}" boundingBox.${key} must be a finite number.`)
    }
  }
  if ((shape.boundingBox.w as number) <= 0 || (shape.boundingBox.h as number) <= 0) {
    throw new Error(`Shape "${id}" boundingBox width and height must be positive.`)
  }
}

function validateStandardLine(line: Record<string, unknown>, id: string) {
  if (!['straight', 'elbow', 'curved'].includes(String(line.lineType))) {
    throw new Error(`Line "${id}" has an invalid lineType.`)
  }
  for (const key of ['endpoint1', 'endpoint2']) {
    const endpoint = line[key]
    if (!isRecord(endpoint) || endpoint.type !== 'shapeEndpoint' || typeof endpoint.shapeId !== 'string') {
      throw new Error(`Line "${id}" ${key} must be a shapeEndpoint.`)
    }
  }
}

function assertUniqueInputIds(input: ApplyLucidchartDiagramStageInput) {
  const seen = new Set<string>()
  for (const id of [
    ...(input.shapes ?? []).map((item) => item.id),
    ...(input.lines ?? []).map((item) => item.id),
    ...(input.removeShapeIds ?? []),
    ...(input.removeLineIds ?? [])
  ]) {
    validateId(id, 'stage item')
    if (seen.has(id)) throw new Error(`Stage contains duplicate item id "${id}".`)
    seen.add(id)
  }
}

function assertIdAvailableAcrossDocument(
  pages: StandardImportPage[],
  id: string,
  targetPageId: string,
  targetKind: 'page' | 'shape' | 'line'
) {
  validateId(id, targetKind)
  for (const page of pages) {
    if (page.id === id && !(targetKind === 'page' && page.id === targetPageId)) {
      throw new Error(`Item id "${id}" is already used by a page.`)
    }
    for (const shape of page.shapes) {
      if (readId(shape) === id && !(targetKind === 'shape' && page.id === targetPageId)) {
        throw new Error(`Item id "${id}" is already used by a shape on page "${page.id}".`)
      }
    }
    for (const line of page.lines) {
      if (readId(line) === id && !(targetKind === 'line' && page.id === targetPageId)) {
        throw new Error(`Item id "${id}" is already used by a line on page "${page.id}".`)
      }
    }
  }
}

function upsertById(items: Record<string, unknown>[], next: Record<string, unknown>) {
  const index = items.findIndex((item) => readId(item) === readId(next))
  if (index >= 0) items[index] = next
  else items.push(next)
}

function readEndpointShapeId(value: unknown) {
  return isRecord(value) && typeof value.shapeId === 'string' ? value.shapeId : ''
}

function readId(value: Record<string, unknown>) {
  return typeof value.id === 'string' ? value.id : ''
}

function readRequiredId(value: Record<string, unknown>, label: string) {
  const id = readId(value)
  validateId(id, label)
  return id
}

function validateId(id: string, label: string) {
  if (!ID_PATTERN.test(id)) throw new Error(`${label} id "${id}" must use 1-36 alphanumeric or -_.~ characters.`)
}

function addUniqueId(ids: Set<string>, id: string, label: string) {
  if (ids.has(id)) throw new Error(`${label} id "${id}" is not unique within the Standard Import document.`)
  ids.add(id)
}

function assertStandardImportSize(value: Record<string, unknown>) {
  const size = Buffer.byteLength(JSON.stringify(value), 'utf8')
  if (size > MAX_STANDARD_IMPORT_BYTES) throw new Error('Standard Import document.json exceeds the 2 MiB Lucid limit.')
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

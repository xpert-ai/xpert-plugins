import { BadRequestException, ConflictException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type {
  ApplyCanvasRecordBatchInput,
  CanvasJsonObject,
  CanvasJsonValue,
  CanvasPersistentRecordType,
  CanvasRecord,
  CanvasRecordFieldPatch,
  CanvasSnapshotData,
  ListCanvasRecordsInput
} from './types.js'
import type { CanvasSnapshotIssue } from './canvas-snapshot.validation.js'
import { createCanvasAgentShapeRecords } from './canvas-agent-shapes.js'

const RECORD_TYPE_ORDER: Record<CanvasPersistentRecordType, number> = {
  document: 0,
  page: 1,
  shape: 2,
  asset: 3,
  binding: 4
}

export type CanvasAgentOperationMarker = CanvasJsonObject & {
  operationId: string
  digest: string
  batchId: string
  stageIndex: number
  stageLabel: string
  isFinalStage: boolean
  baseRevision: number
  createdRecordIds: string[]
  updatedRecordIds: string[]
  removedRecordIds: string[]
}

export function prepareCanvasAgentRecordBatch(snapshot: CanvasSnapshotData, input: ApplyCanvasRecordBatchInput) {
  const store = structuredClone(snapshot.store)
  const createdRecordIds: string[] = []
  const updatedRecordIds: string[] = []
  const removedRecordIds: string[] = []

  const createdShapes = createCanvasAgentShapeRecords(store, input.createShapes ?? [])
  createdRecordIds.push(...createdShapes.map((record) => record.id))

  for (const update of input.updateRecords ?? []) {
    const current = store[update.id]
    if (!current) {
      throw canvasConflict(`Record ${update.id} no longer exists.`)
    }
    assertRecordChecksum(current, update.expectedChecksum)
    store[update.id] = applyCanvasRecordFieldPatch(current, update.patch)
    updatedRecordIds.push(update.id)
  }

  for (const removal of input.removeRecords ?? []) {
    const current = store[removal.id]
    if (!current) {
      throw canvasConflict(`Record ${removal.id} no longer exists.`)
    }
    assertRecordChecksum(current, removal.expectedChecksum)
    delete store[removal.id]
    removedRecordIds.push(removal.id)
  }

  return {
    candidate: { ...snapshot, store },
    createdRecordIds,
    updatedRecordIds,
    removedRecordIds
  }
}

export function diffCanvasAgentRecords(previous: CanvasSnapshotData, next: CanvasSnapshotData) {
  const removeRecordIds = Object.keys(previous.store).filter((recordId) => !(recordId in next.store))
  const putRecords = Object.entries(next.store)
    .filter(([recordId, record]) => !previous.store[recordId] || canvasRecordChecksum(previous.store[recordId]) !== canvasRecordChecksum(record))
    .map(([, record]) => record)
  return { putRecords, removeRecordIds }
}

export function assertRequestedRecordsSurvivedNormalization(
  snapshot: CanvasSnapshotData,
  requestedRecordIds: string[],
  skippedRecords: CanvasSnapshotIssue[] = []
) {
  const missing = requestedRecordIds.filter((recordId) => !snapshot.store[recordId])
  if (missing.length) {
    const relevantIssues = skippedRecords.filter((issue) => issue.id === '(snapshot)' || missing.includes(issue.id))
    const details = relevantIssues.length
      ? relevantIssues.map((issue) => `${issue.id}: ${issue.reason}`)
      : missing.map((recordId) => `${recordId}: tldraw removed the record without a validation detail`)
    throw new BadRequestException(
      `[CANVAS_INVALID_RECORD_BATCH] ${details.join('; ')}`
    )
  }
}

export function canvasAgentOperationDigest(input: ApplyCanvasRecordBatchInput) {
  return sha256(stableStringify(input as object as CanvasJsonValue))
}

export function createCanvasAgentOperationMarker(
  input: ApplyCanvasRecordBatchInput,
  recordIds: { createdRecordIds: string[]; updatedRecordIds: string[]; removedRecordIds: string[] }
): CanvasAgentOperationMarker {
  return {
    operationId: input.operationId,
    digest: canvasAgentOperationDigest(input),
    batchId: input.batchId,
    stageIndex: input.stageIndex,
    stageLabel: input.stageLabel,
    isFinalStage: input.isFinalStage,
    baseRevision: input.baseRevision,
    createdRecordIds: recordIds.createdRecordIds,
    updatedRecordIds: recordIds.updatedRecordIds,
    removedRecordIds: recordIds.removedRecordIds
  }
}

export function assertMatchingOperation(marker: CanvasAgentOperationMarker, input: ApplyCanvasRecordBatchInput) {
  const digest = canvasAgentOperationDigest(input)
  if (marker.digest !== digest) {
    throw new ConflictException(
      `[CANVAS_OPERATION_ID_REUSED] operationId ${input.operationId} was already used for different Canvas content.`
    )
  }
}

export function asCanvasAgentOperationMarker(value: CanvasJsonObject | undefined): CanvasAgentOperationMarker | null {
  if (
    !value ||
    typeof value.operationId !== 'string' ||
    typeof value.digest !== 'string' ||
    typeof value.batchId !== 'string' ||
    typeof value.stageIndex !== 'number' ||
    typeof value.stageLabel !== 'string' ||
    typeof value.isFinalStage !== 'boolean' ||
    typeof value.baseRevision !== 'number' ||
    !isStringArray(value.createdRecordIds) ||
    !isStringArray(value.updatedRecordIds) ||
    !isStringArray(value.removedRecordIds)
  ) {
    return null
  }
  return value as CanvasAgentOperationMarker
}

export function canvasRecordChecksum(record: CanvasRecord) {
  return sha256(stableStringify(record))
}

export function summarizeCanvasRecord(record: CanvasRecord) {
  const props = asJsonObject(record.props)
  return {
    id: record.id,
    typeName: record.typeName,
    type: record.type,
    parentId: record.parentId,
    index: record.index,
    x: record.x,
    y: record.y,
    rotation: record.rotation,
    name: typeof record.name === 'string' ? truncate(record.name, 240) : undefined,
    preview: previewRecord(record, props),
    bounds: numericBounds(props),
    checksum: canvasRecordChecksum(record)
  }
}

export function detailCanvasRecord(record: CanvasRecord) {
  return {
    id: record.id,
    typeName: record.typeName,
    type: record.type,
    name: record.name,
    parentId: record.parentId,
    index: record.index,
    x: record.x,
    y: record.y,
    rotation: record.rotation,
    opacity: record.opacity,
    isLocked: record.isLocked,
    fromId: record.fromId,
    toId: record.toId,
    props: redactRecordProps(record, asJsonObject(record.props)),
    meta: redactAgentJsonObject(asJsonObject(record.meta)),
    checksum: canvasRecordChecksum(record)
  }
}

export function listCanvasRecordSummaries(snapshot: CanvasSnapshotData, input: ListCanvasRecordsInput) {
  const query = input.query?.trim().toLowerCase()
  const records = Object.values(snapshot.store)
    .filter((record) => isPersistentRecord(record, input.typeNames))
    .filter((record) => !input.shapeTypes?.length || (record.typeName === 'shape' && Boolean(record.type && input.shapeTypes.includes(record.type))))
    .filter((record) => !input.parentId || record.parentId === input.parentId)
    .filter((record) => !input.pageId || recordBelongsToPage(snapshot.store, record, input.pageId))
    .filter((record) => !query || searchableRecordText(record).includes(query))
    .sort(compareRecords)

  const cursorId = input.cursor ? decodeRecordCursor(input.cursor) : null
  const cursorIndex = cursorId ? records.findIndex((record) => record.id === cursorId) : -1
  if (cursorId && cursorIndex < 0) {
    throw new BadRequestException('[CANVAS_INVALID_CURSOR] The record cursor is invalid for this revision and filter.')
  }
  const start = cursorIndex + 1
  const limit = Math.max(1, Math.min(input.limit ?? 20, 40))
  const page = records.slice(start, start + limit)
  const hasMore = start + page.length < records.length

  return {
    items: page.map(summarizeCanvasRecord),
    total: records.length,
    limit,
    hasMore,
    nextCursor: hasMore && page.length ? encodeRecordCursor(page.at(-1)!.id) : null
  }
}

function applyCanvasRecordFieldPatch(record: CanvasRecord, patch: CanvasRecordFieldPatch) {
  const next = structuredClone(record)
  if (patch.name !== undefined) next.name = patch.name
  if (patch.parentId !== undefined) next.parentId = patch.parentId
  if (patch.index !== undefined) next.index = patch.index
  if (patch.x !== undefined) next.x = patch.x
  if (patch.y !== undefined) next.y = patch.y
  if (patch.rotation !== undefined) next.rotation = patch.rotation
  if (patch.opacity !== undefined) next.opacity = patch.opacity
  if (patch.isLocked !== undefined) next.isLocked = patch.isLocked
  if (patch.fromId !== undefined) next.fromId = patch.fromId
  if (patch.toId !== undefined) next.toId = patch.toId
  if (patch.props || patch.unsetProps?.length) {
    next.props = mergeJsonObject(asJsonObject(next.props), patch.props, patch.unsetProps)
  }
  if (patch.meta || patch.unsetMeta?.length) {
    next.meta = mergeJsonObject(asJsonObject(next.meta), patch.meta, patch.unsetMeta)
  }
  return next
}

function mergeJsonObject(current: CanvasJsonObject, patch?: CanvasJsonObject, unset?: string[]) {
  const next = { ...current, ...(patch ?? {}) }
  for (const key of unset ?? []) delete next[key]
  return next
}

function assertRecordChecksum(record: CanvasRecord, expectedChecksum: string) {
  const actualChecksum = canvasRecordChecksum(record)
  if (actualChecksum !== expectedChecksum) {
    throw canvasConflict(`Record ${record.id} changed after it was read. Read it again before retrying.`)
  }
}

function canvasConflict(message: string) {
  return new ConflictException(`[CANVAS_RECORD_CONFLICT] ${message}`)
}

function isPersistentRecord(record: CanvasRecord, allowed?: CanvasPersistentRecordType[]) {
  const typeName = record.typeName
  if (!typeName || !(typeName in RECORD_TYPE_ORDER)) return false
  return !allowed?.length || allowed.includes(typeName as CanvasPersistentRecordType)
}

function compareRecords(left: CanvasRecord, right: CanvasRecord) {
  const leftRank = RECORD_TYPE_ORDER[left.typeName as CanvasPersistentRecordType] ?? 99
  const rightRank = RECORD_TYPE_ORDER[right.typeName as CanvasPersistentRecordType] ?? 99
  return leftRank - rightRank || String(left.index ?? '').localeCompare(String(right.index ?? '')) || left.id.localeCompare(right.id)
}

function recordBelongsToPage(store: Record<string, CanvasRecord>, record: CanvasRecord, pageId: string) {
  if (record.id === pageId) return true
  if (record.typeName === 'binding') {
    return [record.fromId, record.toId].some((recordId) => typeof recordId === 'string' && recordBelongsToPage(store, store[recordId], pageId))
  }
  let current: CanvasRecord | undefined = record
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.id === pageId || current.parentId === pageId) return true
    current = typeof current.parentId === 'string' ? store[current.parentId] : undefined
  }
  return false
}

function searchableRecordText(record: CanvasRecord) {
  const props = asJsonObject(record.props)
  return [record.id, record.typeName, record.type, record.name, props.name, props.text, props.altText]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}

function previewRecord(record: CanvasRecord, props: CanvasJsonObject) {
  for (const value of [props.text, props.name, props.altText, record.name]) {
    if (typeof value === 'string' && value.trim()) return truncate(value.trim(), 240)
  }
  return undefined
}

function numericBounds(props: CanvasJsonObject) {
  const width = typeof props.w === 'number' && Number.isFinite(props.w) ? props.w : undefined
  const height = typeof props.h === 'number' && Number.isFinite(props.h) ? props.h : undefined
  return width === undefined && height === undefined ? undefined : { width, height }
}

function redactRecordProps(record: CanvasRecord, props: CanvasJsonObject) {
  const safe = redactAgentJsonObject(props)
  if (record.typeName === 'asset' && 'url' in safe) safe.url = '[redacted:url]'
  return safe
}

function redactAgentJsonObject(value: CanvasJsonObject) {
  const result: CanvasJsonObject = {}
  for (const [key, item] of Object.entries(value)) {
    result[key] = redactAgentJsonValue(item ?? null, key)
  }
  return result
}

function redactAgentJsonValue(value: CanvasJsonValue, key: string): CanvasJsonValue {
  if (/(token|secret|password|credential|authorization|api[-_]?key|base64|dataUrl|src|url|path)$/i.test(key)) {
    return `[redacted:${key}]`
  }
  if (typeof value === 'string' && value.startsWith('data:')) return '[redacted:data-url]'
  if (Array.isArray(value)) return value.map((item) => redactAgentJsonValue(item, key))
  if (value && typeof value === 'object') return redactAgentJsonObject(value)
  return value
}

function encodeRecordCursor(recordId: string) {
  return Buffer.from(JSON.stringify({ version: 1, recordId }), 'utf8').toString('base64url')
}

function decodeRecordCursor(cursor: string) {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { version?: number; recordId?: string }
    if (value.version !== 1 || typeof value.recordId !== 'string' || !value.recordId) throw new Error('Invalid cursor')
    return value.recordId
  } catch {
    throw new BadRequestException('[CANVAS_INVALID_CURSOR] The record cursor is malformed.')
  }
}

function asJsonObject(value: CanvasJsonValue | undefined): CanvasJsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function stableStringify(value: CanvasJsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key] ?? null)}`).join(',')}}`
}

function truncate(value: string, maximum: number) {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`
}

function isStringArray(value: CanvasJsonValue | undefined): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

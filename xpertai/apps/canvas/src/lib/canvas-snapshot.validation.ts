import { createTLStore } from 'tldraw'
import type { CanvasJsonObject, CanvasJsonValue, CanvasRecord, CanvasSnapshotData } from './types.js'

export class CanvasSnapshotValidationError extends Error {
  constructor(readonly issues: CanvasSnapshotIssue[]) {
    super(issues.map((issue) => `${issue.id}: ${issue.reason}`).join('; '))
    this.name = 'CanvasSnapshotValidationError'
  }
}

export interface CanvasSnapshotIssue {
  id: string
  typeName: string
  type: string | null
  reason: string
}

export type NormalizedCanvasSnapshot = CanvasSnapshotData

type CanvasSnapshotCandidate = CanvasJsonValue | object | null | undefined

type TldrawStore = ReturnType<typeof createTLStore>
type TldrawStoreRecord = Parameters<TldrawStore['put']>[0][number]
type TldrawStoreRecordId = Parameters<TldrawStore['get']>[0]
type TldrawStoreWithMigration = TldrawStore & {
  migrateSnapshot?: (snapshot: CanvasSnapshotData) => object
}

export function isCanvasSnapshot(value: CanvasSnapshotCandidate): value is CanvasSnapshotData {
  return Boolean(isPlainObject(value) && isPlainObject(value.store) && value.schema !== undefined)
}

export function createEmptyCanvasSnapshot(): NormalizedCanvasSnapshot {
  const store = createTLStore()
  const snapshot = store.getStoreSnapshot()
  return normalizeCanvasSnapshot({
    schema: snapshot.schema as object as CanvasJsonValue,
    store: snapshot.store as object as Record<string, CanvasRecord>
  })
}

export function normalizeCanvasSnapshot(snapshot: CanvasSnapshotCandidate): NormalizedCanvasSnapshot {
  const result = sanitizeCanvasSnapshot(snapshot)
  if (!result.snapshot) {
    throw new CanvasSnapshotValidationError(result.skippedRecords.length ? result.skippedRecords : [issueFor(snapshot, 'Invalid tldraw snapshot.')])
  }
  return result.snapshot
}

export function sanitizeCanvasSnapshot(snapshot: CanvasSnapshotCandidate): { snapshot: NormalizedCanvasSnapshot | null; skippedRecords: CanvasSnapshotIssue[] } {
  if (!isCanvasSnapshot(snapshot)) {
    return { snapshot: null, skippedRecords: [] }
  }

  const validationStore = createTLStore()
  const migrationStore = validationStore as TldrawStoreWithMigration
  const skippedRecords: CanvasSnapshotIssue[] = []
  let migratedSnapshot: CanvasSnapshotData

  try {
    const migrationResult = typeof migrationStore.migrateSnapshot === 'function' ? migrationStore.migrateSnapshot(snapshot) : snapshot
    migratedSnapshot = toCanvasSnapshotData(migrationResult)
  } catch (error) {
    return {
      snapshot: null,
      skippedRecords: [
        {
          id: '(snapshot)',
          typeName: 'snapshot',
          type: null,
          reason: firstErrorLine(error instanceof Error ? error : String(error))
        }
      ]
    }
  }

  const validStore: Record<string, CanvasRecord> = {}
  for (const record of Object.values(migratedSnapshot.store ?? {})) {
    if (!isCanvasRecord(record)) {
      skippedRecords.push(issueFor(record, 'Record must be an object.'))
      continue
    }

    try {
      validationStore.put([record as object as TldrawStoreRecord], 'initialize')
      const storedRecord = validationStore.get(record.id as TldrawStoreRecordId) as object | null | undefined
      if (storedRecord && isCanvasRecord(storedRecord)) {
        validStore[record.id] = storedRecord
      }
    } catch (error) {
      skippedRecords.push(issueFor(record, error instanceof Error ? error : String(error)))
    }
  }

  const prunedStore = pruneRecordsWithMissingDependencies(validStore, skippedRecords)

  return {
    snapshot: {
      schema: migratedSnapshot.schema,
      store: prunedStore
    },
    skippedRecords
  }
}

export function summarizeSnapshot(snapshot: CanvasSnapshotCandidate) {
  if (!isCanvasSnapshot(snapshot)) {
    return {
      recordCount: 0,
      pageCount: 0,
      shapeCount: 0,
      assetCount: 0
    }
  }
  const records = Object.values(snapshot.store ?? {})
  return {
    recordCount: records.length,
    pageCount: records.filter((record) => record.typeName === 'page').length,
    shapeCount: records.filter((record) => record.typeName === 'shape').length,
    assetCount: records.filter((record) => record.typeName === 'asset').length
  }
}

export function compactSnapshotForAgent(snapshot: CanvasSnapshotCandidate) {
  if (!isCanvasSnapshot(snapshot)) {
    return null
  }
  const records = Object.values(snapshot.store ?? {})
  return {
    ...summarizeSnapshot(snapshot),
    pages: records
      .filter((record) => record.typeName === 'page')
      .map((record) => ({ id: record.id, name: record.name, index: record.index })),
    shapes: records
      .filter((record) => record.typeName === 'shape')
      .slice(0, 200)
      .map((record) => compactShapeRecord(record))
  }
}

export function compactRecordForAgent(record: CanvasSnapshotCandidate) {
  if (!isPlainObject(record)) {
    return record
  }
  if (!isCanvasRecord(record)) {
    return record
  }
  if (record.typeName === 'asset' && record.type === 'image') {
    const props = isPlainObject(record.props) ? record.props : {}
    const src = typeof props.src === 'string' ? props.src : ''
    return {
      ...record,
      props: {
        ...props,
        src: src.startsWith('data:') ? `[data-url:${src.length}]` : src
      }
    }
  }
  if (record.typeName === 'shape') {
    return compactShapeRecord(record)
  }
  return record
}

function compactShapeRecord(record: CanvasRecord) {
  const props = isPlainObject(record.props) ? record.props : {}
  return {
    id: record.id,
    typeName: record.typeName,
    type: record.type,
    parentId: record.parentId,
    index: record.index,
    x: record.x,
    y: record.y,
    rotation: record.rotation,
    meta: record.meta,
    props: compactShapeProps(props)
  }
}

function compactShapeProps(props: CanvasJsonObject) {
  const compact: CanvasJsonObject = {}
  for (const key of ['w', 'h', 'name', 'text', 'richText', 'assetId', 'url', 'altText', 'color', 'size', 'dash', 'fill', 'start', 'end']) {
    if (props[key] !== undefined) {
      compact[key] = props[key]
    }
  }
  return compact
}

function getRecordDependencies(record: CanvasRecord) {
  const dependencies: string[] = []
  if (record.typeName === 'shape') {
    if (typeof record.parentId === 'string') {
      dependencies.push(record.parentId)
    }
    if (record.type === 'image' && isPlainObject(record.props) && typeof record.props.assetId === 'string') {
      dependencies.push(record.props.assetId)
    }
  }
  if (record.typeName === 'binding') {
    const props = isPlainObject(record.props) ? record.props : {}
    const fromId = typeof record.fromId === 'string' ? record.fromId : props.fromId
    const toId = typeof record.toId === 'string' ? record.toId : props.toId
    if (typeof fromId === 'string') {
      dependencies.push(fromId)
    }
    if (typeof toId === 'string') {
      dependencies.push(toId)
    }
  }
  return dependencies
}

function pruneRecordsWithMissingDependencies(store: Record<string, CanvasRecord>, skippedRecords: CanvasSnapshotIssue[]) {
  const prunedStore = { ...store }
  let changed = true

  while (changed) {
    changed = false
    for (const record of Object.values(prunedStore)) {
      const missingDependency = getRecordDependencies(record).find((id) => !prunedStore[id])
      if (!missingDependency) {
        continue
      }
      delete prunedStore[String(record.id)]
      skippedRecords.push(issueFor(record, `Missing dependent record: ${missingDependency}`))
      changed = true
    }
  }

  return prunedStore
}

function issueFor(record: CanvasSnapshotCandidate, reason: Error | string): CanvasSnapshotIssue {
  const object = isPlainObject(record) ? record : {}
  return {
    id: typeof object.id === 'string' ? object.id : '(missing id)',
    typeName: typeof object.typeName === 'string' ? object.typeName : '(missing typeName)',
    type: typeof object.type === 'string' ? object.type : null,
    reason: firstErrorLine(reason)
  }
}

function firstErrorLine(error: Error | string) {
  return error instanceof Error ? error.message.split('\n')[0] : String(error).split('\n')[0]
}

function isPlainObject(value: CanvasSnapshotCandidate): value is CanvasJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isCanvasRecord(value: CanvasSnapshotCandidate): value is CanvasRecord {
  return isPlainObject(value) && typeof value.id === 'string'
}

function toCanvasSnapshotData(value: object): CanvasSnapshotData {
  const object = isPlainObject(value) ? value : {}
  return {
    schema: (object.schema ?? {}) as object as CanvasJsonValue,
    store: isPlainObject(object.store) ? (object.store as object as Record<string, CanvasRecord>) : {}
  }
}

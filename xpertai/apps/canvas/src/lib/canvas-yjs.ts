import { assertSharedValueBase, createSharedValue, patchSharedMap, sharedValueJson, type CanvasSharedValue } from './canvas-yjs-values.js'
import * as Y from 'yjs'
import { CANVAS_COLLABORATION_SCHEMA_VERSION } from './constants.js'
import type { CanvasJsonObject, CanvasJsonValue, CanvasRecord, CanvasSnapshotData } from './types.js'

export const CANVAS_YJS_SCHEMA_VERSION = CANVAS_COLLABORATION_SCHEMA_VERSION
export const CANVAS_YJS_METADATA_MAP = 'canvas'
export const CANVAS_YJS_RECORDS_MAP = 'records'
export const CANVAS_YJS_RECORDS_V2_MAP = 'records-v2'
export const CANVAS_YJS_OPERATIONS_MAP = 'operations'

export type CanvasYjsMutation = {
  putRecords?: CanvasRecord[]
  /** Browser before-images preserve unrelated remote properties. */
  previousRecords?: Record<string, CanvasRecord>
  removeRecordIds?: string[]
  schema?: CanvasJsonValue
  operation?: CanvasJsonObject & { operationId: string }
}

/** Create the property/text-level Yjs document used by both the platform Provider and tldraw Workbench. */
export function createCanvasYDoc(snapshot: CanvasSnapshotData) {
  const doc = new Y.Doc()
  writeCanvasSnapshotToYDoc(doc, snapshot)
  return doc
}

/** Replace the complete tldraw store. Use only for initialization, imports, and version restores. */
export function writeCanvasSnapshotToYDoc(doc: Y.Doc, snapshot: CanvasSnapshotData, origin = 'canvas:initialize') {
  doc.transact(() => {
    const metadata = doc.getMap<CanvasJsonValue>(CANVAS_YJS_METADATA_MAP)
    const version = metadata.get('schemaVersion') === 1 ? 1 : CANVAS_YJS_SCHEMA_VERSION
    metadata.set('schemaVersion', version)
    metadata.set('storeSchema', cloneJson(snapshot.schema))

    if (version === 1) {
      const records = doc.getMap<CanvasRecord>(CANVAS_YJS_RECORDS_MAP)
      for (const recordId of [...records.keys()]) records.delete(recordId)
      for (const [recordId, record] of Object.entries(snapshot.store)) records.set(recordId, cloneJson(record))
    } else {
      const records = doc.getMap<Y.Map<CanvasSharedValue>>(CANVAS_YJS_RECORDS_V2_MAP)
      for (const recordId of [...records.keys()]) records.delete(recordId)
      for (const [recordId, record] of Object.entries(snapshot.store)) records.set(recordId, createSharedValue(record) as Y.Map<CanvasSharedValue>)
    }
    const operations = doc.getMap<CanvasJsonObject>(CANVAS_YJS_OPERATIONS_MAP)
    for (const operationId of [...operations.keys()]) operations.delete(operationId)
  }, origin)
}

/** Materialize the canonical tldraw snapshot from the current Yjs record map. */
export function materializeCanvasYDoc(doc: Y.Doc): CanvasSnapshotData {
  const metadata = doc.getMap<CanvasJsonValue>(CANVAS_YJS_METADATA_MAP)
  const version = metadata.get('schemaVersion')
  if (version !== 1 && version !== 2) throw new Error('CANVAS_SCHEMA_UNSUPPORTED')
  if (version === 1 && doc.getMap(CANVAS_YJS_RECORDS_V2_MAP).size) throw new Error('CANVAS_SCHEMA_DOWNGRADE_REJECTED')
  if (version === 2 && doc.getMap(CANVAS_YJS_RECORDS_MAP).size) throw new Error('CANVAS_LEGACY_WRITE_REJECTED')
  const records = version === 1 ? doc.getMap<CanvasRecord>(CANVAS_YJS_RECORDS_MAP) : doc.getMap<Y.Map<CanvasSharedValue>>(CANVAS_YJS_RECORDS_V2_MAP)
  const store: Record<string, CanvasRecord> = {}
  for (const [id, record] of records.entries()) {
    if (version === 2 && !(record instanceof Y.Map)) throw new Error('CANVAS_RECORD_SCHEMA_INVALID')
    const value = (record instanceof Y.Map ? sharedValueJson(record) : cloneJson(record)) as CanvasRecord
    if (value.id !== id || typeof value.typeName !== 'string') throw new Error('CANVAS_RECORD_IDENTITY_INVALID')
    Object.defineProperty(store, id, { value, enumerable: true, configurable: true, writable: true })
  }
  return { schema: cloneJson(metadata.get('storeSchema') ?? {}), store }
}

/** Apply a record delta and return only the Yjs update produced by that mutation. */
export function patchCanvasYDoc(doc: Y.Doc, mutation: CanvasYjsMutation, origin: unknown) {
  const ids = (mutation.putRecords ?? []).map((record) => record.id)
  if (new Set(ids).size !== ids.length) throw new Error('CANVAS_DUPLICATE_RECORD_MUTATION')
  const version = doc.getMap<CanvasJsonValue>(CANVAS_YJS_METADATA_MAP).get('schemaVersion') ?? CANVAS_YJS_SCHEMA_VERSION
  if (version !== 1 && version !== 2) throw new Error('CANVAS_SCHEMA_UNSUPPORTED')
  if (version === 1 && doc.getMap(CANVAS_YJS_RECORDS_V2_MAP).size) throw new Error('CANVAS_SCHEMA_DOWNGRADE_REJECTED')
  if (version === 2) {
    const records = doc.getMap<Y.Map<CanvasSharedValue>>(CANVAS_YJS_RECORDS_V2_MAP)
    for (const record of mutation.putRecords ?? []) {
      const current = records.get(record.id)
      if (current) assertSharedValueBase(current, record, mutation.previousRecords?.[record.id] ?? sharedValueJson(current))
    }
  }
  const before = Y.encodeStateVector(doc)
  doc.transact(() => {
    const metadata = doc.getMap<CanvasJsonValue>(CANVAS_YJS_METADATA_MAP)
    if (!metadata.has('schemaVersion')) metadata.set('schemaVersion', version)
    if (mutation.schema !== undefined) metadata.set('storeSchema', cloneJson(mutation.schema))
    if (version === 1) {
      const records = doc.getMap<CanvasRecord>(CANVAS_YJS_RECORDS_MAP)
      for (const id of mutation.removeRecordIds ?? []) records.delete(id)
      for (const record of mutation.putRecords ?? []) records.set(record.id, cloneJson(record))
    } else {
      const records = doc.getMap<Y.Map<CanvasSharedValue>>(CANVAS_YJS_RECORDS_V2_MAP)
      for (const id of mutation.removeRecordIds ?? []) records.delete(id)
      for (const record of mutation.putRecords ?? []) {
        const current = records.get(record.id)
        if (current) patchSharedMap(current, record, mutation.previousRecords?.[record.id] ?? sharedValueJson(current) as CanvasRecord)
        else records.set(record.id, createSharedValue(record) as Y.Map<CanvasSharedValue>)
      }
    }
    if (mutation.operation) {
      doc.getMap<CanvasJsonObject>(CANVAS_YJS_OPERATIONS_MAP).set(
        mutation.operation.operationId,
        cloneJson(mutation.operation)
      )
    }
  }, origin)
  return Y.encodeStateAsUpdate(doc, before)
}

/** Return a durable idempotency marker written in the same Yjs transaction as an Agent stage. */
export function getCanvasYjsOperation(doc: Y.Doc, operationId: string) {
  return doc.getMap<CanvasJsonObject>(CANVAS_YJS_OPERATIONS_MAP).get(operationId)
}

export function encodeCanvasYDoc(doc: Y.Doc) {
  return {
    stateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
    stateVectorBase64: Buffer.from(Y.encodeStateVector(doc)).toString('base64')
  }
}

export function decodeCanvasYDoc(stateBase64?: string | null) {
  const doc = new Y.Doc()
  if (stateBase64) Y.applyUpdate(doc, Buffer.from(stateBase64, 'base64'))
  return doc
}

function cloneJson<T extends CanvasJsonValue | CanvasRecord>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

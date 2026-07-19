import * as Y from 'yjs'
import { CANVAS_COLLABORATION_SCHEMA_VERSION } from './constants.js'
import type { CanvasJsonObject, CanvasJsonValue, CanvasRecord, CanvasSnapshotData } from './types.js'

export const CANVAS_YJS_SCHEMA_VERSION = CANVAS_COLLABORATION_SCHEMA_VERSION
export const CANVAS_YJS_METADATA_MAP = 'canvas'
export const CANVAS_YJS_RECORDS_MAP = 'records'
export const CANVAS_YJS_OPERATIONS_MAP = 'operations'

export type CanvasYjsMutation = {
  putRecords?: CanvasRecord[]
  removeRecordIds?: string[]
  schema?: CanvasJsonValue
  operation?: CanvasJsonObject & { operationId: string }
}

/** Create the record-level Yjs document used by both the platform Provider and tldraw Workbench. */
export function createCanvasYDoc(snapshot: CanvasSnapshotData) {
  const doc = new Y.Doc()
  writeCanvasSnapshotToYDoc(doc, snapshot)
  return doc
}

/** Replace the complete tldraw store. Use only for initialization, imports, and version restores. */
export function writeCanvasSnapshotToYDoc(doc: Y.Doc, snapshot: CanvasSnapshotData, origin = 'canvas:initialize') {
  doc.transact(() => {
    const metadata = doc.getMap<CanvasJsonValue>(CANVAS_YJS_METADATA_MAP)
    metadata.set('schemaVersion', CANVAS_YJS_SCHEMA_VERSION)
    metadata.set('storeSchema', cloneJson(snapshot.schema))

    const records = doc.getMap<CanvasRecord>(CANVAS_YJS_RECORDS_MAP)
    for (const recordId of [...records.keys()]) records.delete(recordId)
    for (const [recordId, record] of Object.entries(snapshot.store)) {
      records.set(recordId, cloneJson(record))
    }
    const operations = doc.getMap<CanvasJsonObject>(CANVAS_YJS_OPERATIONS_MAP)
    for (const operationId of [...operations.keys()]) operations.delete(operationId)
  }, origin)
}

/** Materialize the canonical tldraw snapshot from the current Yjs record map. */
export function materializeCanvasYDoc(doc: Y.Doc): CanvasSnapshotData {
  const metadata = doc.getMap<CanvasJsonValue>(CANVAS_YJS_METADATA_MAP)
  const records = doc.getMap<CanvasRecord>(CANVAS_YJS_RECORDS_MAP)
  return {
    schema: cloneJson(metadata.get('storeSchema') ?? {}),
    store: Object.fromEntries([...records.entries()].map(([recordId, record]) => [recordId, cloneJson(record)]))
  }
}

/** Apply a record delta and return only the Yjs update produced by that mutation. */
export function patchCanvasYDoc(doc: Y.Doc, mutation: CanvasYjsMutation, origin: unknown) {
  const before = Y.encodeStateVector(doc)
  doc.transact(() => {
    const metadata = doc.getMap<CanvasJsonValue>(CANVAS_YJS_METADATA_MAP)
    const records = doc.getMap<CanvasRecord>(CANVAS_YJS_RECORDS_MAP)
    metadata.set('schemaVersion', CANVAS_YJS_SCHEMA_VERSION)
    if (mutation.schema !== undefined) metadata.set('storeSchema', cloneJson(mutation.schema))
    for (const recordId of mutation.removeRecordIds ?? []) records.delete(recordId)
    for (const record of mutation.putRecords ?? []) records.set(record.id, cloneJson(record))
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

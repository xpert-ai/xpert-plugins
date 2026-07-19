import type { ICollaborationPresence } from '@xpert-ai/contracts'
import type { CollaborationSessionDescriptor } from '@xpert-ai/plugin-sdk/collaboration-client'
import * as Y from 'yjs'
import {
  CANVAS_YJS_RECORDS_MAP,
  materializeCanvasYDoc,
  patchCanvasYDoc
} from '../../../canvas-yjs.js'
import type { CanvasRecord, CanvasSnapshotData } from '../../../types.js'
import type { CanvasStoreChanges } from './autosave.js'

const PERSISTENT_RECORD_TYPES = new Set(['asset', 'binding', 'document', 'page', 'shape'])

export const LOCAL_TLDRAW_ORIGIN = { source: 'canvas-tldraw-workbench' }

export type CanvasCollaborationDescriptor = CollaborationSessionDescriptor & {
  canvasDocumentId: string
}

export type OpenCanvasPayload = {
  collab: CanvasCollaborationDescriptor
}

export type CanvasPresenceState = ICollaborationPresence

/** Convert a tldraw user transaction into one record-level Yjs update. */
export function applyTldrawChangesToYDoc(doc: Y.Doc, changes: CanvasStoreChanges) {
  const putRecords = [
    ...Object.values(changes.added),
    ...Object.values(changes.updated).map(([, record]) => record)
  ]
    .filter((record) => PERSISTENT_RECORD_TYPES.has(record.typeName))
    .map((record) => cloneRecord(record))
  const removeRecordIds = Object.values(changes.removed)
    .filter((record) => PERSISTENT_RECORD_TYPES.has(record.typeName))
    .map((record) => record.id)
  if (!putRecords.length && !removeRecordIds.length) return false
  patchCanvasYDoc(doc, { putRecords, removeRecordIds }, LOCAL_TLDRAW_ORIGIN)
  return true
}

export function readCanvasSnapshotFromYDoc(doc: Y.Doc): CanvasSnapshotData {
  return materializeCanvasYDoc(doc)
}

export function hasCanvasYjsContent(doc: Y.Doc) {
  return doc.getMap<CanvasRecord>(CANVAS_YJS_RECORDS_MAP).size > 0
}

function cloneRecord(record: { id: string; typeName: string }) {
  return JSON.parse(JSON.stringify(record)) as CanvasRecord
}

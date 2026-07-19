import * as Y from 'yjs'
import {
  createCanvasYDoc,
  decodeCanvasYDoc,
  encodeCanvasYDoc,
  getCanvasYjsOperation,
  materializeCanvasYDoc,
  patchCanvasYDoc,
  writeCanvasSnapshotToYDoc
} from './canvas-yjs.js'
import type { CanvasRecord, CanvasSnapshotData } from './types.js'

describe('Canvas Yjs schema', () => {
  it('round-trips a tldraw snapshot through the platform state encoding', () => {
    const snapshot = baseSnapshot()
    const encoded = encodeCanvasYDoc(createCanvasYDoc(snapshot))

    expect(materializeCanvasYDoc(decodeCanvasYDoc(encoded.stateBase64))).toEqual(snapshot)
    expect(encoded.stateVectorBase64).toEqual(expect.any(String))
  })

  it('merges concurrent changes to distinct tldraw records', () => {
    const base = createCanvasYDoc(baseSnapshot())
    const baseUpdate = Y.encodeStateAsUpdate(base)
    const left = new Y.Doc()
    const right = new Y.Doc()
    Y.applyUpdate(left, baseUpdate)
    Y.applyUpdate(right, baseUpdate)

    const leftUpdate = patchCanvasYDoc(left, { putRecords: [shape('shape:left', 'Left')] }, 'left')
    const rightUpdate = patchCanvasYDoc(right, { putRecords: [shape('shape:right', 'Right')] }, 'right')
    Y.applyUpdate(left, rightUpdate)
    Y.applyUpdate(right, leftUpdate)

    expect(materializeCanvasYDoc(left)).toEqual(materializeCanvasYDoc(right))
    expect(materializeCanvasYDoc(left).store).toEqual(expect.objectContaining({
      'shape:left': expect.objectContaining({ id: 'shape:left' }),
      'shape:right': expect.objectContaining({ id: 'shape:right' })
    }))
  })

  it('converges deterministically when two actors replace the same record', () => {
    const snapshot = baseSnapshot()
    snapshot.store['shape:shared'] = shape('shape:shared', 'Original')
    const baseUpdate = Y.encodeStateAsUpdate(createCanvasYDoc(snapshot))
    const left = new Y.Doc()
    const right = new Y.Doc()
    Y.applyUpdate(left, baseUpdate)
    Y.applyUpdate(right, baseUpdate)

    const leftUpdate = patchCanvasYDoc(left, { putRecords: [shape('shape:shared', 'Left')] }, 'left')
    const rightUpdate = patchCanvasYDoc(right, { putRecords: [shape('shape:shared', 'Right')] }, 'right')
    Y.applyUpdate(left, rightUpdate)
    Y.applyUpdate(right, leftUpdate)

    expect(materializeCanvasYDoc(left)).toEqual(materializeCanvasYDoc(right))
  })

  it('stores an Agent operation marker atomically without adding it to the tldraw snapshot', () => {
    const doc = createCanvasYDoc(baseSnapshot())
    patchCanvasYDoc(doc, {
      putRecords: [shape('shape:stage-1', 'Stage 1')],
      operation: {
        operationId: 'stage-operation-1',
        digest: 'abc123',
        batchId: 'batch-1'
      }
    }, 'agent-stage')

    expect(getCanvasYjsOperation(doc, 'stage-operation-1')).toEqual(expect.objectContaining({
      operationId: 'stage-operation-1',
      digest: 'abc123'
    }))
    expect(materializeCanvasYDoc(doc).store['shape:stage-1']).toBeTruthy()
    expect(materializeCanvasYDoc(doc)).not.toHaveProperty('operations')

    writeCanvasSnapshotToYDoc(doc, baseSnapshot(), 'restore')
    expect(getCanvasYjsOperation(doc, 'stage-operation-1')).toBeUndefined()
  })
})

function baseSnapshot(): CanvasSnapshotData {
  return {
    schema: { schemaVersion: 2, sequences: {} },
    store: {
      'document:document': { id: 'document:document', typeName: 'document', name: '' },
      'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a1' }
    }
  }
}

function shape(id: string, text: string): CanvasRecord {
  return {
    id,
    typeName: 'shape',
    type: 'text',
    parentId: 'page:page',
    index: 'a1',
    x: 0,
    y: 0,
    props: { text },
    meta: {}
  }
}

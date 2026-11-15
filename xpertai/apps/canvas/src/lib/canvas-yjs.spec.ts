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

describe('Canvas collaboration v2 property/text merges', () => {
  function peers(record = shape('shape:shared', '原文')) {
    const snapshot = baseSnapshot(); snapshot.store[record.id] = record
    const left = createCanvasYDoc(snapshot), right = decodeCanvasYDoc(encodeCanvasYDoc(left).stateBase64)
    return { left, right, record }
  }
  const merge = (left: Y.Doc, right: Y.Doc, a: Uint8Array, b: Uint8Array) => {
    Y.applyUpdate(left, b); Y.applyUpdate(right, a)
    expect(materializeCanvasYDoc(left)).toEqual(materializeCanvasYDoc(right))
    return materializeCanvasYDoc(left).store['shape:shared']
  }
  it('retains independent concurrent coordinates/style/text changes on the same record', () => {
    const { left, right, record } = peers()
    const a = patchCanvasYDoc(left, { putRecords: [{ ...record, x: 120, props: { ...record.props, color: 'blue' } }] }, 'left')
    const b = patchCanvasYDoc(right, { putRecords: [{ ...record, y: 80, props: { ...record.props, text: '原文追加' } }] }, 'right')
    expect(merge(left, right, a, b)).toMatchObject({ x: 120, y: 80, props: { color: 'blue', text: '原文追加' } })
  })
  it('merges concurrent inserts into one text and survives duplicate/reordered offline delivery', () => {
    const { left, right, record } = peers()
    const a = patchCanvasYDoc(left, { putRecords: [{ ...record, props: { text: '甲原文' } }] }, 'left')
    const b = patchCanvasYDoc(right, { putRecords: [{ ...record, props: { text: '原文乙' } }] }, 'right')
    expect(merge(left, right, a, b).props.text).toBe('甲原文乙')
    Y.applyUpdate(left, b); Y.applyUpdate(left, a)
    expect(materializeCanvasYDoc(left).store[record.id].props.text).toBe('甲原文乙')
  })
  it('preserves independent text-node edits in tldraw richText', () => {
    const rich = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '甲乙' }] }] }
    const record = { ...shape('shape:shared', ''), props: { richText: rich } }
    const { left, right } = peers(record)
    const change = (text: string) => ({ ...record, props: { richText: { ...rich, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } } })
    const a = patchCanvasYDoc(left, { putRecords: [change('前甲乙')] }, 'left')
    const b = patchCanvasYDoc(right, { putRecords: [change('甲乙后')] }, 'right')
    expect(merge(left, right, a, b).props.richText).toEqual({ ...rich, content: [{ type: 'paragraph', content: [{ type: 'text', text: '前甲乙后' }] }] })
  })
  it('uses editor before-images so an unrelated remote field is not restored to a stale value', () => {
    const { left, record } = peers()
    patchCanvasYDoc(left, { putRecords: [{ ...record, x: 50 }] }, 'remote')
    patchCanvasYDoc(left, { putRecords: [{ ...record, y: 60 }], previousRecords: { [record.id]: record } }, 'local')
    expect(materializeCanvasYDoc(left).store[record.id]).toMatchObject({ x: 50, y: 60 })
  })
  it('rejects stale text offsets before any record or operation marker is changed', () => {
    const { left, record } = peers()
    patchCanvasYDoc(left, { putRecords: [{ ...record, props: { text: '新的当前文本' } }] }, 'remote')
    const before = encodeCanvasYDoc(left)
    expect(() => patchCanvasYDoc(left, {
      putRecords: [shape('shape:new', 'must not appear'), { ...record, props: { text: '原文追加' } }],
      previousRecords: { [record.id]: record }, operation: { operationId: 'rejected' }
    }, 'stale')).toThrow('CANVAS_TEXT_BASE_CHANGED')
    expect(encodeCanvasYDoc(left)).toEqual(before)
    expect(getCanvasYjsOperation(left, 'rejected')).toBeUndefined()
  })
  it('retains legacy snapshots without silently upgrading them and refuses v2 downgrade updates', () => {
    const legacy = new Y.Doc(); legacy.getMap('canvas').set('schemaVersion', 1)
    writeCanvasSnapshotToYDoc(legacy, baseSnapshot())
    expect(materializeCanvasYDoc(legacy)).toEqual(baseSnapshot())
    expect(legacy.getMap('canvas').get('schemaVersion')).toBe(1)
    const { left } = peers(); left.getMap('canvas').set('schemaVersion', 1)
    expect(() => materializeCanvasYDoc(left)).toThrow('CANVAS_SCHEMA_DOWNGRADE_REJECTED')
  })
})

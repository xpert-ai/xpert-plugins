import * as Y from 'yjs'
import { createCanvasYDoc } from '../../../canvas-yjs.js'
import type { CanvasSnapshotData } from '../../../types.js'
import type { CanvasStoreChanges } from './autosave.js'
import {
  applyTldrawChangesToYDoc,
  createCanvasPresenceSignature,
  readCanvasSnapshotFromYDoc,
  type CanvasPresenceUpdate
} from './collaboration.js'

describe('Canvas tldraw/Yjs bridge', () => {
  it('writes only persistent tldraw document records into Yjs', () => {
    const doc = createCanvasYDoc(baseSnapshot())
    const changes = {
      added: {
        'shape:new': { id: 'shape:new', typeName: 'shape', type: 'geo', parentId: 'page:page', props: {}, meta: {} },
        'camera:page:page': { id: 'camera:page:page', typeName: 'camera', x: 0, y: 0, z: 1 }
      },
      updated: {},
      removed: {}
    } as unknown as CanvasStoreChanges

    expect(applyTldrawChangesToYDoc(doc, changes)).toBe(true)
    const snapshot = readCanvasSnapshotFromYDoc(doc)
    expect(snapshot.store['shape:new']).toBeTruthy()
    expect(snapshot.store['camera:page:page']).toBeUndefined()
  })

  it('propagates record removals', () => {
    const snapshot = baseSnapshot()
    snapshot.store['shape:remove'] = { id: 'shape:remove', typeName: 'shape', type: 'geo', parentId: 'page:page', props: {}, meta: {} }
    const doc = createCanvasYDoc(snapshot)
    const changes = {
      added: {},
      updated: {},
      removed: { 'shape:remove': snapshot.store['shape:remove'] }
    } as unknown as CanvasStoreChanges

    applyTldrawChangesToYDoc(doc, changes)
    expect(readCanvasSnapshotFromYDoc(doc).store['shape:remove']).toBeUndefined()
  })

  it('creates stable signatures for unchanged collaboration presence', () => {
    const presence: CanvasPresenceUpdate = {
      pageId: 'page:page',
      focus: null,
      selection: { kind: 'elements', elementIds: ['shape:one'] },
      viewport: { zoom: 1, width: 1280, height: 720 },
      mode: 'edit'
    }

    expect(createCanvasPresenceSignature(presence)).toBe(createCanvasPresenceSignature({
      ...presence,
      selection: { kind: 'elements', elementIds: ['shape:one'] }
    }))
    expect(createCanvasPresenceSignature(presence)).not.toBe(createCanvasPresenceSignature({
      ...presence,
      viewport: { zoom: 1.25, width: 1280, height: 720 }
    }))
  })
})

function baseSnapshot(): CanvasSnapshotData {
  return {
    schema: { schemaVersion: 2 },
    store: {
      'document:document': { id: 'document:document', typeName: 'document', name: '' },
      'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a1' }
    }
  }
}

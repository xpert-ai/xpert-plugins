import {
  type CanvasStoreChanges,
  applyCanvasViewState,
  captureViewportSnapshotImage,
  createAutosaveSignature,
  hasPersistentCanvasViewStateChange
} from './autosave.js'
import type { Editor } from 'tldraw'

type TestRecord = {
  id: string
  typeName: string
  currentPageId?: string
  [key: string]: string | number | boolean | null | object | undefined
}

type TestStoreChanges = {
  added?: Record<string, TestRecord>
  updated?: Record<string, [TestRecord, TestRecord]>
  removed?: Record<string, TestRecord>
}

function asEditor(editor: object): Editor {
  return editor as object as Editor
}

describe('canvas autosave helpers', () => {
  it('creates stable signatures for equivalent payloads', () => {
    const left = createAutosaveSignature({
      documentId: 'doc-1',
      snapshot: { store: { b: 2, a: 1 }, schema: { v: 1 } },
      viewState: { camera: { z: 1, x: 0 } },
      selectionSummary: { selectedShapeIds: ['shape:1'] }
    })
    const right = createAutosaveSignature({
      documentId: 'doc-1',
      snapshot: { schema: { v: 1 }, store: { a: 1, b: 2 } },
      viewState: { camera: { x: 0, z: 1 } },
      selectionSummary: { selectedShapeIds: ['shape:1'] }
    })

    expect(left).toBe(right)
  })

  it('captures viewport PNG payloads from tldraw editor.toImage', async () => {
    const editor = {
      getCurrentPageShapeIds: () => new Set(['shape:1']),
      getViewportPageBounds: () => ({ x: 0, y: 0, w: 320, h: 200 }),
      getCurrentPageId: () => 'page:page',
      getCamera: () => ({ x: 10, y: 20, z: 1 }),
      toImage: jest.fn(async () => ({
        blob: new Blob(['png-bytes'], { type: 'image/png' })
      }))
    }

    const payload = await captureViewportSnapshotImage(asEditor(editor))

    expect(payload.dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(payload.width).toBe(320)
    expect(payload.height).toBe(200)
    expect(payload.pageId).toBe('page:page')
    expect(editor.toImage).toHaveBeenCalledWith(['shape:1'], expect.objectContaining({ format: 'png', background: true }))
  })

  it('applies persisted page and camera view state', () => {
    const editor = {
      getPage: jest.fn(() => ({ id: 'page:page' })),
      setCurrentPage: jest.fn(),
      setCamera: jest.fn()
    }

    const applied = applyCanvasViewState(asEditor(editor), {
      currentPageId: 'page:page',
      camera: { x: 120, y: -40, z: 0.75 }
    })

    expect(applied).toBe(true)
    expect(editor.setCurrentPage).toHaveBeenCalledWith('page:page')
    expect(editor.setCamera).toHaveBeenCalledWith({ x: 120, y: -40, z: 0.75 })
  })

  it('ignores transient pointer and hover session changes', () => {
    expect(
      hasPersistentCanvasViewStateChange(testStoreChanges({
        updated: {
          'pointer:pointer': [
            { id: 'pointer:pointer', typeName: 'pointer', x: 10, y: 10 },
            { id: 'pointer:pointer', typeName: 'pointer', x: 20, y: 20 }
          ],
          'instance_page_state:page': [
            { id: 'instance_page_state:page', typeName: 'instance_page_state', hoveredShapeId: null },
            { id: 'instance_page_state:page', typeName: 'instance_page_state', hoveredShapeId: 'shape:1' }
          ],
          'instance:instance': [
            { id: 'instance:instance', typeName: 'instance', currentPageId: 'page:page', cursor: { type: 'default' } },
            { id: 'instance:instance', typeName: 'instance', currentPageId: 'page:page', cursor: { type: 'pointer' } }
          ]
        }
      }))
    ).toBe(false)
  })

  it('detects persistent camera and current page session changes', () => {
    expect(
      hasPersistentCanvasViewStateChange(testStoreChanges({
        updated: {
          'camera:page': [
            { id: 'camera:page', typeName: 'camera', x: 0, y: 0, z: 1 },
            { id: 'camera:page', typeName: 'camera', x: 80, y: 20, z: 1.2 }
          ]
        }
      }))
    ).toBe(true)

    expect(
      hasPersistentCanvasViewStateChange(testStoreChanges({
        updated: {
          'instance:instance': [
            { id: 'instance:instance', typeName: 'instance', currentPageId: 'page:one' },
            { id: 'instance:instance', typeName: 'instance', currentPageId: 'page:two' }
          ]
        }
      }))
    ).toBe(true)
  })
})

function testStoreChanges(changes: TestStoreChanges): CanvasStoreChanges {
  const normalized = {
    added: {},
    updated: {},
    removed: {},
    ...changes
  }
  return normalized as object as CanvasStoreChanges
}

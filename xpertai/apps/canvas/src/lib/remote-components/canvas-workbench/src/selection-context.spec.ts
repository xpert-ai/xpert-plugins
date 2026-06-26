import type { TLParentId, TLShape } from 'tldraw'
import { createCanvasSelectionContext, createCanvasSelectionSignature } from './selection-context.js'

describe('canvas selection context', () => {
  it('builds stable assistant context for selected shapes', () => {
    const context = createCanvasSelectionContext({
      document: { id: 'doc-1', title: 'Board', currentVersionId: 'ver-1', currentVersionNumber: 2 },
      selectedShapes: [
        {
          id: 'shape:holder' as TLShape['id'],
          typeName: 'shape',
          type: 'frame',
          x: 1,
          y: 2,
          rotation: 0,
          index: 'a0' as TLShape['index'],
          isLocked: false,
          opacity: 1,
          parentId: 'page:page' as TLParentId,
          props: { w: 512, h: 683, name: 'Holder', color: 'blue' },
          meta: { canvasAiImageHolder: true }
        } satisfies TLShape
      ],
      pageId: 'page:page',
      dirty: true,
      sceneSource: 'autosave',
      snapshotImagePath: 'files/canvas/documents/doc-1/snapshots/current.png'
    })

    expect(context.currentCanvas.selection.type).toBe('canvas.selection.v1')
    expect(context.currentCanvas.sceneSource).toBe('autosave')
    expect(context.currentCanvas.snapshotImagePath).toBe('files/canvas/documents/doc-1/snapshots/current.png')
    expect(context.currentCanvas.selection.shapes[0].isAiImageHolder).toBe(true)
    expect(createCanvasSelectionSignature(context)).toContain('shape:holder')
  })
})

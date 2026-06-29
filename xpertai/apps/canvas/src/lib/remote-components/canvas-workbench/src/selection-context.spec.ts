import type { TLParentId, TLShape } from 'tldraw'
import {
  CANVAS_CONTEXT_COMMAND,
  CANVAS_CONTEXT_KEY,
  createCanvasAssistantContextCommand,
  createCanvasSelectionContext,
  createCanvasSelectionSignature
} from './selection-context.js'

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
    expect(context.currentCanvas.selection.shapes[0].pageId).toBe('page:page')
    expect(context.currentCanvas.insertionTarget).toEqual(
      expect.objectContaining({
        type: 'canvas.insertionTarget.v2',
        documentId: 'doc-1',
        pageId: 'page:page',
        shapeId: 'shape:holder',
        width: 512,
        height: 683
      })
    )
    expect(createCanvasSelectionSignature(context)).toContain('shape:holder')
  })

  it('builds host assistant context command payload with env values', () => {
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
      dirty: false,
      sceneSource: 'autosave',
      snapshotImagePath: 'files/canvas/documents/doc-1/snapshots/current.png',
      snapshotImageUpdatedAt: '2026-06-27T00:00:00.000Z'
    })

    const command = createCanvasAssistantContextCommand(context)

    expect(command.commandKey).toBe(CANVAS_CONTEXT_COMMAND)
    expect(command.payload.key).toBe(CANVAS_CONTEXT_KEY)
    expect(command.payload.env).toEqual(
      expect.objectContaining({
        canvasDocumentId: 'doc-1',
        canvasVersionId: 'ver-1',
        canvasPageId: 'page:page',
        canvasSceneDirty: 'false',
        canvasSceneSource: 'autosave',
        canvasSnapshotImagePath: 'files/canvas/documents/doc-1/snapshots/current.png'
      })
    )
    expect(JSON.parse(command.payload.env.canvasInsertionTargetJson)).toEqual(
      expect.objectContaining({
        type: 'canvas.insertionTarget.v2',
        documentId: 'doc-1',
        pageId: 'page:page',
        shapeId: 'shape:holder'
      })
    )
    expect(JSON.parse(command.payload.env.canvasSelectedShapeJson)).toEqual(
      expect.objectContaining({
        id: 'shape:holder',
        pageId: 'page:page',
        isAiImageHolder: true
      })
    )
  })

  it('changes the assistant context signature when selected shape bounds change', () => {
    const baseShape = {
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
    const before = createCanvasSelectionContext({
      document: { id: 'doc-1', title: 'Board' },
      selectedShapes: [baseShape],
      pageId: 'page:page'
    })
    const after = createCanvasSelectionContext({
      document: { id: 'doc-1', title: 'Board' },
      selectedShapes: [
        {
          ...baseShape,
          props: { ...baseShape.props, h: 768 }
        }
      ],
      pageId: 'page:page'
    })

    expect(createCanvasSelectionSignature(after)).not.toBe(createCanvasSelectionSignature(before))
    expect(after.currentCanvas.insertionTarget?.height).toBe(768)
  })
})

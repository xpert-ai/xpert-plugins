import type { TLShape } from 'tldraw'

export const CANVAS_CONTEXT_COMMAND = 'assistant.context.set'

type CanvasContextDocument = {
  id?: string
  title?: string
  currentVersionId?: string | null
  currentVersionNumber?: number | null
}

type CanvasContextVersion = {
  id?: string
  versionNumber?: number | null
}

type ShapeBoundsProps = {
  w?: number
  h?: number
}

export function createCanvasSelectionContext(input: {
  document?: CanvasContextDocument | null
  version?: CanvasContextVersion | null
  selectedShapes?: TLShape[]
  pageId?: string | null
  dirty?: boolean
  sceneSource?: string | null
  snapshotImagePath?: string | null
  snapshotImageUpdatedAt?: string | null
}) {
  const selectedShapes = input.selectedShapes ?? []
  return {
    currentCanvas: {
      documentId: input.document?.id ?? '',
      title: input.document?.title ?? '',
      currentVersionId: input.document?.currentVersionId ?? input.version?.id ?? '',
      currentVersionNumber: input.document?.currentVersionNumber ?? input.version?.versionNumber ?? null,
      isDirty: Boolean(input.dirty),
      sceneSource: input.sceneSource ?? 'version',
      snapshotImagePath: input.snapshotImagePath ?? '',
      snapshotImageUpdatedAt: input.snapshotImageUpdatedAt ?? '',
      selection: {
        type: 'canvas.selection.v1',
        pageId: input.pageId ?? null,
        selectedShapeIds: selectedShapes.map((shape) => shape.id).filter(Boolean),
        selectedShapeCount: selectedShapes.length,
        shapes: selectedShapes.map(compactShape),
        capturedAt: new Date().toISOString()
      }
    }
  }
}

export type CanvasSelectionContext = ReturnType<typeof createCanvasSelectionContext>

export function createCanvasSelectionSignature(context: CanvasSelectionContext) {
  const selection = context.currentCanvas.selection
  return JSON.stringify({
    documentId: context.currentCanvas.documentId ?? '',
    versionId: context.currentCanvas.currentVersionId ?? '',
    dirty: context.currentCanvas.isDirty ?? false,
    pageId: selection.pageId ?? null,
    selectedShapeIds: selection.selectedShapeIds ?? []
  })
}

function compactShape(shape: TLShape) {
  const boundsProps = shape.props as ShapeBoundsProps
  return {
    id: shape.id,
    type: shape.type,
    x: shape.x,
    y: shape.y,
    w: boundsProps.w,
    h: boundsProps.h,
    parentId: shape.parentId,
    isAiImageHolder: Boolean(shape.meta?.canvasAiImageHolder || shape.meta?.cowartAiImageHolder),
    meta: shape.meta
  }
}

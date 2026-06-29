import type { TLShape } from 'tldraw'

export const CANVAS_CONTEXT_COMMAND = 'assistant.context.set'
export const CANVAS_CONTEXT_KEY = 'canvas'

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

type CompactCanvasShape = ReturnType<typeof compactShape>

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
  const compactShapes = selectedShapes.map((shape) => compactShape(shape, input.pageId ?? null))
  const insertionTarget = createInsertionTarget({
    documentId: input.document?.id ?? '',
    pageId: input.pageId ?? null,
    shapes: compactShapes
  })
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
      insertionTarget,
      selection: {
        type: 'canvas.selection.v1',
        pageId: input.pageId ?? null,
        selectedShapeIds: selectedShapes.map((shape) => shape.id).filter(Boolean),
        selectedShapeCount: selectedShapes.length,
        shapes: compactShapes,
        capturedAt: new Date().toISOString()
      }
    }
  }
}

export type CanvasSelectionContext = ReturnType<typeof createCanvasSelectionContext>

export type CanvasAssistantContextPayload = {
  key: typeof CANVAS_CONTEXT_KEY
  env: CanvasAssistantContextEnv
  context: CanvasSelectionContext
}

export type CanvasAssistantContextCommand = {
  commandKey: typeof CANVAS_CONTEXT_COMMAND
  payload: CanvasAssistantContextPayload
}

type CanvasAssistantContextEnv = {
  canvasDocumentId: string
  canvasVersionId: string
  canvasPageId: string
  canvasSelectionJson: string
  canvasSelectedShapeJson: string
  canvasInsertionTargetJson: string
  canvasContextJson: string
  canvasSceneDirty: string
  canvasSnapshotImagePath: string
  canvasSnapshotImageUpdatedAt: string
  canvasSceneSource: string
}

export function createCanvasAssistantContextCommand(context: CanvasSelectionContext): CanvasAssistantContextCommand {
  return {
    commandKey: CANVAS_CONTEXT_COMMAND,
    payload: createCanvasAssistantContextPayload(context)
  }
}

export function createCanvasAssistantContextPayload(context: CanvasSelectionContext): CanvasAssistantContextPayload {
  const currentCanvas = context.currentCanvas
  const selection = currentCanvas.selection
  const selectedShapes = selection.shapes
  const selectedShape = selectedShapes.length === 1 ? selectedShapes[0] : null
  return {
    key: CANVAS_CONTEXT_KEY,
    env: {
      canvasDocumentId: currentCanvas.documentId ?? '',
      canvasVersionId: currentCanvas.currentVersionId ?? '',
      canvasPageId: selection.pageId ?? '',
      canvasSelectionJson: JSON.stringify(selection),
      canvasSelectedShapeJson: JSON.stringify(selectedShape),
      canvasInsertionTargetJson: JSON.stringify(currentCanvas.insertionTarget),
      canvasContextJson: JSON.stringify(context),
      canvasSceneDirty: currentCanvas.isDirty ? 'true' : 'false',
      canvasSnapshotImagePath: currentCanvas.snapshotImagePath ?? '',
      canvasSnapshotImageUpdatedAt: currentCanvas.snapshotImageUpdatedAt ?? '',
      canvasSceneSource: currentCanvas.sceneSource ?? ''
    },
    context
  }
}

export function createCanvasSelectionSignature(context: CanvasSelectionContext) {
  const selection = context.currentCanvas.selection
  return JSON.stringify({
    documentId: context.currentCanvas.documentId ?? '',
    versionId: context.currentCanvas.currentVersionId ?? '',
    dirty: context.currentCanvas.isDirty ?? false,
    sceneSource: context.currentCanvas.sceneSource ?? '',
    snapshotImagePath: context.currentCanvas.snapshotImagePath ?? '',
    pageId: selection.pageId ?? null,
    selectedShapes: (selection.shapes ?? []).map((shape) => ({
      id: shape.id,
      type: shape.type,
      parentId: shape.parentId,
      pageId: shape.pageId,
      x: shape.x,
      y: shape.y,
      w: shape.w,
      h: shape.h,
      isAiImageHolder: shape.isAiImageHolder,
      meta: shape.meta
    })),
    insertionTarget: context.currentCanvas.insertionTarget ?? null
  })
}

function compactShape(shape: TLShape, currentPageId: string | null) {
  const boundsProps = shape.props as ShapeBoundsProps
  const pageId = getShapePageId(shape, currentPageId)
  return {
    id: shape.id,
    type: shape.type,
    x: shape.x,
    y: shape.y,
    w: boundsProps.w,
    h: boundsProps.h,
    parentId: shape.parentId,
    pageId,
    isAiImageHolder: Boolean(shape.meta?.canvasAiImageHolder || shape.meta?.cowartAiImageHolder),
    meta: shape.meta
  }
}

function createInsertionTarget(input: {
  documentId: string
  pageId: string | null
  shapes: CompactCanvasShape[]
}) {
  const holder = input.shapes.length === 1 && input.shapes[0]?.isAiImageHolder ? input.shapes[0] : null
  if (!holder || !input.documentId) {
    return null
  }
  return {
    type: 'canvas.insertionTarget.v2',
    documentId: input.documentId,
    pageId: holder.pageId ?? input.pageId,
    shapeId: holder.id,
    width: holder.w,
    height: holder.h
  }
}

function getShapePageId(shape: TLShape, currentPageId: string | null) {
  const parentId = String(shape.parentId ?? '')
  return parentId.startsWith('page:') ? parentId : currentPageId
}

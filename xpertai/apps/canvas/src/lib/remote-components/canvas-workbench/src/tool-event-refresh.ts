const CANVAS_TOOL_NAMES = new Set([
  'canvas_create_document',
  'canvas_save_snapshot',
  'canvas_patch_records',
  'canvas_insert_image',
  'canvas_update_document_status',
  'canvas_report_failure'
])

type CanvasToolEvent = {
  toolName?: string
  name?: string
  payload?: {
    toolName?: string
  }
  data?: {
    toolName?: string
  }
}

type CanvasToolEventCandidate = CanvasToolEvent | object | string | number | boolean | null | undefined

export function shouldRefreshForCanvasToolEvent(event: CanvasToolEventCandidate) {
  if (!isToolEventObject(event)) {
    return false
  }
  const toolName = event.toolName ?? event.name ?? event.payload?.toolName ?? event.data?.toolName
  return typeof toolName === 'string' && CANVAS_TOOL_NAMES.has(toolName)
}

function isToolEventObject(event: CanvasToolEventCandidate): event is CanvasToolEvent {
  return Boolean(event && typeof event === 'object' && !Array.isArray(event))
}

import type { Editor } from 'tldraw'

const CANVAS_CONTENT_MUTATION_TOOL_NAMES = new Set([
  'canvas_save_snapshot',
  'canvas_patch_records',
  'canvas_insert_image'
])

type CanvasViewportEditor = Pick<Editor, 'getCurrentPageBounds' | 'zoomToFit'>

export function revealCanvasContentAfterToolMutation(toolName: string, editor: CanvasViewportEditor | null) {
  if (!CANVAS_CONTENT_MUTATION_TOOL_NAMES.has(toolName) || !editor) return false
  const bounds = editor.getCurrentPageBounds()
  if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) {
    return false
  }
  editor.zoomToFit({ animation: { duration: 220 } })
  return true
}

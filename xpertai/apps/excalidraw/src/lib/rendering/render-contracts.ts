import { z } from 'zod/v3'
import { id, revision } from '../tools/contracts.js'
export const RENDER_ACTION = 'excalidraw.render'
export const RENDER_ACTION_VERSION = '1.0.0'
export const RENDER_QUEUE = 'excalidraw.render'
export const jobResultSchema = z
  .object({
    success: z.boolean(),
    jobId: id,
    drawingId: id,
    sceneRevision: revision,
    irRevision: revision.optional(),
    status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'conflict']),
    kind: z.enum(['preview', 'export', 'mermaid', 'diagram_preview']).optional(),
    format: z.enum(['json', 'svg', 'png']).optional(),
    resultTool: z.enum(['excalidraw_read_preview', 'excalidraw_read_export']).optional(),
    message: z.string().max(500).optional(),
    cursor: id,
    terminal: z.boolean(),
    previewId: id.optional(),
    qualityRunId: id.optional(),
    errorCode: z.string().max(100).optional(),
    nextAction: z.string().max(100)
  })
  .strict()
export const exportResultSchema = z
  .object({ drawingId: id, jobId: id, format: z.enum(['json', 'svg', 'png']), status: z.string().max(100) })
  .strict()

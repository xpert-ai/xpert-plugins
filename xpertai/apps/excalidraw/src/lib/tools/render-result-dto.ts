import type { z } from 'zod/v3'
import type { ExcalidrawRenderService } from '../rendering/excalidraw-render.service.js'
import type { jobResultSchema } from '../rendering/render-contracts.js'

export function jobDto(result: z.infer<typeof jobResultSchema>) {
  return {
    success: result.success,
    jobId: result.jobId,
    drawingId: result.drawingId,
    sceneRevision: result.sceneRevision,
    irRevision: result.irRevision,
    status: result.status,
    kind: result.kind,
    format: result.format,
    resultTool: result.resultTool,
    message: result.message,
    cursor: result.cursor,
    terminal: result.terminal,
    previewId: result.previewId,
    qualityRunId: result.qualityRunId,
    errorCode: result.errorCode,
    nextAction: result.nextAction
  }
}
export function exportDto(result: Awaited<ReturnType<ExcalidrawRenderService['readExport']>>) {
  return {
    jobId: result.jobId,
    data: result.data,
    offset: result.offset,
    nextOffset: result.nextOffset,
    ...(result.offset === 0
      ? {
          drawingId: result.drawingId,
          format: result.format,
          mimeType: result.mimeType,
          name: result.name,
          size: result.size,
          sha256: result.sha256,
          encoding: result.encoding,
          total: result.total
        }
      : {})
  }
}
export function imageDto(result: Awaited<ReturnType<ExcalidrawRenderService['readPreview']>>) {
  const meta = result.structuredContent
  return {
    content: result.content.map((image) => ({ type: image.type, mimeType: image.mimeType, data: image.data })),
    structuredContent: {
      drawingId: meta.drawingId,
      previewId: meta.previewId,
      sceneRevision: meta.sceneRevision,
      irRevision: meta.irRevision,
      stale: meta.stale,
      mimeType: meta.mimeType,
      kind: meta.kind
    }
  }
}

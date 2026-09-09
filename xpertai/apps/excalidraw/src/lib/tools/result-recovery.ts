import { prepareToolResult } from '@xpert-ai/plugin-sdk'
import { id } from './contracts.js'
import type { MinimalReceipt, ResultIdentity } from './result-recovery.schema.js'

// The identity comes from the completed call, never from an exception payload.
// Validate the complete DTO once at the SDK boundary; only build recovery on failure.
export function projectResult<T>(project: () => T, identity: ResultIdentity = {}) {
  return prepareToolResult(project, (diagnostic) => {
    if (process.env.EXCALIDRAW_DEBUG === 'true') console.warn('[Excalidraw] output recovery', diagnostic)
    return minimalReceipt(identity)
  })
}
export function projectImageResult<T>(project: () => T, identity: ResultIdentity) {
  return prepareToolResult(project, (diagnostic) => {
    if (process.env.EXCALIDRAW_DEBUG === 'true') console.warn('[Excalidraw] image output recovery', diagnostic)
    return { content: [], structuredContent: minimalReceipt(identity) }
  })
}
function bounded(value: string | undefined, max: number) {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined
}
function identifier(value: string | undefined) {
  const candidate = bounded(value, id.maxLength ?? 100)
  return candidate && candidate === candidate.trim() ? candidate : undefined
}
function revision(value: number | undefined) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}
export function minimalReceipt(identity: ResultIdentity): MinimalReceipt {
  return {
    resultStatus: 'unavailable',
    errorCode: 'tool_result_unavailable',
    success: typeof identity.success === 'boolean' ? identity.success : undefined,
    operationId: identifier(identity.operationId),
    drawingId: identifier(identity.drawingId),
    sceneRevision: revision(identity.sceneRevision),
    irRevision: revision(identity.irRevision),
    versionId: identifier(identity.versionId),
    versionNumber: revision(identity.versionNumber),
    shareUrl: bounded(identity.shareUrl, 4096),
    jobId: identifier(identity.jobId),
    previewId: identifier(identity.previewId),
    status: bounded(identity.status, 80),
    message:
      'The tool returned, but its detailed result is unavailable. The reported business status has not been changed.',
    nextAction:
      'Read the returned drawing/job, or retry this call with identical arguments and the same operationId. Do not use a new operationId to recover this result.'
  }
}

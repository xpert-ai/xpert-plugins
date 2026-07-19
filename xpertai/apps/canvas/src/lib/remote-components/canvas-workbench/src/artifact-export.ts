import { executeAction, getResponsePayload, isObject } from './runtime.js'
import type { RemotePayloadObject, RemotePayloadValue } from './runtime.js'

export type CanvasArtifactExportResult = RemotePayloadObject & {
  exportId?: string
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  stage?: string
  errorMessage?: string
  share?: RemotePayloadValue
}

export function unwrapCanvasArtifactExport(value: RemotePayloadValue | null | undefined): CanvasArtifactExportResult {
  const root = isObject(value) ? value : {}
  const data = isObject(root.data) ? root.data : root
  return data as CanvasArtifactExportResult
}

export async function waitForCanvasArtifactExport(
  documentId: string,
  exportId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {}
) {
  const intervalMs = options.intervalMs ?? 1_500
  const timeoutAt = Date.now() + (options.timeoutMs ?? 5 * 60_000)
  while (Date.now() < timeoutAt) {
    const response = await executeAction(
      'get_artifact_export',
      documentId,
      { exportId, documentId },
      { documentId }
    )
    const result = unwrapCanvasArtifactExport(getResponsePayload(response))
    if (result.status === 'succeeded') return result
    if (result.status === 'failed' || result.status === 'cancelled') {
      throw new Error(typeof result.errorMessage === 'string' && result.errorMessage.trim()
        ? result.errorMessage
        : `Canvas Artifact export ${result.status}.`)
    }
    await delay(intervalMs)
  }
  throw new Error('Canvas Artifact export timed out while waiting for the sandbox browser job.')
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

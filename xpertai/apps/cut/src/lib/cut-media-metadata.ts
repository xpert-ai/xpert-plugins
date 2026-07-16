import { ALL_FORMATS, BufferSource, Input } from 'mediabunny'
import type { CutMediaMetadata } from './types.js'

/** Reads container metadata without decoding media frames. Invalid or unsupported files remain importable. */
export async function probeCutMediaMetadata(buffer: Buffer, mimeType: string): Promise<CutMediaMetadata> {
  if (!mimeType.startsWith('video/') && !mimeType.startsWith('audio/')) return {}
  const input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS })
  try {
    const duration = await input.computeDuration()
    const video = await input.getPrimaryVideoTrack()
    return {
      ...(Number.isFinite(duration) && duration > 0 ? { duration: round(duration) } : {}),
      ...(video ? {
        codedWidth: video.codedWidth,
        codedHeight: video.codedHeight,
        displayWidth: video.displayWidth,
        displayHeight: video.displayHeight,
        rotationDegrees: video.rotation
      } : {})
    }
  } catch {
    return {}
  } finally {
    input.dispose()
  }
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000
}

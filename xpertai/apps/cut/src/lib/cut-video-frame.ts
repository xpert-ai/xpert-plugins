export type CutVideoFrameMatchInput = {
  targetTime: number
  mediaTime: number
  mediaDuration: number
  frameDuration: number
}

const EXACT_FRAME_TOLERANCE_SECONDS = 0.075
const MIN_END_FREEZE_WINDOW_SECONDS = 0.25

/**
 * Accepts the decoded frame nearest the requested timestamp. Near the end of a
 * media file, containers commonly report a duration slightly longer than the
 * final decodable video sample (for example when the audio track is longer).
 * In that narrow tail window the final frame is intentionally frozen instead
 * of waiting for a frame that cannot exist.
 */
export function isCutVideoFrameAcceptable(input: CutVideoFrameMatchInput) {
  if (![input.targetTime, input.mediaTime, input.mediaDuration, input.frameDuration].every(Number.isFinite)) return false
  if (input.targetTime < 0 || input.mediaTime < 0 || input.mediaDuration <= 0 || input.frameDuration <= 0) return false
  if (Math.abs(input.mediaTime - input.targetTime) <= EXACT_FRAME_TOLERANCE_SECONDS) return true

  const freezeWindow = Math.max(MIN_END_FREEZE_WINDOW_SECONDS, input.frameDuration * 6)
  const nearEnd = input.targetTime >= Math.max(0, input.mediaDuration - freezeWindow)
  const frameIsNotAhead = input.mediaTime <= input.targetTime + EXACT_FRAME_TOLERANCE_SECONDS
  return nearEnd && frameIsNotAhead && input.targetTime - input.mediaTime <= freezeWindow
}

export function cutVideoFrameTimeoutMessage(input: {
  targetTime: number
  mediaDuration: number
  lastMediaTime: number | null
}) {
  const last = input.lastMediaTime == null ? 'none' : `${input.lastMediaTime.toFixed(6)}s`
  return `Cut video frame decode timed out during export (target=${input.targetTime.toFixed(6)}s, last=${last}, duration=${input.mediaDuration.toFixed(6)}s).`
}

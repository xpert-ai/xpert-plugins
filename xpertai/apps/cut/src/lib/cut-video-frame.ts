export type CutVideoFrameMatchInput = {
  targetTime: number
  mediaTime: number
  mediaDuration: number
  frameDuration: number
}

const EXACT_FRAME_TOLERANCE_SECONDS = 0.075
const MIN_START_FREEZE_WINDOW_SECONDS = 0.15
const MIN_END_FREEZE_WINDOW_SECONDS = 0.25
const DAMAGED_PACKET_RECOVERY_SECONDS = 2

/**
 * Accepts the decoded frame nearest the requested timestamp. Camera MOV files
 * may expose a short edit-list or composition-time offset before their first
 * presentable video sample. In that narrow start window the first frame is
 * intentionally frozen back to timeline zero. Near the end of a media file,
 * containers can likewise report a duration slightly longer than the final
 * decodable video sample, so the final frame is frozen across the narrow tail.
 */
export function isCutVideoFrameAcceptable(input: CutVideoFrameMatchInput) {
  if (![input.targetTime, input.mediaTime, input.mediaDuration, input.frameDuration].every(Number.isFinite)) return false
  if (input.targetTime < 0 || input.mediaTime < 0 || input.mediaDuration <= 0 || input.frameDuration <= 0) return false
  if (Math.abs(input.mediaTime - input.targetTime) <= EXACT_FRAME_TOLERANCE_SECONDS) return true

  const startFreezeWindow = Math.max(MIN_START_FREEZE_WINDOW_SECONDS, input.frameDuration * 4)
  const nearStart = input.targetTime <= startFreezeWindow
  const firstFrameIsNearStart = input.mediaTime <= startFreezeWindow
  const firstFrameIsNotBehind = input.mediaTime >= input.targetTime - EXACT_FRAME_TOLERANCE_SECONDS
  if (nearStart && firstFrameIsNearStart && firstFrameIsNotBehind) return true

  const endFreezeWindow = Math.max(MIN_END_FREEZE_WINDOW_SECONDS, input.frameDuration * 6)
  const nearEnd = input.targetTime >= Math.max(0, input.mediaDuration - endFreezeWindow)
  const frameIsNotAhead = input.mediaTime <= input.targetTime + EXACT_FRAME_TOLERANCE_SECONDS
  return nearEnd && frameIsNotAhead && input.targetTime - input.mediaTime <= endFreezeWindow
}

export function cutVideoFrameTimeoutMessage(input: {
  targetTime: number
  mediaDuration: number
  lastMediaTime: number | null
}) {
  const last = input.lastMediaTime == null ? 'none' : `${input.lastMediaTime.toFixed(6)}s`
  return `Cut video frame decode timed out during export (target=${input.targetTime.toFixed(6)}s, last=${last}, duration=${input.mediaDuration.toFixed(6)}s).`
}

/**
 * Builds a bounded recovery plan for a video packet that Chromium cannot
 * decode. A fresh decoder first seeks to an earlier frame and freezes that
 * frame across the likely damaged GOP. This keeps a single bad packet from
 * aborting an otherwise valid export while avoiding repeated seeks to the same
 * deterministic failure on every output frame.
 */
export function cutVideoDamagedPacketRecovery(input: {
  targetTime: number
  mediaDuration: number
  frameDuration: number
}) {
  if (![input.targetTime, input.mediaDuration, input.frameDuration].every(Number.isFinite)
    || input.targetTime < 0
    || input.mediaDuration <= 0
    || input.frameDuration <= 0) return null

  const end = Math.max(0, input.mediaDuration - 0.001)
  const targetTime = Math.min(input.targetTime, end)
  const recoveryWindow = Math.max(DAMAGED_PACKET_RECOVERY_SECONDS, input.frameDuration * 60)
  const candidates = [
    Math.max(0, targetTime - recoveryWindow),
    Math.max(0, targetTime - recoveryWindow * 2.5)
  ].map((candidate) => Math.min(candidate, end))
    .filter((candidate, index, values) => Math.abs(candidate - targetTime) > 0.0005
      && values.findIndex((value) => Math.abs(value - candidate) < 0.0005) === index)

  if (!candidates.length) return null
  return {
    targetTime,
    candidates,
    resumeAt: Math.min(end, targetTime + recoveryWindow)
  }
}

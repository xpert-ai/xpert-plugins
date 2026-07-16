import type { CutProjectDocument } from './types.js'

export const MAX_CUT_PROJECT_DURATION = 3_600

export function audibleTimelineClips(document: CutProjectDocument) {
  return document.tracks.flatMap((track) => {
    if (track.muted) return []
    return track.clips.filter((clip) => {
      if (!clip.previewUrl || clip.duration <= 0 || (clip.volume ?? 1) <= 0) return false
      if (track.kind === 'audio') return clip.type === 'audio'
      return clip.type === 'video' && !clip.audioDetached
    })
  })
}

export function restoreClipSourceDuration(documentInput: CutProjectDocument, clipId: string, sourceDuration: number) {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) throw new Error('Media duration is unavailable.')
  const document = structuredClone(documentInput)
  const clip = document.tracks.flatMap((track) => track.clips).find((item) => item.id === clipId)
  if (!clip || (clip.type !== 'video' && clip.type !== 'audio')) throw new Error('The selected clip has no media duration.')
  const playbackRate = clip.playbackRate ?? 1
  const availableSourceDuration = Math.min(sourceDuration, MAX_CUT_PROJECT_DURATION) - clip.trimIn
  if (availableSourceDuration <= 0) throw new Error('The selected trim starts after the media ends.')
  const requestedTimelineDuration = availableSourceDuration / playbackRate
  const projectEnd = Math.min(MAX_CUT_PROJECT_DURATION, clip.start + requestedTimelineDuration)
  const duration = roundTime(projectEnd - clip.start)
  document.settings.durationSeconds = roundTime(Math.max(document.settings.durationSeconds, projectEnd))
  clip.duration = duration
  clip.trimOut = roundTime(clip.trimIn + duration * playbackRate)
  return document
}

function roundTime(value: number) {
  return Math.round(value * 1_000) / 1_000
}

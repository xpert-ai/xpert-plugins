import type { CutProjectDocument } from './types.js'

export const MAX_CUT_PROJECT_DURATION = 3_600
export const PREVIEW_PLAYHEAD_JUMP_SECONDS = 0.25
export const PREVIEW_MEDIA_SEEK_EPSILON_SECONDS = 1 / 120
export const PREVIEW_MEDIA_PREROLL_SECONDS = 5

export type PreviewMediaSyncState = {
  playing: boolean
  wasPlaying: boolean
  playhead: number
  previousPlayhead: number
  currentTime: number
  targetTime: number
}

export type PreviewNativeAudioState = {
  active: boolean
  capturedAudio: boolean
  requestedVolume: number
  mutedByTimeline?: boolean
}

/**
 * Future clips are pre-rolled so their first frame is ready at the cut. Keep
 * their native media element muted until they become active; otherwise a clip
 * mounted after the user's original Play gesture can be rejected by browser
 * autoplay policy. Captured audio stays muted natively and is mixed by WebAudio.
 */
export function previewNativeAudioState(state: PreviewNativeAudioState) {
  const requestedVolume = Math.min(1, Math.max(0, state.requestedVolume))
  return {
    volume: state.capturedAudio ? 1 : state.active ? requestedVolume : 0,
    muted: state.capturedAudio || !state.active || Boolean(state.mutedByTimeline) || requestedVolume === 0
  }
}

/**
 * Media elements advance on their own while playing. Re-seeking them on every
 * React playhead update causes large or non-range-addressable files to stall
 * and repeatedly replay tiny audio fragments. Only synchronize when playback
 * starts, while paused, or after a real playhead jump.
 */
export function shouldSeekPreviewMedia(state: PreviewMediaSyncState) {
  const outOfPosition = Math.abs(state.currentTime - state.targetTime) > PREVIEW_MEDIA_SEEK_EPSILON_SECONDS
  if (!outOfPosition) return false
  if (!state.playing || !state.wasPlaying) return true
  return Math.abs(state.playhead - state.previousPlayhead) > PREVIEW_PLAYHEAD_JUMP_SECONDS
}

export function shouldMountPreviewMedia(
  clip: { type: string; previewUrl?: string; start: number; duration: number },
  playhead: number
) {
  if (!clip.previewUrl || (clip.type !== 'video' && clip.type !== 'audio')) return false
  if (playhead >= clip.start && playhead < clip.start + clip.duration) return true
  return clip.start > playhead && clip.start - playhead <= PREVIEW_MEDIA_PREROLL_SECONDS
}

/**
 * A visual track can contain legacy or imported overlaps. Its last active clip
 * is the visible winner (matching canvas paint order); suppress the covered
 * clips so their embedded audio is not mixed underneath the visible shot.
 */
export function activePreviewVisualClipIds(document: CutProjectDocument, playhead: number) {
  return document.tracks.flatMap((track) => {
    if (track.kind !== 'visual' || track.hidden) return []
    const active = track.clips.filter((clip) => playhead >= clip.start && playhead < clip.start + clip.duration)
    const winner = active[active.length - 1]
    return winner ? [winner.id] : []
  })
}

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

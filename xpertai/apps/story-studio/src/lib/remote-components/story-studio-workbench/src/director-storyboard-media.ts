import type { Candidate } from './production-data'

type PreviewableVideo = {
  currentTime: number
  duration: number
  paused: boolean
}

export function playableVideoUrl(candidate: Candidate | null | undefined) {
  const url = candidate?.kind === 'video' ? candidate.fileUrl?.trim() : null
  return url && !url.startsWith('data:') ? url : null
}

export function selectedVideoCandidate(candidates: Candidate[]) {
  const videos = candidates.filter((candidate) => candidate.kind === 'video')
  const selected = videos.filter((candidate) => candidate.selected)
  if (selected.length === 1) return selected[0]
  if (selected.length === 0 && videos.length === 1) return videos[0]
  return null
}

export function selectVideoPreviewCandidate(
  candidates: Candidate[],
  preferredId: string | null
) {
  const playable = candidates.filter((candidate) =>
    Boolean(playableVideoUrl(candidate))
  )
  return (
    playable.find((candidate) => candidate.id === preferredId) ??
    playable.find((candidate) => candidate.selected) ??
    playable[0] ??
    candidates.find((candidate) => candidate.id === preferredId) ??
    candidates.find((candidate) => candidate.selected) ??
    candidates[0] ??
    null
  )
}

export function previewFrameTime(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0.1
  return Math.min(0.5, Math.max(0.1, duration * 0.05))
}

export function primeVideoPreview(video: PreviewableVideo) {
  if (!video.paused || video.currentTime > 0.05) return
  video.currentTime = previewFrameTime(video.duration)
}

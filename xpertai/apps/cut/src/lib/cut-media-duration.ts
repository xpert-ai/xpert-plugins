export type CutMediaTrackDurations = {
  containerDuration?: number | null
  videoDuration?: number | null
  audioDuration?: number | null
}

export function selectCutMediaDuration(kind: 'video' | 'audio', durations: CutMediaTrackDurations) {
  const preferred = kind === 'video' ? durations.videoDuration : durations.audioDuration
  return positiveDuration(preferred) ?? positiveDuration(durations.containerDuration)
}

export function compactCutMediaTrackDurations(durations: CutMediaTrackDurations) {
  return {
    ...(positiveDuration(durations.containerDuration) ? { containerDuration: roundTime(durations.containerDuration!) } : {}),
    ...(positiveDuration(durations.videoDuration) ? { videoDuration: roundTime(durations.videoDuration!) } : {}),
    ...(positiveDuration(durations.audioDuration) ? { audioDuration: roundTime(durations.audioDuration!) } : {})
  }
}

function positiveDuration(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function roundTime(value: number) {
  return Math.round(value * 1_000) / 1_000
}

export function clipStartFromDrag(input: {
  initialStart: number
  deltaPixels: number
  pixelsPerSecond: number
  clipDuration: number
  projectDuration: number
}) {
  if (!Number.isFinite(input.pixelsPerSecond) || input.pixelsPerSecond <= 0) throw new Error('pixelsPerSecond must be positive.')
  const raw = input.initialStart + input.deltaPixels / input.pixelsPerSecond
  const max = Math.max(0, input.projectDuration - input.clipDuration)
  return Math.round(Math.min(max, Math.max(0, raw)) * 1000) / 1000
}

export type CutTimelineThumbnailSample = {
  left: number
  width: number
  sourceTime: number
}

export const CUT_TIMELINE_MIN_PIXELS_PER_SECOND = 0.5
export const CUT_TIMELINE_MAX_PIXELS_PER_SECOND = 160

export function timelineZoomSliderValue(pixelsPerSecond: number) {
  const bounded = clampTimelineZoom(pixelsPerSecond)
  const range = Math.log(CUT_TIMELINE_MAX_PIXELS_PER_SECOND / CUT_TIMELINE_MIN_PIXELS_PER_SECOND)
  return roundTime(Math.log(bounded / CUT_TIMELINE_MIN_PIXELS_PER_SECOND) / range * 100)
}

export function timelinePixelsPerSecondFromSlider(value: number) {
  const sliderValue = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  const range = CUT_TIMELINE_MAX_PIXELS_PER_SECOND / CUT_TIMELINE_MIN_PIXELS_PER_SECOND
  return roundTimelineZoom(CUT_TIMELINE_MIN_PIXELS_PER_SECOND * Math.pow(range, sliderValue / 100))
}

export function scaleTimelinePixelsPerSecond(pixelsPerSecond: number, factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) return clampTimelineZoom(pixelsPerSecond)
  return roundTimelineZoom(clampTimelineZoom(pixelsPerSecond * factor))
}

export function fitTimelinePixelsPerSecond(input: {
  viewportWidth: number
  duration: number
  gutterWidth?: number
  horizontalPadding?: number
}) {
  if (!Number.isFinite(input.duration) || input.duration <= 0) return CUT_TIMELINE_MIN_PIXELS_PER_SECOND
  const available = Math.max(1, input.viewportWidth - (input.gutterWidth ?? 0) - (input.horizontalPadding ?? 0))
  return roundTimelineZoom(clampTimelineZoom(available / input.duration))
}

export function timelineRulerMarks(duration: number, pixelsPerSecond: number) {
  if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) return []
  const intervals = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
  const interval = intervals.find((candidate) => candidate * pixelsPerSecond >= 56) ?? intervals.at(-1)!
  return Array.from({ length: Math.floor(duration / interval) + 1 }, (_, index) => roundTime(index * interval))
}

/**
 * Samples only the visible part of a video clip. Long clips can span tens of
 * thousands of timeline pixels, so generating a thumbnail for the full clip
 * would waste decode work and memory. The caller can recompute this small
 * window as the timeline scrolls.
 */
export function timelineVideoThumbnailSamples(input: {
  clipDuration: number
  trimIn: number
  playbackRate?: number
  pixelsPerSecond: number
  visibleStart: number
  visibleEnd: number
  cellWidth?: number
  maxSamples?: number
}): CutTimelineThumbnailSample[] {
  if (!Number.isFinite(input.pixelsPerSecond) || input.pixelsPerSecond <= 0) return []
  if (!Number.isFinite(input.clipDuration) || input.clipDuration <= 0) return []
  const clipWidth = input.clipDuration * input.pixelsPerSecond
  const cellWidth = Math.max(48, input.cellWidth ?? 96)
  const visibleStart = Math.min(clipWidth, Math.max(0, input.visibleStart))
  const visibleEnd = Math.min(clipWidth, Math.max(visibleStart, input.visibleEnd))
  if (visibleEnd <= visibleStart) return []

  const firstCell = Math.floor(visibleStart / cellWidth)
  const lastCell = Math.ceil(visibleEnd / cellWidth)
  const maxSamples = Math.max(1, Math.floor(input.maxSamples ?? 24))
  const playbackRate = Number.isFinite(input.playbackRate) && (input.playbackRate ?? 0) > 0 ? input.playbackRate! : 1
  const samples: CutTimelineThumbnailSample[] = []
  for (let cell = firstCell; cell < lastCell && samples.length < maxSamples; cell += 1) {
    const left = cell * cellWidth
    const width = Math.min(cellWidth, clipWidth - left)
    if (width <= 0) continue
    const timelineTime = Math.min(input.clipDuration, (left + width / 2) / input.pixelsPerSecond)
    samples.push({
      left,
      width,
      sourceTime: roundTime(Math.max(0, input.trimIn) + timelineTime * playbackRate)
    })
  }
  return samples
}

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000
}

function clampTimelineZoom(value: number) {
  const finite = Number.isFinite(value) ? value : CUT_TIMELINE_MIN_PIXELS_PER_SECOND
  return Math.min(CUT_TIMELINE_MAX_PIXELS_PER_SECOND, Math.max(CUT_TIMELINE_MIN_PIXELS_PER_SECOND, finite))
}

function roundTimelineZoom(value: number) {
  return value < 10 ? Math.round(value * 10) / 10 : Math.round(value)
}

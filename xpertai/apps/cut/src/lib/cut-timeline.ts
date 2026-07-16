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

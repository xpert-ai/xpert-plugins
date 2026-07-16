export function computeCutWaveform(
  channels: readonly Float32Array[],
  startFrame: number,
  endFrame: number,
  barCount = 32
) {
  if (!channels.length || barCount <= 0) return []
  const availableFrames = Math.min(...channels.map((channel) => channel.length))
  const start = clamp(Math.floor(startFrame), 0, availableFrames)
  const end = clamp(Math.ceil(endFrame), start, availableFrames)
  if (end <= start) return Array.from({ length: barCount }, () => 0)
  const peaks = Array.from({ length: barCount }, (_, barIndex) => {
    const barStart = Math.floor(start + (end - start) * barIndex / barCount)
    const barEnd = Math.max(barStart + 1, Math.floor(start + (end - start) * (barIndex + 1) / barCount))
    const sampleStep = Math.max(1, Math.floor((barEnd - barStart) / 192))
    let peak = 0
    for (let frame = barStart; frame < Math.min(barEnd, end); frame += sampleStep) {
      for (const channel of channels) peak = Math.max(peak, Math.abs(channel[frame] ?? 0))
    }
    return peak
  })
  const maxPeak = Math.max(...peaks, 0.0001)
  return peaks.map((peak) => peak / maxPeak)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

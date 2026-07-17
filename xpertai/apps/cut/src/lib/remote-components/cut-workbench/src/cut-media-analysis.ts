export const CUT_BROWSER_MEDIA_ANALYZER_VERSION = 'cut-browser-media-analysis/2'

export type CutBrowserMediaEvidenceSegment = {
  mediaAssetId: string
  evidenceType: 'silence' | 'audio_activity' | 'shot'
  start: number
  end: number
  label: string
  text?: string | null
  confidence?: number | null
  thumbnailTime?: number | null
  metadata?: Record<string, string | number | boolean | null>
}

export function analyzeCutAudioActivity(input: {
  mediaAssetId: string
  audio: Float32Array
  sampleRate: number
  duration: number
  windowSeconds?: number
  silenceThresholdDb?: number
  minimumSilenceSeconds?: number
}): CutBrowserMediaEvidenceSegment[] {
  const windowSeconds = input.windowSeconds ?? 0.1
  const minimumSilence = input.minimumSilenceSeconds ?? 0.5
  const windowFrames = Math.max(1, Math.round(input.sampleRate * windowSeconds))
  const measuredBins: Array<{ start: number; end: number; db: number }> = []
  for (let startFrame = 0; startFrame < input.audio.length; startFrame += windowFrames) {
    const endFrame = Math.min(input.audio.length, startFrame + windowFrames)
    let squareSum = 0
    for (let index = startFrame; index < endFrame; index += 1) squareSum += input.audio[index]! * input.audio[index]!
    const rms = Math.sqrt(squareSum / Math.max(1, endFrame - startFrame))
    const db = rms > 0 ? 20 * Math.log10(rms) : -100
    measuredBins.push({
      start: startFrame / input.sampleRate,
      end: Math.min(input.duration, endFrame / input.sampleRate),
      db
    })
  }
  const threshold = input.silenceThresholdDb ?? adaptiveSilenceThreshold(measuredBins.map((bin) => bin.db))
  const bins = measuredBins.map((bin) => ({ ...bin, silent: bin.db < threshold }))
  const groups = groupAudioBins(bins)
  for (const group of groups) {
    if (group.silent && group.end - group.start < minimumSilence) group.silent = false
  }
  return coalesceAudioGroups(groups).map((group, index) => {
    const meanDb = group.db.reduce((total, value) => total + value, 0) / group.db.length
    const peakDb = Math.max(...group.db)
    const evidenceType = group.silent ? 'silence' as const : 'audio_activity' as const
    const separation = group.silent ? threshold - meanDb : meanDb - threshold
    return {
      mediaAssetId: input.mediaAssetId,
      evidenceType,
      start: roundMilliseconds(group.start),
      end: roundMilliseconds(group.end),
      label: group.silent ? `Silence ${index + 1}` : `Audio activity ${index + 1}`,
      confidence: Math.round(clamp(0.55 + separation / 40, 0.55, 0.99) * 1_000) / 1_000,
      thumbnailTime: roundMilliseconds(group.start + (group.end - group.start) / 2),
      metadata: {
        meanDb: Math.round(meanDb * 100) / 100,
        peakDb: Math.round(peakDb * 100) / 100,
        silenceThresholdDb: threshold,
        windowSeconds
      }
    }
  }).filter((segment) => segment.end > segment.start)
}

/**
 * Estimate the recording's noise floor instead of assuming studio silence.
 * The lower quintile is normally room tone; a small margin above it separates
 * pauses while the clamps keep quiet speech and clipped recordings safe.
 */
export function adaptiveSilenceThreshold(values: readonly number[]) {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (!finite.length) return -42
  const noiseFloor = finite[Math.min(finite.length - 1, Math.floor(finite.length * 0.2))]!
  return Math.round(clamp(noiseFloor + 6, -55, -30) * 100) / 100
}

export async function analyzeCutVideoShots(input: {
  mediaAssetId: string
  url: string
  maxDuration: number
  signal?: AbortSignal
  onProgress?: (progress: number, message: string) => void
}): Promise<{ duration: number; segments: CutBrowserMediaEvidenceSegment[] }> {
  const video = document.createElement('video')
  video.crossOrigin = 'use-credentials'
  video.muted = true
  video.preload = 'auto'
  video.playsInline = true
  video.src = input.url
  await waitForVideoEvent(video, 'loadedmetadata', input.signal)
  const duration = Math.min(input.maxDuration, video.duration)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Video has no analyzable duration.')
  const sampleInterval = Math.max(0.5, duration / 300)
  const sampleTimes: number[] = []
  for (let time = 0; time < duration; time += sampleInterval) sampleTimes.push(Math.min(duration - 0.001, time))
  if (sampleTimes.at(-1)! < duration - 0.25) sampleTimes.push(Math.max(0, duration - 0.001))
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 36
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Browser canvas is unavailable for shot analysis.')
  const differences: Array<{ time: number; score: number }> = []
  let previous: Float32Array | null = null
  for (let index = 0; index < sampleTimes.length; index += 1) {
    if (input.signal?.aborted) throw new DOMException('Media analysis cancelled.', 'AbortError')
    const time = sampleTimes[index]!
    await seekVideo(video, time, input.signal)
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const signature = frameSignature(context.getImageData(0, 0, canvas.width, canvas.height).data)
    if (previous) {
      const score = signatureDifference(previous, signature)
      differences.push({ time, score })
    }
    previous = signature
    input.onProgress?.(Math.round((index + 1) / sampleTimes.length * 100), `Sampling video frame ${index + 1} of ${sampleTimes.length}…`)
  }
  video.removeAttribute('src')
  video.load()
  const segments = buildCutShotSegments(input.mediaAssetId, duration, differences, sampleInterval)
  return { duration, segments }
}

export function buildCutShotSegments(
  mediaAssetId: string,
  duration: number,
  differences: readonly { time: number; score: number }[],
  sampleInterval: number,
  threshold = 0.2,
  minimumShotSeconds = 0.75
): CutBrowserMediaEvidenceSegment[] {
  const boundaries: Array<{ time: number; score: number }> = [{ time: 0, score: 1 }]
  let lastBoundary = 0
  for (const difference of differences) {
    if (difference.score >= threshold && difference.time - lastBoundary >= minimumShotSeconds && difference.time < duration) {
      boundaries.push({ time: difference.time, score: difference.score })
      lastBoundary = difference.time
    }
  }
  return boundaries.map((boundary, index) => {
    const end = boundaries[index + 1]?.time ?? duration
    return {
      mediaAssetId,
      evidenceType: 'shot' as const,
      start: roundMilliseconds(boundary.time),
      end: roundMilliseconds(end),
      label: `Shot ${index + 1}`,
      confidence: Math.round(clamp(boundary.score, 0.55, 0.99) * 1_000) / 1_000,
      thumbnailTime: roundMilliseconds(boundary.time + (end - boundary.time) / 2),
      metadata: { boundaryScore: Math.round(boundary.score * 1_000) / 1_000, sampleInterval: roundMilliseconds(sampleInterval) }
    }
  }).filter((segment) => segment.end > segment.start)
}

type AudioGroup = { start: number; end: number; silent: boolean; db: number[] }

function groupAudioBins(bins: Array<{ start: number; end: number; db: number; silent: boolean }>) {
  const groups: AudioGroup[] = []
  for (const bin of bins) {
    const previous = groups.at(-1)
    if (previous?.silent === bin.silent) {
      previous.end = bin.end
      previous.db.push(bin.db)
    } else groups.push({ start: bin.start, end: bin.end, silent: bin.silent, db: [bin.db] })
  }
  return groups
}

function coalesceAudioGroups(groups: AudioGroup[]) {
  const output: AudioGroup[] = []
  for (const group of groups) {
    const previous = output.at(-1)
    if (previous?.silent === group.silent) {
      previous.end = group.end
      previous.db.push(...group.db)
    } else output.push({ ...group, db: [...group.db] })
  }
  return output
}

function frameSignature(data: Uint8ClampedArray) {
  const buckets = new Float32Array(16)
  const pixels = data.length / 4
  for (let offset = 0; offset < data.length; offset += 4) {
    const luminance = data[offset]! * 0.2126 + data[offset + 1]! * 0.7152 + data[offset + 2]! * 0.0722
    buckets[Math.min(15, Math.floor(luminance / 16))] += 1 / pixels
  }
  return buckets
}

function signatureDifference(left: Float32Array, right: Float32Array) {
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference += Math.abs(left[index]! - right[index]!)
  return Math.min(1, difference / 2)
}

function waitForVideoEvent(video: HTMLVideoElement, name: 'loadedmetadata', signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(name, onReady)
      video.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    const onReady = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); reject(new Error('Could not load video for shot analysis.')) }
    const onAbort = () => { cleanup(); reject(new DOMException('Media analysis cancelled.', 'AbortError')) }
    video.addEventListener(name, onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function seekVideo(video: HTMLVideoElement, time: number, signal?: AbortSignal) {
  if (Math.abs(video.currentTime - time) <= 0.001 && video.readyState >= 2) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    const onSeeked = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); reject(new Error(`Could not decode video frame at ${time.toFixed(2)}s.`)) }
    const onAbort = () => { cleanup(); reject(new DOMException('Media analysis cancelled.', 'AbortError')) }
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
    video.currentTime = time
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundMilliseconds(value: number) {
  return Math.round(value * 1_000) / 1_000
}

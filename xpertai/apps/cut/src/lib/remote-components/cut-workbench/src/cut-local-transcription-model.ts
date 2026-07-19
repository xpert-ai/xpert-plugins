export const CUT_LOCAL_TRANSCRIPTION_SAMPLE_RATE = 16_000
export const CUT_LOCAL_TRANSCRIPTION_CHUNK_SECONDS = 30
export const CUT_LOCAL_TRANSCRIPTION_OVERLAP_SECONDS = 2

export type CutLocalTranscriptionDevice = 'webgpu' | 'wasm'

export type CutLocalTranscriptSegment = {
  start: number
  end: number
  text: string
  confidence?: number | null
  speaker?: string | null
}

export type CutWhisperChunk = {
  timestamp?: [number | null, number | null]
  text?: string
}

export type CutAudioWindow = {
  startFrame: number
  endFrame: number
  startSeconds: number
  acceptAfterSeconds: number
}

export function downmixCutAudio(channels: readonly Float32Array[], frameCount?: number) {
  if (!channels.length) throw new Error('Decoded media has no audio channels.')
  const length = Math.max(0, Math.min(frameCount ?? channels[0]!.length, ...channels.map((channel) => channel.length)))
  const mono = new Float32Array(length)
  for (const channel of channels) {
    for (let index = 0; index < length; index += 1) mono[index] += channel[index]! / channels.length
  }
  return mono
}

export function resampleCutAudio(input: Float32Array, inputSampleRate: number, outputSampleRate = CUT_LOCAL_TRANSCRIPTION_SAMPLE_RATE) {
  if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0 || !Number.isFinite(outputSampleRate) || outputSampleRate <= 0) {
    throw new Error('Audio sample rates must be positive.')
  }
  if (inputSampleRate === outputSampleRate) return input.slice()
  const outputLength = Math.max(1, Math.round(input.length * outputSampleRate / inputSampleRate))
  const output = new Float32Array(outputLength)
  const ratio = inputSampleRate / outputSampleRate
  for (let index = 0; index < outputLength; index += 1) {
    const source = index * ratio
    const lower = Math.min(input.length - 1, Math.floor(source))
    const upper = Math.min(input.length - 1, lower + 1)
    const weight = source - lower
    output[index] = input[lower]! * (1 - weight) + input[upper]! * weight
  }
  return output
}

export function createCutAudioWindows(
  totalFrames: number,
  sampleRate = CUT_LOCAL_TRANSCRIPTION_SAMPLE_RATE,
  chunkSeconds = CUT_LOCAL_TRANSCRIPTION_CHUNK_SECONDS,
  overlapSeconds = CUT_LOCAL_TRANSCRIPTION_OVERLAP_SECONDS
): CutAudioWindow[] {
  if (totalFrames <= 0) return []
  if (chunkSeconds <= 0 || overlapSeconds < 0 || overlapSeconds >= chunkSeconds) {
    throw new Error('Local transcription chunking requires 0 <= overlap < chunk length.')
  }
  const chunkFrames = Math.max(1, Math.round(chunkSeconds * sampleRate))
  const overlapFrames = Math.round(overlapSeconds * sampleRate)
  const hopFrames = chunkFrames - overlapFrames
  const windows: CutAudioWindow[] = []
  for (let startFrame = 0; startFrame < totalFrames; startFrame += hopFrames) {
    const endFrame = Math.min(totalFrames, startFrame + chunkFrames)
    const startSeconds = startFrame / sampleRate
    windows.push({
      startFrame,
      endFrame,
      startSeconds,
      acceptAfterSeconds: startFrame === 0 ? 0 : startSeconds + overlapSeconds / 2
    })
    if (endFrame === totalFrames) break
  }
  return windows
}

export function normalizeCutWhisperWindow(
  chunks: readonly CutWhisperChunk[] | undefined,
  text: string,
  window: CutAudioWindow,
  sampleRate: number,
  duration: number
): CutLocalTranscriptSegment[] {
  const windowEnd = Math.min(duration, window.endFrame / sampleRate)
  const candidates = chunks?.length ? chunks.map((chunk) => {
    const localStart = finiteTimestamp(chunk.timestamp?.[0], 0)
    const localEnd = finiteTimestamp(chunk.timestamp?.[1], windowEnd - window.startSeconds)
    return {
      start: window.startSeconds + localStart,
      end: window.startSeconds + localEnd,
      text: chunk.text?.trim() ?? ''
    }
  }) : [{ start: window.startSeconds, end: windowEnd, text: text.trim() }]
  return candidates.filter((segment) => {
    const midpoint = segment.start + (segment.end - segment.start) / 2
    return segment.text && segment.end > segment.start && segment.start < duration && midpoint + 0.0001 >= window.acceptAfterSeconds
  }).map((segment) => ({
    start: roundMilliseconds(Math.max(0, segment.start)),
    end: roundMilliseconds(Math.min(duration, segment.end)),
    text: segment.text
  })).filter((segment) => segment.end > segment.start)
}

export function coalesceCutTranscriptSegments(input: readonly CutLocalTranscriptSegment[]) {
  const sorted = input.map((segment) => ({ ...segment, text: segment.text.trim() }))
    .filter((segment) => segment.text && segment.end > segment.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const output: CutLocalTranscriptSegment[] = []
  for (const segment of sorted) {
    const previous = output.at(-1)
    if (previous && normalizeTranscriptText(previous.text) === normalizeTranscriptText(segment.text) && segment.start <= previous.end + 0.25) {
      previous.end = roundMilliseconds(Math.max(previous.end, segment.end))
      continue
    }
    output.push({ ...segment, start: roundMilliseconds(segment.start), end: roundMilliseconds(segment.end) })
  }
  return output
}

function finiteTimestamp(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

function normalizeTranscriptText(value: string) {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function roundMilliseconds(value: number) {
  return Math.round(value * 1_000) / 1_000
}

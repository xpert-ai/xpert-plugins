import type { CutTranscriptSegmentData } from './types.js'

const MAX_TRANSCRIPTION_CHARS = 200_000
const MAX_TRANSCRIPT_SEGMENTS = 5_000

/**
 * Converts the plain-text response exposed by current platform STT providers
 * into bounded, reviewable segments. Timing is explicitly estimated because
 * the shared Speech-to-Text model contract currently returns text, not words.
 */
export function estimateCutTranscriptSegments(
  value: string,
  durationSeconds?: number | null
): CutTranscriptSegmentData[] {
  const text = value.replace(/\r\n?/g, '\n').trim().slice(0, MAX_TRANSCRIPTION_CHARS)
  if (!text) throw new Error('Speech-to-text returned an empty transcription.')
  const chunks = splitTranscription(text).slice(0, MAX_TRANSCRIPT_SEGMENTS)
  const duration = normalizedDuration(durationSeconds, chunks.length)
  const totalWeight = chunks.reduce((sum, chunk) => sum + segmentWeight(chunk), 0)
  let cursor = 0
  return chunks.map((chunk, sequence) => {
    const start = cursor
    const isLast = sequence === chunks.length - 1
    const share = segmentWeight(chunk) / totalWeight
    const end = isLast ? duration : Math.min(duration, cursor + duration * share)
    cursor = end
    return {
      sequence,
      start: roundMillis(start),
      end: roundMillis(Math.max(end, start + 0.001)),
      text: chunk,
      confidence: null,
      speaker: null,
      words: null
    }
  })
}

export function normalizeCutTranscriptionContent(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content.map((item) => {
    if (typeof item === 'string') return item.trim()
    if (!item || typeof item !== 'object' || Array.isArray(item)) return ''
    const text = (item as { text?: unknown }).text
    return typeof text === 'string' ? text.trim() : ''
  }).filter(Boolean).join('\n').trim()
}

function splitTranscription(text: string) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const chunks = lines.flatMap((line) => line.split(/(?<=[.!?。！？；;])\s*/u).map((item) => item.trim()).filter(Boolean))
  return chunks.length ? chunks : [text]
}

function normalizedDuration(value: number | null | undefined, chunkCount: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(86_400, value)
    : Math.min(86_400, Math.max(1, chunkCount) * 3)
}

function segmentWeight(value: string) {
  return Math.max(1, Array.from(value).length)
}

function roundMillis(value: number) {
  return Math.round(value * 1000) / 1000
}

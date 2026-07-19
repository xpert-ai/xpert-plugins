import type { CutProjectDocument } from './types.js'

export type CutSpeechCleanupMode = 'conservative' | 'balanced' | 'aggressive'
export type CutSpeechCleanupKind = 'silence' | 'filler' | 'repetition' | 'stutter' | 'manual'

export type CutSpeechTranscriptSegment = {
  id?: string
  start: number
  end: number
  text: string
  words?: Array<{ start: number; end: number; text: string }> | null
}

export type CutSpeechCleanupCandidate = {
  start: number
  end: number
  evidenceIds: string[]
  kind: CutSpeechCleanupKind
  label: string
}

export type CutMergedSpeechCleanupCandidate = CutSpeechCleanupCandidate & {
  kinds: Set<CutSpeechCleanupKind>
}

export type CutSpeechCleanupPreset = {
  minimumSilenceSeconds: number
  keepPaddingSeconds: number
  maxRemovalRatio: number
  removeSilence: boolean
  removeFillers: boolean
  removeRepeatedPhrases: boolean
  removeStutters: boolean
}

const DEFAULT_FILLERS = [
  '嗯', '嗯嗯', '呃', '额', '啊', '呐', '这个', '那个', '就是', '就是说', '然后',
  'um', 'uh', 'erm', 'hmm', 'like', 'you know'
]

export function cutSpeechCleanupPreset(mode: CutSpeechCleanupMode): CutSpeechCleanupPreset {
  if (mode === 'conservative') return {
    minimumSilenceSeconds: 1.2,
    keepPaddingSeconds: 0.16,
    maxRemovalRatio: 0.2,
    removeSilence: true,
    removeFillers: true,
    removeRepeatedPhrases: false,
    removeStutters: true
  }
  if (mode === 'aggressive') return {
    minimumSilenceSeconds: 0.4,
    keepPaddingSeconds: 0.06,
    maxRemovalRatio: 0.5,
    removeSilence: true,
    removeFillers: true,
    removeRepeatedPhrases: true,
    removeStutters: true
  }
  return {
    minimumSilenceSeconds: 0.65,
    keepPaddingSeconds: 0.1,
    maxRemovalRatio: 0.35,
    removeSilence: true,
    removeFillers: true,
    removeRepeatedPhrases: true,
    removeStutters: true
  }
}

export function detectFillerCandidates(
  segments: readonly CutSpeechTranscriptSegment[],
  configuredFillers?: readonly string[]
): CutSpeechCleanupCandidate[] {
  const fillers = new Set((configuredFillers?.length ? configuredFillers : DEFAULT_FILLERS)
    .map(normalizeSpeechToken).filter(Boolean))
  const candidates: CutSpeechCleanupCandidate[] = []
  for (const segment of segments) {
    if (!segment.id) continue
    const evidenceIds = [`transcript:${segment.id}`]
    if (segment.words?.length) {
      for (const word of segment.words) {
        if (!fillers.has(normalizeSpeechToken(word.text))) continue
        candidates.push({
          start: Math.max(segment.start, word.start - 0.03),
          end: Math.min(segment.end, word.end + 0.03),
          evidenceIds,
          kind: 'filler',
          label: word.text.trim()
        })
      }
      continue
    }
    if (segment.end - segment.start <= 2.5 && fillers.has(normalizeSpeechToken(segment.text))) {
      candidates.push({ start: segment.start, end: segment.end, evidenceIds, kind: 'filler', label: segment.text.trim() })
      continue
    }
    const normalizedText = normalizeSpeechToken(segment.text)
    if (!normalizedText || segment.end - segment.start > 4) continue
    const boundaryFiller = [...fillers]
      .filter((filler) => filler.length && filler.length < normalizedText.length)
      .sort((left, right) => right.length - left.length)
      .find((filler) => normalizedText.startsWith(filler) || normalizedText.endsWith(filler))
    if (!boundaryFiller) continue
    const estimatedDuration = Math.min(0.48, Math.max(0.12,
      (segment.end - segment.start) * boundaryFiller.length / normalizedText.length + 0.03))
    const atStart = normalizedText.startsWith(boundaryFiller)
    candidates.push({
      start: atStart ? segment.start : Math.max(segment.start, segment.end - estimatedDuration),
      end: atStart ? Math.min(segment.end, segment.start + estimatedDuration) : segment.end,
      evidenceIds,
      kind: 'filler',
      label: boundaryFiller
    })
  }
  return candidates
}

export function detectTranscriptGapCandidates(
  segments: readonly CutSpeechTranscriptSegment[],
  minimumSilenceSeconds = 0.65,
  keepPaddingSeconds = 0.1
): CutSpeechCleanupCandidate[] {
  const ordered = segments.filter((segment) => segment.id && segment.end > segment.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  if (ordered.length < 2) return []
  const candidates: CutSpeechCleanupCandidate[] = []
  let previous = ordered[0]!
  let coveredUntil = previous.end
  for (const segment of ordered.slice(1)) {
    const gap = segment.start - coveredUntil
    if (gap >= minimumSilenceSeconds) {
      const start = coveredUntil + keepPaddingSeconds
      const end = segment.start - keepPaddingSeconds
      if (end - start >= 0.05) {
        candidates.push({
          start: roundMilliseconds(start),
          end: roundMilliseconds(end),
          evidenceIds: [`transcript:${previous.id}`],
          kind: 'silence',
          label: `Transcript pause before ${segment.text.trim().slice(0, 48) || 'speech'}`
        })
      }
    }
    if (segment.end > coveredUntil) {
      coveredUntil = segment.end
      previous = segment
    }
  }
  return candidates
}

export function detectStutterCandidates(
  segments: readonly CutSpeechTranscriptSegment[]
): CutSpeechCleanupCandidate[] {
  const words = timedWords(segments)
  const candidates: CutSpeechCleanupCandidate[] = []
  for (let index = 1; index < words.length; index += 1) {
    const previous = words[index - 1]!
    const current = words[index]!
    if (!previous.normalized || previous.normalized !== current.normalized) continue
    if (current.start - previous.end > 0.8) continue
    candidates.push({
      start: previous.start,
      end: previous.end,
      evidenceIds: [previous.evidenceId],
      kind: 'stutter',
      label: previous.text.trim()
    })
  }
  return candidates
}

export function detectRepeatedPhraseCandidates(
  segments: readonly CutSpeechTranscriptSegment[]
): CutSpeechCleanupCandidate[] {
  const candidates: CutSpeechCleanupCandidate[] = []
  const ordered = segments.filter((segment) => segment.id && segment.end > segment.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!
    const current = ordered[index]!
    const normalized = normalizeSpeechToken(previous.text)
    if (normalized.length < 2 || normalized !== normalizeSpeechToken(current.text) || current.start - previous.end > 1.2) continue
    candidates.push({
      start: previous.start,
      end: previous.end,
      evidenceIds: [`transcript:${previous.id}`],
      kind: 'repetition',
      label: previous.text.trim()
    })
  }

  const words = timedWords(segments)
  const usedWordIndexes = new Set<number>()
  for (let phraseSize = 6; phraseSize >= 2; phraseSize -= 1) {
    for (let secondStart = phraseSize; secondStart + phraseSize <= words.length; secondStart += 1) {
      const firstStart = secondStart - phraseSize
      const first = words.slice(firstStart, secondStart)
      const second = words.slice(secondStart, secondStart + phraseSize)
      if (first.some((_word, offset) => usedWordIndexes.has(firstStart + offset))) continue
      if (second[0]!.start - first.at(-1)!.end > 1.2) continue
      if (!first.every((word, offset) => word.normalized && word.normalized === second[offset]!.normalized)) continue
      first.forEach((_word, offset) => usedWordIndexes.add(firstStart + offset))
      candidates.push({
        start: first[0]!.start,
        end: first.at(-1)!.end,
        evidenceIds: [...new Set(first.map((word) => word.evidenceId))],
        kind: 'repetition',
        label: first.map((word) => word.text.trim()).join(' ')
      })
      secondStart += phraseSize - 1
    }
  }
  return candidates
}

export function selectedTranscriptCandidates(
  segments: readonly CutSpeechTranscriptSegment[],
  segmentIds: readonly string[]
): CutSpeechCleanupCandidate[] {
  const selected = new Set(segmentIds)
  return segments.flatMap((segment) => segment.id && selected.has(segment.id) ? [{
    start: segment.start,
    end: segment.end,
    evidenceIds: [`transcript:${segment.id}`],
    kind: 'manual' as const,
    label: segment.text.trim()
  }] : [])
}

export function mapSpeechCandidatesToTimeline(
  document: CutProjectDocument,
  mediaAssetId: string,
  candidates: readonly CutSpeechCleanupCandidate[]
) {
  const mapped: CutSpeechCleanupCandidate[] = []
  const clips = document.tracks.flatMap((track) => track.clips).filter((clip) =>
    clip.mediaAssetId === mediaAssetId && (clip.type === 'video' || clip.type === 'audio')
  )
  for (const clip of clips) {
    const rate = clip.playbackRate ?? 1
    const sourceStart = clip.trimIn
    const sourceEnd = clip.trimIn + clip.duration * rate
    for (const candidate of candidates) {
      const start = Math.max(sourceStart, candidate.start)
      const end = Math.min(sourceEnd, candidate.end)
      if (end - start < 0.04) continue
      mapped.push({
        ...candidate,
        start: roundMilliseconds(clip.start + (start - sourceStart) / rate),
        end: roundMilliseconds(clip.start + (end - sourceStart) / rate)
      })
    }
  }
  return mapped
}

export function mergeSpeechCleanupCandidates(
  input: readonly CutSpeechCleanupCandidate[]
): CutMergedSpeechCleanupCandidate[] {
  const sorted = [...input].sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: CutMergedSpeechCleanupCandidate[] = []
  for (const candidate of sorted) {
    const previous = merged.at(-1)
    if (previous && candidate.start <= previous.end + 0.02) {
      previous.end = Math.max(previous.end, candidate.end)
      previous.kinds.add(candidate.kind)
      previous.evidenceIds = [...new Set([...previous.evidenceIds, ...candidate.evidenceIds])].slice(0, 8)
      if (candidate.kind !== 'silence') previous.label = candidate.label
      continue
    }
    merged.push({ ...candidate, evidenceIds: [...new Set(candidate.evidenceIds)].slice(0, 8), kinds: new Set([candidate.kind]) })
  }
  return merged
}

export function speechCleanupCategoryCounts(candidates: readonly CutMergedSpeechCleanupCandidate[]) {
  const counts: Record<CutSpeechCleanupKind, number> = { silence: 0, filler: 0, repetition: 0, stutter: 0, manual: 0 }
  for (const candidate of candidates) for (const kind of candidate.kinds) counts[kind] += 1
  return counts
}

function timedWords(segments: readonly CutSpeechTranscriptSegment[]) {
  return segments.flatMap((segment) => !segment.id ? [] : (segment.words ?? []).flatMap((word) => {
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start) return []
    return [{
      start: word.start,
      end: word.end,
      text: word.text,
      normalized: normalizeSpeechToken(word.text),
      evidenceId: `transcript:${segment.id}`
    }]
  })).sort((left, right) => left.start - right.start || left.end - right.end)
}

function normalizeSpeechToken(value: string) {
  return value.toLocaleLowerCase().normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '')
}

function roundMilliseconds(value: number) {
  return Math.round(value * 1_000) / 1_000
}

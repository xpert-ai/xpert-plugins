export type SourceSegment = {
  text: string
  field?: string
}

const EVIDENCE_ORDER = ['title', 'description', 'price', 'category', 'specs']

type Span = {
  start: number
  end: number
  field: string
}

/**
 * Splits the supplier copy into plain and evidence-backed segments so the
 * workbench can highlight the exact excerpt each extracted field came from.
 * Overlapping quotes keep the earliest one; quotes missing from the copy are
 * ignored rather than guessed at.
 */
export function sourceSegments(
  sourceText: string,
  evidence: Record<string, string> | null | undefined
): SourceSegment[] {
  if (!sourceText) return []
  if (!evidence) return [{ text: sourceText }]

  const spans: Span[] = []
  for (const field of EVIDENCE_ORDER) {
    const quote = evidence[field]
    if (!quote) continue
    const start = sourceText.indexOf(quote)
    if (start < 0) continue
    spans.push({ start, end: start + quote.length, field })
  }

  spans.sort((a, b) => a.start - b.start || b.end - a.end)
  const selected: Span[] = []
  for (const span of spans) {
    if (selected.some((other) => span.start < other.end && other.start < span.end)) continue
    selected.push(span)
  }

  const segments: SourceSegment[] = []
  let cursor = 0
  for (const span of selected) {
    if (span.start > cursor) segments.push({ text: sourceText.slice(cursor, span.start) })
    segments.push({ text: sourceText.slice(span.start, span.end), field: span.field })
    cursor = span.end
  }
  if (cursor < sourceText.length) segments.push({ text: sourceText.slice(cursor) })
  return segments
}

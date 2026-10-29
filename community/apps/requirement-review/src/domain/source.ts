export const INPUT_LIMITS = {
  title: 80,
  characters: 12_000,
  segments: 100
} as const
export type SourceSegment = {
  id: string
  text: string
  timestamp: string | null
}

export class InputError extends Error {
  constructor(
    public readonly code:
      | 'invalid_title'
      | 'empty_source'
      | 'source_too_long'
      | 'too_many_segments'
  ) {
    super(code)
  }
}

export function validateTitle(title: string): string {
  const value = title.trim()
  if (!value || value.length > INPUT_LIMITS.title)
    throw new InputError('invalid_title')
  return value
}

export function segmentSource(source: string): SourceSegment[] {
  if (!source.trim()) throw new InputError('empty_source')
  if (source.length > INPUT_LIMITS.characters)
    throw new InputError('source_too_long')
  const paragraphs = source
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  if (paragraphs.length > INPUT_LIMITS.segments)
    throw new InputError('too_many_segments')
  return paragraphs.map((text, index) => {
    const match = text.match(/^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s/)
    const timeParts = match?.[1].split(':').map(Number)
    const valid = timeParts && timeParts.slice(1).every((part) => part < 60)
    return {
      id: `S${String(index + 1).padStart(2, '0')}`,
      text,
      timestamp: valid && match ? match[1] : null
    }
  })
}

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

export function hasValidEvidence(
  segments: SourceSegment[],
  segmentId: string,
  quote: string
): boolean {
  const segment = segments.find((item) => item.id === segmentId)
  const normalized = normalizeWhitespace(quote)
  return Boolean(
    segment &&
    normalized &&
    normalizeWhitespace(segment.text).includes(normalized)
  )
}

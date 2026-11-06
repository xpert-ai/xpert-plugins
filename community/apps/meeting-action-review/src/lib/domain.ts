import { createHash, randomUUID } from 'node:crypto'
import type { EditableItem, ExtractionInput } from './schemas.js'
import { fail, type ReviewItem, type Segments } from './types.js'

// Inputs are parsed by strict schemas with deterministic field order before hashing.
export const fingerprint = (value: object | string) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function segmentSource(source: string): Segments {
  const segments: Segments['segments'] = []
  let offset = 0
  for (const line of source.split('\n')) {
    if (line.trim()) segments.push({ id: `S${String(segments.length + 1).padStart(3, '0')}`, start: offset, end: offset + line.length })
    offset += line.length + 1
  }
  return { schemaVersion: 1, offsetUnit: 'utf16', segments }
}
export function acceptItems(input: ExtractionInput, source: Segments): ReviewItem[] {
  const ids = new Set(source.segments.map(s => s.id))
  return input.items.map(item => {
    if (item.sourceSegmentIds.some(id => !ids.has(id))) fail('SOURCE_REFERENCE_INVALID')
    return { ...item, sourceSegmentIds: [...new Set(item.sourceSegmentIds)], id: randomUUID(), origin: 'ai', humanAdjusted: false }
  })
}
export function reviewItems(input: EditableItem[], initial: ReviewItem[]): ReviewItem[] {
  const original = new Map(initial.map(i => [i.id, i]))
  return input.map(item => {
    const before = original.get(item.id)
    return before ? {
      ...before, ...item,
      humanAdjusted: item.task !== before.task || item.owner !== before.owner || item.deadlineText !== before.deadlineText
    } : { ...item, sourceSegmentIds: [], origin: 'manual', humanAdjusted: false, reviewNote: null }
  })
}
export function assertFingerprint(actual: string | null, expected: string) {
  if (actual !== expected) fail('OPERATION_CONFLICT')
}

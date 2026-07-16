import { estimateCutTranscriptSegments, normalizeCutTranscriptionContent } from './cut-transcription.js'

describe('Cut transcription normalization', () => {
  it('estimates bounded monotonic timings for plain-text STT output', () => {
    const segments = estimateCutTranscriptSegments('Hello world. 第二句话！\nFinal line', 12)
    expect(segments).toHaveLength(3)
    expect(segments[0]).toMatchObject({ sequence: 0, start: 0, text: 'Hello world.' })
    expect(segments.at(-1)?.end).toBe(12)
    expect(segments.every((item, index) => item.end > item.start && (!index || item.start >= segments[index - 1]!.end))).toBe(true)
  })

  it('normalizes string and text-block model content and rejects empty text', () => {
    expect(normalizeCutTranscriptionContent([{ type: 'text', text: ' first ' }, { text: 'second' }])).toBe('first\nsecond')
    expect(() => estimateCutTranscriptSegments('   ', 3)).toThrow('empty transcription')
  })
})

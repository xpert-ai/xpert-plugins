import { detectCutSubtitleFormat, parseCutSubtitle, serializeCutSubtitle } from './cut-caption.js'

describe('Cut subtitle formats', () => {
  const captions = [
    { id: 'caption-1', start: 1.25, end: 3.5, text: 'Hello, Xpert!' },
    { id: 'caption-2', start: 4, end: 6.2, text: 'Second line\ncontinues.' }
  ]

  it.each(['srt', 'vtt', 'ass'] as const)('round-trips %s cues', (format) => {
    const serialized = serializeCutSubtitle(captions, format)
    expect(detectCutSubtitleFormat(serialized)).toBe(format)
    expect(parseCutSubtitle(serialized, format)).toEqual(captions)
  })

  it('parses WebVTT cue settings and ignores notes', () => {
    const parsed = parseCutSubtitle(`WEBVTT\n\nNOTE generated locally\nprivate note\n\nintro\n00:01.000 --> 00:03.250 align:center\nWelcome\n`)
    expect(parsed).toEqual([{ id: 'caption-1', start: 1, end: 3.25, text: 'Welcome' }])
  })

  it('rejects invalid or empty cue timing', () => {
    expect(() => parseCutSubtitle('1\n00:00:03,000 --> 00:00:02,000\nBackwards')).toThrow('invalid timing')
    expect(() => parseCutSubtitle('WEBVTT')).toThrow('No VTT subtitle cues')
  })
})

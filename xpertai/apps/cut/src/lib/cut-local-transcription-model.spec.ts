import {
  coalesceCutTranscriptSegments,
  createCutAudioWindows,
  downmixCutAudio,
  normalizeCutWhisperWindow,
  resampleCutAudio
} from './remote-components/cut-workbench/src/cut-local-transcription-model.js'

describe('Cut browser transcription audio and chunk model', () => {
  it('downmixes and linearly resamples decoded audio', () => {
    const mono = downmixCutAudio([
      new Float32Array([1, 0.5, 0, -0.5]),
      new Float32Array([-1, 0.5, 1, -0.5])
    ])
    expect([...mono]).toEqual([0, 0.5, 0.5, -0.5])
    expect([...resampleCutAudio(mono, 4, 2)]).toEqual([0, 0.5])
  })

  it('creates overlapping 30-second windows and removes duplicate overlap output', () => {
    const windows = createCutAudioWindows(65 * 16_000)
    expect(windows).toHaveLength(3)
    expect(windows.map((window) => [window.startSeconds, window.endFrame / 16_000, window.acceptAfterSeconds])).toEqual([
      [0, 30, 0],
      [28, 58, 29],
      [56, 65, 57]
    ])
    const first = normalizeCutWhisperWindow([
      { timestamp: [0, 2], text: 'Welcome' },
      { timestamp: [28, 30], text: 'overlap' }
    ], '', windows[0]!, 16_000, 65)
    const second = normalizeCutWhisperWindow([
      { timestamp: [0, 1], text: 'overlap' },
      { timestamp: [1, 4], text: 'to Cut' }
    ], '', windows[1]!, 16_000, 65)
    expect(second).toEqual([{ start: 29, end: 32, text: 'to Cut' }])
    expect(coalesceCutTranscriptSegments([...first, ...second])).toEqual([
      { start: 0, end: 2, text: 'Welcome' },
      { start: 28, end: 30, text: 'overlap' },
      { start: 29, end: 32, text: 'to Cut' }
    ])
  })

  it('uses bounded window text when a model omits timestamp chunks', () => {
    const window = createCutAudioWindows(5 * 16_000)[0]!
    expect(normalizeCutWhisperWindow(undefined, ' Short clip ', window, 16_000, 5)).toEqual([
      { start: 0, end: 5, text: 'Short clip' }
    ])
  })
})

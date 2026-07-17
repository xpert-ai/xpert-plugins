import { adaptiveSilenceThreshold, analyzeCutAudioActivity, buildCutShotSegments } from './remote-components/cut-workbench/src/cut-media-analysis.js'

describe('Cut browser media analysis', () => {
  it('adapts the silence threshold to room tone while keeping safety clamps', () => {
    expect(adaptiveSilenceThreshold([-38, -37, -36, -18, -16, -14])).toBe(-31)
    expect(adaptiveSilenceThreshold([-80, -78, -70, -20])).toBe(-55)
    expect(adaptiveSilenceThreshold([-20, -19, -18, -17])).toBe(-30)
  })

  it('extracts bounded silence and audio-activity evidence from PCM windows', () => {
    const sampleRate = 100
    const audio = new Float32Array(sampleRate * 3)
    for (let index = sampleRate; index < sampleRate * 2; index += 1) audio[index] = 0.25
    const segments = analyzeCutAudioActivity({
      mediaAssetId: 'media-a',
      audio,
      sampleRate,
      duration: 3,
      windowSeconds: 0.1,
      silenceThresholdDb: -42,
      minimumSilenceSeconds: 0.5
    })
    expect(segments.map((segment) => ({ type: segment.evidenceType, start: segment.start, end: segment.end }))).toEqual([
      { type: 'silence', start: 0, end: 1 },
      { type: 'audio_activity', start: 1, end: 2 },
      { type: 'silence', start: 2, end: 3 }
    ])
    expect(segments[0]).toMatchObject({ label: 'Silence 1', metadata: { silenceThresholdDb: -42 } })
    expect(segments[1]!.confidence).toBeGreaterThan(0.55)
  })

  it('folds sub-threshold micro-pauses into surrounding activity', () => {
    const sampleRate = 100
    const audio = new Float32Array(sampleRate * 2).fill(0.2)
    audio.fill(0, 90, 110)
    const segments = analyzeCutAudioActivity({
      mediaAssetId: 'media-a', audio, sampleRate, duration: 2,
      windowSeconds: 0.1, minimumSilenceSeconds: 0.5
    })
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ evidenceType: 'audio_activity', start: 0, end: 2 })
  })

  it('turns significant frame differences into stable shot ranges and keyframe times', () => {
    const shots = buildCutShotSegments('media-video', 12, [
      { time: 0.5, score: 0.9 },
      { time: 1, score: 0.1 },
      { time: 4, score: 0.45 },
      { time: 4.4, score: 0.8 },
      { time: 9, score: 0.32 }
    ], 0.5)
    expect(shots).toEqual([
      expect.objectContaining({ evidenceType: 'shot', start: 0, end: 4, thumbnailTime: 2 }),
      expect.objectContaining({ evidenceType: 'shot', start: 4, end: 9, thumbnailTime: 6.5, confidence: 0.55 }),
      expect.objectContaining({ evidenceType: 'shot', start: 9, end: 12, thumbnailTime: 10.5 })
    ])
  })
})

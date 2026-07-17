import { compactCutMediaTrackDurations, selectCutMediaDuration } from './cut-media-duration.js'

describe('Cut media duration selection', () => {
  it('uses the video track duration instead of a longer audio/container duration for video clips', () => {
    expect(selectCutMediaDuration('video', {
      containerDuration: 140.759365,
      videoDuration: 140.666667,
      audioDuration: 140.711109
    })).toBeCloseTo(140.666667)
  })

  it('uses the audio track duration for audio assets and preserves compact evidence', () => {
    const durations = { containerDuration: 4.12345, audioDuration: 4.12 }
    expect(selectCutMediaDuration('audio', durations)).toBe(4.12)
    expect(compactCutMediaTrackDurations(durations)).toEqual({ containerDuration: 4.123, audioDuration: 4.12 })
  })
})

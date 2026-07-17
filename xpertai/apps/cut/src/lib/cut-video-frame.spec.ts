import { cutVideoFrameTimeoutMessage, isCutVideoFrameAcceptable } from './cut-video-frame.js'

describe('Cut video frame matching', () => {
  it('freezes the last decoded frame when container duration exceeds the video track tail', () => {
    expect(isCutVideoFrameAcceptable({
      targetTime: 140.733333,
      mediaTime: 140.633333,
      mediaDuration: 140.759365,
      frameDuration: 1 / 30
    })).toBe(true)
  })

  it('does not accept a stale frame away from the end of the media', () => {
    expect(isCutVideoFrameAcceptable({
      targetTime: 40,
      mediaTime: 39.8,
      mediaDuration: 140.759365,
      frameDuration: 1 / 30
    })).toBe(false)
  })

  it('includes seek evidence in timeout errors', () => {
    expect(cutVideoFrameTimeoutMessage({ targetTime: 12.5, mediaDuration: 30, lastMediaTime: 12.1 }))
      .toContain('target=12.500000s, last=12.100000s, duration=30.000000s')
  })
})

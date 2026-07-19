import { cutVideoDamagedPacketRecovery, cutVideoFrameTimeoutMessage, isCutVideoFrameAcceptable } from './cut-video-frame.js'

describe('Cut video frame matching', () => {
  it('freezes a camera MOV first frame with a short composition-time offset back to timeline zero', () => {
    expect(isCutVideoFrameAcceptable({
      targetTime: 0,
      mediaTime: 0.08,
      mediaDuration: 69.12,
      frameDuration: 1 / 30
    })).toBe(true)
  })

  it('does not hide a large undecodable gap at the start of the media', () => {
    expect(isCutVideoFrameAcceptable({
      targetTime: 0,
      mediaTime: 0.8,
      mediaDuration: 69.12,
      frameDuration: 1 / 30
    })).toBe(false)
  })

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

  it('does not accept an ahead frame outside the bounded start window', () => {
    expect(isCutVideoFrameAcceptable({
      targetTime: 40,
      mediaTime: 40.08,
      mediaDuration: 140.759365,
      frameDuration: 1 / 30
    })).toBe(false)
  })

  it('includes seek evidence in timeout errors', () => {
    expect(cutVideoFrameTimeoutMessage({ targetTime: 12.5, mediaDuration: 30, lastMediaTime: 12.1 }))
      .toContain('target=12.500000s, last=12.100000s, duration=30.000000s')
  })

  it('recovers a damaged packet by freezing a previous frame across its GOP', () => {
    expect(cutVideoDamagedPacketRecovery({ targetTime: 60.15, mediaDuration: 432.959, frameDuration: 1 / 30 }))
      .toEqual({ targetTime: 60.15, candidates: [58.15, 55.15], resumeAt: 62.15 })
  })

  it('does not create an unusable recovery plan at the first media frame', () => {
    expect(cutVideoDamagedPacketRecovery({ targetTime: 0, mediaDuration: 30, frameDuration: 1 / 30 })).toBeNull()
  })
})

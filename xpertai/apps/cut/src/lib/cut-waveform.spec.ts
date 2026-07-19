import { computeCutWaveform } from './cut-waveform.js'

describe('Cut waveform', () => {
  it('calculates normalized peaks for the visible source range', () => {
    const channel = new Float32Array([0, 0.2, -0.4, 0.1, 0.8, -1, 0.2, 0])
    expectPeaks(computeCutWaveform([channel], 0, 8, 4), [0.2, 0.4, 1, 0.2])
    expectPeaks(computeCutWaveform([channel], 4, 8, 2), [1, 0.2])
  })

  it('combines channels and handles empty ranges', () => {
    const left = new Float32Array([0.1, 0.2, 0.1, 0.2])
    const right = new Float32Array([0.5, 0.1, 1, 0.1])
    expectPeaks(computeCutWaveform([left, right], 0, 4, 2), [0.5, 1])
    expect(computeCutWaveform([left], 4, 4, 3)).toEqual([0, 0, 0])
  })
})

function expectPeaks(received: number[], expected: number[]) {
  expect(received).toHaveLength(expected.length)
  received.forEach((peak, index) => expect(peak).toBeCloseTo(expected[index]!, 5))
}

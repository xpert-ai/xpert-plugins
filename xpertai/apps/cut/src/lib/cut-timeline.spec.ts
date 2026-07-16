import { clipStartFromDrag } from './cut-timeline.js'

describe('Cut 1080p timeline dragging', () => {
  it('maps pointer distance to a bounded frame-friendly start time', () => {
    expect(clipStartFromDrag({ initialStart: 2, deltaPixels: 300, pixelsPerSecond: 60, clipDuration: 10, projectDuration: 30 })).toBe(7)
    expect(clipStartFromDrag({ initialStart: 18, deltaPixels: 600, pixelsPerSecond: 60, clipDuration: 10, projectDuration: 30 })).toBe(20)
  })
})

import {
  CUT_TIMELINE_MAX_PIXELS_PER_SECOND,
  CUT_TIMELINE_MIN_PIXELS_PER_SECOND,
  clipStartFromDrag,
  fitTimelinePixelsPerSecond,
  scaleTimelinePixelsPerSecond,
  timelinePixelsPerSecondFromSlider,
  timelineRulerMarks,
  timelineVideoThumbnailSamples,
  timelineZoomSliderValue
} from './cut-timeline.js'

describe('Cut 1080p timeline dragging', () => {
  it('maps pointer distance to a bounded frame-friendly start time', () => {
    expect(clipStartFromDrag({ initialStart: 2, deltaPixels: 300, pixelsPerSecond: 60, clipDuration: 10, projectDuration: 30 })).toBe(7)
    expect(clipStartFromDrag({ initialStart: 18, deltaPixels: 600, pixelsPerSecond: 60, clipDuration: 10, projectDuration: 30 })).toBe(20)
  })

  it('samples only the visible portion of a long video clip', () => {
    expect(timelineVideoThumbnailSamples({
      clipDuration: 600,
      trimIn: 10,
      playbackRate: 2,
      pixelsPerSecond: 48,
      visibleStart: 960,
      visibleEnd: 1_248,
      cellWidth: 96
    })).toEqual([
      { left: 960, width: 96, sourceTime: 52 },
      { left: 1_056, width: 96, sourceTime: 56 },
      { left: 1_152, width: 96, sourceTime: 60 }
    ])
  })

  it('bounds samples to the clip and rejects invalid geometry', () => {
    expect(timelineVideoThumbnailSamples({
      clipDuration: 2,
      trimIn: 3,
      pixelsPerSecond: 50,
      visibleStart: 50,
      visibleEnd: 500,
      cellWidth: 80
    })).toEqual([
      { left: 0, width: 80, sourceTime: 3.8 },
      { left: 80, width: 20, sourceTime: 4.8 }
    ])
    expect(timelineVideoThumbnailSamples({ clipDuration: 2, trimIn: 0, pixelsPerSecond: 0, visibleStart: 0, visibleEnd: 100 })).toEqual([])
  })

  it('uses a logarithmic zoom scale with useful low-end precision', () => {
    for (const pixelsPerSecond of [0.5, 1, 2, 4, 12, 48, 160]) {
      expect(timelinePixelsPerSecondFromSlider(timelineZoomSliderValue(pixelsPerSecond))).toBeCloseTo(pixelsPerSecond, 0)
    }
    expect(timelinePixelsPerSecondFromSlider(0)).toBe(CUT_TIMELINE_MIN_PIXELS_PER_SECOND)
    expect(timelinePixelsPerSecondFromSlider(100)).toBe(CUT_TIMELINE_MAX_PIXELS_PER_SECOND)
    expect(scaleTimelinePixelsPerSecond(1, 0.8)).toBe(0.8)
    expect(scaleTimelinePixelsPerSecond(160, 1.25)).toBe(160)
  })

  it('fits a long project inside the available timeline viewport', () => {
    expect(fitTimelinePixelsPerSecond({ viewportWidth: 2_048, duration: 432.89, gutterWidth: 132, horizontalPadding: 16 })).toBe(4.4)
    expect(fitTimelinePixelsPerSecond({ viewportWidth: 760, duration: 600, gutterWidth: 132, horizontalPadding: 16 })).toBe(1)
  })

  it('adapts ruler intervals to the zoom density', () => {
    expect(timelineRulerMarks(10, 160).slice(0, 4)).toEqual([0, 0.5, 1, 1.5])
    expect(timelineRulerMarks(432, 4).slice(0, 4)).toEqual([0, 15, 30, 45])
    expect(timelineRulerMarks(600, 0.5).slice(0, 3)).toEqual([0, 120, 240])
  })
})

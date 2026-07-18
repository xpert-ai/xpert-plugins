import { cutMediaDrawRect, cutStageScale, fitCutStage } from './cut-media-layout.js'

describe('Cut media layout', () => {
  it('fits portrait and landscape projects inside the available stage without changing aspect ratio', () => {
    expect(fitCutStage({ width: 900, height: 600 }, { width: 1080, height: 1920 })).toEqual({ width: 337.5, height: 600 })
    expect(fitCutStage({ width: 900, height: 600 }, { width: 1920, height: 1080 })).toEqual({ width: 900, height: 506.25 })
  })

  it('scales project-space text metrics with the fitted video stage', () => {
    const landscapeStage = fitCutStage({ width: 900, height: 600 }, { width: 1920, height: 1080 })
    const portraitStage = fitCutStage({ width: 900, height: 600 }, { width: 1080, height: 1920 })

    expect(cutStageScale(landscapeStage, { width: 1920, height: 1080 })).toBeCloseTo(0.46875)
    expect(96 * cutStageScale(landscapeStage, { width: 1920, height: 1080 })).toBeCloseTo(45)
    expect(cutStageScale(portraitStage, { width: 1080, height: 1920 })).toBeCloseTo(0.3125)
    expect(cutStageScale({ width: 0, height: 0 }, { width: 1920, height: 1080 })).toBe(0)
  })

  it('uses the same centered contain, cover, and stretch geometry for preview/export semantics', () => {
    expect(cutMediaDrawRect({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, 'contain'))
      .toEqual({ x: -540, y: -303.75, width: 1080, height: 607.5 })
    expect(cutMediaDrawRect({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, 'cover'))
      .toEqual({ x: -1706.6666666666665, y: -960, width: 3413.333333333333, height: 1920 })
    expect(cutMediaDrawRect({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, 'stretch'))
      .toEqual({ x: -540, y: -960, width: 1080, height: 1920 })
  })
})

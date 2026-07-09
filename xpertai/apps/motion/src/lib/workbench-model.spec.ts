import {
  addLayerToComposition,
  applyMotionTemplate,
  attachMotionPath,
  computeHtmlTimelineLayout,
  compositionDuration,
  createVideoLayer,
  friendlyHtmlComponentName,
  hitTestLayer,
  htmlTimelineItems,
  moveLayerAtTime
} from './workbench-model.js'
import type { MotionVideoComposition } from './types.js'

describe('Motion Workbench model helpers', () => {
  it('extracts HTML timeline items from motion attributes', () => {
    const items = htmlTimelineItems(
      '<!doctype html><html><body><h1 data-ma-id="headline" data-ma-anim="slide-up" data-ma-trigger="load" data-ma-dur="520" data-ma-delay="120">Morning</h1></body></html>'
    )
    expect(items).toEqual([
      {
        id: 'headline',
        label: 'h1 · Morning',
        verb: 'slide-up',
        trigger: 'load',
        delay: 120,
        duration: 520
      }
    ])
  })

  it('keeps upstream HTML labels and timeline restraint behavior', () => {
    expect(friendlyHtmlComponentName({ tagName: 'h1', text: 'Morning, Rin', index: 0 })).toBe('Headline · Morning, Rin')
    expect(friendlyHtmlComponentName({ tagName: 'div', className: 'metric-card', text: 'Revenue', index: 1 })).toBe('Card · Revenue')

    const layout = computeHtmlTimelineLayout([
      { id: 'c0', label: 'Headline', verb: 'slide-up', trigger: 'load', delay: 0, duration: 520 },
      { id: 'c1', label: 'Button', verb: 'fade', trigger: 'load', delay: 20, duration: 400 },
      { id: 'c2', label: 'Card', verb: 'fade', trigger: 'load', delay: 30, duration: 400 },
      { id: 'c3', label: 'Card', verb: 'fade', trigger: 'load', delay: 40, duration: 400 },
      { id: 'c4', label: 'Card', verb: 'fade', trigger: 'load', delay: 50, duration: 400 }
    ])
    expect(layout.duration).toBe(1200)
    expect(layout.earlyLoadCount).toBe(5)
    expect(layout.restraintWarning).toContain('More than four')
    expect(layout.items[0].widthPct).toBeGreaterThan(40)
  })

  it('adds layers and creates keyframes while dragging', () => {
    const composition: MotionVideoComposition = { w: 1280, h: 720, duration: 4, layers: [] }
    const layer = createVideoLayer('text', composition, 1)
    const withLayer = addLayerToComposition(composition, -1, layer)
    expect(withLayer.layers).toHaveLength(1)

    const moved = moveLayerAtTime(layer, 20, -10, 1.25)
    expect(moved.x).toBe((layer.x || 0) + 20)
    expect(moved.tracks?.x?.some((point) => point.t === 1.25)).toBe(true)
    expect(hitTestLayer([moved], moved.x || 0, moved.y || 0)?.id).toBe(layer.id)
  })

  it('applies templates and serializes motion paths', () => {
    const layer = createVideoLayer('rect', { w: 1280, h: 720, duration: 4 }, 1)
    const templated = applyMotionTemplate(layer, 'slide-up')
    expect(templated.tracks?.y).toHaveLength(2)
    const pathed = attachMotionPath(templated, [{ x: 100, y: 100 }, { x: 400, y: 160 }], 'line')
    expect(pathed.path?.kind).toBe('line')
    expect(pathed.tracks?.offset).toHaveLength(2)
  })

  it('computes scene duration for video compositions', () => {
    expect(
      compositionDuration({
        scenes: [
          { id: 'a', duration: 2, layers: [{ type: 'text' }] },
          { id: 'b', duration: 3, layers: [{ type: 'text' }] }
        ]
      })
    ).toBe(5)
  })
})

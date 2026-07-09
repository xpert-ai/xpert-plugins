import {
  MOTION_KEYFRAME_PROPS,
  MOTION_TRIGGERS,
  MOTION_VERBS,
  buildMotionCustomKeyframes,
  customKeyframeName,
  exportTextArtifact,
  injectCustomMotionKeyframes,
  injectMotionRuntime,
  validateHtmlArtifact
} from './html-motion.js'

const html = '<!doctype html><html><head><title>Motion</title></head><body><h1 data-ma-anim="fade">Motion</h1></body></html>'

describe('Motion HTML runtime', () => {
  it('exposes supported triggers, verbs, and keyframe tracks', () => {
    expect(MOTION_TRIGGERS).toEqual(['load', 'scroll', 'hover', 'click'])
    expect(MOTION_VERBS).toHaveLength(13)
    expect(MOTION_KEYFRAME_PROPS).toEqual(['opacity', 'x', 'y', 'scale', 'rotate', 'blur'])
  })

  it('injects runtime and keyframes once', () => {
    const once = injectMotionRuntime(html)
    const twice = injectMotionRuntime(once)
    expect(once).toContain('id="ma-motion-kf"')
    expect(once).toContain('id="ma-motion-runtime"')
    expect(twice.match(/ma-motion-runtime/g)?.length).toBe(1)
  })

  it('validates complete documents and exports text artifacts', () => {
    expect(validateHtmlArtifact(html)).toContain('<!doctype html>')
    expect(() => validateHtmlArtifact('<div>fragment</div>')).toThrow('complete HTML document')
    expect(exportTextArtifact({ kind: 'css', title: 'Motion' }).content).toContain('@keyframes ma-fade')
    expect(exportTextArtifact({ kind: 'json', title: 'Motion', html }).content).toContain('"title": "Motion"')
  })

  it('builds and injects custom keyframes for selected Workbench elements', () => {
    const name = customKeyframeName('Headline · Morning')
    const css = buildMotionCustomKeyframes(name, {
      opacity: [
        { t: 0, v: 0 },
        { t: 1, v: 1 }
      ],
      y: [
        { t: 0, v: 24 },
        { t: 1, v: 0 }
      ],
      blur: [
        { t: 0, v: 8 },
        { t: 1, v: 0 }
      ]
    })
    expect(name).toBe('ma-kf-headline-morning')
    expect(css).toContain('@keyframes ma-kf-headline-morning')
    expect(css).toContain('translate(0px,24px)')
    const injected = injectCustomMotionKeyframes(html, name, { opacity: [{ t: 0, v: 0 }, { t: 1, v: 1 }] })
    expect(injected).toContain(`id="ma-custom-${name}"`)
    expect(injectCustomMotionKeyframes(injected, name, { opacity: [{ t: 0, v: 0 }, { t: 1, v: 1 }] }).match(new RegExp(`ma-custom-${name}`, 'g'))?.length).toBe(1)
  })
})

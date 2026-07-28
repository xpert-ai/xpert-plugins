import {
  createProductIntroHyperframesComposition,
  XPERT_AI_PRODUCT_INTRO
} from './hyperframes-product-intro.js'
import {
  readHyperframesCompositionMetadata,
  validateHyperframesComposition
} from './hyperframes-composition.js'

describe('HyperFrames product intro generator', () => {
  it('creates a complete, self-contained six-scene Xpert AI launch film', () => {
    const html = createProductIntroHyperframesComposition(XPERT_AI_PRODUCT_INTRO)

    expect(validateHyperframesComposition(html)).toBe(html)
    expect(readHyperframesCompositionMetadata(html)).toEqual({
      id: 'main',
      width: 1920,
      height: 1080,
      duration: 36
    })
    expect(html.match(/data-scene-title=/g)).toHaveLength(6)
    expect(html).toContain('data-hf-id="agent-builder"')
    expect(html).toContain('data-hf-id="scene-cta"')
    expect(html).toContain('Multi-agent orchestration')
    expect(Buffer.byteLength(html)).toBeLessThan(200_000)
  })

  it('escapes user-provided copy and rejects external resource injection by construction', () => {
    const html = createProductIntroHyperframesComposition({
      ...XPERT_AI_PRODUCT_INTRO,
      brandName: '<script>alert(1)</script>',
      website: '" onclick="alert(1)'
    })

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&quot; onclick=&quot;alert(1)')
    expect(validateHyperframesComposition(html)).toBe(html)
  })
})

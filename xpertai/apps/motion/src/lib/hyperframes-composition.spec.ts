import {
  createStarterHyperframesComposition,
  readHyperframesCompositionMetadata,
  validateHyperframesComposition
} from './hyperframes-composition.js'

describe('HyperFrames composition contract', () => {
  it('creates a self-contained native starter composition', () => {
    const html = createStarterHyperframesComposition('Product Launch', 'A deterministic launch film.')
    expect(validateHyperframesComposition(html)).toBe(html)
    expect(readHyperframesCompositionMetadata(html)).toEqual({ id: 'main', width: 1280, height: 720, duration: 6 })
    expect(html).toContain('data-hf-id="title"')
    expect(html).toContain('data-no-timeline')
  })

  it('rejects legacy or network-dependent HTML', () => {
    expect(() => validateHyperframesComposition('<html><body>legacy</body></html>')).toThrow('data-composition-id')
    expect(() =>
      validateHyperframesComposition(
        '<main data-composition-id="main" data-width="1280" data-height="720" data-duration="4"><img src="https://example.com/a.png"></main>'
      )
    ).toThrow('data URIs')
    expect(() =>
      validateHyperframesComposition(
        '<main data-composition-id="main" data-width="1280" data-height="720" data-duration="4"><img src="./asset.png"></main>'
      )
    ).toThrow('relative asset')
    expect(() =>
      validateHyperframesComposition(
        '<style>.hero{background:url(./asset.png)}</style><main data-composition-id="main" data-width="1280" data-height="720" data-duration="4"></main>'
      )
    ).toThrow('relative asset')
    expect(
      validateHyperframesComposition(
        '<main data-composition-id="main" data-width="1280" data-height="720" data-duration="4"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="><a href="#scene">Scene</a></main>'
      )
    ).toContain('data:image/gif')
  })
})

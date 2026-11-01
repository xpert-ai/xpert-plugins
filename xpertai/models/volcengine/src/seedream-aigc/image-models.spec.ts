import { getSeedreamImageCapabilities, SEEDREAM_MODEL_OPTIONS, validateImageSize } from './image-models.js'

describe('Seedream 5.0 Flash image controls', () => {
  const model = 'doubao-seedream-5-0-flash-260915'
  it('exposes Flash with its supported image payload controls', () => {
    expect(SEEDREAM_MODEL_OPTIONS.map(([id]) => id)).toContain(model)
    expect(getSeedreamImageCapabilities(model)).toEqual({
      supportsSequential: false, supportsStream: false, supportsOutputFormat: true, maxInputImages: 10
    })
  })
  it('accepts its 1K/2K sizes and rejects Lite-only 3K/4K presets', () => {
    for (const size of ['1024x1024', '2048x2048', '2368x1776']) {
      expect(() => validateImageSize(model, size)).not.toThrow()
    }
    for (const size of ['3072x3072', '4096x4096']) expect(() => validateImageSize(model, size)).toThrow('not supported')
  })
})

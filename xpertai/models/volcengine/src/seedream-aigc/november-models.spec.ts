import { getSeedreamImageCapabilities, validateImageSize } from './image-models.js'
import { normalizeVideoGenerationOptions } from './rules.js'
import { normalizeSeedreamImageObservation } from './usage.js'

it('uses the Flash-specific media limits and rejects unsupported resolution and draft mode', () => {
  const model = 'doubao-seedance-2-5-flash-261115'
  const options = normalizeVideoGenerationOptions({ model })
  expect(options.capabilities).toMatchObject({ maxReferenceImages: 10, maxReferenceVideos: 5, maxReferenceAudios: 5 })
  for (const input of [{ resolution: '1080p' }, { draft: true }]) {
    expect(() => normalizeVideoGenerationOptions({ model, ...input })).toThrow()
  }
})

it('bills each delivered Seedream 5.5 image at its own size and counts input images once', () => {
  const model = 'doubao-seedream-5-5-261028'
  expect(getSeedreamImageCapabilities(model).maxInputImages).toBe(10)
  expect(() => validateImageSize(model, '4096x4096')).toThrow()
  const metrics = normalizeSeedreamImageObservation({ data: [{ url: 'a', size: '1024x1024' }, { url: 'b', size: '2048x2048' }] },
    { model, image: ['a', 'b'] }).metrics
  expect(metrics).toEqual([expect.objectContaining({ key: 'image-0', component: 'output', pricingDimensions: { resolution: 'le-2.61mp', mode: 'standard' } }),
    expect.objectContaining({ key: 'image-1', component: 'output', pricingDimensions: { resolution: 'gt-2.61mp', mode: 'standard' } }),
    expect.objectContaining({ component: 'input', quantity: 2 })])
})

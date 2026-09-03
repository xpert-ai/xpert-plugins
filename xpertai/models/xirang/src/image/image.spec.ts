import { getXirangImagePricingDimensions } from './pricing.js'

describe('Xirang image pricing dimensions', () => {
  it('uses the formal Seedream 2.61MP billing boundary', () => {
    expect(getXirangImagePricingDimensions('doubao-seedream-5.0-pro', { size: '1024x1024' })).toEqual({
      resolution: 'le-2.61mp',
      mode: 'standard'
    })
    expect(getXirangImagePricingDimensions('doubao-seedream-5.0-pro', { size: '2048x2048' })).toEqual({
      resolution: 'gt-2.61mp',
      mode: 'standard'
    })
  })

  it('falls back to the response size when the request uses a symbolic size', () => {
    expect(
      getXirangImagePricingDimensions(
        'doubao-seedream-5.0-pro',
        { size: '2K' },
        {
          data: [{ size: '1024x2048' }]
        }
      )
    ).toEqual({ resolution: 'le-2.61mp', mode: 'standard' })
  })

  it('does not guess a price tier when a symbolic size has no measured dimensions', () => {
    expect(getXirangImagePricingDimensions('doubao-seedream-5.0-pro', { size: '2K' })).toEqual({
      mode: 'standard'
    })
  })
})

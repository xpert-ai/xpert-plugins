import { AiProviderRole } from '@xpert-ai/contracts'
import { ImageGenerationModel } from '@xpert-ai/plugin-sdk'
import { XirangProviderStrategy } from '../provider.strategy.js'
import { XirangImageGenerationModel } from './image.js'
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

describe('Xirang image requests', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses the image manager contract and official Bearer authorization', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ url: 'https://example.test/image.png' }] })
    } as Response)
    const manager = new XirangImageGenerationModel(new XirangProviderStrategy())
    const handleModelUsage = jest.fn()

    expect(manager).toBeInstanceOf(ImageGenerationModel)
    await manager
      .getAIGCModel(
        {
          model: 'wan2.7-image',
          copilot: {
            role: AiProviderRole.Primary,
            modelProvider: { credentials: { app_key: 'app-key' } }
          }
        },
        { handleModelUsage }
      )
      .invoke({ prompt: 'a cloud' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai.ctaigw.cn/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer app-key', 'Content-Type': 'application/json' }
      })
    )
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(request.body))).toEqual({
      model: 'wan2.7-image',
      prompt: 'a cloud',
      response_format: 'url'
    })
    expect(handleModelUsage).toHaveBeenCalledWith(expect.objectContaining({ model: 'wan2.7-image' }))
  })

  it('fails closed when an unverified image-edit input is supplied', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
    const manager = new XirangImageGenerationModel(new XirangProviderStrategy())
    const client = manager.getAIGCModel({
      model: 'qwen-image-2.0-pro',
      copilot: {
        role: AiProviderRole.Primary,
        modelProvider: { credentials: { app_key: 'app-key' } }
      }
    })

    await expect(client.invoke({ prompt: 'edit this', image: 'https://example.test/input.png' }))
      .rejects.toThrow('当前仅支持文生图')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

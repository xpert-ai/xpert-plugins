import { SeedreamArkClient } from './client.js'
import { SeedreamImageModelClient } from './model.js'

describe('SeedreamImageModelClient', () => {
  it('returns Provider token and generation usage in the unified observation', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: 'image-data' }],
        usage: { generated_images: 1, output_tokens: 100, total_tokens: 100 }
      })
    })
    const client = new SeedreamImageModelClient(
      new SeedreamArkClient(
        { ark_api_key: 'provider-key', api_endpoint_host: 'https://ark.test/api/v3' },
        fetchMock as typeof fetch
      )
    )

    const result = await client.invoke({ model: 'doubao-seedream-4-5-251128', prompt: 'test' })

    expect(result.observation).toEqual(
      expect.objectContaining({
        state: 'succeeded',
        usageAvailability: 'available',
        metrics: expect.arrayContaining([
          expect.objectContaining({
            unit: 'token',
            completionTokens: 100,
            totalTokens: 100,
            authority: 'provider'
          }),
          expect.objectContaining({ unit: 'generation', quantity: 1, authority: 'provider' })
        ])
      })
    )
  })
})

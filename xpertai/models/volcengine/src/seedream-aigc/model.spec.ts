import { SeedreamArkClient } from './client.js'
import { calculateModelUsageCharge } from '@xpert-ai/plugin-sdk'
import { VolcengineProviderStrategy } from '../provider.strategy.js'
import { SeedreamImageModelClient, VolcengineImageGenerationModel, VolcengineVideoGenerationModel } from './model.js'

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

it.each([undefined, 'other-image-model'])('bills the selected Seedream model when the input specifies %p', async inputModel => {
  const model = 'doubao-seedream-5-5-261028'
  const manager = new VolcengineImageGenerationModel(new VolcengineProviderStrategy())
  const data = [{ url: 'https://example.test/a', size: '1280x720' }, { url: 'https://example.test/b', size: '2880x1440' }]
  const http = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data }))
  try {
    const client = manager.getAIGCModel({ model, copilot: { modelProvider: { credentials: { ark_api_key: 'test' } } } } as any)
    const result = await client.invoke({ model: inputModel, prompt: 'Edit', image: ['a', 'b'], size: '2880x1440' })
    expect(JSON.parse(String(http.mock.calls[0][1]?.body))).toMatchObject({ model, size: '2880x1440' })
    const snapshot = manager.getUsagePricingSnapshot(model, {}, { model, modality: 'image', operation: 'image_to_image', startedAt: '2026-11-26T00:00:00Z' })
    const charges = result.observation.metrics!.map(metric => calculateModelUsageCharge(snapshot, metric))
    expect(charges.map(charge => [charge.quantity, charge.unitPrice])).toEqual([[1, 0.13], [1, 0.23], [2, 0.05]])
  } finally { http.mockRestore() }
})

it.each([undefined, 'other-video-model'])('bills the selected Seedance model when the input specifies %p', async inputModel => {
  const model = 'doubao-seedance-2-5-flash-261115'
  const manager = new VolcengineVideoGenerationModel(new VolcengineProviderStrategy())
  const http = jest.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json({ id: 'task-1' }))
    .mockResolvedValueOnce(Response.json({ id: 'task-1', status: 'succeeded', usage: { completion_tokens: 1800, total_tokens: 1800 } }))
  try {
    const client = manager.getAIGCModel({ model, copilot: { modelProvider: { credentials: { ark_api_key: 'test' } } } } as any)
    const submitted = await client.submit({ model: inputModel, content: [{ type: 'text', text: 'Mountains' }], resolution: '720p' })
    expect(JSON.parse(String(http.mock.calls[0][1]?.body))).toMatchObject({ model, resolution: '720p' })
    const result = await client.query(submitted.providerRequestId)
    for (const [videoInput, unitPrice] of [[true, 28], [false, 46]] as const) {
      const snapshot = manager.getUsagePricingSnapshot(model, {}, {
        model, modality: 'video', operation: videoInput ? 'reference_to_video' : 'text_to_video',
        startedAt: '2026-11-26T00:00:00Z', pricingDimensions: { resolution: '720p', videoInput }
      })
      const charge = calculateModelUsageCharge(snapshot, result.observation.metrics![0])
      expect(charge).toMatchObject({ quantity: 1800, unitPrice, currency: 'CNY' })
    }
  } finally { http.mockRestore() }
})

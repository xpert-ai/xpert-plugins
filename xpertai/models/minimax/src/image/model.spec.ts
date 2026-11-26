import { calculateModelUsageCharge } from '@xpert-ai/plugin-sdk'
import { MiniMaxImageModel } from './model.js'
import { MiniMaxProviderStrategy } from '../provider.strategy.js'

it('uses separate generation and edit routes and records actual token usage', async () => {
  const model = new MiniMaxImageModel(new MiniMaxProviderStrategy())
  const handleModelUsage = jest.fn()
  const client = model.getAIGCModel({ model: 'MiniMax-H3-Image', copilot: { modelProvider: { credentials: { api_key: 'test' } } } } as any, { handleModelUsage })
  const data = { data: [{ url: 'https://example.test/result.jpg', size: '1024x1024' }], usage: { input_tokens: 50, output_tokens: 130, input_tokens_details: { text_tokens: 30, image_tokens: 20 } } }
  const http = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(data))
  try {
    await client.invoke({ prompt: 'Landscape', n: 2, area: '2K' })
    await client.invoke({ prompt: 'Change the sky', images: [{ image_url: 'https://example.test/input.png' }] })
    expect(http.mock.calls.map(call => call[0])).toEqual(['https://api.minimaxi.com/v1/images/generations', 'https://api.minimaxi.com/v1/images/edits'])
    expect(handleModelUsage).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'image_to_image',
      metrics: [expect.objectContaining({ promptTokens: 30 }), expect.objectContaining({ promptTokens: 20 }), expect.objectContaining({ completionTokens: 130 })] }))
    http.mockResolvedValueOnce(Response.json({ data: [], base_resp: { status_code: 1 } }))
    await expect(client.invoke({ prompt: 'Landscape' })).rejects.toThrow()
    expect(handleModelUsage).toHaveBeenCalledTimes(2)
  } finally { http.mockRestore() }
})

it.each(['MiniMax-H3-Image', 'MiniMax-H3-Image-Highspeed'])('forwards the documented generation and edit inputs for %s', async (modelId) => {
  const model = new MiniMaxImageModel(new MiniMaxProviderStrategy())
  const client = model.getAIGCModel({ model: modelId, copilot: { modelProvider: { credentials: { api_key: 'test' } } } } as any)
  const output = { data: [{ b64_json: 'cGl4ZWxz', size: '2720x1536' }] }
  const http = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(output))
  try {
    const generation = { prompt: 'Landscape', size: '2720x1536', disable_prompt_enhanced: true, stream: false as const, response_format: 'b64_json' as const }
    const edit = { prompt: 'Edit the sky', images: [{ image_url: 'https://example.test/photo.png' }], n: 2,
      size: 'auto', aspect_ratio: '21:9', stream: false as const, area: '2K' as const, response_format: 'b64_json' as const }
    expect((await client.invoke(generation)).data).toMatchObject(output)
    expect((await client.invoke(edit)).data).toMatchObject(output)
    expect(http.mock.calls.map(([url, init]) => [url, JSON.parse(String(init?.body))])).toEqual([
      ['https://api.minimaxi.com/v1/images/generations', { ...generation, model: modelId }],
      ['https://api.minimaxi.com/v1/images/edits', { ...edit, model: modelId }]
    ])
  } finally { http.mockRestore() }
})

it.each([
  ['https://api.minimax.cn', 'CNY', '1024x1024', [15, 20, 50]],
  ['https://api.minimax.io', 'USD', '5440x3072', [1.15, 1.5, 3.8]]
] as const)('prices delivered Highspeed usage at %s', async (base_url, currency, size, prices) => {
  const model = 'MiniMax-H3-Image-Highspeed'
  const manager = new MiniMaxImageModel(new MiniMaxProviderStrategy())
  const client = manager.getAIGCModel({ model, copilot: { modelProvider: { credentials: { base_url, api_key: 'test' } } } } as any)
  const response = {
    data: [{ url: 'https://example.test/image.jpg', size }, { error: { code: '1000', message: 'Failed' } }],
    usage: { input_tokens: 200, output_tokens: 400, input_tokens_details: { text_tokens: 80, image_tokens: 120 } }
  }
  const http = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(response))
  try {
    const result = await client.invoke({ prompt: 'Repaint', images: [{ image_url: 'https://example.test/input.png' }], n: 2 })
    const snapshot = manager.getUsagePricingSnapshot(model, {}, { model, modality: 'image', operation: 'image_to_image', startedAt: '2026-11-26T00:00:00Z' })
    const charges = result.observation.metrics.map(metric => calculateModelUsageCharge(snapshot, metric))
    expect(charges.map(({ unitPrice }) => unitPrice)).toEqual(prices)
    expect(charges.map(({ quantity }) => quantity)).toEqual([80, 120, 400])
    expect(charges.map(charge => charge.currency)).toEqual([currency, currency, currency])
  } finally { http.mockRestore() }
})

it('requires a concrete aspect ratio or size when generation skips prompt enhancement', async () => {
  const manager = new MiniMaxImageModel(new MiniMaxProviderStrategy())
  const client = manager.getAIGCModel({ model: 'MiniMax-H3-Image', copilot: { modelProvider: { credentials: { api_key: 'test' } } } } as any)
  const http = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [{ url: 'https://example.test/image.jpg' }] }))
  try {
    for (const fields of [{}, { size: 'auto', aspect_ratio: 'auto' }, { area: '2K' as const }]) {
      await expect(client.invoke({ prompt: 'paint', disable_prompt_enhanced: true, ...fields })).rejects.toThrow()
    }
    await expect(client.invoke({ prompt: 'edit', images: [{ image_url: 'https://example.test/photo.jpg' }], disable_prompt_enhanced: true, size: '2720x1536' })).rejects.toThrow()
    expect(http).not.toHaveBeenCalled()
    await client.invoke({ prompt: 'paint', disable_prompt_enhanced: true, aspect_ratio: '4:3' })
    expect(JSON.parse(String(http.mock.calls[0][1]?.body))).toMatchObject({ disable_prompt_enhanced: true, aspect_ratio: '4:3' })
  } finally { http.mockRestore() }
})

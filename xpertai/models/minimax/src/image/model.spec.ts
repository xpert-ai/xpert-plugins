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

import { AiProviderRole } from '@xpert-ai/contracts'
import { SiliconflowProviderStrategy } from '../provider.strategy.js'
import { SiliconflowTextEmbeddingModel } from './text-embedding.js'

describe('SiliconFlow VL embedding text requests', () => {
  afterEach(() => jest.restoreAllMocks())
  it('sends one input per request and explicitly requests float vectors', async () => {
    const requests: Array<{ input: string[]; encoding_format: string }> = []
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const request: { input: string[]; encoding_format: string } = JSON.parse(String(init?.body))
      requests.push(request)
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2, 3] }], usage: { prompt_tokens: 2, total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } })
    })
    const manager = new SiliconflowTextEmbeddingModel(new SiliconflowProviderStrategy())
    const client = manager.getEmbeddingInstance({ model: 'Qwen/Qwen3-VL-Embedding-8B', copilot: { role: AiProviderRole.Primary, modelProvider: { credentials: { api_key: 'test' } } } })
    expect(await client.embedDocuments(['one', 'two'])).toEqual([[1, 2, 3], [1, 2, 3]])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requests).toEqual([
      expect.objectContaining({ input: ['one'], encoding_format: 'float' }),
      expect.objectContaining({ input: ['two'], encoding_format: 'float' })
    ])
  })
})

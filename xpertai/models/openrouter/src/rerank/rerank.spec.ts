import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { OpenRouterProviderStrategy } from '../provider.strategy.js'
import { OpenRouterRerankModel } from './rerank.js'

describe('OpenRouterRerankModel', () => {
  let rerank: OpenRouterRerankModel

  beforeEach(() => {
    rerank = new OpenRouterRerankModel(new OpenRouterProviderStrategy())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('validates credentials through OpenRouter rerank', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [{ index: 0, relevance_score: 0.9 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )

    await expect(
      rerank.validateCredentials('cohere/rerank-4-fast', {
        api_key: 'test-key',
        endpoint_url: 'https://router.example.com/api/v1/'
      })
    ).resolves.toBeUndefined()

    expect(fetchSpy).toHaveBeenCalledWith('https://router.example.com/api/v1/rerank', expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json'
      }
    }))
  })

  it('returns an OpenRouter-compatible reranker for the selected model', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          { index: 1, relevance_score: 0.8 },
          { index: 0, relevance_score: 0.2 }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    const instance = await rerank.getReranker({
      model: 'cohere/rerank-4-fast',
      copilot: {
        modelProvider: {
          credentials: {
            api_key: 'test-key'
          }
        }
      }
    } as any)

    await expect(
      instance.rerank([
        { pageContent: 'first document' },
        { pageContent: 'second document' }
      ] as any, 'query', { model: 'cohere/rerank-4-fast', topN: 1 })
    ).resolves.toEqual([{ index: 1, relevanceScore: 1 }])
    expect(fetchSpy).toHaveBeenCalledWith('https://openrouter.ai/api/v1/rerank', expect.anything())
    expect(rerank.modelType).toBe(AiModelTypeEnum.RERANK)
  })
})

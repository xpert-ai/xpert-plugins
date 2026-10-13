import { XirangProviderStrategy } from './provider.strategy.js'
import { XirangLargeLanguageModel } from './llm/llm.js'
import { XirangTextEmbeddingModel } from './text-embedding/text-embedding.js'
import { XirangRerankModel } from './rerank/rerank.js'

describe('Xirang provider validation', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses Bearer AppKey for the official model-list endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)

    await new XirangProviderStrategy().validateProviderCredentials({ app_key: ' app-key ' })

    expect(fetchMock).toHaveBeenCalledWith('https://ai.ctaigw.cn/v1/models', {
      method: 'GET',
      headers: { Authorization: 'Bearer app-key', Accept: 'application/json' },
      signal: expect.any(AbortSignal)
    })
  })

  it('discovers three types and retains official endpoint IDs and rerank routes', async () => {
    const provider = new XirangProviderStrategy()
    new XirangLargeLanguageModel(provider)
    new XirangTextEmbeddingModel(provider)
    new XirangRerankModel(provider)
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [
      { id: 'qwen3.8-flash' }, { id: 'text-embedding-v4' }, { id: 'qwen3-rerank' }, { id: 'opaque-model-id' }
    ] })))
    const models = await provider.discoverModels({ app_key: 'test-key' })
    expect(models.map((model) => model.modelType)).toEqual(['llm', 'text-embedding', 'rerank', null])
    expect(models[0].modelProperties.endpoint_model_name).toBe('865d804fa96848bbad8d047707f33565')
    expect(models[2].modelProperties).toEqual({ endpoint_model_name: 'a18944d8204c4e969cd4635c28af56e5', rerank_path: '/reranks' })
    expect(models[3].configuration).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const custom = await provider.discoverModels({ app_key: 'key', endpoint_url: 'https://gateway.test/v1' })
    expect(custom[0].modelProperties.endpoint_model_name).toBe('qwen3.8-flash')
  })
})

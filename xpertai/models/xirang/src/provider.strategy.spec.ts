import { XirangProviderStrategy } from './provider.strategy.js'
import { XirangLargeLanguageModel } from './llm/llm.js'
import { XirangTextEmbeddingModel } from './text-embedding/text-embedding.js'
import { XirangRerankModel } from './rerank/rerank.js'
import { AiModelTypeEnum, resolveModelParameterOptions } from '@xpert-ai/contracts'
import type { XirangModelCredentials } from './types.js'

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

  it('discovers three types and retains the returned model IDs and rerank routes', async () => {
    const provider = new XirangProviderStrategy()
    new XirangLargeLanguageModel(provider)
    new XirangTextEmbeddingModel(provider)
    new XirangRerankModel(provider)
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [
      { id: 'qwen3.8-flash' }, { id: 'text-embedding-v4' }, { id: 'qwen3-rerank' }, { id: 'opaque-model-id' }
    ] })))
    const models = await provider.discoverModels({ app_key: 'test-key' })
    expect(models.map((model) => model.modelType)).toEqual(['llm', 'text-embedding', 'rerank', null])
    expect(models[0].modelProperties.endpoint_model_name).toBe('qwen3.8-flash')
    expect(models[2].modelProperties).toEqual({ endpoint_model_name: 'qwen3-rerank', rerank_path: '/reranks' })
    expect(models[3].configuration).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const custom = await provider.discoverModels({ app_key: 'key', endpoint_url: 'https://gateway.test/v1' })
    expect(custom[0].modelProperties.endpoint_model_name).toBe('qwen3.8-flash')
  })

  it('reuses matching built-in metadata and parameter rules without importing the rest of the catalog', async () => {
    const provider = new XirangProviderStrategy()
    const manager = new XirangLargeLanguageModel(provider)
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'qwen3.8-flash' }] })))

    const [imported, ...others] = await provider.discoverModels({ app_key: 'test-key' })
    const builtin = manager.getModelSchema(imported.model)!
    const credentials: XirangModelCredentials = {
      app_key: 'test-key',
      ...imported.modelProperties,
      model_configuration: imported.configuration
    }
    const schema = manager.getModelSchema(imported.model, credentials)!
    expect(others).toEqual([])
    expect(imported.typeSource).toBe('catalog')
    expect(imported.configuration).toMatchObject({
      contextSize: builtin.model_properties.context_size,
      maxOutputTokens: builtin.parameter_rules.find((rule) => rule.name === 'max_tokens')!.max,
      features: builtin.features
    })
    expect(schema.pricing).toEqual(builtin.pricing)
    for (const name of ['temperature', 'top_p', 'enable_thinking', 'response_format']) {
      expect(schema.parameter_rules.find((rule) => rule.name === name))
        .toEqual(builtin.parameter_rules.find((rule) => rule.name === name))
    }
    const chat = manager.getChatModel({ model: imported.model }, undefined, credentials)
    expect(chat.invocationParams().model).toBe('qwen3.8-flash')
  })

  it('keeps an API-only LLM request minimal after imported configuration and host defaults resolve', async () => {
    const provider = new XirangProviderStrategy()
    const manager = new XirangLargeLanguageModel(provider)
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: 'kimi-k3.1-pro', model_type: 'llm' }]
    })))
    const [imported] = await provider.discoverModels({ app_key: 'test-key' })
    const credentials: XirangModelCredentials = {
      app_key: 'test-key', ...imported.modelProperties, model_configuration: imported.configuration
    }
    expect(manager.predefinedModels().some((model) => model.model === imported.model)).toBe(false)
    expect(imported.modelType).toBe(AiModelTypeEnum.LLM)
    expect(imported.configuration).toMatchObject({ features: [] })
    // @ts-expect-error The host passes structured model credentials through the SDK's string-only parameter type.
    const rules = manager.getParameterRules(imported.model, credentials)
    const options = resolveModelParameterOptions({ streaming: false }, rules)
    const chat = manager.getChatModel({ model: imported.model, options }, undefined, credentials)
    expect(JSON.parse(JSON.stringify(chat.invocationParams())))
      .toEqual({ model: 'kimi-k3.1-pro', stream: false })
    const manual = manager.getChatModel({ model: imported.model, options: { ...options, temperature: 1 } }, undefined, credentials)
    expect(manual.invocationParams().temperature).toBe(1)
  })

  it('uses an exact catalog endpoint ID to inherit known metadata', async () => {
    const provider = new XirangProviderStrategy()
    const manager = new XirangLargeLanguageModel(provider)
    const endpointId = '865d804fa96848bbad8d047707f33565'
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: endpointId }] })))
    const [imported] = await provider.discoverModels({ app_key: 'test-key' })
    expect(imported.model).toBe(endpointId)
    expect(imported.modelProperties.endpoint_model_name).toBe(endpointId)
    expect(imported.typeSource).toBe('catalog')
    expect(imported.configuration).toMatchObject({ features: manager.getModelSchema('qwen3.8-flash')!.features })
  })
})

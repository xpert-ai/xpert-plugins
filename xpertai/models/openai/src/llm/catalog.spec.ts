import { OpenAIProviderStrategy } from '../provider.strategy.js'
import { OpenAILargeLanguageModel } from './llm.js'
import { getSupportedOpenAIReasoningEfforts } from '../types.js'
import { AiModelTypeEnum, AiProviderRole } from '@xpert-ai/contracts'

describe('OpenAI current model catalog', () => {
  const llm = new OpenAILargeLanguageModel(new OpenAIProviderStrategy())
  const models = llm.predefinedModels()
  const currentModels = ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna', 'gpt-6-sol']
  const removedModels = ['gpt-5.4', 'gpt-5.4-pro', 'gpt-5', 'gpt-5.2-chat', 'gpt-5.2-codex']

  it('loads current models and the retained GPT-5 models without removed entries or duplicates', () => {
    const ids = models.map((model) => model.model)
    expect(ids).toEqual([...currentModels, 'gpt-5.3-codex', 'gpt-5.2', 'gpt-5.2-pro'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(removedModels)('does not advertise native transport for removed catalog model %s', async (model) => {
    await expect(llm.modelProvider.getNativeModelClient('openai_responses', {
      model, modelType: AiModelTypeEnum.LLM,
      copilot: { role: AiProviderRole.Primary, modelProvider: { credentials: { api_key: 'test-key' } } }
    })).rejects.toThrow('Native model protocol is unavailable')
  })

  it.each(currentModels)('keeps catalog capabilities and runtime reasoning aligned for %s', (name) => {
    const model = models.find((item) => item.model === name)
    expect(model).toMatchObject({
      native_protocols: ['openai_responses'],
      model_properties: { mode: 'chat', context_size: 1050000, max_output: 128000 },
      features: expect.arrayContaining(['vision', 'tool-call', 'stream-tool-call', 'structured-output'])
    })
    expect(model?.parameter_rules.find((rule) => rule.name === 'reasoning_effort')).toMatchObject({
      default: 'medium', options: getSupportedOpenAIReasoningEfforts(name)
    })
    expect(model?.parameter_rules.find((rule) => rule.name === 'max_tokens')).toMatchObject({ min: 16, max: 128000 })
  })

  it.each(currentModels)('exposes %s through the declared native Responses transport', async (model) => {
    const client = await llm.modelProvider.getNativeModelClient('openai_responses', {
      model, modelType: AiModelTypeEnum.LLM,
      copilot: { role: AiProviderRole.Primary, modelProvider: { credentials: { api_key: 'test-key' } } }
    })
    expect(client.protocol).toBe('openai_responses')
    expect(client.generate).toEqual(expect.any(Function))
    expect(client.priceUsage).toEqual(expect.any(Function))
  })

  it.each([
    ['gpt-6-astra', 10, 50, 1], ['gpt-6.1-sol', 2, 10, 0.1],
    ['gpt-6.1-terra', 1, 5, 0.05], ['gpt-6-luna', 0.1, 0.5, 0.01], ['gpt-6-sol', 2, 10, 0.2]
  ] as const)('prices %s on both sides of the 272K input boundary', (name, input, output, cache) => {
    const model = models.find((item) => item.model === name)
    const pricing = model?.pricing
    expect(pricing).toMatchObject({ input: String(input), output: String(output), currency: 'USD', unit: '0.000001' })
    if (!pricing || !('input' in pricing)) throw new Error('Expected LLM token pricing')
    expect(pricing.tiered_pricing).toEqual([
      { input, output, max_tokens: 272000 },
      { input: input * 2, output: output * 1.5, max_tokens: 1050000 }
    ])
    for (const [component, shortRate, longRate] of [
      ['input', input, input * 2], ['output', output, output * 1.5],
      ['cache_read_input', cache, cache * 2], ['cache_write_input', input * 1.25, input * 2.5]
    ]) {
      expect(pricing.rules).toContainEqual({ component, unit_price: shortRate, unit_size: 1000000, max_input_tokens: 272000 })
      expect(pricing.rules).toContainEqual({ component, unit_price: longRate, unit_size: 1000000, min_input_tokens: 272001 })
    }
  })
})

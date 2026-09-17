import { Volcengine } from './types.js'
import { VolcengineLargeLanguageModel } from './llm/llm.js'
import { VolcengineProviderStrategy } from './provider.strategy.js'
import { AiProviderRole } from '@xpert-ai/contracts'
import { calculateLLMUsagePrice } from '@xpert-ai/plugin-sdk'

describe('volcengine', () => {
  it('should work', () => {
    expect(Volcengine).toEqual('volcengine')
  })

  it.each([
    ['deepseek-v4-1-flash-260910', 2, 8, 0.04],
    ['glm-5-3-flash-260828', 0.8, 2.8, 0.23]
  ] as const)('prices %s using official maximum token and storage rates', (modelId, input, output, cache) => {
    const llm = new VolcengineLargeLanguageModel(new VolcengineProviderStrategy())
    const model = llm.predefinedModels().find((entry) => entry.model === modelId)
    if (!model?.pricing) throw new Error('Missing Ark model pricing')
    const charge = calculateLLMUsagePrice(model.pricing, {
      promptTokens: 1500000,
      completionTokens: 1000000,
      totalTokens: 2500000,
      cacheReadInputTokens: 500000
    }, { pricingTime: '2026-09-20T00:00:00+08:00', cacheStorageTokenHours: 2000000 })
    expect(charge.pricingStatus).toBe('priced')
    expect(charge.totalAmount).toBeCloseTo(input + output + cache / 2 + 0.017 * 2, 8)
  })

  it.each([
    ['deepseek-v4-1-flash-260910', 393216, 'minimal'],
    ['glm-5-3-flash-260828', 131072, 'low']
  ] as const)('loads and configures %s', (modelId, maxTokens, effort) => {
    const llm = new VolcengineLargeLanguageModel(new VolcengineProviderStrategy())
    const model = llm.predefinedModels().find((entry) => entry.model === modelId)
    expect(model?.features).toEqual(expect.arrayContaining(['vision', 'multi-tool-call']))
    expect(model?.parameter_rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'max_tokens', max: maxTokens }),
      expect.objectContaining({ name: 'reasoning_effort', options: expect.arrayContaining([effort]) })
    ]))
    const chat = llm.getChatModel({
      model: modelId,
      options: { max_tokens: maxTokens, reasoning_effort: effort },
      copilot: {
        role: AiProviderRole.Primary,
        modelProvider: { credentials: { ark_api_key: 'test-key' } }
      }
    })
    expect(chat.invocationParams()).toEqual(expect.objectContaining({
      max_tokens: maxTokens,
      reasoning_effort: effort
    }))
  })
})

import {
  applyTongyiExplicitCache,
  getTongyiPricingContext,
  TongyiLargeLanguageModel,
  toTongyiConfigurationWithExtraHeaders
} from './llm.js'
import { TongyiProviderStrategy } from '../provider.strategy.js'

describe('getTongyiPricingContext', () => {
  it('uses explicit request mode and the selected DashScope endpoint', () => {
    expect(
      getTongyiPricingContext(
        { dashscope_api_key: 'test', use_international_endpoint: true },
        { enable_thinking: true }
      )
    ).toEqual({ mode: 'thinking', region: 'international' })

    expect(
      getTongyiPricingContext(
        { dashscope_api_key: 'test' },
        { enable_thinking: false }
      )
    ).toEqual({ mode: 'standard', region: 'cn' })
  })

  it('uses the default standard mode without inferring the region behind a custom endpoint', () => {
    expect(
      getTongyiPricingContext({ dashscope_api_key: 'test', api_host: 'proxy.example.com' })
    ).toEqual({ mode: 'standard', region: undefined })
  })

  it('honors an explicit region selection behind a custom endpoint', () => {
    expect(
      getTongyiPricingContext({
        dashscope_api_key: 'test',
        api_host: 'proxy.example.com',
        use_international_endpoint: true
      })
    ).toEqual({ mode: 'standard', region: 'international' })
  })

  it('ignores unobservable search add-on cost while preserving token pricing context', () => {
    const context = getTongyiPricingContext(
      { dashscope_api_key: 'test' },
      { enable_search: true }
    )

    expect(context).toEqual({ mode: 'standard', region: 'cn' })
    expect(context).not.toHaveProperty('unpricedAddOns')
  })
})

describe('applyTongyiExplicitCache', () => {
  it.each([
    'qwen3.8-max',
    'qwen3.7-max',
    'qwen3.7-flash',
    'qwen3.6-plus',
    'qwen3-max-preview',
    'qwen-plus-latest',
    'qwen3-coder-plus',
    'qwen3-vl-plus',
    'qwen-vl-max',
    'deepseek-v3.2',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'kimi-k2.5',
    'glm-5.1'
  ])(
    'adds ephemeral cache control to %s system text content',
    (model) => {
      const request = {
        model,
        messages: [
          { role: 'system', content: 'Long stable system prompt' },
          { role: 'user', content: 'hi' }
        ]
      }

      const patched = applyTongyiExplicitCache(request, { model })

      expect(patched).not.toBe(request)
      expect(request.messages[0].content).toBe('Long stable system prompt')
      expect(patched.messages[0].content).toEqual([
        {
          type: 'text',
          text: 'Long stable system prompt',
          cache_control: { type: 'ephemeral' }
        }
      ])
    }
  )

  it('does not change other models', () => {
    const request = {
      model: 'qwen-turbo',
      messages: [{ role: 'system', content: 'Long stable system prompt' }]
    }

    expect(applyTongyiExplicitCache(request, { model: 'qwen-turbo' })).toBe(request)
  })

  it('does not add duplicate cache control', () => {
    const request = {
      model: 'qwen3.6-plus',
      messages: [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'Long stable system prompt',
              cache_control: { type: 'ephemeral' }
            }
          ]
        }
      ]
    }

    expect(applyTongyiExplicitCache(request, { model: 'qwen3.6-plus' })).toBe(request)
  })
})

describe('Tongyi China-region explicit-cache pricing', () => {
  const manager = new TongyiLargeLanguageModel(new TongyiProviderStrategy())
  const models = manager.predefinedModels()
  const explicitlyCachedModels = [
    'qwen3.8-max',
    'qwen3.7-max',
    'qwen3-max',
    'qwen3-max-preview',
    'qwen3.7-plus',
    'qwen3.6-plus',
    'qwen3.5-plus',
    'qwen-plus',
    'qwen-plus-latest',
    'qwen3.6-flash',
    'qwen3.5-flash',
    'qwen-flash',
    'qwen3-coder-plus',
    'qwen3-vl-plus',
    'qwen3-vl-flash',
    'qwen-vl-max',
    'qwen-vl-plus',
    'deepseek-v3.2',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'kimi-k2.5',
    'glm-5.1'
  ]

  it('preserves the official qwen3.7-flash explicit-cache prices', () => {
    const model = models.find((candidate) => candidate.model === 'qwen3.7-flash')
    const rules = model?.pricing && 'rules' in model.pricing ? model.pricing.rules ?? [] : []

    expect(rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: 'input', unit_price: 0.2, max_input_tokens: 32000, region: 'cn' }),
      expect.objectContaining({ component: 'input', unit_price: 0.6, min_input_tokens: 32001, max_input_tokens: 256000, region: 'cn' }),
      expect.objectContaining({ component: 'input', unit_price: 1.2, min_input_tokens: 256001, max_input_tokens: 1000000, region: 'cn' }),
      expect.objectContaining({ component: 'cache_read_input', unit_price: 0.02, max_input_tokens: 32000, region: 'cn' }),
      expect.objectContaining({ component: 'cache_read_input', unit_price: 0.06, min_input_tokens: 32001, max_input_tokens: 256000, region: 'cn' }),
      expect.objectContaining({ component: 'cache_read_input', unit_price: 0.12, min_input_tokens: 256001, max_input_tokens: 1000000, region: 'cn' }),
      expect.objectContaining({ component: 'cache_write_input', unit_price: 0.25, max_input_tokens: 32000, region: 'cn' }),
      expect.objectContaining({ component: 'cache_write_input', unit_price: 0.75, min_input_tokens: 32001, max_input_tokens: 256000, region: 'cn' }),
      expect.objectContaining({ component: 'cache_write_input', unit_price: 1.5, min_input_tokens: 256001, max_input_tokens: 1000000, region: 'cn' })
    ]))
  })

  it.each(explicitlyCachedModels)('uses the supplied explicit-cache ratios for %s', (modelName) => {
    const model = models.find((candidate) => candidate.model === modelName)
    const rules = model?.pricing && 'rules' in model.pricing ? model.pricing.rules ?? [] : []
    const inputs = rules.filter((rule) => rule.component === 'input' && rule.region === 'cn')
    const reads = rules.filter((rule) => rule.component === 'cache_read_input' && rule.region === 'cn')
    const writes = rules.filter((rule) => rule.component === 'cache_write_input' && rule.region === 'cn')

    expect(inputs.length).toBeGreaterThan(0)
    expect(reads).toHaveLength(inputs.length)
    expect(writes).toHaveLength(inputs.length)

    for (const input of inputs) {
      const sameTier = (rule: (typeof rules)[number]) =>
        rule.min_input_tokens === input.min_input_tokens && rule.max_input_tokens === input.max_input_tokens
      expect(reads.find(sameTier)?.unit_price).toBeCloseTo(Number(input.unit_price) * 0.1, 8)
      expect(writes.find(sameTier)?.unit_price).toBeCloseTo(Number(input.unit_price) * 1.25, 8)
    }
  })

  it.each(explicitlyCachedModels)('prices standard, cache-read, cache-write, and output usage for %s', (modelName) => {
    const usage = (manager as any).calcResponseUsage(
      modelName,
      {},
      1_000,
      100,
      0,
      {
        promptTokens: 1_000,
        completionTokens: 100,
        totalTokens: 1_100,
        cacheReadInputTokens: 100,
        cacheWriteInputTokens: 100
      },
      { region: 'cn', mode: 'standard' }
    )

    expect(usage.pricingStatus).toBe('priced')
    expect(usage.pricingBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: 'input', pricingStatus: 'priced' }),
        expect.objectContaining({ component: 'cache_read_input', pricingStatus: 'priced' }),
        expect.objectContaining({ component: 'cache_write_input', pricingStatus: 'priced' }),
        expect.objectContaining({ component: 'output', pricingStatus: 'priced' })
      ])
    )
  })
})

describe('toTongyiConfigurationWithExtraHeaders', () => {
  it('keeps the original configuration when extra headers are empty', () => {
    const configuration = {
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    }

    expect(toTongyiConfigurationWithExtraHeaders(configuration, '')).toBe(configuration)
    expect(toTongyiConfigurationWithExtraHeaders(configuration, '   ')).toBe(configuration)
    expect(toTongyiConfigurationWithExtraHeaders(configuration, undefined)).toBe(configuration)
  })

  it('adds parsed extra headers only when configured', () => {
    const configuration = {
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    }

    expect(
      toTongyiConfigurationWithExtraHeaders(configuration, '{"x-dashscope-workspace":"workspace-1"}')
    ).toEqual({
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultHeaders: {
        'x-dashscope-workspace': 'workspace-1'
      }
    })
  })

  it('rejects extra headers that would override core request headers', () => {
    expect(() =>
      toTongyiConfigurationWithExtraHeaders({}, '{"Authorization":"Bearer other"}')
    ).toThrow("Extra header 'Authorization' is reserved")
  })
})

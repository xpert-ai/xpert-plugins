import {
  applyTongyiExplicitCache,
  getTongyiPricingContext,
  toTongyiConfigurationWithExtraHeaders
} from './llm.js'

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
    'qwen3.6-plus',
    'qwen3-max-preview',
    'qwen3-coder-plus',
    'qwen3-vl-plus',
    'deepseek-v3.2',
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

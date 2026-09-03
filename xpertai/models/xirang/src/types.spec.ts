import { getXirangBaseUrl, resolveXirangModelLimits, toCredentialKwargs } from './types.js'

describe('Xirang credentials', () => {
  it('normalizes the default endpoint and preserves raw AppKey auth', () => {
    expect(getXirangBaseUrl({ endpoint_url: 'https://ai.ctaigw.cn/v1///' })).toBe('https://ai.ctaigw.cn/v1')
    const params = toCredentialKwargs({ app_key: 'app-key', endpoint_url: 'https://example.test/v1' }, 'glm-5.3')
    expect(params.configuration.baseURL).toBe('https://example.test/v1')
    expect(params.configuration.defaultHeaders).toEqual({ Authorization: 'app-key' })
    expect(params.model).toBe('glm-5.3')
  })

  it('rejects an empty AppKey before creating a client', () => {
    expect(() => toCredentialKwargs({ app_key: '  ' }, 'glm-5.3')).toThrow('AppKey is missing')
  })

  it('keeps context and maximum output limits independent', () => {
    expect(
      resolveXirangModelLimits({
        context_size: '1000000',
        max_tokens_to_sample: '131072'
      })
    ).toEqual({ contextSize: 1000000, maxOutputTokens: 131072 })
  })

  it('clamps an invalid maximum output limit to the context window', () => {
    expect(
      resolveXirangModelLimits({
        context_size: 8192,
        max_tokens_to_sample: 16384
      })
    ).toEqual({ contextSize: 8192, maxOutputTokens: 8192 })
  })
})

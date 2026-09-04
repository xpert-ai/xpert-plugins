import {
  getXirangAuthorization,
  getXirangBaseUrl,
  resolveXirangEndpointModel,
  resolveXirangModelLimits,
  toCredentialKwargs
} from './types.js'

describe('Xirang credentials', () => {
  it('normalizes the official endpoint and sends the documented Bearer AppKey', () => {
    expect(getXirangBaseUrl({ endpoint_url: 'https://ai.ctaigw.cn/v1///' })).toBe('https://ai.ctaigw.cn/v1')
    const params = toCredentialKwargs({ app_key: ' app-key ' }, 'glm-5.3')
    expect(params.configuration.baseURL).toBe('https://ai.ctaigw.cn/v1')
    expect(params.configuration.defaultHeaders).toEqual({ Authorization: 'Bearer app-key' })
    expect(params.model).toBe('glm-5.3')
  })

  it('does not duplicate an existing Bearer prefix', () => {
    expect(getXirangAuthorization({ app_key: 'Bearer app-key' })).toBe('Bearer app-key')
    expect(getXirangAuthorization({ app_key: 'app-key', endpoint_url: 'https://ai.ctaigw.cn/coding/v1' }))
      .toBe('Bearer app-key')
  })

  it('preserves raw authorization for an explicit compatible gateway', () => {
    const params = toCredentialKwargs({ app_key: 'app-key', endpoint_url: 'https://example.test/v1/' }, 'custom-model')
    expect(params.configuration.baseURL).toBe('https://example.test/v1')
    expect(params.configuration.defaultHeaders).toEqual({ Authorization: 'app-key' })
  })

  it('prefers an explicit endpoint override, then captured model ID, then the logical name', () => {
    const predefined = { endpoint_model_name: 'captured-id' }
    expect(resolveXirangEndpointModel({ app_key: 'key', endpoint_model_name: 'override-id' }, 'logical', predefined))
      .toBe('override-id')
    expect(resolveXirangEndpointModel({ app_key: 'key' }, 'logical', predefined)).toBe('captured-id')
    expect(
      resolveXirangEndpointModel(
        { app_key: 'key', endpoint_url: 'https://example.test/v1' },
        'logical',
        predefined
      )
    ).toBe('logical')
    expect(resolveXirangEndpointModel({ app_key: 'key' }, 'logical')).toBe('logical')
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

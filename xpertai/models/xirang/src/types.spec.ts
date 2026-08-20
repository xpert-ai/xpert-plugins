import { getXirangBaseUrl, toCredentialKwargs } from './types.js'

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
})

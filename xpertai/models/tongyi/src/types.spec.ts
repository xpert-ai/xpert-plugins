import {
  getTongyiHttpBaseUrl,
  toCredentialKwargs,
  TongyiDefaultBaseUrl,
  TongyiDefaultHttpBaseUrl,
  TongyiIntlBaseUrl,
  TongyiIntlHttpBaseUrl
} from './types.js'

describe('Tongyi endpoint helpers', () => {
  it('uses domestic endpoints when international endpoint is not configured', () => {
    const credentials = { dashscope_api_key: 'test-key' }

    expect(toCredentialKwargs(credentials).configuration.baseURL).toBe(TongyiDefaultBaseUrl)
    expect(getTongyiHttpBaseUrl(credentials)).toBe(TongyiDefaultHttpBaseUrl)
  })

  it('uses international endpoints only when explicitly enabled', () => {
    const credentials = { dashscope_api_key: 'test-key', use_international_endpoint: 'true' }

    expect(toCredentialKwargs(credentials).configuration.baseURL).toBe(TongyiIntlBaseUrl)
    expect(getTongyiHttpBaseUrl(credentials)).toBe(TongyiIntlHttpBaseUrl)
  })

  it('uses an optional workspace API host for compatible and DashScope endpoints', () => {
    const credentials = {
      dashscope_api_key: 'test-key',
      api_host: 'llm-wnsb9rvvimieg6nx.cn-beijing.maas.aliyuncs.com',
      use_international_endpoint: 'true'
    }

    expect(toCredentialKwargs(credentials).configuration.baseURL).toBe(
      'https://llm-wnsb9rvvimieg6nx.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
    )
    expect(getTongyiHttpBaseUrl(credentials)).toBe(
      'https://llm-wnsb9rvvimieg6nx.cn-beijing.maas.aliyuncs.com/api/v1'
    )
  })

  it('preserves the protocol and removes trailing slashes from a configured API host', () => {
    const credentials = {
      dashscope_api_key: 'test-key',
      api_host: 'http://localhost:8080///'
    }

    expect(toCredentialKwargs(credentials).configuration.baseURL).toBe(
      'http://localhost:8080/compatible-mode/v1'
    )
    expect(getTongyiHttpBaseUrl(credentials)).toBe('http://localhost:8080/api/v1')
  })
})

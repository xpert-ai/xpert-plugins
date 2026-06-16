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
})

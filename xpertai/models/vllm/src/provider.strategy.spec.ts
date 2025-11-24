jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  ModelProvider: class {},
}))

import { VLLMProviderStrategy } from './provider.strategy.js'
import { VLLMModelCredentials } from './types.js'

describe('VLLMProviderStrategy', () => {
  let strategy: VLLMProviderStrategy
  let credentials: VLLMModelCredentials

  beforeEach(() => {
    strategy = new VLLMProviderStrategy()
    credentials = {
      api_key: 'test-api-key',
      endpoint_url: 'https://mock.endpoint/v1'
    }
  })

  it('returns the endpoint URL from credentials', () => {
    expect(strategy.getBaseUrl(credentials)).toBe(credentials.endpoint_url)
  })

  it('formats the authorization header correctly', () => {
    expect(strategy.getAuthorization(credentials)).toBe('Bearer test-api-key')
  })

  it('resolves validation without throwing', async () => {
    await expect(strategy.validateProviderCredentials(credentials)).resolves.toBeUndefined()
  })
})

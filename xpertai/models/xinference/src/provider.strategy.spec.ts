jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  ModelProvider: class {},
}))

import { XinferenceProviderStrategy } from './provider.strategy.js'
import { XinferenceModelCredentials } from './types.js'

describe('XinferenceProviderStrategy', () => {
  let strategy: XinferenceProviderStrategy
  let credentials: XinferenceModelCredentials

  beforeEach(() => {
    strategy = new XinferenceProviderStrategy()
    credentials = {
      api_key: 'test-api-key',
      server_url: 'https://mock.endpoint/v1'
    }
  })

  it('returns the server URL from credentials', () => {
    expect(strategy.getBaseUrl(credentials)).toBe(credentials.server_url)
  })

  it('formats the authorization header correctly', () => {
    expect(strategy.getAuthorization(credentials)).toBe('Bearer test-api-key')
  })

  it('resolves validation without throwing', async () => {
    await expect(strategy.validateProviderCredentials(credentials)).resolves.toBeUndefined()
  })
})

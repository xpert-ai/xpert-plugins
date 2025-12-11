jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  ModelProvider: class {}
}))

import { AnthropicProviderStrategy } from './provider.strategy.js'
import { AnthropicModelCredentials } from './types.js'

describe('AnthropicProviderStrategy', () => {
  let strategy: AnthropicProviderStrategy
  let credentials: AnthropicModelCredentials

  beforeEach(() => {
    strategy = new AnthropicProviderStrategy()
    credentials = {
      api_key: 'test-api-key',
      context_size: '200000',
      max_tokens_to_sample: '4096'
    }
  })

  it('should validate credentials successfully when API key is provided', async () => {
    await expect(strategy.validateProviderCredentials(credentials)).resolves.toBeUndefined()
  })

  it('should throw error when API key is missing', async () => {
    const invalidCredentials = {
      ...credentials,
      api_key: ''
    }
    await expect(strategy.validateProviderCredentials(invalidCredentials)).rejects.toThrow(
      'Anthropic API key is required'
    )
  })

  it('should throw error when API key is undefined', async () => {
    const invalidCredentials = {
      ...credentials,
      api_key: undefined as any
    }
    await expect(strategy.validateProviderCredentials(invalidCredentials)).rejects.toThrow(
      'Anthropic API key is required'
    )
  })
})


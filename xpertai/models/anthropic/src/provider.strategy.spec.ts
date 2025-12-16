jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  ModelProvider: class {}
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  ModelProvider: class {
    getModelManager() {
      return {
        validateCredentials: jest.fn().mockResolvedValue(undefined)
      }
    }
    getProviderSchema() {
      return { provider: 'anthropic' }
    }
  },
  CredentialsValidateFailedError: class extends Error {}
}))

import { AnthropicProviderStrategy } from './provider.strategy.js'
import { AnthropicCredentials } from './types.js'

describe('AnthropicProviderStrategy', () => {
  let strategy: AnthropicProviderStrategy
  let credentials: AnthropicCredentials

  beforeEach(() => {
    strategy = new AnthropicProviderStrategy()
    credentials = {
      api_key: 'test-api-key'
    }
  })

  it('should validate credentials successfully when API key is provided', async () => {
    await expect(strategy.validateProviderCredentials(credentials)).resolves.toBeUndefined()
  })

  it('should throw error when API key is missing', async () => {
    const invalidCredentials = {
      api_key: ''
    }
    await expect(strategy.validateProviderCredentials(invalidCredentials)).rejects.toThrow(
      'Anthropic API key is required'
    )
  })

  it('should throw error when API key is undefined', async () => {
    const invalidCredentials = {
      api_key: undefined as any
    }
    await expect(strategy.validateProviderCredentials(invalidCredentials)).rejects.toThrow(
      'Anthropic API key is required'
    )
  })
})


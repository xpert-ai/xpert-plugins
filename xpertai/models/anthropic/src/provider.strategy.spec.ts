const validateCredentials = jest.fn().mockResolvedValue(undefined)

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  ModelProvider: class {
    getModelManager() {
      return {
        validateCredentials
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
    validateCredentials.mockClear()
    strategy = new AnthropicProviderStrategy()
    credentials = {
      anthropic_api_key: 'test-api-key'
    }
  })

  it('should validate credentials successfully when API key is provided', async () => {
    await expect(strategy.validateProviderCredentials(credentials)).resolves.toBeUndefined()
    expect(validateCredentials).toHaveBeenCalledWith('claude-haiku-4-5', credentials)
  })

  it('should throw error when API key is missing', async () => {
    await expect(
      strategy.validateProviderCredentials({ anthropic_api_key: '' })
    ).rejects.toThrow('Anthropic API key is required')
  })

  it('should throw error when API key is undefined', async () => {
    await expect(
      strategy.validateProviderCredentials({ anthropic_api_key: undefined as any })
    ).rejects.toThrow('Anthropic API key is required')
  })
})

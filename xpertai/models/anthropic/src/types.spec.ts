import { toCredentialKwargs, AnthropicCredentials } from './types.js'

describe('toCredentialKwargs', () => {
  it('should convert credentials to ChatAnthropicInput correctly', () => {
    const credentials: AnthropicCredentials = {
      api_key: 'test-api-key'
    }

    const result = toCredentialKwargs(credentials, 'claude-3-5-sonnet-20241022')

    expect(result.anthropicApiKey).toBe('test-api-key')
    expect(result.modelName).toBe('claude-3-5-sonnet-20241022')
  })

  it('should use default model when model is not provided', () => {
    const credentials: AnthropicCredentials = {
      api_key: 'test-api-key'
    }

    const result = toCredentialKwargs(credentials)

    expect(result.modelName).toBe('claude-3-5-sonnet-20241022')
  })

  it('should use provided model parameter', () => {
    const credentials: AnthropicCredentials = {
      api_key: 'test-api-key'
    }

    const result = toCredentialKwargs(credentials, 'claude-3-opus-20240229')

    expect(result.modelName).toBe('claude-3-opus-20240229')
    expect(result.anthropicApiKey).toBe('test-api-key')
  })
})


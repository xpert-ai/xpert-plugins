import { toCredentialKwargs, AnthropicModelCredentials } from './types.js'

describe('toCredentialKwargs', () => {
  it('should convert credentials to ChatAnthropicInput correctly', () => {
    const credentials: AnthropicModelCredentials = {
      api_key: 'test-api-key',
      model: 'claude-3-5-sonnet-20241022',
      context_size: '200000',
      max_tokens_to_sample: '4096',
      temperature: 0.7,
      top_p: 0.9,
      streaming: true
    }

    const result = toCredentialKwargs(credentials)

    expect(result.anthropicApiKey).toBe('test-api-key')
    expect(result.modelName).toBe('claude-3-5-sonnet-20241022')
    expect(result.temperature).toBe(0.7)
    expect(result.topP).toBe(0.9)
    expect(result.streaming).toBe(true)
    expect(result.maxTokens).toBe(4096)
  })

  it('should use default model when model is not provided', () => {
    const credentials: AnthropicModelCredentials = {
      api_key: 'test-api-key',
      context_size: '200000',
      max_tokens_to_sample: '4096'
    }

    const result = toCredentialKwargs(credentials)

    expect(result.modelName).toBe('claude-3-5-sonnet-20241022')
  })

  it('should use provided model parameter when credentials.model is missing', () => {
    const credentials: AnthropicModelCredentials = {
      api_key: 'test-api-key',
      context_size: '200000',
      max_tokens_to_sample: '4096'
    }

    const result = toCredentialKwargs(credentials, 'claude-3-opus-20240229')

    expect(result.modelName).toBe('claude-3-opus-20240229')
  })

  it('should parse max_tokens_to_sample as integer', () => {
    const credentials: AnthropicModelCredentials = {
      api_key: 'test-api-key',
      context_size: '200000',
      max_tokens_to_sample: '8192'
    }

    const result = toCredentialKwargs(credentials)

    expect(result.maxTokens).toBe(8192)
    expect(typeof result.maxTokens).toBe('number')
  })

  it('should set maxTokens to undefined when max_tokens_to_sample is empty', () => {
    const credentials: AnthropicModelCredentials = {
      api_key: 'test-api-key',
      context_size: '200000',
      max_tokens_to_sample: ''
    }

    const result = toCredentialKwargs(credentials)

    expect(result.maxTokens).toBeUndefined()
  })

  it('should handle optional fields correctly', () => {
    const credentials: AnthropicModelCredentials = {
      api_key: 'test-api-key',
      context_size: '200000',
      max_tokens_to_sample: '4096'
    }

    const result = toCredentialKwargs(credentials)

    expect(result.temperature).toBeUndefined()
    expect(result.topP).toBeUndefined()
    expect(result.streaming).toBeUndefined()
  })
})


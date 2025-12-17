import { AnthropicInput } from '@langchain/anthropic'
import { toCredentialKwargs, AnthropicCredentials } from './types.js'

describe('toCredentialKwargs', () => {
  it('should convert credentials to AnthropicInput correctly', () => {
    const credentials: AnthropicCredentials = {
      api_key: 'test-api-key'
    }

    const result = toCredentialKwargs(credentials, 'claude-3-5-sonnet-20241022')

    // Type check: result should be assignable to AnthropicInput
    const _typeCheck: AnthropicInput = result
    
    expect(result.anthropicApiKey).toBe('test-api-key')
    expect(result.modelName).toBe('claude-3-5-sonnet-20241022')
  })

  it('should use default model when model is not provided', () => {
    const credentials: AnthropicCredentials = {
      api_key: 'test-api-key'
    }

    const result = toCredentialKwargs(credentials)

    // Type check: result should be assignable to AnthropicInput
    const _typeCheck: AnthropicInput = result

    expect(result.modelName).toBe('claude-3-5-sonnet-20241022')
  })

  it('should use provided model parameter', () => {
    const credentials: AnthropicCredentials = {
      api_key: 'test-api-key'
    }

    const result = toCredentialKwargs(credentials, 'claude-3-opus-20240229')

    // Type check: result should be assignable to AnthropicInput
    const _typeCheck: AnthropicInput = result

    expect(result.modelName).toBe('claude-3-opus-20240229')
    expect(result.anthropicApiKey).toBe('test-api-key')
  })

  it('should return AnthropicInput type that matches @langchain/anthropic interface', () => {
    const credentials: AnthropicCredentials = {
      api_key: 'test-api-key'
    }

    const result = toCredentialKwargs(credentials, 'claude-3-5-sonnet-20241022')

    // Verify the result has the correct structure for AnthropicInput
    expect(result).toHaveProperty('anthropicApiKey')
    expect(result).toHaveProperty('modelName')
    expect(typeof result.anthropicApiKey).toBe('string')
    expect(typeof result.modelName).toBe('string')
  })
})


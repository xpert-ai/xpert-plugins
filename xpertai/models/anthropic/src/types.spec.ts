import { AnthropicInput } from '@langchain/anthropic'
import {
  AnthropicCredentials,
  normalizeAnthropicBaseUrl,
  toCredentialKwargs
} from './types.js'

describe('toCredentialKwargs', () => {
  it('should convert credentials to AnthropicInput correctly', () => {
    const credentials: AnthropicCredentials = {
      anthropic_api_key: 'test-api-key'
    }

    const result = toCredentialKwargs(credentials, 'claude-sonnet-4-6')

    const _typeCheck: AnthropicInput = result

    expect(result.anthropicApiKey).toBe('test-api-key')
    expect(result.modelName).toBe('claude-sonnet-4-6')
    expect(result.model).toBe('claude-sonnet-4-6')
  })

  it('should use latest Sonnet model by default', () => {
    const credentials: AnthropicCredentials = {
      anthropic_api_key: 'test-api-key'
    }

    const result = toCredentialKwargs(credentials)

    const _typeCheck: AnthropicInput = result

    expect(result.modelName).toBe('claude-sonnet-4-6')
  })

  it('should support custom base URLs in both compatibility fields', () => {
    const credentials: AnthropicCredentials = {
      anthropic_api_key: 'test-api-key',
      anthropic_api_url: 'https://anthropic.example.com/'
    }

    const result = toCredentialKwargs(credentials, 'claude-opus-4-6')

    expect(result.anthropicApiUrl).toBe('https://anthropic.example.com')
    expect(result.clientOptions?.baseURL).toBe('https://anthropic.example.com')
  })
})

describe('normalizeAnthropicBaseUrl', () => {
  it('should trim whitespace and trailing slashes', () => {
    expect(normalizeAnthropicBaseUrl(' https://anthropic.example.com/// ')).toBe(
      'https://anthropic.example.com'
    )
  })

  it('should return undefined for empty values', () => {
    expect(normalizeAnthropicBaseUrl('')).toBeUndefined()
    expect(normalizeAnthropicBaseUrl(undefined)).toBeUndefined()
  })
})

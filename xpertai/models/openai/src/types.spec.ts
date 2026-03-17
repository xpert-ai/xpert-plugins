import { OpenAIBaseInput } from '@langchain/openai'
import {
  isOpenAIOfficialBaseUrl,
  isOpenAIGPT5ProModel,
  normalizeOpenAIBaseUrl,
  OpenAICredentials,
  OpenAIDefaultBaseUrl,
  shouldEnableResponseFormat,
  shouldEnableSamplingParameters,
  toCredentialKwargs
} from './types.js'

describe('OpenAI credential kwargs', () => {
  it('uses default OpenAI base URL when endpoint is omitted', () => {
    const credentials: OpenAICredentials = {
      api_key: 'test-key'
    }

    const result = toCredentialKwargs(credentials)
    const _typeCheck: OpenAIBaseInput = result

    expect(result.apiKey).toBe('test-key')
    expect(result.configuration.baseURL).toBe(OpenAIDefaultBaseUrl)
  })

  it('appends /v1 when endpoint only contains host', () => {
    expect(normalizeOpenAIBaseUrl('https://api.example.com')).toBe('https://api.example.com/v1')
    expect(normalizeOpenAIBaseUrl('https://api.example.com/')).toBe('https://api.example.com/v1')
    expect(normalizeOpenAIBaseUrl('https://api.example.com。')).toBe('https://api.example.com/v1')
  })

  it('keeps existing versioned or custom path unchanged', () => {
    expect(normalizeOpenAIBaseUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1')
    expect(normalizeOpenAIBaseUrl('https://gateway.example.com/openai/v1')).toBe(
      'https://gateway.example.com/openai/v1'
    )
  })

  it('detects official OpenAI base URL host', () => {
    expect(isOpenAIOfficialBaseUrl('https://api.openai.com/v1')).toBe(true)
    expect(isOpenAIOfficialBaseUrl('https://api.example.com/v1')).toBe(false)
  })

  it('detects GPT-5 Pro model variants', () => {
    expect(isOpenAIGPT5ProModel('gpt-5-pro')).toBe(true)
    expect(isOpenAIGPT5ProModel('gpt-5.2-pro')).toBe(true)
    expect(isOpenAIGPT5ProModel('gpt-5.4-pro')).toBe(true)
    expect(isOpenAIGPT5ProModel('gpt-5.4')).toBe(false)
  })

  it('supports configurable sampling parameter strategy', () => {
    expect(shouldEnableSamplingParameters('enabled', 'https://api.example.com/v1', 'gpt-5.4-pro')).toBe(
      true
    )
    expect(shouldEnableSamplingParameters('disabled', 'https://api.openai.com/v1', 'gpt-5.4')).toBe(
      false
    )
    expect(shouldEnableSamplingParameters('auto', 'https://api.openai.com/v1', 'gpt-5.4')).toBe(true)
    expect(shouldEnableSamplingParameters('auto', 'https://api.openai.com/v1', 'gpt-5.4-pro')).toBe(
      false
    )
    expect(shouldEnableSamplingParameters('auto', 'https://api.example.com/v1', 'gpt-5.4')).toBe(false)
  })

  it('disables response_format for official GPT-5 Pro models only', () => {
    expect(shouldEnableResponseFormat('https://api.openai.com/v1', 'gpt-5.4')).toBe(true)
    expect(shouldEnableResponseFormat('https://api.openai.com/v1', 'gpt-5.4-pro')).toBe(false)
    expect(shouldEnableResponseFormat('https://gateway.example.com/v1', 'gpt-5.4-pro')).toBe(true)
  })
})
